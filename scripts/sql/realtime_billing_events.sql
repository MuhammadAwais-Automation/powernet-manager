-- Required for dashboard live payment notifications and billing auto-refresh.
-- Run once in Supabase SQL editor after the billing tables exist.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bills'
  ) then
    alter publication supabase_realtime add table public.bills;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;

  -- Ensure all column values are sent in the old payload of updates (needed for correct realtime notifications comparison)
  alter table public.bills replica identity full;
end $$;
