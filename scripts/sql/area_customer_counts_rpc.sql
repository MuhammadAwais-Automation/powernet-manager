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

create or replace function public.get_area_financial_summaries(p_month text)
returns table(
  area_id uuid,
  customer_count bigint,
  staff_count bigint,
  expected_revenue integer,
  received_revenue integer,
  pending_revenue integer
)
language sql
security definer
set search_path = public
as $$
  with active_customers as (
    select
      customers.id,
      customers.area_id,
      coalesce(customers.due_amount, packages.default_price, 0)::integer as monthly_amount
    from public.customers
    left join public.packages on packages.id = customers.package_id
    where customers.area_id is not null
      and customers.status = 'active'
      and coalesce(customers.due_amount, packages.default_price, 0) > 0
  ),
  bill_totals as (
    select
      customers.area_id,
      coalesce(sum(bills.paid_amount), 0)::integer as received,
      coalesce(sum(greatest(bills.amount - coalesce(bills.paid_amount, 0), 0)), 0)::integer as pending
    from public.bills
    join public.customers on customers.id = bills.customer_id
    where bills.month = left(trim(p_month), 7)
      and customers.area_id is not null
    group by customers.area_id
  ),
  staff_totals as (
    select
      areas.id as area_id,
      count(staff.id)::bigint as staff_count
    from public.areas
    left join public.staff
      on staff.is_active is true
     and (
       staff.area_id = areas.id
       or areas.id = any(coalesce(staff.area_ids, '{}')::uuid[])
     )
    group by areas.id
  )
  select
    areas.id as area_id,
    count(active_customers.id)::bigint as customer_count,
    coalesce(staff_totals.staff_count, 0)::bigint as staff_count,
    coalesce(sum(active_customers.monthly_amount), 0)::integer as expected_revenue,
    coalesce(max(bill_totals.received), 0)::integer as received_revenue,
    coalesce(max(bill_totals.pending), 0)::integer as pending_revenue
  from public.areas
  left join active_customers on active_customers.area_id = areas.id
  left join bill_totals on bill_totals.area_id = areas.id
  left join staff_totals on staff_totals.area_id = areas.id
  where areas.is_active is true
  group by areas.id, staff_totals.staff_count;
$$;

revoke all on function public.get_area_financial_summaries(text) from public;
revoke execute on function public.get_area_financial_summaries(text) from anon;
grant execute on function public.get_area_financial_summaries(text) to authenticated;
grant execute on function public.get_area_financial_summaries(text) to service_role;
