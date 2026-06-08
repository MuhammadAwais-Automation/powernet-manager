create or replace function public.approve_payment_verification(
  p_verification_id uuid,
  p_reviewer_id uuid,
  p_review_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verification public.payment_verifications%rowtype;
  v_payment jsonb;
  v_receipt_no text;
begin
  select *
  into v_verification
  from public.payment_verifications
  where id = p_verification_id
  for update;

  if not found then
    raise exception 'Payment verification record not found';
  end if;

  if v_verification.status <> 'pending' then
    raise exception 'This payment has already been processed';
  end if;

  v_payment := public.record_bill_payment(
    v_verification.bill_id,
    v_verification.amount,
    p_reviewer_id,
    v_verification.method,
    'customer',
    v_verification.created_at,
    coalesce(nullif(trim(p_review_note), ''), 'Payment receipt verified by administrator')
  );
  v_receipt_no := v_payment ->> 'receiptNo';

  update public.payments
  set
    receipt_url = v_verification.receipt_url,
    customer_remarks = v_verification.customer_remarks
  where receipt_no = v_receipt_no;

  update public.payment_verifications
  set
    status = 'approved',
    review_note = nullif(trim(coalesce(p_review_note, '')), ''),
    reviewed_by = p_reviewer_id,
    reviewed_at = now()
  where id = v_verification.id;

  return v_payment || jsonb_build_object('verificationId', v_verification.id);
end;
$$;

revoke all on function public.approve_payment_verification(uuid, uuid, text) from public;
revoke execute on function public.approve_payment_verification(uuid, uuid, text) from anon;
grant execute on function public.approve_payment_verification(uuid, uuid, text) to authenticated;
grant execute on function public.approve_payment_verification(uuid, uuid, text) to service_role;
