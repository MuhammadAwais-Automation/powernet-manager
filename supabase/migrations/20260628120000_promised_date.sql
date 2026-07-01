-- Promise-to-Pay: store the date a customer commits to pay (separate from visit log time).
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS promised_date date;

COMMENT ON COLUMN public.bills.promised_date IS
  'Customer promised payment date when payment_note = promise_to_pay';

CREATE INDEX IF NOT EXISTS bills_ptp_followup_idx
  ON public.bills (promised_date)
  WHERE payment_method = 'visit' AND payment_note = 'promise_to_pay';