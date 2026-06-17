-- Block duplicate payment verification submissions on paid bills or bills with pending review.
-- Run in Supabase SQL editor after migration_payment_verifications.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.validate_payment_verification_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.bills%rowtype;
  v_pending_count integer;
  v_remaining integer;
BEGIN
  SELECT *
  INTO v_bill
  FROM public.bills
  WHERE id = NEW.bill_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found';
  END IF;

  IF NEW.customer_id IS DISTINCT FROM v_bill.customer_id THEN
    RAISE EXCEPTION 'Bill does not belong to this customer';
  END IF;

  v_remaining := greatest(v_bill.amount - coalesce(v_bill.paid_amount, 0), 0);

  IF v_remaining <= 0 OR v_bill.status = 'paid' THEN
    RAISE EXCEPTION 'This bill is already fully paid. No new payment receipt is needed.';
  END IF;

  IF NEW.amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount exceeds remaining bill balance (Rs. %).', v_remaining;
  END IF;

  SELECT count(*)
  INTO v_pending_count
  FROM public.payment_verifications
  WHERE bill_id = NEW.bill_id
    AND status = 'pending';

  IF v_pending_count > 0 THEN
    RAISE EXCEPTION 'A payment receipt for this bill is already pending review.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_payment_verification_insert_trigger ON public.payment_verifications;
CREATE TRIGGER validate_payment_verification_insert_trigger
  BEFORE INSERT ON public.payment_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_verification_insert();

COMMIT;
