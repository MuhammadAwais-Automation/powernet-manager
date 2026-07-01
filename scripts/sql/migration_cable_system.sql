-- Cable system: subscribers, fixed monthly price, separate billing
-- Run in Supabase SQL Editor

BEGIN;

-- 1. Customer flags
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS has_cable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_internet boolean NOT NULL DEFAULT true;

UPDATE public.customers SET has_internet = true WHERE has_internet IS NULL;

-- 2. Fixed cable price (singleton settings row)
CREATE TABLE IF NOT EXISTS public.cable_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_price integer NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cable_settings (id, monthly_price)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- 3. Cable bills
CREATE TABLE IF NOT EXISTS public.cable_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount >= 0),
  paid_amount integer NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  month text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  collected_by uuid REFERENCES public.staff(id),
  paid_at timestamptz,
  receipt_no text,
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('cash', 'bank', 'easypaisa', 'jazzcash', 'other', 'visit')),
  payment_source text NOT NULL DEFAULT 'manual' CHECK (payment_source IN ('office', 'agent', 'customer', 'manual')),
  payment_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cable_bills_customer_month_key
  ON public.cable_bills (customer_id, month);

CREATE INDEX IF NOT EXISTS cable_bills_month_status_idx
  ON public.cable_bills (month, status);

-- 4. Cable payments
CREATE TABLE IF NOT EXISTS public.cable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cable_bill_id uuid NOT NULL REFERENCES public.cable_bills(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  collected_by uuid REFERENCES public.staff(id),
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'bank', 'easypaisa', 'jazzcash', 'other')),
  source text NOT NULL DEFAULT 'office' CHECK (source IN ('office', 'agent', 'customer', 'manual')),
  note text,
  receipt_no text NOT NULL UNIQUE,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cable_payments_bill_id_idx ON public.cable_payments (cable_bill_id);
CREATE INDEX IF NOT EXISTS cable_payments_customer_id_idx ON public.cable_payments (customer_id);

-- 5. RLS
ALTER TABLE public.cable_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cable_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cable_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cable_settings_staff_all ON public.cable_settings;
CREATE POLICY cable_settings_staff_all ON public.cable_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role = 'admin'
    )
  );

DROP POLICY IF EXISTS cable_settings_staff_read ON public.cable_settings;
CREATE POLICY cable_settings_staff_read ON public.cable_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN ('admin', 'complaint_manager')
    )
  );

DROP POLICY IF EXISTS cable_bills_staff_all ON public.cable_bills;
CREATE POLICY cable_bills_staff_all ON public.cable_bills
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN ('admin', 'complaint_manager', 'recovery_agent')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN ('admin', 'complaint_manager', 'recovery_agent')
    )
  );

DROP POLICY IF EXISTS cable_payments_staff_all ON public.cable_payments;
CREATE POLICY cable_payments_staff_all ON public.cable_payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN ('admin', 'complaint_manager', 'recovery_agent')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN ('admin', 'complaint_manager', 'recovery_agent')
    )
  );

-- 6. Overdue transition for cable bills
CREATE OR REPLACE FUNCTION public.transition_pending_cable_bills_to_overdue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_month text := to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY-MM');
  v_current_day integer := CAST(to_char(now() AT TIME ZONE 'Asia/Karachi', 'DD') AS integer);
  v_updated integer := 0;
BEGIN
  UPDATE public.cable_bills cb
  SET status = 'overdue'
  FROM public.customers c
  LEFT JOIN public.areas a ON c.area_id = a.id
  WHERE cb.customer_id = c.id
    AND cb.status = 'pending'
    AND (
      cb.month < v_current_month
      OR (
        cb.month = v_current_month
        AND (
          (coalesce(a.type, 'civilian') = 'garrison' AND v_current_day > 5)
          OR (coalesce(a.type, 'civilian') = 'civilian' AND v_current_day > 10)
        )
      )
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- 7. Generate monthly cable bills (fixed price from cable_settings)
CREATE OR REPLACE FUNCTION public.generate_monthly_cable_bills(p_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := left(trim(p_month), 7);
  v_price integer := 0;
  v_eligible integer := 0;
  v_existing integer := 0;
  v_zero_amount integer := 0;
  v_created integer := 0;
BEGIN
  IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Billing month must be in YYYY-MM format';
  END IF;

  SELECT monthly_price INTO v_price FROM public.cable_settings WHERE id = 1;
  v_price := coalesce(v_price, 0);

  WITH billable AS (
    SELECT c.id AS customer_id, v_price AS amount
    FROM public.customers c
    WHERE c.has_cable = true
      AND c.status = 'active'
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE amount > 0
        AND EXISTS (
          SELECT 1 FROM public.cable_bills cb
          WHERE cb.customer_id = billable.customer_id AND cb.month = v_month
        )
    ),
    count(*) FILTER (WHERE amount <= 0)
  INTO v_eligible, v_existing, v_zero_amount
  FROM billable;

  INSERT INTO public.cable_bills (customer_id, amount, month, status, paid_amount)
  SELECT customer_id, amount, v_month, 'pending', 0
  FROM (
    SELECT c.id AS customer_id, v_price AS amount
    FROM public.customers c
    WHERE c.has_cable = true AND c.status = 'active'
  ) billable
  WHERE amount > 0
  ON CONFLICT (customer_id, month) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'month', v_month,
    'eligible', v_eligible,
    'created', v_created,
    'existing', v_existing,
    'zeroAmount', v_zero_amount,
    'price', v_price
  );
END;
$$;

-- 8. Record cable bill payment
CREATE OR REPLACE FUNCTION public.record_cable_bill_payment(
  p_bill_id uuid,
  p_amount integer,
  p_collected_by uuid DEFAULT null,
  p_method text DEFAULT 'cash',
  p_source text DEFAULT 'office',
  p_paid_at timestamptz DEFAULT null,
  p_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.cable_bills%rowtype;
  v_current_paid integer;
  v_remaining integer;
  v_new_paid integer;
  v_new_status text;
  v_receipt text;
BEGIN
  PERFORM public.transition_pending_cable_bills_to_overdue();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF p_method NOT IN ('cash', 'bank', 'easypaisa', 'jazzcash', 'other') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF p_source NOT IN ('office', 'agent', 'customer', 'manual') THEN
    RAISE EXCEPTION 'Invalid payment source';
  END IF;

  SELECT * INTO v_bill FROM public.cable_bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cable bill not found'; END IF;

  v_current_paid := coalesce(v_bill.paid_amount, 0);
  v_remaining := greatest(v_bill.amount - v_current_paid, 0);
  IF v_remaining <= 0 THEN RAISE EXCEPTION 'Bill is already fully paid'; END IF;
  IF p_amount > v_remaining THEN RAISE EXCEPTION 'Payment amount exceeds remaining balance'; END IF;

  v_new_paid := v_current_paid + p_amount;
  v_new_status := CASE WHEN v_new_paid >= v_bill.amount THEN 'paid' ELSE v_bill.status END;
  v_receipt := 'CBL-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));

  INSERT INTO public.cable_payments (
    cable_bill_id, customer_id, amount, collected_by, method, source, note, receipt_no, paid_at
  ) VALUES (
    v_bill.id, v_bill.customer_id, p_amount, p_collected_by, p_method, p_source,
    nullif(trim(coalesce(p_note, '')), ''), v_receipt, coalesce(p_paid_at, now())
  );

  UPDATE public.cable_bills
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

-- 9. Cable billing summary RPC
CREATE OR REPLACE FUNCTION public.get_cable_billing_summary(
  p_month text,
  p_area_id uuid DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := left(trim(p_month), 7);
BEGIN
  PERFORM public.transition_pending_cable_bills_to_overdue();

  RETURN (
    SELECT jsonb_build_object(
      'totalBills', count(*)::integer,
      'totalBilled', coalesce(sum(cb.amount), 0)::integer,
      'totalPaid', coalesce(sum(cb.paid_amount), 0)::integer,
      'totalRemaining', coalesce(sum(greatest(cb.amount - cb.paid_amount, 0)), 0)::integer,
      'paidBills', count(*) FILTER (WHERE cb.status = 'paid')::integer,
      'unpaidBills', count(*) FILTER (WHERE cb.status != 'paid')::integer,
      'overdueBills', count(*) FILTER (WHERE cb.status = 'overdue')::integer,
      'overdueTotal', coalesce(sum(greatest(cb.amount - cb.paid_amount, 0)) FILTER (WHERE cb.status = 'overdue'), 0)::integer
    )
    FROM public.cable_bills cb
    JOIN public.customers c ON c.id = cb.customer_id
    WHERE cb.month = v_month
      AND (p_area_id IS NULL OR c.area_id = p_area_id)
  );
END;
$$;

-- 10. Internet bills: only has_internet customers
CREATE OR REPLACE FUNCTION public.generate_monthly_bills(p_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := left(trim(p_month), 7);
  v_eligible integer := 0;
  v_existing integer := 0;
  v_zero_amount integer := 0;
  v_created integer := 0;
BEGIN
  IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Billing month must be in YYYY-MM format';
  END IF;

  WITH billable AS (
    SELECT
      customers.id AS customer_id,
      coalesce(customers.due_amount, packages.default_price, 0) AS amount
    FROM public.customers
    LEFT JOIN public.packages ON packages.id = customers.package_id
    WHERE customers.status = 'active'
      AND customers.has_internet = true
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE amount > 0 AND EXISTS (
        SELECT 1 FROM public.bills
        WHERE bills.customer_id = billable.customer_id AND bills.month = v_month
      )
    ),
    count(*) FILTER (WHERE amount <= 0)
  INTO v_eligible, v_existing, v_zero_amount
  FROM billable;

  INSERT INTO public.bills (customer_id, amount, month, status, paid_amount)
  SELECT customer_id, amount, v_month, 'pending', 0
  FROM (
    SELECT
      customers.id AS customer_id,
      coalesce(customers.due_amount, packages.default_price, 0) AS amount
    FROM public.customers
    LEFT JOIN public.packages ON packages.id = customers.package_id
    WHERE customers.status = 'active'
      AND customers.has_internet = true
  ) billable
  WHERE amount > 0
  ON CONFLICT (customer_id, month) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;

  RETURN jsonb_build_object(
    'month', v_month,
    'eligible', v_eligible,
    'created', v_created,
    'existing', v_existing,
    'zeroAmount', v_zero_amount
  );
END;
$$;

COMMIT;