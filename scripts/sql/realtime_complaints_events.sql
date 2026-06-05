-- Required for dashboard live complaint notifications and complaints auto-refresh.
-- Run once in Supabase SQL editor after the complaints table exists.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'complaints'
  ) then
    alter publication supabase_realtime add table public.complaints;
  end if;

  -- Ensure all column values are sent in the old payload of updates (needed for correct realtime notifications comparison)
  alter table public.complaints replica identity full;
end $$;
