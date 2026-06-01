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
  console.log('=== DETAILED AWAIS CUSTOMERS LIST ===');
  
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, customer_code, full_name, status, house_id, address_value, email, auth_user_id, due_amount')
    .ilike('full_name', '%Awais%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Total found: ${customers.length}`);
  
  customers.forEach((c, idx) => {
    console.log(`\n[${idx + 1}] ID: ${c.id}`);
    console.log(`    Name: ${c.full_name}`);
    console.log(`    Code: ${c.customer_code}`);
    console.log(`    House ID: ${c.house_id}`);
    console.log(`    Address Val: ${c.address_value}`);
    console.log(`    Auth ID: ${c.auth_user_id}`);
    console.log(`    Due Amount: ${c.due_amount}`);
    console.log(`    Status: ${c.status}`);
  });
}

run();
