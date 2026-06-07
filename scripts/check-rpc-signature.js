const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of envLines) {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function run() {
  console.log('=== CHECKING RPC SIGNATURE FOR record_bill_payment ===');
  
  // Use a query on pg_proc to find the parameters
  const { data, error } = await supabase
    .from('bills') // Just a table to use to execute arbitrary SQL or we can query pg_catalog if we have permissions, but wait, we can't run raw sql unless we do it via rpc or we can check what functions exist by calling them.
    .select('id')
    .limit(1);

  // Instead of running raw sql, let's try calling record_bill_payment with a dummy invalid bill ID and see what error we get.
  // This will tell us if it doesn't recognize the parameters.
  const dummyUuid = '00000000-0000-0000-0000-000000000000';
  
  const test1 = await supabase.rpc('record_bill_payment', {
    p_bill_id: dummyUuid,
    p_amount: 100,
    p_collected_by: null,
    p_method: 'cash',
    p_source: 'customer',
    p_paid_at: null,
    p_note: 'test signature'
  });
  
  console.log('Result for full signature:', test1.error ? { code: test1.error.code, message: test1.error.message } : 'success');

  const test2 = await supabase.rpc('record_bill_payment', {
    p_bill_id: dummyUuid,
    p_amount: 100,
    p_collected_by: null,
    p_method: 'cash',
    p_note: 'test signature'
  });

  console.log('Result for legacy signature:', test2.error ? { code: test2.error.code, message: test2.error.message } : 'success');
}

run();
