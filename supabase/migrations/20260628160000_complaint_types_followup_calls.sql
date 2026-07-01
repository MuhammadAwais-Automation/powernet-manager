-- Complaint type refresh, follow-up call logs, commitment timeline, FCM device tokens
BEGIN;

-- 1) Complaint types: migrate legacy values to new set
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_type_check;

UPDATE public.complaints SET type = 'no_internet' WHERE type IN ('connectivity', 'speed');
UPDATE public.complaints SET type = 'fiber_issue' WHERE type = 'hardware';
UPDATE public.complaints SET type = 'payment_issue' WHERE type = 'billing';
UPDATE public.complaints SET type = 'other' WHERE type = 'upgrade';

ALTER TABLE public.complaints ADD CONSTRAINT complaints_type_check
  CHECK (type IN ('fiber_issue', 'no_internet', 'device_issue', 'payment_issue', 'other'));

-- 2) Follow-up calls (manual log + tap-to-dial workflow)
CREATE TABLE IF NOT EXISTS public.follow_up_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  caller_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  caller_channel text NOT NULL CHECK (caller_channel IN ('office', 'recovery_agent')),
  call_outcome text NOT NULL CHECK (call_outcome IN (
    'answered', 'no_answer', 'busy', 'wrong_number', 'switched_off'
  )),
  commitment_action text CHECK (commitment_action IN (
    'new_promise_date', 'will_pay_office', 'will_pay_field', 'refused',
    'already_paid', 'callback_later', 'none'
  )),
  promised_date date,
  notes text,
  called_at timestamptz NOT NULL DEFAULT now(),
  next_follow_up_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS follow_up_calls_customer_called_idx
  ON public.follow_up_calls (customer_id, called_at DESC);
CREATE INDEX IF NOT EXISTS follow_up_calls_bill_called_idx
  ON public.follow_up_calls (bill_id, called_at DESC);
CREATE INDEX IF NOT EXISTS follow_up_calls_caller_called_idx
  ON public.follow_up_calls (caller_id, called_at DESC);

-- 3) Customer commitment timeline (visit + call events)
CREATE TABLE IF NOT EXISTS public.customer_commitment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  follow_up_call_id uuid REFERENCES public.follow_up_calls(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'visit_logged', 'office_call', 'agent_call', 'payment_received', 'promise_updated'
  )),
  source_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  summary text NOT NULL,
  promised_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_commitment_events_customer_created_idx
  ON public.customer_commitment_events (customer_id, created_at DESC);

-- 4) Staff device tokens for push notifications (FCM)
CREATE TABLE IF NOT EXISTS public.staff_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  fcm_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS staff_device_tokens_staff_idx
  ON public.staff_device_tokens (staff_id);

-- Auto timeline entry when a follow-up call is logged
CREATE OR REPLACE FUNCTION public._commitment_event_from_follow_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_summary text;
BEGIN
  v_event_type := CASE NEW.caller_channel
    WHEN 'office' THEN 'office_call'
    ELSE 'agent_call'
  END;

  v_summary := 'Call logged (' || NEW.call_outcome || ')';
  IF NEW.commitment_action IS NOT NULL AND NEW.commitment_action <> 'none' THEN
    v_summary := v_summary || ' — ' || replace(NEW.commitment_action, '_', ' ');
  END IF;
  IF coalesce(trim(NEW.notes), '') <> '' THEN
    v_summary := v_summary || ': ' || trim(NEW.notes);
  END IF;

  INSERT INTO public.customer_commitment_events (
    customer_id, bill_id, follow_up_call_id, event_type,
    source_staff_id, summary, promised_date, metadata
  )
  VALUES (
    NEW.customer_id,
    NEW.bill_id,
    NEW.id,
    v_event_type,
    NEW.caller_id,
    v_summary,
    NEW.promised_date,
    jsonb_build_object(
      'call_outcome', NEW.call_outcome,
      'commitment_action', NEW.commitment_action,
      'next_follow_up_date', NEW.next_follow_up_date
    )
  );

  IF NEW.commitment_action = 'new_promise_date' AND NEW.promised_date IS NOT NULL AND NEW.bill_id IS NOT NULL THEN
    UPDATE public.bills
    SET promised_date = NEW.promised_date
    WHERE id = NEW.bill_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follow_up_calls_commitment_event ON public.follow_up_calls;
CREATE TRIGGER follow_up_calls_commitment_event
AFTER INSERT ON public.follow_up_calls
FOR EACH ROW EXECUTE FUNCTION public._commitment_event_from_follow_up();

-- Visit logged → commitment timeline
CREATE OR REPLACE FUNCTION public._commitment_event_from_visit_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary text;
BEGIN
  IF NEW.payment_method = 'visit'
     AND (TG_OP = 'INSERT' OR OLD.payment_method IS DISTINCT FROM 'visit') THEN
    v_summary := 'Field visit logged';
    IF coalesce(trim(NEW.payment_note), '') <> '' THEN
      v_summary := v_summary || ' — ' || replace(NEW.payment_note, '_', ' ');
    END IF;

    INSERT INTO public.customer_commitment_events (
      customer_id, bill_id, event_type, source_staff_id, summary, promised_date, metadata
    )
    VALUES (
      NEW.customer_id,
      NEW.id,
      'visit_logged',
      NEW.collected_by,
      v_summary,
      NEW.promised_date,
      jsonb_build_object('payment_note', NEW.payment_note)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bills_commitment_visit_event ON public.bills;
CREATE TRIGGER bills_commitment_visit_event
AFTER INSERT OR UPDATE OF payment_method, payment_note, promised_date, paid_at, collected_by
ON public.bills
FOR EACH ROW EXECUTE FUNCTION public._commitment_event_from_visit_bill();

-- RLS
ALTER TABLE public.follow_up_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_commitment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS follow_up_calls_staff_all ON public.follow_up_calls;
CREATE POLICY follow_up_calls_staff_all ON public.follow_up_calls
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS commitment_events_staff_all ON public.customer_commitment_events;
CREATE POLICY commitment_events_staff_all ON public.customer_commitment_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS commitment_events_customer_select ON public.customer_commitment_events;
CREATE POLICY commitment_events_customer_select ON public.customer_commitment_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_commitment_events.customer_id
        AND c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS staff_device_tokens_own ON public.staff_device_tokens;
CREATE POLICY staff_device_tokens_own ON public.staff_device_tokens
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_device_tokens.staff_id
        AND s.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = staff_device_tokens.staff_id
        AND s.auth_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_up_calls TO authenticated;
GRANT SELECT, INSERT ON public.customer_commitment_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_device_tokens TO authenticated;
GRANT ALL ON public.follow_up_calls TO service_role;
GRANT ALL ON public.customer_commitment_events TO service_role;
GRANT ALL ON public.staff_device_tokens TO service_role;

COMMIT;