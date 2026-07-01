-- Service-type reporting: Internet / Cable / Both across reports, areas, dashboard, and customer portal.

-- ---------------------------------------------------------------------------
-- 1. Reports summary with p_service_type
-- ---------------------------------------------------------------------------
drop function if exists public.get_reports_summary(text);
drop function if exists public.get_reports_summary(text, uuid);
drop function if exists public.get_reports_summary(text, uuid, text);

create or replace function public.get_reports_summary(
  p_month text,
  p_area_id uuid default null,
  p_service_type text default 'both'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_month text := left(trim(coalesce(p_month, to_char(current_date, 'YYYY-MM'))), 7);
  v_service text := lower(trim(coalesce(p_service_type, 'both')));
  v_month_start date;
  v_next_month date;
  v_payload jsonb;
begin
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Report month must be in YYYY-MM format';
  end if;

  if v_service not in ('internet', 'cable', 'both') then
    raise exception 'Service type must be internet, cable, or both';
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
    select
      bills.id,
      bills.amount,
      bills.paid_amount,
      bills.status,
      bills.month,
      bills.collected_by,
      bills.customer_id
    from public.bills
    join public.customers on customers.id = bills.customer_id
    where (p_area_id is null or customers.area_id = p_area_id)
      and v_service in ('internet', 'both')
    union all
    select
      cable_bills.id,
      cable_bills.amount,
      cable_bills.paid_amount,
      cable_bills.status,
      cable_bills.month,
      cable_bills.collected_by,
      cable_bills.customer_id
    from public.cable_bills
    join public.customers on customers.id = cable_bills.customer_id
    where (p_area_id is null or customers.area_id = p_area_id)
      and v_service in ('cable', 'both')
  ),
  scoped_payments as (
    select
      payments.id,
      payments.amount,
      payments.paid_at,
      payments.collected_by,
      payments.customer_id
    from public.payments
    join public.customers on customers.id = payments.customer_id
    where (p_area_id is null or customers.area_id = p_area_id)
      and v_service in ('internet', 'both')
    union all
    select
      cable_payments.id,
      cable_payments.amount,
      cable_payments.paid_at,
      cable_payments.collected_by,
      cable_payments.customer_id
    from public.cable_payments
    join public.customers on customers.id = cable_payments.customer_id
    where (p_area_id is null or customers.area_id = p_area_id)
      and v_service in ('cable', 'both')
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
    where (p_area_id is null or customers.area_id = p_area_id)
      and (
        v_service = 'both'
        or (v_service = 'internet' and customers.has_internet = true)
        or (v_service = 'cable' and customers.has_cable = true)
      )
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
    'serviceType', v_service,
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

revoke all on function public.get_reports_summary(text, uuid, text) from public, anon;
grant execute on function public.get_reports_summary(text, uuid, text) to authenticated;
grant execute on function public.get_reports_summary(text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Area financial summaries with p_service_type
-- ---------------------------------------------------------------------------
drop function if exists public.get_area_financial_summaries(text);
drop function if exists public.get_area_financial_summaries(text, text);

create or replace function public.get_area_financial_summaries(
  p_month text,
  p_service_type text default 'both'
)
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
  with service as (
    select lower(trim(coalesce(p_service_type, 'both'))) as kind
  ),
  cable_price as (
    select coalesce((select monthly_price from public.cable_settings where id = 1), 0)::integer as price
  ),
  internet_customers as (
    select
      customers.id,
      customers.area_id,
      coalesce(customers.due_amount, packages.default_price, 0)::integer as monthly_amount
    from public.customers
    left join public.packages on packages.id = customers.package_id
    cross join service
    where customers.area_id is not null
      and customers.status = 'active'
      and customers.has_internet = true
      and service.kind in ('internet', 'both')
      and coalesce(customers.due_amount, packages.default_price, 0) > 0
  ),
  cable_customers as (
    select
      customers.id,
      customers.area_id,
      cable_price.price as monthly_amount
    from public.customers
    cross join cable_price
    cross join service
    where customers.area_id is not null
      and customers.status = 'active'
      and customers.has_cable = true
      and service.kind in ('cable', 'both')
      and cable_price.price > 0
  ),
  active_customers as (
    select * from internet_customers
    union all
    select * from cable_customers
  ),
  internet_bill_totals as (
    select
      customers.area_id,
      coalesce(sum(bills.paid_amount), 0)::integer as received,
      coalesce(sum(greatest(bills.amount - coalesce(bills.paid_amount, 0), 0)), 0)::integer as pending
    from public.bills
    join public.customers on customers.id = bills.customer_id
    cross join service
    where bills.month = left(trim(p_month), 7)
      and customers.area_id is not null
      and service.kind in ('internet', 'both')
    group by customers.area_id
  ),
  cable_bill_totals as (
    select
      customers.area_id,
      coalesce(sum(cable_bills.paid_amount), 0)::integer as received,
      coalesce(sum(greatest(cable_bills.amount - coalesce(cable_bills.paid_amount, 0), 0)), 0)::integer as pending
    from public.cable_bills
    join public.customers on customers.id = cable_bills.customer_id
    cross join service
    where cable_bills.month = left(trim(p_month), 7)
      and customers.area_id is not null
      and service.kind in ('cable', 'both')
    group by customers.area_id
  ),
  bill_totals as (
    select area_id, sum(received)::integer as received, sum(pending)::integer as pending
    from (
      select area_id, received, pending from internet_bill_totals
      union all
      select area_id, received, pending from cable_bill_totals
    ) combined
    group by area_id
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

revoke all on function public.get_area_financial_summaries(text, text) from public, anon;
grant execute on function public.get_area_financial_summaries(text, text) to authenticated;
grant execute on function public.get_area_financial_summaries(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Dashboard summary with cable breakdown
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with cable_price as (
    select coalesce((select monthly_price from public.cable_settings where id = 1), 0)::integer as price
  ),
  stats as (
    select
      (select count(*) from public.customers) as total_customers,
      (select count(*) from public.customers where status = 'active') as active_customers,
      (select count(*) from public.bills where status <> 'paid') as unpaid_internet_bills,
      (select count(*) from public.cable_bills where status <> 'paid') as unpaid_cable_bills,
      (select count(*) from public.complaints where status = 'open') as open_complaints,
      (select count(*) from public.staff where is_active = true) as active_staff,
      coalesce((
        select sum(coalesce(customers.due_amount, packages.default_price, 0))
        from public.customers
        left join public.packages on packages.id = customers.package_id
        where customers.status = 'active'
          and customers.has_internet = true
          and coalesce(customers.due_amount, packages.default_price, 0) > 0
      ), 0) as expected_internet_revenue,
      coalesce((
        select count(*) * (select price from cable_price)
        from public.customers
        where customers.status = 'active'
          and customers.has_cable = true
      ), 0) as expected_cable_revenue,
      coalesce((
        select sum(amount)
        from public.payments
        where paid_at >= date_trunc('month', now())
          and paid_at < date_trunc('month', now()) + interval '1 month'
      ), 0) as monthly_internet_revenue,
      coalesce((
        select sum(amount)
        from public.cable_payments
        where paid_at >= date_trunc('month', now())
          and paid_at < date_trunc('month', now()) + interval '1 month'
      ), 0) as monthly_cable_revenue,
      coalesce((
        select sum(greatest(amount - coalesce(paid_amount, 0), 0))
        from public.bills
        where status <> 'paid'
      ), 0) as pending_internet_revenue,
      coalesce((
        select sum(greatest(amount - coalesce(paid_amount, 0), 0))
        from public.cable_bills
        where status <> 'paid'
      ), 0) as pending_cable_revenue
  ),
  complaint_stats as (
    select
      count(*) filter (where status = 'open') as open,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'resolved') as resolved
    from public.complaints
  ),
  months as (
    select generate_series(
      date_trunc('month', now()) - interval '5 months',
      date_trunc('month', now()),
      interval '1 month'
    )::date as month_start
  ),
  internet_revenue_months as (
    select
      months.month_start,
      to_char(months.month_start, 'Mon') as label,
      coalesce(sum(payments.amount), 0) as total
    from months
    left join public.payments
      on payments.paid_at >= months.month_start
     and payments.paid_at < months.month_start + interval '1 month'
    group by months.month_start
  ),
  cable_revenue_months as (
    select
      months.month_start,
      to_char(months.month_start, 'Mon') as label,
      coalesce(sum(cable_payments.amount), 0) as total
    from months
    left join public.cable_payments
      on cable_payments.paid_at >= months.month_start
     and cable_payments.paid_at < months.month_start + interval '1 month'
    group by months.month_start
  )
  select jsonb_build_object(
    'totalCustomers', stats.total_customers,
    'activeCustomers', stats.active_customers,
    'unpaidBills', stats.unpaid_internet_bills + stats.unpaid_cable_bills,
    'unpaidInternetBills', stats.unpaid_internet_bills,
    'unpaidCableBills', stats.unpaid_cable_bills,
    'openComplaints', stats.open_complaints,
    'monthlyRevenue', stats.monthly_internet_revenue + stats.monthly_cable_revenue,
    'monthlyInternetRevenue', stats.monthly_internet_revenue,
    'monthlyCableRevenue', stats.monthly_cable_revenue,
    'expectedRevenue', stats.expected_internet_revenue + stats.expected_cable_revenue,
    'expectedInternetRevenue', stats.expected_internet_revenue,
    'expectedCableRevenue', stats.expected_cable_revenue,
    'pendingRevenue', stats.pending_internet_revenue + stats.pending_cable_revenue,
    'pendingInternetRevenue', stats.pending_internet_revenue,
    'pendingCableRevenue', stats.pending_cable_revenue,
    'activeStaff', stats.active_staff,
    'complaintsByStatus', jsonb_build_object(
      'open', complaint_stats.open,
      'in_progress', complaint_stats.in_progress,
      'resolved', complaint_stats.resolved
    ),
    'revenueByMonth', (
      select jsonb_agg(
        jsonb_build_object(
          'm', internet_revenue_months.label,
          'v', round((internet_revenue_months.total + coalesce(cable_revenue_months.total, 0)) / 1000.0)::int
        )
        order by internet_revenue_months.month_start
      )
      from internet_revenue_months
      left join cable_revenue_months
        on cable_revenue_months.month_start = internet_revenue_months.month_start
    ),
    'revenueByMonthInternet', (
      select jsonb_agg(
        jsonb_build_object('m', label, 'v', round(total / 1000.0)::int)
        order by month_start
      )
      from internet_revenue_months
    ),
    'revenueByMonthCable', (
      select jsonb_agg(
        jsonb_build_object('m', label, 'v', round(total / 1000.0)::int)
        order by month_start
      )
      from cable_revenue_months
    )
  )
  from stats, complaint_stats;
$$;

-- ---------------------------------------------------------------------------
-- 4. Customer balance summary with cable fields
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_balance_summary(
  p_customer_id uuid,
  p_current_month text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select left(trim(p_current_month), 7) as current_month
  ),
  bill_rows as (
    select
      id,
      month,
      amount,
      coalesce(paid_amount, 0) as paid_amount,
      status,
      greatest(amount - coalesce(paid_amount, 0), 0) as remaining
    from public.bills
    where customer_id = p_customer_id
  ),
  cable_bill_rows as (
    select
      id,
      month,
      amount,
      coalesce(paid_amount, 0) as paid_amount,
      status,
      greatest(amount - coalesce(paid_amount, 0), 0) as remaining
    from public.cable_bills
    where customer_id = p_customer_id
  ),
  internet_totals as (
    select
      coalesce(sum(b.remaining) filter (where b.status <> 'paid' and b.month = i.current_month), 0)::integer as current_due,
      coalesce(sum(b.remaining) filter (where b.status <> 'paid' and b.month < i.current_month), 0)::integer as previous_due,
      coalesce(sum(b.remaining) filter (where b.status <> 'paid'), 0)::integer as total_outstanding,
      coalesce(sum(b.paid_amount), 0)::integer as total_paid,
      count(*) filter (where b.status <> 'paid' and b.remaining > 0)::integer as open_bill_count
    from bill_rows b
    cross join input i
  ),
  internet_current_bill as (
    select b.id
    from bill_rows b
    cross join input i
    where b.month = i.current_month
    order by b.month desc
    limit 1
  ),
  cable_totals as (
    select
      coalesce(sum(cb.remaining) filter (where cb.status <> 'paid' and cb.month = i.current_month), 0)::integer as cable_current_due,
      coalesce(sum(cb.remaining) filter (where cb.status <> 'paid' and cb.month < i.current_month), 0)::integer as cable_previous_due,
      coalesce(sum(cb.remaining) filter (where cb.status <> 'paid'), 0)::integer as cable_total_outstanding,
      coalesce(sum(cb.paid_amount), 0)::integer as cable_total_paid,
      count(*) filter (where cb.status <> 'paid' and cb.remaining > 0)::integer as cable_open_bill_count
    from cable_bill_rows cb
    cross join input i
  ),
  cable_current_bill as (
    select cb.id
    from cable_bill_rows cb
    cross join input i
    where cb.month = i.current_month
    order by cb.month desc
    limit 1
  )
  select jsonb_build_object(
    'currentDue', internet_totals.current_due,
    'previousDue', internet_totals.previous_due,
    'totalOutstanding', internet_totals.total_outstanding,
    'totalPaid', internet_totals.total_paid,
    'openBillCount', internet_totals.open_bill_count,
    'currentBillId', internet_current_bill.id,
    'cableCurrentDue', cable_totals.cable_current_due,
    'cablePreviousDue', cable_totals.cable_previous_due,
    'cableTotalOutstanding', cable_totals.cable_total_outstanding,
    'cableTotalPaid', cable_totals.cable_total_paid,
    'cableOpenBillCount', cable_totals.cable_open_bill_count,
    'cableCurrentBillId', cable_current_bill.id
  )
  from internet_totals
  cross join cable_totals
  left join internet_current_bill on true
  left join cable_current_bill on true;
$$;

-- ---------------------------------------------------------------------------
-- 5. Customer portal RLS for cable bills and payments
-- ---------------------------------------------------------------------------
drop policy if exists cable_bills_customer_select_own on public.cable_bills;
create policy cable_bills_customer_select_own
  on public.cable_bills
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customers
      where customers.id = cable_bills.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );

drop policy if exists cable_payments_customer_select_own on public.cable_payments;
create policy cable_payments_customer_select_own
  on public.cable_payments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.customers
      where customers.id = cable_payments.customer_id
        and customers.auth_user_id = auth.uid()
    )
  );
