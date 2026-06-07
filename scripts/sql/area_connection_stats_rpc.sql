-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard)
-- It calculates total, active, and inactive customer connections for each active area.

create or replace function public.get_area_connection_stats()
returns table(
  area_id uuid,
  area_name text,
  total_connections bigint,
  active_connections bigint,
  inactive_connections bigint
)
language sql
security definer
set search_path = public
as $$
  select 
    a.id as area_id,
    a.name as area_name,
    count(c.id)::bigint as total_connections,
    count(case when c.status in ('active', 'free') then 1 end)::bigint as active_connections,
    count(case when c.status not in ('active', 'free') then 1 end)::bigint as inactive_connections
  from public.areas a
  left join public.customers c on c.area_id = a.id and c.status is not null
  where a.is_active is true
  group by a.id, a.name
  order by a.name;
$$;

revoke all on function public.get_area_connection_stats() from public;
revoke execute on function public.get_area_connection_stats() from anon;
grant execute on function public.get_area_connection_stats() to authenticated;
grant execute on function public.get_area_connection_stats() to service_role;
