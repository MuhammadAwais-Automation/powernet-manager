-- Migration: Transition Customer Login Credentials to Phone Number
-- Run this script in the Supabase SQL editor.

BEGIN;

-- 1. Create a performance index on normalized customer phone numbers
CREATE INDEX IF NOT EXISTS customers_phone_normalized_idx
  ON public.customers(regexp_replace(phone, '[^0-9]', '', 'g'))
  WHERE phone IS NOT NULL AND status = 'active';

-- 2. Define/Redefine the Customer Login Lookup RPC
CREATE OR REPLACE FUNCTION public.customer_login_lookup(p_identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%rowtype;
  v_norm_ident text;
  v_phone_digits text;
BEGIN
  -- Extract digits for phone comparisons
  v_phone_digits := regexp_replace(p_identifier, '[^0-9]', '', 'g');
  -- Normalize user input for alphanumeric identifier comparisons
  v_norm_ident := trim(both '_' from regexp_replace(lower(trim(p_identifier)), '[^a-z0-9]+', '_', 'g'));

  SELECT *
    INTO v_customer
    FROM public.customers
   WHERE auth_user_id IS NOT NULL
     AND status = 'active'
     AND (
       -- Phone number lookup (ensure we have at least 10 digits to prevent empty matching)
       (length(v_phone_digits) >= 10 AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits)
       -- Fallback to legacy identifiers for backwards compatibility
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(house_id), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(username), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(address_value), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(customer_code), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
     )
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Customer account not found');
  END IF;

  -- Ensure phone exists
  IF v_customer.phone IS NULL OR length(trim(v_customer.phone)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Customer account has no phone number registered');
  END IF;

  -- Return the phone-based virtual email
  RETURN json_build_object(
    'success', true,
    'email', 'customer_' || regexp_replace(v_customer.phone, '[^0-9]', '', 'g') || '@powernet.local'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_login_lookup(text) TO anon, authenticated;

-- 3. Trigger Function: Sync phone number changes in public.customers to auth.users
CREATE OR REPLACE FUNCTION public.sync_customer_phone_to_auth_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_digits text;
  v_new_email text;
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone AND NEW.auth_user_id IS NOT NULL THEN
    v_phone_digits := regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    v_new_email := 'customer_' || v_phone_digits || '@powernet.local';
    
    -- Update the auth user's email and user metadata
    UPDATE auth.users
       SET email = v_new_email,
           raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
             'login_id', v_phone_digits,
             'house_id', coalesce(NEW.house_id, v_phone_digits)
           )
     WHERE id = NEW.auth_user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create/Recreate the trigger
DROP TRIGGER IF EXISTS trg_sync_customer_phone_to_auth_email ON public.customers;
CREATE TRIGGER trg_sync_customer_phone_to_auth_email
  AFTER UPDATE OF phone ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_phone_to_auth_email();

-- 4. Run One-Time Data Migration of Existing Users
DO $$
DECLARE
  r RECORD;
  v_phone_digits TEXT;
  v_new_email TEXT;
  v_conflict_count INTEGER;
  v_migrated_count INTEGER := 0;
  v_conflict_skipped INTEGER := 0;
BEGIN
  FOR r IN
    SELECT c.id AS customer_id, c.auth_user_id, c.phone, c.full_name, c.house_id
      FROM public.customers c
     WHERE c.auth_user_id IS NOT NULL
       AND c.phone IS NOT NULL
       AND length(trim(c.phone)) > 0
  LOOP
    v_phone_digits := regexp_replace(r.phone, '[^0-9]', '', 'g');
    v_new_email := 'customer_' || v_phone_digits || '@powernet.local';

    -- Check for conflicts (where the email might already be in use by another user in auth.users)
    SELECT count(*) INTO v_conflict_count
      FROM auth.users
     WHERE email = v_new_email
       AND id != r.auth_user_id;

    IF v_conflict_count > 0 THEN
      RAISE WARNING 'Conflict: Email % is already used in auth.users. Skipping customer % (ID: %).', 
        v_new_email, r.full_name, r.customer_id;
      v_conflict_skipped := v_conflict_skipped + 1;
    ELSE
      -- Update auth.users email and login metadata
      UPDATE auth.users
         SET email = v_new_email,
             raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
               'login_id', v_phone_digits,
               'house_id', coalesce(r.house_id, v_phone_digits)
             )
       WHERE id = r.auth_user_id;
      v_migrated_count := v_migrated_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migration finished. Successfully updated % user(s). Skipped % duplicate/conflict(s).', 
    v_migrated_count, v_conflict_skipped;
END $$;

COMMIT;
