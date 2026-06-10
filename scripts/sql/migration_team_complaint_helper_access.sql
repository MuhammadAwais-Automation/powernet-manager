-- Allow helpers to participate in team-assigned complaint work.
-- Run in Supabase SQL editor after customer_complaints_intake.sql and migration_complaint_timestamps.sql.

begin;

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
        and staff.role in ('admin', 'complaint_manager', 'technician', 'helper')
    )
  )
  with check (
    exists (
      select 1
      from public.staff
      where staff.auth_user_id = auth.uid()
        and staff.is_active = true
        and staff.role in ('admin', 'complaint_manager', 'technician', 'helper')
    )
  );

drop policy if exists complaint_events_staff_select on public.complaint_events;
create policy complaint_events_staff_select
  on public.complaint_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff
      where staff.auth_user_id = auth.uid()
        and staff.is_active = true
        and staff.role in ('admin', 'complaint_manager', 'technician', 'helper')
    )
  );

create index if not exists complaints_team_status_opened_idx
  on public.complaints (team_id, status, opened_at desc)
  where team_id is not null;

commit;
