create or replace function public.get_area_customer_counts()
returns table(area_id uuid, count bigint)
language sql
security definer
set search_path = public
as $$
  select customers.area_id, count(*)::bigint as count
  from public.customers
  where customers.area_id is not null
  group by customers.area_id;
$$;

revoke all on function public.get_area_customer_counts() from public;
revoke execute on function public.get_area_customer_counts() from anon;
grant execute on function public.get_area_customer_counts() to authenticated;
grant execute on function public.get_area_customer_counts() to service_role;
