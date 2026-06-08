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
  summary as (
    select
      coalesce(sum(remaining) filter (where status <> 'paid' and month = input.current_month), 0)::integer as current_due,
      coalesce(sum(remaining) filter (where status <> 'paid' and month < input.current_month), 0)::integer as previous_due,
      coalesce(sum(remaining) filter (where status <> 'paid'), 0)::integer as total_outstanding,
      coalesce(sum(paid_amount), 0)::integer as total_paid,
      count(*) filter (where status <> 'paid' and remaining > 0)::integer as open_bill_count,
      (
        select id
        from bill_rows
        where month = input.current_month
        order by month desc
        limit 1
      ) as current_bill_id
    from bill_rows, input
  )
  select jsonb_build_object(
    'currentDue', summary.current_due,
    'previousDue', summary.previous_due,
    'totalOutstanding', summary.total_outstanding,
    'totalPaid', summary.total_paid,
    'openBillCount', summary.open_bill_count,
    'currentBillId', summary.current_bill_id
  )
  from summary;
$$;

revoke all on function public.get_customer_balance_summary(uuid, text) from public;
revoke execute on function public.get_customer_balance_summary(uuid, text) from anon;
grant execute on function public.get_customer_balance_summary(uuid, text) to authenticated;
grant execute on function public.get_customer_balance_summary(uuid, text) to service_role;
