-- Database DDL Migration: Staff Multi-Area verify_staff_login RPC support
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_staff_login(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff RECORD;
  v_area_name TEXT;
  v_areas JSON;
BEGIN
  -- 1. Find active staff by username
  SELECT *
  INTO v_staff
  FROM public.staff
  WHERE lower(username) = lower(p_username)
    AND is_active = true
  LIMIT 1;

  -- 2. If staff not found or password hash doesn't match
  IF v_staff.id IS NULL OR v_staff.password_hash IS NULL OR v_staff.password_hash <> crypt(p_password, v_staff.password_hash) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid credentials'
    );
  END IF;

  -- 3. Fetch single legacy area name (associated with v_staff.area_id)
  IF v_staff.area_id IS NOT NULL THEN
    SELECT name INTO v_area_name
    FROM public.areas
    WHERE id = v_staff.area_id;
  END IF;

  -- 4. Fetch list of areas and their names associated with v_staff.area_ids array
  SELECT 
    coalesce(json_agg(json_build_object('name', name)), '[]'::json)
  INTO v_areas
  FROM public.areas
  WHERE id::text = any(v_staff.area_ids);

  -- 5. Return success JSON
  RETURN json_build_object(
    'success', true,
    'staff', json_build_object(
      'id', v_staff.id,
      'full_name', v_staff.full_name,
      'role', v_staff.role,
      'phone', v_staff.phone,
      'area_id', v_staff.area_id,
      'area_name', v_area_name,
      'area_ids', v_staff.area_ids,
      'areas', v_areas,
      'username', v_staff.username,
      'auth_user_id', v_staff.auth_user_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_staff_login(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_staff_login(TEXT, TEXT) TO anon, authenticated, service_role;

COMMIT;
