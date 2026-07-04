-- Cable Issue + Cable Down complaint types (replace legacy cable types)
BEGIN;

UPDATE public.complaints
SET type = 'cable_issue'
WHERE type IN ('signal_issue', 'onu_fault', 'no_signal');

UPDATE public.complaints
SET service_line = 'cable'
WHERE type IN ('cable_issue', 'cable_down');

ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_type_check;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_type_check
  CHECK (type IN (
    'fiber_issue', 'no_internet', 'device_issue', 'payment_issue', 'other',
    'cable_issue', 'cable_down',
    'signal_issue', 'onu_fault', 'no_signal'
  ));

CREATE OR REPLACE FUNCTION public.set_complaint_service_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type IN ('cable_issue', 'cable_down', 'signal_issue', 'onu_fault', 'no_signal') THEN
    NEW.service_line := 'cable';
  ELSIF TG_OP = 'INSERT' OR NEW.type IS DISTINCT FROM OLD.type THEN
    NEW.service_line := 'internet';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;