-- Customer portal V1: signup approvals, customer auth linking, and customer app access.
-- Run in Supabase SQL editor after the existing core schema is present.

begin;

alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists house_id text,
  add column if not exists father_name text,
  add column if not exists gender text,
  add column if not exists profession text,
  add column if not exists rank_or_position text,
  add column if not exists unit text,
  add column if not exists whatsapp text,
  add column if not exists email text;

create unique index if not exists customers_auth_user_id_uidx
  on public.customers(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists customers_house_id_uidx
  on public.customers(lower(house_id))
  where house_id is not null and length(trim(house_id)) > 0;

create table if not exists public.customer_signup_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  father_name text,
  cnic text not null,
  gender text,
  profession text,
  rank_or_position text,
  unit text,
  phone text not null,
  whatsapp text,
  area_id uuid not null references public.areas(id),
  package_id uuid not null references public.packages(id),
  house_id text not null,
  street_address text,
  email text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  approved_customer_id uuid references public.customers(id) on delete set null,
  reviewed_by uuid references public.staff(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists customer_signup_requests_pending_house_uidx
  on public.customer_signup_requests(lower(house_id))
  where status = 'pending';

create index if not exists customer_signup_requests_status_created_idx
  on public.customer_signup_requests(status, created_at desc);

alter table public.customer_signup_requests enable row level security;

drop policy if exists customer_signup_requests_anon_insert on public.customer_signup_requests;
create policy customer_signup_requests_anon_insert
  on public.customer_signup_requests
  for insert
  to anon
  with check (status = 'pending');

drop policy if exists customer_signup_requests_auth_read on public.customer_signup_requests;
create policy customer_signup_requests_auth_read
  on public.customer_signup_requests
  for select
  to authenticated
  using (true);

drop policy if exists customer_signup_requests_auth_update on public.customer_signup_requests;
create policy customer_signup_requests_auth_update
  on public.customer_signup_requests
  for update
  to authenticated
  using (true)
  with check (true);

create or replace function public.customer_login_lookup(p_identifier text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_norm_ident text;
begin
  -- Normalize user input for robust alphanumeric matching (matching TS email formatting)
  v_norm_ident := trim(both '_' from regexp_replace(lower(trim(p_identifier)), '[^a-z0-9]+', '_', 'g'));

  select *
    into v_customer
    from public.customers
   where auth_user_id is not null
     and status = 'active'
     and (
       trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(house_id), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       or trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(username), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       or trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(address_value), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       or trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(customer_code), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       or regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') =
          regexp_replace(coalesce(p_identifier, ''), '[^0-9]', '', 'g')
     )
   order by created_at desc
   limit 1;

  if v_customer.id is null then
    return json_build_object('success', false, 'error', 'Customer account not found');
  end if;

  return json_build_object(
    'success', true,
    'email', 'customer_' ||
      trim(both '_' from regexp_replace(
        lower(coalesce(
          nullif(trim(v_customer.house_id), ''),
          nullif(trim(v_customer.username), ''),
          nullif(trim(v_customer.address_value), ''),
          nullif(trim(v_customer.customer_code), '')
        )),
        '[^a-z0-9]+',
        '_',
        'g'
      )) ||
      '@powernet.local'
  );
end;
$$;

grant execute on function public.customer_login_lookup(text) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_signup_requests'
  ) then
    alter publication supabase_realtime add table public.customer_signup_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customers'
  ) then
    alter publication supabase_realtime add table public.customers;
  end if;
end $$;

commit;
