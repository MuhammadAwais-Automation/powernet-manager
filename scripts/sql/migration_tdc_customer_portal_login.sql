-- TDC customers: allow login + bills/payment portal; block new complaints.
-- Run after migration_phone_auth.sql.

BEGIN;

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
  v_phone_digits := regexp_replace(p_identifier, '[^0-9]', '', 'g');
  v_norm_ident := trim(both '_' from regexp_replace(lower(trim(p_identifier)), '[^a-z0-9]+', '_', 'g'));

  SELECT *
    INTO v_customer
    FROM public.customers
   WHERE auth_user_id IS NOT NULL
     AND status IN ('active', 'tdc')
     AND (
       (length(v_phone_digits) >= 10 AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits)
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

  IF v_customer.phone IS NULL OR length(trim(v_customer.phone)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Customer account has no phone number registered');
  END IF;

  RETURN json_build_object(
    'success', true,
    'email', 'customer_' || regexp_replace(v_customer.phone, '[^0-9]', '', 'g') || '@powernet.local',
    'status', v_customer.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_login_lookup(text) TO anon, authenticated;

-- Only active customers may file new complaints (TDC can still read existing tickets).
DROP POLICY IF EXISTS complaints_customer_insert_own ON public.complaints;
CREATE POLICY complaints_customer_insert_own
  ON public.complaints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'open'
    AND assigned_to IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.customers
      WHERE customers.id = complaints.customer_id
        AND customers.auth_user_id = auth.uid()
        AND customers.status = 'active'
    )
  );

COMMIT;
