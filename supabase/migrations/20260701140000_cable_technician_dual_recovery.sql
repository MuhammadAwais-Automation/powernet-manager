-- Cable technician role + dual recovery (internet + cable) foundation
BEGIN;

-- 1) Migrate legacy mobile role
UPDATE public.staff
SET role = 'cable_technician'
WHERE role = 'cable_operator';

-- 2) Complaint service line (internet vs cable field work)
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS service_line text NOT NULL DEFAULT 'internet';

ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_service_line_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_service_line_check
  CHECK (service_line IN ('internet', 'cable'));

-- 3) Cable-specific complaint types
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_type_check;

UPDATE public.complaints
SET service_line = 'cable'
WHERE type IN ('signal_issue', 'onu_fault', 'no_signal');

UPDATE public.complaints
SET service_line = 'internet'
WHERE service_line IS NULL OR service_line NOT IN ('internet', 'cable');

ALTER TABLE public.complaints ADD CONSTRAINT complaints_type_check
  CHECK (type IN (
    'fiber_issue', 'no_internet', 'device_issue', 'payment_issue', 'other',
    'signal_issue', 'onu_fault', 'no_signal'
  ));

CREATE INDEX IF NOT EXISTS complaints_service_line_status_idx
  ON public.complaints (service_line, status, opened_at DESC);

-- Auto-set service_line from complaint type on write
CREATE OR REPLACE FUNCTION public.set_complaint_service_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type IN ('signal_issue', 'onu_fault', 'no_signal') THEN
    NEW.service_line := 'cable';
  ELSIF TG_OP = 'INSERT' OR NEW.type IS DISTINCT FROM OLD.type THEN
    NEW.service_line := 'internet';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_complaint_service_line_before_write ON public.complaints;
CREATE TRIGGER set_complaint_service_line_before_write
BEFORE INSERT OR UPDATE OF type ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.set_complaint_service_line();

-- 4) Follow-up calls can reference cable bills
ALTER TABLE public.follow_up_calls
  ADD COLUMN IF NOT EXISTS cable_bill_id uuid REFERENCES public.cable_bills(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS follow_up_calls_cable_bill_called_idx
  ON public.follow_up_calls (cable_bill_id, called_at DESC);

-- 5) Complaints RLS: cable technicians join internet techs/helpers
DROP POLICY IF EXISTS complaints_dashboard_staff_all ON public.complaints;
CREATE POLICY complaints_dashboard_staff_all ON public.complaints
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN (
          'admin', 'complaint_manager', 'technician', 'helper', 'cable_technician'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN (
          'admin', 'complaint_manager', 'technician', 'helper', 'cable_technician'
        )
    )
  );

DROP POLICY IF EXISTS complaint_events_staff_select ON public.complaint_events;
CREATE POLICY complaint_events_staff_select ON public.complaint_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN (
          'admin', 'complaint_manager', 'technician', 'helper', 'cable_technician'
        )
    )
  );

-- 6) Cable technicians: read cable bills (balance preview), no write
DROP POLICY IF EXISTS cable_bills_cable_technician_read ON public.cable_bills;
CREATE POLICY cable_bills_cable_technician_read ON public.cable_bills
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role = 'cable_technician'
    )
  );

-- 7) Pending cable bills for recovery agents (mobile collector)
CREATE OR REPLACE FUNCTION public.fetch_pending_cable_bills_for_areas(
  p_area_ids uuid[],
  p_month text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month text := coalesce(nullif(left(trim(p_month), 7), ''), to_char(now() AT TIME ZONE 'Asia/Karachi', 'YYYY-MM'));
  v_result jsonb;
BEGIN
  PERFORM public.transition_pending_cable_bills_to_overdue();

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.due_amount DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      cb.id,
      cb.customer_id,
      cb.amount,
      cb.paid_amount,
      greatest(cb.amount - coalesce(cb.paid_amount, 0), 0) AS due_amount,
      cb.month,
      cb.status,
      c.customer_code,
      c.full_name,
      c.phone,
      c.house_id,
      c.address_type,
      c.address_value,
      c.area_id,
      c.has_cable,
      c.has_internet,
      a.name AS area_name,
      a.code AS area_code
    FROM public.cable_bills cb
    JOIN public.customers c ON c.id = cb.customer_id
    LEFT JOIN public.areas a ON a.id = c.area_id
    WHERE cb.status IN ('pending', 'overdue')
      AND greatest(cb.amount - coalesce(cb.paid_amount, 0), 0) > 0
      AND c.has_cable = true
      AND (p_area_ids IS NULL OR cardinality(p_area_ids) = 0 OR c.area_id = ANY(p_area_ids))
      AND (p_month IS NULL OR cb.month = v_month)
  ) t;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_pending_cable_bills_for_areas(uuid[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.fetch_pending_cable_bills_for_areas(uuid[], text) TO authenticated, service_role;

COMMIT;
