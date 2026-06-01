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
  console.log('=== CHECKING CUSTOMER SIGNUP REQUESTS ===');
  
  const { data: requests, error } = await supabase
    .from('customer_signup_requests')
    .select('*')
    .ilike('full_name', '%Awais%');

  if (error) {
    console.error('Error fetching signup requests:', error);
    return;
  }

  console.log(`Total found requests: ${requests.length}`);
  requests.forEach((r, idx) => {
    console.log(`\n[${idx + 1}] Request ID: ${r.id}`);
    console.log(`    Name: ${r.full_name}`);
    console.log(`    House ID: ${r.house_id}`);
    console.log(`    Status: ${r.status}`);
    console.log(`    Approved Customer ID: ${r.approved_customer_id}`);
    console.log(`    Email: ${r.email}`);
    console.log(`    Phone: ${r.phone}`);
  });
}

run();
