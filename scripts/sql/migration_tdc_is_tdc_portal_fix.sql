-- TDC portal login fix for existing customer APK (no rebuild required).
-- Old app loads customers with .eq('status', 'active') only.
-- Keep status='active' for portal auth; track disconnect via is_tdc.

BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_tdc boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS customers_is_tdc_idx
  ON public.customers (is_tdc)
  WHERE is_tdc = true;

-- Normalize existing TDC rows so old APK login works immediately.
UPDATE public.customers
SET is_tdc = true
WHERE status = 'tdc';

UPDATE public.customers
SET status = 'active'
WHERE status = 'tdc';

CREATE OR REPLACE FUNCTION public.normalize_customer_tdc_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'tdc' THEN
    NEW.is_tdc := true;
    NEW.status := 'active';
  ELSIF NEW.status = 'active' AND COALESCE(OLD.is_tdc, false) = true THEN
    NEW.is_tdc := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_customer_tdc_status ON public.customers;
CREATE TRIGGER trg_normalize_customer_tdc_status
  BEFORE INSERT OR UPDATE OF status ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_customer_tdc_status();

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

  UPDATE public.customers c
  SET is_tdc = true,
      disconnected_date = coalesce(c.disconnected_date, CURRENT_DATE)
  WHERE c.status = 'active'
    AND c.is_tdc = false
    AND EXISTS (
      SELECT 1
      FROM public.bills b
      WHERE b.customer_id = c.id
        AND b.status = 'overdue'
    );

  RETURN v_updated;
END;
$function$;

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
  PERFORM public.transition_pending_bills_to_overdue();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF p_method NOT IN ('cash', 'bank', 'easypaisa', 'jazzcash', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_source NOT IN ('office', 'agent', 'customer', 'manual') THEN
    RAISE EXCEPTION 'Invalid payment source';
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
    bill_id, customer_id, amount, collected_by, method, source, note, receipt_no, paid_at
  )
  VALUES (
    v_bill.id, v_bill.customer_id, p_amount, p_collected_by, p_method, p_source,
    nullif(trim(coalesce(p_note, '')), ''), v_receipt, coalesce(p_paid_at, now())
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

  UPDATE public.customers
  SET is_tdc = false,
      reconnected_date = CURRENT_DATE
  WHERE id = v_bill.customer_id
    AND is_tdc = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.bills
      WHERE bills.customer_id = v_bill.customer_id
        AND bills.status = 'overdue'
    );

  RETURN jsonb_build_object(
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

CREATE OR REPLACE FUNCTION public.customer_login_lookup(p_identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer public.customers%rowtype;
  v_norm_ident text;
  v_phone_digits text;
BEGIN
  v_phone_digits := regexp_replace(p_identifier, '[^0-9]', '', 'g');
  v_norm_ident := trim(both '_' from regexp_replace(lower(trim(p_identifier)), '[^a-z0-9]+', '_', 'g'));

  SELECT *
    INTO v_customer
    FROM public.customers
   WHERE auth_user_id IS NOT NULL
     AND status = 'active'
     AND (
       (length(v_phone_digits) >= 10 AND regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_phone_digits)
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(house_id), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(username), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(address_value), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
       OR trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(customer_code), ''), '')), '[^a-z0-9]+', '_', 'g')) = v_norm_ident
     )
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_customer.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Customer account not found');
  END IF;

  IF v_customer.phone IS NULL OR length(trim(v_customer.phone)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'Customer account has no phone number registered');
  END IF;

  RETURN json_build_object(
    'success', true,
    'email', 'customer_' || regexp_replace(v_customer.phone, '[^0-9]', '', 'g') || '@powernet.local',
    'status', CASE WHEN v_customer.is_tdc THEN 'tdc' ELSE v_customer.status END,
    'is_tdc', v_customer.is_tdc
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_login_lookup(text) TO anon, authenticated;

DROP POLICY IF EXISTS complaints_customer_insert_own ON public.complaints;
CREATE POLICY complaints_customer_insert_own
  ON public.complaints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'open'
    AND assigned_to IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.customers
      WHERE customers.id = complaints.customer_id
        AND customers.auth_user_id = auth.uid()
        AND customers.status = 'active'
        AND customers.is_tdc = false
    )
  );

COMMIT;
