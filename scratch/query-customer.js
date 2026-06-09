const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', 'PowerNet Manager', '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- SCANNING DB FOR CUSTOMER ---');
  
  // Find customer
  const { data: customers, error: customerErr } = await supabase
    .from('customers')
    .select('id, customer_code, full_name, status, house_id, email, auth_user_id')
    .ilike('full_name', '%Awais%');

  if (customerErr) {
    console.error('Customer Error:', customerErr);
    return;
  }

  console.log('Matching Customers:', customers);

  if (!customers || customers.length === 0) {
    console.log('No customers found matching "Awais"');
    return;
  }

  for (const customer of customers) {
    const customerId = customer.id;
    console.log(`\nAnalyzing bills for: ${customer.full_name} (${customerId})`);
    
    // Fetch bills
    const { data: bills, error: billsErr } = await supabase
      .from('bills')
      .select('*')
      .eq('customer_id', customerId);

    if (billsErr) {
      console.error('Bills Error:', billsErr);
    } else {
      console.log(`Found ${bills.length} bills:`, bills);
    }

    // Fetch complaints
    const { data: complaints, error: complaintsErr } = await supabase
      .from('complaints')
      .select('*')
      .eq('customer_id', customerId);

    if (complaintsErr) {
      console.error('Complaints Error:', complaintsErr);
    } else {
      console.log(`Found ${complaints.length} complaints:`, complaints);
    }
  }
}

run();
