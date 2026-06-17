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

const STALE_NOTE =
  'Bill was already fully paid before this receipt was submitted. Duplicate submission closed.';

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  const { data: adminStaff } = await sb
    .from('staff')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!adminStaff?.id) {
    console.error('No active admin staff found for stale cleanup.');
    process.exit(1);
  }

  const { data: pending, error } = await sb
    .from('payment_verifications')
    .select('id, amount, bill:bills(amount, paid_amount, status, month)')
    .eq('status', 'pending');

  if (error) {
    console.error('Failed to load pending verifications:', error.message);
    process.exit(1);
  }

  const stale = (pending ?? []).filter((row) => {
    const bill = row.bill;
    if (!bill) return true;
    const remaining = Math.max((bill.amount ?? 0) - (bill.paid_amount ?? 0), 0);
    return remaining <= 0 || bill.status === 'paid';
  });

  if (stale.length === 0) {
    console.log('No stale pending payment verifications to reject.');
    return;
  }

  for (const row of stale) {
    const { error: updateErr } = await sb
      .from('payment_verifications')
      .update({
        status: 'rejected',
        review_note: STALE_NOTE,
        reviewed_by: adminStaff.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateErr) {
      console.error(`Failed to reject ${row.id}:`, updateErr.message);
    } else {
      console.log(`Rejected stale verification ${row.id} (bill ${row.bill?.month ?? 'unknown'})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
