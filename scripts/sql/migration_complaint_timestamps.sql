-- Migration to add assigned_at and in_progress_at to complaints table
-- Run this in your Supabase SQL Editor.

BEGIN;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.complaint_events (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  actor_id uuid references public.staff(id),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS complaint_events_complaint_id_idx
  ON public.complaint_events (complaint_id, created_at DESC);

ALTER TABLE public.complaint_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS complaint_events_auth_all ON public.complaint_events;
DROP POLICY IF EXISTS complaint_events_staff_select ON public.complaint_events;
DROP POLICY IF EXISTS complaint_events_customer_select_own ON public.complaint_events;

CREATE POLICY complaint_events_staff_select
  ON public.complaint_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.role IN ('admin', 'complaint_manager', 'technician')
    )
  );

CREATE POLICY complaint_events_customer_select_own
  ON public.complaint_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.complaints
      JOIN public.customers ON customers.id = complaints.customer_id
      WHERE complaints.id = complaint_events.complaint_id
        AND customers.auth_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.log_complaint_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_note text;
BEGIN
  SELECT staff.id
    INTO v_actor_id
  FROM public.staff
  WHERE staff.auth_user_id = auth.uid()
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.complaint_events (complaint_id, actor_id, from_status, to_status, note)
    VALUES (NEW.id, v_actor_id, NULL, NEW.status, 'Complaint created');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
       OR OLD.priority IS DISTINCT FROM NEW.priority
     ) THEN
    v_note := concat_ws(
      '; ',
      CASE WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'Status changed' END,
      CASE WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN 'Assignment changed' END,
      CASE WHEN OLD.priority IS DISTINCT FROM NEW.priority THEN 'Priority changed' END
    );

    INSERT INTO public.complaint_events (complaint_id, actor_id, from_status, to_status, note)
    VALUES (NEW.id, v_actor_id, OLD.status, NEW.status, v_note);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complaint_events_after_insert_update ON public.complaints;
CREATE TRIGGER complaint_events_after_insert_update
AFTER INSERT OR UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.log_complaint_event();

-- Ensure realtime updates send all details (needed for proper realtime sync on these new fields)
ALTER TABLE public.complaints REPLICA IDENTITY FULL;

COMMIT;
