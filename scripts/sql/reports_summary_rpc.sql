create or replace function public.get_reports_summary(p_month text)
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
  revenue_months as (
    select
      month_keys.month_start,
      month_keys.label,
      coalesce(sum(bills.amount), 0)::integer as total
    from month_keys
    left join public.bills on bills.month = month_keys.month_key
    group by month_keys.month_start, month_keys.label
  ),
  daily_collection as (
    select
      days.sort_order,
      days.label,
      coalesce(sum(payments.amount), 0)::integer as total
    from (values
      (1, 'Mon'),
      (2, 'Tue'),
      (3, 'Wed'),
      (4, 'Thu'),
      (5, 'Fri'),
      (6, 'Sat'),
      (7, 'Sun')
    ) as days(sort_order, label)
    left join public.payments
      on extract(isodow from payments.paid_at)::integer = days.sort_order
     and payments.paid_at >= v_month_start
     and payments.paid_at < v_next_month
    group by days.sort_order, days.label
  ),
  complaints_months as (
    select
      month_keys.month_start,
      month_keys.label,
      count(complaints.id)::integer as total
    from month_keys
    left join public.complaints
      on complaints.opened_at >= month_keys.month_start
     and complaints.opened_at < month_keys.month_start + interval '1 month'
    group by month_keys.month_start, month_keys.label
  ),
  customers_months as (
    select
      month_keys.month_start,
      month_keys.label,
      count(customers.id)::integer as total
    from month_keys
    left join public.customers
      on customers.created_at < month_keys.month_start + interval '1 month'
    group by month_keys.month_start, month_keys.label
  ),
  payment_totals as (
    select
      payments.collected_by as staff_id,
      count(payments.id)::integer as payments_count,
      coalesce(sum(payments.amount), 0)::integer as collected
    from public.payments
    where payments.paid_at >= v_month_start
      and payments.paid_at < v_next_month
    group by payments.collected_by
  ),
  pending_totals as (
    select
      bills.collected_by as staff_id,
      coalesce(sum(greatest(bills.amount - coalesce(bills.paid_amount, 0), 0)), 0)::integer as pending
    from public.bills
    where bills.month = v_month
      and bills.status <> 'paid'
    group by bills.collected_by
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
      coalesce((select sum(amount) from public.bills where month = v_month), 0)::integer as revenue,
      coalesce((
        select sum(amount)
        from public.payments
        where paid_at >= v_month_start
          and paid_at < v_next_month
      ), 0)::integer as collections,
      coalesce((
        select sum(greatest(amount - coalesce(paid_amount, 0), 0))
        from public.bills
        where month = v_month
          and status <> 'paid'
      ), 0)::integer as pending,
      coalesce((
        select count(*)
        from public.complaints
        where opened_at >= v_month_start
          and opened_at < v_next_month
      ), 0)::integer as complaints,
      coalesce((
        select count(*)
        from public.customers
        where created_at < v_next_month
      ), 0)::integer as customers
  )
  select jsonb_build_object(
    'month', v_month,
    'cards', jsonb_build_object(
      'revenue', cards.revenue,
      'collections', cards.collections,
      'pending', cards.pending,
      'complaints', cards.complaints,
      'customers', cards.customers
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
grant execute on function public.get_reports_summary(text) to authenticated;
grant execute on function public.get_reports_summary(text) to service_role;
