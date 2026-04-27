-- Optional hardening step after login/auth verification.
-- This app authenticates dashboard users with Supabase Auth, then reads/writes as
-- the authenticated role. Anonymous table access should not be needed in
-- production and also creates duplicate permissive policy warnings.
begin;

drop policy if exists anon_read on public.areas;
drop policy if exists anon_write on public.areas;

drop policy if exists anon_read on public.bills;
drop policy if exists anon_write on public.bills;

drop policy if exists anon_read on public.complaints;
drop policy if exists anon_write on public.complaints;

drop policy if exists anon_read on public.customers;
drop policy if exists anon_write on public.customers;

drop policy if exists anon_read on public.packages;
drop policy if exists anon_write on public.packages;

drop policy if exists anon_read on public.staff;
drop policy if exists anon_write on public.staff;

commit;
