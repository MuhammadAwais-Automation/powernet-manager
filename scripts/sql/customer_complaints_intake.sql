-- Customer complaint intake: customer app inserts, dashboard triages, realtime refreshes.
-- Run after the core complaints/customers/staff schema and customer_portal.sql.

begin;

alter table public.complaints
  add column if not exists resolution_notes text,
  add column if not exists hardware_used text;

create sequence if not exists public.complaints_complaint_code_seq start 1001;

create or replace function public.set_complaint_code()
returns trigger
language plpgsql
as $$
begin
  if new.complaint_code is null or length(trim(new.complaint_code)) = 0 then
    new.complaint_code := 'CMP-' || nextval('public.complaints_complaint_code_seq')::text;
  end if;
  return new;
end;
$$;

drop trigger if exists set_complaint_code_before_insert on public.complaints;
create trigger set_complaint_code_before_insert
before insert on public.complaints
for each row execute function public.set_complaint_code();

alter table public.complaints enable row level security;

drop policy if exists complaints_customer_select_own on public.complaints;
create policy complaints_customer_select_own
  on public.complaints
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customers
      where customers.id = complaints.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );

drop policy if exists complaints_customer_insert_own on public.complaints;
create policy complaints_customer_insert_own
  on public.complaints
  for insert
  to authenticated
  with check (
    status = 'open'
    and assigned_to is null
    and exists (
      select 1
      from public.customers
      where customers.id = complaints.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );

drop policy if exists complaints_dashboard_staff_all on public.complaints;
create policy complaints_dashboard_staff_all
  on public.complaints
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.staff
      where staff.auth_user_id = auth.uid()
        and staff.is_active = true
        and staff.role in ('admin', 'complaint_manager', 'technician')
    )
  )
  with check (
    exists (
      select 1
      from public.staff
      where staff.auth_user_id = auth.uid()
        and staff.is_active = true
        and staff.role in ('admin', 'complaint_manager', 'technician')
    )
  );

create index if not exists complaints_customer_status_opened_idx
  on public.complaints (customer_id, status, opened_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'complaints'
  ) then
    alter publication supabase_realtime add table public.complaints;
  end if;

  alter table public.complaints replica identity full;
end $$;

commit;
