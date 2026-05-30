create or replace function public.get_reports_summary(
  p_month text,
  p_area_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_month text := left(trim(coalesce(p_month, to_char(current_date, 'YYYY-MM'))), 7);
  v_month_start date;
  v_next_month date;
  v_payload jsonb;
begin
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Report month must be in YYYY-MM format';
  end if;

  v_month_start := to_date(v_month || '-01', 'YYYY-MM-DD')::date;
  v_next_month := (v_month_start + interval '1 month')::date;

  with month_series as (
    select generate_series(v_month_start - interval '5 months', v_month_start, interval '1 month')::date as month_start
  ),
  month_keys as (
    select
      month_start,
      to_char(month_start, 'YYYY-MM') as month_key,
      to_char(month_start, 'Mon') as label
    from month_series
  ),
  scoped_bills as (
    select bills.*
    from public.bills
    join public.customers on customers.id = bills.customer_id
    where p_area_id is null or customers.area_id = p_area_id
  ),
  scoped_payments as (
    select payments.*
    from public.payments
    join public.customers on customers.id = payments.customer_id
    where p_area_id is null or customers.area_id = p_area_id
  ),
  scoped_complaints as (
    select complaints.*
    from public.complaints
    left join public.customers on customers.id = complaints.customer_id
    where p_area_id is null or customers.area_id = p_area_id
  ),
  scoped_customers as (
    select customers.*
    from public.customers
    where p_area_id is null or customers.area_id = p_area_id
  ),
  revenue_months as (
    select
      month_keys.month_start,
      month_keys.label,
      coalesce(sum(scoped_bills.amount), 0)::integer as total
    from month_keys
    left join scoped_bills on scoped_bills.month = month_keys.month_key
    group by month_keys.month_start, month_keys.label
  ),
  daily_collection as (
    select
      days.sort_order,
      days.label,
      coalesce(sum(scoped_payments.amount), 0)::integer as total
    from (values
      (1, 'Mon'),
      (2, 'Tue'),
      (3, 'Wed'),
      (4, 'Thu'),
      (5, 'Fri'),
      (6, 'Sat'),
      (7, 'Sun')
    ) as days(sort_order, label)
    left join scoped_payments
      on extract(isodow from scoped_payments.paid_at)::integer = days.sort_order
     and scoped_payments.paid_at >= v_month_start
     and scoped_payments.paid_at < v_next_month
    group by days.sort_order, days.label
  ),
  complaints_months as (
    select
      month_keys.month_start,
      month_keys.label,
      count(scoped_complaints.id)::integer as total
    from month_keys
    left join scoped_complaints
      on scoped_complaints.opened_at >= month_keys.month_start
     and scoped_complaints.opened_at < month_keys.month_start + interval '1 month'
    group by month_keys.month_start, month_keys.label
  ),
  customers_months as (
    select
      month_keys.month_start,
      month_keys.label,
      count(scoped_customers.id) filter (
        where scoped_customers.created_at < month_keys.month_start + interval '1 month'
          and (
            scoped_customers.disconnected_date is null
            or scoped_customers.disconnected_date >= month_keys.month_start + interval '1 month'
            or scoped_customers.reconnected_date < month_keys.month_start + interval '1 month'
          )
      )::integer as total
    from month_keys
    left join scoped_customers on scoped_customers.created_at < month_keys.month_start + interval '1 month'
    group by month_keys.month_start, month_keys.label
  ),
  customer_growth_months as (
    select
      month_keys.month_start,
      month_keys.label,
      (
        count(scoped_customers.id) filter (
          where scoped_customers.created_at >= month_keys.month_start
            and scoped_customers.created_at < month_keys.month_start + interval '1 month'
        )
        - count(scoped_customers.id) filter (
          where scoped_customers.disconnected_date >= month_keys.month_start
            and scoped_customers.disconnected_date < month_keys.month_start + interval '1 month'
        )
        + count(scoped_customers.id) filter (
          where scoped_customers.reconnected_date >= month_keys.month_start
            and scoped_customers.reconnected_date < month_keys.month_start + interval '1 month'
        )
      )::integer as total
    from month_keys
    left join scoped_customers on true
    group by month_keys.month_start, month_keys.label
  ),
  payment_totals as (
    select
      scoped_payments.collected_by as staff_id,
      count(scoped_payments.id)::integer as payments_count,
      coalesce(sum(scoped_payments.amount), 0)::integer as collected
    from scoped_payments
    where scoped_payments.paid_at >= v_month_start
      and scoped_payments.paid_at < v_next_month
    group by scoped_payments.collected_by
  ),
  pending_totals as (
    select
      scoped_bills.collected_by as staff_id,
      coalesce(sum(greatest(scoped_bills.amount - coalesce(scoped_bills.paid_amount, 0), 0)), 0)::integer as pending
    from scoped_bills
    where scoped_bills.month = v_month
      and scoped_bills.status <> 'paid'
    group by scoped_bills.collected_by
  ),
  agent_base as (
    select
      staff.id as staff_id,
      staff.full_name,
      coalesce(areas.name, 'No area') as area_name
    from public.staff
    left join public.areas on areas.id = staff.area_id
    where staff.is_active is true
      and staff.role in ('recovery_agent', 'admin', 'complaint_manager')
      and (p_area_id is null or staff.area_id = p_area_id or p_area_id = any(coalesce(staff.area_ids, '{}')::uuid[]))
    union all
    select
      null::uuid as staff_id,
      'Unassigned / Manual' as full_name,
      'No area' as area_name
  ),
  agent_rows as (
    select
      agent_base.full_name,
      agent_base.area_name,
      coalesce(payment_totals.payments_count, 0)::integer as payments_count,
      coalesce(payment_totals.collected, 0)::integer as collected,
      coalesce(pending_totals.pending, 0)::integer as pending,
      case
        when coalesce(payment_totals.collected, 0) + coalesce(pending_totals.pending, 0) = 0 then 0
        else round(
          coalesce(payment_totals.collected, 0)::numeric
          * 100
          / (coalesce(payment_totals.collected, 0) + coalesce(pending_totals.pending, 0))
        )::integer
      end as collection_rate
    from agent_base
    left join payment_totals on payment_totals.staff_id is not distinct from agent_base.staff_id
    left join pending_totals on pending_totals.staff_id is not distinct from agent_base.staff_id
    where coalesce(payment_totals.collected, 0) > 0
       or coalesce(pending_totals.pending, 0) > 0
       or agent_base.staff_id is not null
    order by coalesce(payment_totals.collected, 0) desc, agent_base.full_name asc
    limit 10
  ),
  cards as (
    select
      coalesce((select sum(amount) from scoped_bills where month = v_month), 0)::integer as revenue,
      coalesce((
        select sum(amount)
        from scoped_payments
        where paid_at >= v_month_start
          and paid_at < v_next_month
      ), 0)::integer as collections,
      coalesce((
        select sum(greatest(amount - coalesce(paid_amount, 0), 0))
        from scoped_bills
        where month = v_month
          and status <> 'paid'
      ), 0)::integer as pending,
      coalesce((
        select count(*)
        from scoped_complaints
        where opened_at >= v_month_start
          and opened_at < v_next_month
      ), 0)::integer as complaints,
      coalesce((
        select count(*)
        from scoped_customers
        where created_at < v_next_month
          and (
            disconnected_date is null
            or disconnected_date >= v_next_month
            or reconnected_date < v_next_month
          )
      ), 0)::integer as customers,
      coalesce((
        select
          count(*) filter (where created_at >= v_month_start and created_at < v_next_month)
          - count(*) filter (where disconnected_date >= v_month_start and disconnected_date < v_next_month)
          + count(*) filter (where reconnected_date >= v_month_start and reconnected_date < v_next_month)
        from scoped_customers
      ), 0)::integer as growth
  )
  select jsonb_build_object(
    'month', v_month,
    'cards', jsonb_build_object(
      'revenue', cards.revenue,
      'collections', cards.collections,
      'pending', cards.pending,
      'complaints', cards.complaints,
      'customers', cards.customers,
      'growth', cards.growth
    ),
    'revenueMonths', coalesce((
      select jsonb_agg(jsonb_build_object('d', label, 'v', round(total::numeric / 1000)::integer) order by month_start)
      from revenue_months
    ), '[]'::jsonb),
    'dailyCollections', coalesce((
      select jsonb_agg(jsonb_build_object('d', label, 'v', round(total::numeric / 1000)::integer) order by sort_order)
      from daily_collection
    ), '[]'::jsonb),
    'complaintsMonths', coalesce((
      select jsonb_agg(jsonb_build_object('d', label, 'v', total) order by month_start)
      from complaints_months
    ), '[]'::jsonb),
    'customersMonths', coalesce((
      select jsonb_agg(jsonb_build_object('d', label, 'v', total) order by month_start)
      from customers_months
    ), '[]'::jsonb),
    'customerGrowthMonths', coalesce((
      select jsonb_agg(jsonb_build_object('d', label, 'v', total) order by month_start)
      from customer_growth_months
    ), '[]'::jsonb),
    'agentCollections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', full_name,
        'area', area_name,
        'payments', payments_count,
        'collected', collected,
        'pending', pending,
        'collectionRate', collection_rate
      ) order by collected desc, full_name asc)
      from agent_rows
    ), '[]'::jsonb)
  )
  into v_payload
  from cards;

  return v_payload;
end;
$$;

revoke all on function public.get_reports_summary(text) from public;
revoke execute on function public.get_reports_summary(text) from anon;
revoke all on function public.get_reports_summary(text, uuid) from public;
revoke execute on function public.get_reports_summary(text, uuid) from anon;
grant execute on function public.get_reports_summary(text, uuid) to authenticated;
grant execute on function public.get_reports_summary(text, uuid) to service_role;
