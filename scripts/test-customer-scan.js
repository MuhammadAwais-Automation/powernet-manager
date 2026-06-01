const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually to avoid external package dependencies
const envPath = path.join(__dirname, '..', '.env.local');
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of envLines) {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY is missing from .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('=== RUNNING REAL-TIME CUSTOMER DATA DIAGNOSTIC ===');
  
  // 1. Search for customer records matching "Awais"
  const { data: customers, error: customerErr } = await supabase
    .from('customers')
    .select('id, customer_code, full_name, status, house_id, address_value, email, auth_user_id, due_amount')
    .ilike('full_name', '%Awais%');

  if (customerErr) {
    console.error('Customer Query Error:', customerErr);
    return;
  }

  console.log(`\nFound ${customers.length} customer records matching "Awais":`);
  console.log(JSON.stringify(customers, null, 2));

  for (const customer of customers) {
    console.log(`\n---------------------------------------------`);
    console.log(`Analyzing details for Profile ID: ${customer.id}`);
    console.log(`Name: ${customer.full_name}`);
    console.log(`House ID / Address Value: ${customer.house_id} / ${customer.address_value}`);
    console.log(`Auth User ID: ${customer.auth_user_id}`);
    console.log(`Due Amount: Rs. ${customer.due_amount}`);
    console.log(`Status: ${customer.status}`);

    // Check bills for this customer ID
    const { data: bills, error: billsErr } = await supabase
      .from('bills')
      .select('id, month, amount, paid_amount, status, created_at')
      .eq('customer_id', customer.id);

    if (billsErr) {
      console.error(`- Bills fetch error:`, billsErr);
    } else {
      console.log(`- Bills generated: ${bills.length}`);
      if (bills.length > 0) {
        console.log(bills.map(b => `  * Month: ${b.month}, Amount: Rs. ${b.amount}, Status: ${b.status}, CreatedAt: ${b.created_at}`).join('\n'));
      }
    }

    // Check complaints for this customer ID
    const { data: complaints, error: complaintsErr } = await supabase
      .from('complaints')
      .select('id, complaint_code, issue, status, opened_at')
      .eq('customer_id', customer.id);

    if (complaintsErr) {
      console.error(`- Complaints fetch error:`, complaintsErr);
    } else {
      console.log(`- Complaints: ${complaints.length}`);
      if (complaints.length > 0) {
        console.log(complaints.map(c => `  * Code: ${c.complaint_code}, Issue: ${c.issue}, Status: ${c.status}`).join('\n'));
      }
    }
  }
}

run();
