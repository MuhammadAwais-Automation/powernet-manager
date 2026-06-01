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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const customerId = '0081a091-bfd1-4f9b-81c7-5202dfdb946a';
  console.log(`=== RUNNING MOBILE SIMULATION QUERY FOR CUSTOMER ID: ${customerId} ===`);
  
  const select = 'id, customer_id, amount, paid_amount, month, status, collected_by, ' +
                 'paid_at, receipt_no, payment_method, payment_note, created_at, ' +
                 'customer:customers(id, customer_code, full_name, address_type, address_value, area_id)';

  const { data, error } = await supabase
    .from('bills')
    .select(select)
    .eq('customer_id', customerId);

  if (error) {
    console.error('SIMULATION FAILED:', error);
  } else {
    console.log(`SIMULATION SUCCESS! Found ${data.length} bills.`);
    console.log('Bills data:', JSON.stringify(data, null, 2));
  }
}

run();
