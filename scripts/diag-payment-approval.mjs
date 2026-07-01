import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const path = resolve(process.cwd(), '.env.local');
  const raw = readFileSync(path, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  // Pending verifications with bill context
  const { data: pending, error: pErr } = await sb
    .from('payment_verifications')
    .select(`
      id, bill_id, customer_id, amount, method, status, created_at, receipt_url,
      bill:bills(id, month, amount, paid_amount, status),
      customer:customers(id, full_name, customer_code, status)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  logSection('PENDING VERIFICATIONS');
  if (pErr) {
    console.log('QUERY ERROR:', JSON.stringify(pErr, null, 2));
  } else {
    console.log(`Count: ${pending?.length ?? 0}`);
    for (const v of pending ?? []) {
      const bill = v.bill;
      const remaining = bill ? Math.max((bill.amount ?? 0) - (bill.paid_amount ?? 0), 0) : null;
      console.log(JSON.stringify({
        id: v.id,
        amount: v.amount,
        method: v.method,
        customer: v.customer?.full_name,
        customer_code: v.customer?.customer_code,
        customer_status: v.customer?.status,
        bill_month: bill?.month,
        bill_amount: bill?.amount,
        bill_paid: bill?.paid_amount,
        bill_status: bill?.status,
        remaining,
        amount_ok: remaining != null ? v.amount <= remaining : null,
        bill_fully_paid: remaining === 0,
      }, null, 2));
    }
  }

  // Get an admin staff id for realistic test
  const { data: adminStaff } = await sb
    .from('staff')
    .select('id, full_name, role, auth_user_id')
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  logSection('ADMIN STAFF FOR TEST');
  console.log(adminStaff ?? 'NO ACTIVE ADMIN FOUND');

  // RPC existence tests
  logSection('approve_payment_verification — fake UUID');
  const { error: rpcFakeErr } = await sb.rpc('approve_payment_verification', {
    p_verification_id: '00000000-0000-0000-0000-000000000001',
    p_reviewer_id: adminStaff?.id ?? '00000000-0000-0000-0000-000000000002',
    p_review_note: 'diagnostic',
  });
  console.log(rpcFakeErr
    ? JSON.stringify({ message: rpcFakeErr.message, code: rpcFakeErr.code, details: rpcFakeErr.details, hint: rpcFakeErr.hint }, null, 2)
    : 'NO ERROR (unexpected success)');

  logSection('record_bill_payment — 7 params fake bill');
  const { error: pay7Err } = await sb.rpc('record_bill_payment', {
    p_bill_id: '00000000-0000-0000-0000-000000000001',
    p_amount: 100,
    p_collected_by: adminStaff?.id ?? null,
    p_method: 'bank',
    p_source: 'customer',
    p_paid_at: new Date().toISOString(),
    p_note: 'diagnostic',
  });
  console.log(pay7Err
    ? JSON.stringify({ message: pay7Err.message, code: pay7Err.code, details: pay7Err.details, hint: pay7Err.hint }, null, 2)
    : 'NO ERROR (unexpected success)');

  // Try 5-param version (legacy signature)
  logSection('record_bill_payment — 5 params legacy signature');
  const { error: pay5Err } = await sb.rpc('record_bill_payment', {
    p_bill_id: '00000000-0000-0000-0000-000000000001',
    p_amount: 100,
    p_collected_by: adminStaff?.id ?? null,
    p_method: 'bank',
    p_source: 'customer',
  });
  console.log(pay5Err
    ? JSON.stringify({ message: pay5Err.message, code: pay5Err.code, details: pay5Err.details, hint: pay5Err.hint }, null, 2)
    : 'NO ERROR — 5-param overload EXISTS');

  // Pre-check each pending for likely failure reason (read-only)
  logSection('PRECHECK ANALYSIS (read-only)');
  for (const v of pending ?? []) {
    const bill = v.bill;
    const remaining = bill ? Math.max((bill.amount ?? 0) - (bill.paid_amount ?? 0), 0) : null;
    const issues = [];
    if (!bill) issues.push('BILL_MISSING_OR_INACCESSIBLE');
    if (remaining === 0) issues.push('BILL_ALREADY_FULLY_PAID');
    if (remaining != null && v.amount > remaining) issues.push('AMOUNT_EXCEEDS_REMAINING');
    if (!['bank', 'easypaisa', 'jazzcash', 'other'].includes(v.method)) issues.push('INVALID_METHOD');
    console.log(JSON.stringify({ verification_id: v.id, issues: issues.length ? issues : ['LOOKS_OK_AT_DATA_LAYER'] }));
  }

  // Simulate approve RPC error without mutating — use real pending id but invalid reviewer
  if (pending?.length) {
    logSection('RPC ERROR CAPTURE — real verification id, invalid reviewer FK');
    const { error: fkErr } = await sb.rpc('approve_payment_verification', {
      p_verification_id: pending[0].id,
      p_reviewer_id: '00000000-0000-0000-0000-000000000001',
      p_review_note: 'diagnostic',
    });
    console.log(fkErr
      ? JSON.stringify({ message: fkErr.message, code: fkErr.code, details: fkErr.details, hint: fkErr.hint }, null, 2)
      : 'unexpected success');
  }

  // Function inventory via postgres meta if available — try supabase REST introspection
  logSection('RECENT APPROVED/REJECTED (last 3 each)');
  for (const st of ['approved', 'rejected']) {
    const { data } = await sb
      .from('payment_verifications')
      .select('id, status, amount, reviewed_at, review_note')
      .eq('status', st)
      .order('reviewed_at', { ascending: false })
      .limit(3);
    console.log(st, data);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
