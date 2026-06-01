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
  const customerId = '0081a091-bfd1-4f9b-81c7-5202dfdb946a';
  console.log(`=== CHECKING CUSTOMER RELATIONS FOR ID: ${customerId} ===`);
  
  const { data: customer, error } = await supabase
    .from('customers')
    .select(`
      id,
      full_name,
      address_value,
      house_id,
      area:areas(id, name, code),
      package:packages(id, name, speed_mbps)
    `)
    .eq('id', customerId)
    .single();

  if (error) {
    console.error('Error fetching customer relations:', error);
    return;
  }

  console.log('Customer detail in database:', JSON.stringify(customer, null, 2));
}

run();
