-- Database DDL Migration: Overdue billing and customer status transitions
-- Garrison due day: 5, Civilian due day: 10
-- TDC transitions for customers with overdue bills
-- Reactivation to active if no overdue bills left after payment

BEGIN;

-- 1. Update transition_pending_bills_to_overdue function
CREATE OR REPLACE FUNCTION public.transition_pending_bills_to_overdue()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_month text := to_char(now() at time zone 'Asia/Karachi', 'YYYY-MM');
  v_current_day integer := CAST(to_char(now() at time zone 'Asia/Karachi', 'DD') AS integer);
  v_updated integer := 0;
BEGIN
  -- Update bills to 'overdue' if past their due date
  UPDATE public.bills b
  SET status = 'overdue'
  FROM public.customers c
  LEFT JOIN public.areas a ON c.area_id = a.id
  WHERE b.customer_id = c.id
    AND b.status = 'pending'
    AND (
      b.month < v_current_month
      OR (
        b.month = v_current_month
        AND (
          (coalesce(a.type, 'civilian') = 'garrison' AND v_current_day > 5)
          OR (coalesce(a.type, 'civilian') = 'civilian' AND v_current_day > 10)
        )
      )
    );
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Update customers who have any overdue bills and are 'active' to 'tdc'
  UPDATE public.customers c
  SET status = 'tdc',
      disconnected_date = coalesce(c.disconnected_date, CURRENT_DATE)
  WHERE c.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.customer_id = c.id
        AND b.status = 'overdue'
    );

  RETURN v_updated;
END;
$function$;

-- 2. Update record_bill_payment function to reactivate customers on full payment
CREATE OR REPLACE FUNCTION public.record_bill_payment(
  p_bill_id uuid,
  p_amount integer,
  p_collected_by uuid DEFAULT null,
  p_method text DEFAULT 'cash',
  p_source text DEFAULT 'agent',
  p_paid_at timestamp with time zone DEFAULT null,
  p_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.bills%rowtype;
  v_current_paid integer;
  v_remaining integer;
  v_new_paid integer;
  v_new_status text;
  v_receipt text;
BEGIN
  -- Perform overdue transitions to ensure all statuses are up to date first
  perform public.transition_pending_bills_to_overdue();

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_method not in ('cash', 'bank', 'easypaisa', 'jazzcash', 'other') then
    raise exception 'Invalid payment method';
  end if;

  if p_source not in ('office', 'agent', 'customer', 'manual') then
    raise exception 'Invalid payment source';
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
    source,
    note,
    receipt_no,
    paid_at
  )
  values (
    v_bill.id,
    v_bill.customer_id,
    p_amount,
    p_collected_by,
    p_method,
    p_source,
    nullif(trim(coalesce(p_note, '')), ''),
    v_receipt,
    coalesce(p_paid_at, now())
  );

  update public.bills
  set
    paid_amount = v_new_paid,
    status = v_new_status,
    collected_by = coalesce(p_collected_by, collected_by),
    paid_at = case when v_new_status = 'paid' then coalesce(p_paid_at, now()) else paid_at end,
    receipt_no = case when v_new_status = 'paid' then v_receipt else receipt_no end,
    payment_method = p_method,
    payment_source = p_source,
    payment_note = nullif(trim(coalesce(p_note, '')), '')
  where id = v_bill.id;

  -- Reactivate customer if they have no more overdue bills and are currently 'tdc'
  UPDATE public.customers
  SET status = 'active',
      reconnected_date = CURRENT_DATE
  WHERE id = v_bill.customer_id
    AND status = 'tdc'
    AND NOT EXISTS (
      SELECT 1 
      FROM public.bills 
      WHERE bills.customer_id = v_bill.customer_id 
        AND bills.status = 'overdue'
    );

  return jsonb_build_object(
    'billId', v_bill.id,
    'customerId', v_bill.customer_id,
    'amountPaid', p_amount,
    'paidAmount', v_new_paid,
    'remainingAmount', greatest(v_bill.amount - v_new_paid, 0),
    'status', v_new_status,
    'receiptNo', v_receipt,
    'paidAt', coalesce(p_paid_at, now())
  );
END;
$$;

COMMIT;
