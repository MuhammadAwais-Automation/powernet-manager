-- Recovery agent: payment proof + partial remainder carry-forward
DROP FUNCTION IF EXISTS public.record_bill_payment(uuid, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.record_bill_payment(uuid, integer, uuid, text, text, timestamp with time zone, text);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS receipt_url text;

CREATE OR REPLACE FUNCTION public._next_billing_month(p_month text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_year integer;
  v_month integer;
BEGIN
  IF p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Billing month must be in YYYY-MM format';
  END IF;
  v_year := split_part(p_month, '-', 1)::integer;
  v_month := split_part(p_month, '-', 2)::integer;
  IF v_month = 12 THEN
    RETURN (v_year + 1)::text || '-01';
  END IF;
  RETURN v_year::text || '-' || lpad((v_month + 1)::text, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_bill_payment(
  p_bill_id uuid,
  p_amount integer,
  p_collected_by uuid DEFAULT null,
  p_method text DEFAULT 'cash',
  p_source text DEFAULT 'agent',
  p_paid_at timestamp with time zone DEFAULT null,
  p_note text DEFAULT null,
  p_receipt_url text DEFAULT null,
  p_remainder_action text DEFAULT 'leave'
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
  v_carry integer;
  v_next_month text;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF p_method NOT IN ('cash', 'bank', 'easypaisa', 'jazzcash', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_source NOT IN ('office', 'agent', 'customer', 'manual') THEN
    RAISE EXCEPTION 'Invalid payment source';
  END IF;

  IF coalesce(p_remainder_action, 'leave') NOT IN ('leave', 'carry_forward') THEN
    RAISE EXCEPTION 'Invalid remainder action';
  END IF;

  SELECT * INTO v_bill
  FROM public.bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  v_current_paid := coalesce(v_bill.paid_amount, 0);
  v_remaining := greatest(v_bill.amount - v_current_paid, 0);

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Bill is already fully paid';
  END IF;

  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining balance';
  END IF;

  v_new_paid := v_current_paid + p_amount;
  v_new_status := CASE WHEN v_new_paid >= v_bill.amount THEN 'paid' ELSE v_bill.status END;
  v_receipt := 'RCPT-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));

  INSERT INTO public.payments (
    bill_id,
    customer_id,
    amount,
    collected_by,
    method,
    source,
    note,
    receipt_no,
    receipt_url,
    paid_at
  )
  VALUES (
    v_bill.id,
    v_bill.customer_id,
    p_amount,
    p_collected_by,
    p_method,
    p_source,
    nullif(trim(coalesce(p_note, '')), ''),
    v_receipt,
    nullif(trim(coalesce(p_receipt_url, '')), ''),
    coalesce(p_paid_at, now())
  );

  UPDATE public.bills
  SET
    paid_amount = v_new_paid,
    status = v_new_status,
    collected_by = coalesce(p_collected_by, collected_by),
    paid_at = CASE WHEN v_new_status = 'paid' THEN coalesce(p_paid_at, now()) ELSE paid_at END,
    receipt_no = CASE WHEN v_new_status = 'paid' THEN v_receipt ELSE receipt_no END,
    payment_method = p_method,
    payment_source = p_source,
    payment_note = nullif(trim(coalesce(p_note, '')), '')
  WHERE id = v_bill.id;

  v_carry := 0;
  IF p_remainder_action = 'carry_forward' AND v_new_paid < v_bill.amount THEN
    v_carry := v_bill.amount - v_new_paid;
    v_next_month := public._next_billing_month(v_bill.month);

    UPDATE public.bills
    SET
      amount = v_new_paid,
      status = 'paid',
      paid_at = coalesce(p_paid_at, now()),
      receipt_no = v_receipt,
      payment_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Remainder carried to ' || v_next_month)
    WHERE id = v_bill.id;

    INSERT INTO public.bills (customer_id, amount, month, status, paid_amount, payment_note)
    VALUES (
      v_bill.customer_id,
      v_carry,
      v_next_month,
      'pending',
      0,
      'Carried forward from ' || v_bill.month
    )
    ON CONFLICT (customer_id, month)
    DO UPDATE SET
      amount = public.bills.amount + excluded.amount,
      payment_note = coalesce(public.bills.payment_note, '') ||
        CASE WHEN public.bills.payment_note IS NULL OR public.bills.payment_note = '' THEN '' ELSE '; ' END ||
        excluded.payment_note;
  END IF;

  RETURN jsonb_build_object(
    'billId', v_bill.id,
    'customerId', v_bill.customer_id,
    'amountPaid', p_amount,
    'paidAmount', v_new_paid,
    'remainingAmount', CASE
      WHEN p_remainder_action = 'carry_forward' AND v_carry > 0 THEN 0
      ELSE greatest(v_bill.amount - v_new_paid, 0)
    END,
    'carriedForwardAmount', v_carry,
    'carriedForwardMonth', CASE WHEN v_carry > 0 THEN v_next_month ELSE null END,
    'status', CASE WHEN p_remainder_action = 'carry_forward' AND v_carry > 0 THEN 'paid' ELSE v_new_status END,
    'receiptNo', v_receipt,
    'paidAt', coalesce(p_paid_at, now())
  );
END;
$$;