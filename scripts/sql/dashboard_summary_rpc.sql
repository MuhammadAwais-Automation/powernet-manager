create or replace function public.get_dashboard_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with stats as (
    select
      (select count(*) from public.customers) as total_customers,
      (select count(*) from public.customers where status = 'active') as active_customers,
      (select count(*) from public.bills where status <> 'paid') as unpaid_bills,
      (select count(*) from public.complaints where status = 'open') as open_complaints,
      (select count(*) from public.staff where is_active = true) as active_staff,
      coalesce((
        select sum(amount)
        from public.bills
        where status = 'paid'
          and month like to_char(now(), 'YYYY-MM') || '%'
      ), 0) as monthly_revenue
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
  revenue_months as (
    select
      months.month_start,
      to_char(months.month_start, 'Mon') as label,
      coalesce(sum(bills.amount), 0) as total
    from months
    left join public.bills
      on bills.status = 'paid'
     and left(bills.month, 7) = to_char(months.month_start, 'YYYY-MM')
    group by months.month_start
  )
  select jsonb_build_object(
    'totalCustomers', stats.total_customers,
    'activeCustomers', stats.active_customers,
    'unpaidBills', stats.unpaid_bills,
    'openComplaints', stats.open_complaints,
    'monthlyRevenue', stats.monthly_revenue,
    'activeStaff', stats.active_staff,
    'complaintsByStatus', jsonb_build_object(
      'open', complaint_stats.open,
      'in_progress', complaint_stats.in_progress,
      'resolved', complaint_stats.resolved
    ),
    'revenueByMonth', (
      select jsonb_agg(
        jsonb_build_object('m', revenue_months.label, 'v', round(revenue_months.total / 1000.0)::int)
        order by revenue_months.month_start
      )
      from revenue_months
    )
  )
  from stats, complaint_stats;
$$;

revoke all on function public.get_dashboard_summary() from public;
revoke execute on function public.get_dashboard_summary() from anon;
grant execute on function public.get_dashboard_summary() to authenticated;
grant execute on function public.get_dashboard_summary() to service_role;
