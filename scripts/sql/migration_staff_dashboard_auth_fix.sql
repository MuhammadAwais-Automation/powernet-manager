-- Repair dashboard auth linkage and harden staff self-read for post-login lookup.
-- Run in Supabase SQL editor or: npx supabase db query --linked -f scripts/sql/migration_staff_dashboard_auth_fix.sql

BEGIN;

-- 1) Let authenticated users read their own staff row (required if auth_all is ever removed).
DROP POLICY IF EXISTS staff_self_read ON public.staff;
CREATE POLICY staff_self_read
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- 2) Link orphaned dashboard auth users to staff rows when auth exists but staff row is missing.
INSERT INTO public.staff (full_name, role, username, auth_user_id, is_active)
SELECT
  initcap(split_part(u.email, '@', 1)) AS full_name,
  'admin'::text AS role,
  split_part(u.email, '@', 1) AS username,
  u.id AS auth_user_id,
  true AS is_active
FROM auth.users u
WHERE u.email IN ('awais@powernet.local', 'asif@powernet.local')
  AND NOT EXISTS (
    SELECT 1 FROM public.staff s WHERE s.auth_user_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.staff s WHERE lower(s.username) = split_part(u.email, '@', 1)
  );

-- 3) Re-link staff rows that lost auth_user_id but matching auth.users email still exists.
UPDATE public.staff s
SET auth_user_id = u.id,
    is_active = true
FROM auth.users u
WHERE s.auth_user_id IS NULL
  AND s.username IS NOT NULL
  AND u.email = lower(trim(s.username)) || '@powernet.local'
  AND NOT EXISTS (
    SELECT 1 FROM public.staff other
    WHERE other.auth_user_id = u.id
      AND other.id <> s.id
  );

COMMIT;
