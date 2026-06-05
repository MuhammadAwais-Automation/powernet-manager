alter table public.bills
  add column if not exists paid_amount integer not null default 0,
  add column if not exists receipt_no text,
  add column if not exists payment_method text,
  add column if not exists payment_note text;

create unique index if not exists bills_customer_month_key
  on public.bills (customer_id, month);

create index if not exists bills_month_status_idx
  on public.bills (month, status);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount integer not null check (amount > 0),
  collected_by uuid references public.staff(id),
  method text not null default 'cash' check (method in ('cash', 'bank', 'easypaisa', 'jazzcash', 'other')),
  note text,
  receipt_no text not null unique,
  paid_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now()
);

alter table public.payments enable row level security;

drop policy if exists payments_auth_all on public.payments;
create policy payments_auth_all
  on public.payments
  for all
  to authenticated
  using (true)
  with check (true);

create index if not exists payments_bill_id_idx on public.payments (bill_id);
create index if not exists payments_customer_id_idx on public.payments (customer_id);
create index if not exists payments_collected_by_idx on public.payments (collected_by);
create index if not exists payments_paid_at_idx on public.payments (paid_at desc);

create or replace function public.generate_monthly_bills(p_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := left(trim(p_month), 7);
  v_eligible integer := 0;
  v_existing integer := 0;
  v_zero_amount integer := 0;
  v_created integer := 0;
begin
  if v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Billing month must be in YYYY-MM format';
  end if;

  with billable as (
    select
      customers.id as customer_id,
      coalesce(customers.due_amount, packages.default_price, 0) as amount
    from public.customers
    left join public.packages on packages.id = customers.package_id
    where customers.status = 'active'
  )
  select
    count(*),
    count(*) filter (
      where amount > 0
        and exists (
          select 1
          from public.bills
          where bills.customer_id = billable.customer_id
            and bills.month = v_month
        )
    ),
    count(*) filter (where amount <= 0)
  into v_eligible, v_existing, v_zero_amount
  from billable;

  insert into public.bills (customer_id, amount, month, status, paid_amount)
  select customer_id, amount, v_month, 'pending', 0
  from (
    select
      customers.id as customer_id,
      coalesce(customers.due_amount, packages.default_price, 0) as amount
    from public.customers
    left join public.packages on packages.id = customers.package_id
    where customers.status = 'active'
  ) billable
  where amount > 0
  on conflict (customer_id, month) do nothing;

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'month', v_month,
    'eligible', v_eligible,
    'created', v_created,
    'existing', v_existing,
    'zeroAmount', v_zero_amount
  );
end;
$$;

create or replace function public.record_bill_payment(
  p_bill_id uuid,
  p_amount integer,
  p_collected_by uuid default null,
  p_method text default 'cash',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
  v_current_paid integer;
  v_remaining integer;
  v_new_paid integer;
  v_new_status text;
  v_receipt text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_method not in ('cash', 'bank', 'easypaisa', 'jazzcash', 'other') then
    raise exception 'Invalid payment method';
  end if;

  select * into v_bill
  from public.bills
  where id = p_bill_id
  for update;

  if not found then
    raise exception 'Bill not found';
  end if;

  v_current_paid := coalesce(v_bill.paid_amount, 0);
  v_remaining := greatest(v_bill.amount - v_current_paid, 0);

  if v_remaining <= 0 then
    raise exception 'Bill is already fully paid';
  end if;

  if p_amount > v_remaining then
    raise exception 'Payment amount exceeds remaining balance';
  end if;

  v_new_paid := v_current_paid + p_amount;
  v_new_status := case when v_new_paid >= v_bill.amount then 'paid' else v_bill.status end;
  v_receipt := 'RCPT-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));

  insert into public.payments (
    bill_id,
    customer_id,
    amount,
    collected_by,
    method,
    note,
    receipt_no
  )
  values (
    v_bill.id,
    v_bill.customer_id,
    p_amount,
    p_collected_by,
    p_method,
    nullif(trim(coalesce(p_note, '')), ''),
    v_receipt
  );

  update public.bills
  set
    paid_amount = v_new_paid,
    status = v_new_status,
    collected_by = coalesce(p_collected_by, collected_by),
    paid_at = case when v_new_status = 'paid' then current_date else paid_at end,
    receipt_no = case when v_new_status = 'paid' then v_receipt else receipt_no end,
    payment_method = p_method,
    payment_note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_bill.id;

  return jsonb_build_object(
    'billId', v_bill.id,
    'customerId', v_bill.customer_id,
    'amountPaid', p_amount,
    'paidAmount', v_new_paid,
    'remainingAmount', greatest(v_bill.amount - v_new_paid, 0),
    'status', v_new_status,
    'receiptNo', v_receipt
  );
end;
$$;

revoke all on function public.generate_monthly_bills(text) from public;
revoke execute on function public.generate_monthly_bills(text) from anon;
grant execute on function public.generate_monthly_bills(text) to authenticated;
grant execute on function public.generate_monthly_bills(text) to service_role;

revoke all on function public.record_bill_payment(uuid, integer, uuid, text, text) from public;
revoke execute on function public.record_bill_payment(uuid, integer, uuid, text, text) from anon;
grant execute on function public.record_bill_payment(uuid, integer, uuid, text, text) to authenticated;
grant execute on function public.record_bill_payment(uuid, integer, uuid, text, text) to service_role;
