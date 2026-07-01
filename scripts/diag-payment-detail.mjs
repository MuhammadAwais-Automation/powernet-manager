import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const VERIFICATION_ID = '28e11676-3bc8-4f98-ab0e-71d49b63337a';

async function main() {
  const { data: v } = await sb
    .from('payment_verifications')
    .select('*, bill:bills(*), customer:customers(full_name, customer_code)')
    .eq('id', VERIFICATION_ID)
    .single();

  console.log('=== VERIFICATION ===');
  console.log(JSON.stringify(v, null, 2));

  if (v?.bill_id) {
    const { data: payments } = await sb
      .from('payments')
      .select('id, amount, method, source, note, receipt_no, paid_at, collected_by, receipt_url, customer_remarks, created_at')
      .eq('bill_id', v.bill_id)
      .order('paid_at', { ascending: true });
    console.log('\n=== PAYMENTS ON THIS BILL ===');
    console.log(JSON.stringify(payments, null, 2));
  }

  // All pending where bill already paid
  const { data: allPending } = await sb
    .from('payment_verifications')
    .select('id, amount, bill:bills(id, month, amount, paid_amount, status)')
    .eq('status', 'pending');

  const stale = (allPending ?? []).filter((p) => {
    const b = p.bill;
    if (!b) return true;
    const rem = Math.max((b.amount ?? 0) - (b.paid_amount ?? 0), 0);
    return rem <= 0 || b.status === 'paid';
  });

  console.log('\n=== STALE PENDING (bill already paid) ===');
  console.log(`Total pending: ${allPending?.length ?? 0}, stale: ${stale.length}`);
  console.log(JSON.stringify(stale, null, 2));

  // Simulate anon client RPC like dashboard
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: adminStaff } = await sb.from('staff').select('id').eq('role', 'admin').limit(1).single();

  // Sign in as admin if we can find credentials - skip, use anon without auth
  const { error: anonErr } = await anon.rpc('approve_payment_verification', {
    p_verification_id: VERIFICATION_ID,
    p_reviewer_id: adminStaff?.id,
    p_review_note: 'ui simulation',
  });
  console.log('\n=== ANON (no login) RPC ERROR ===');
  console.log(anonErr ? { message: anonErr.message, code: anonErr.code, name: anonErr.name, constructor: anonErr.constructor?.name } : 'ok');

  // Check approve_payment_verification function body snippet via trying transition
  const { error: adminErr } = await sb.rpc('approve_payment_verification', {
    p_verification_id: VERIFICATION_ID,
    p_reviewer_id: adminStaff?.id,
    p_review_note: 'service role retest',
  });
  console.log('\n=== SERVICE ROLE RETEST ERROR ===');
  console.log(adminErr ? { message: adminErr.message, code: adminErr.code } : 'ok');
}

main().catch(console.error);
