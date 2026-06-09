const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'PowerNet Manager', '.env.local');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
const envConfig = {};
for (const line of lines) {
  const parts = line.split('=');
  if (parts.length >= 2) {
    envConfig[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
}

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- INSPECTING DATABASE SCHEMA ---');

  // Try to query payments table
  const { data: samplePayment, error: sampleErr } = await supabase
    .from('payments')
    .select('*')
    .limit(1);

  if (sampleErr) {
    console.error('Error selecting from payments:', sampleErr);
  } else {
    console.log('Sample payment keys:', samplePayment.length > 0 ? Object.keys(samplePayment[0]) : 'No payments found');
    console.log('Sample payment object:', samplePayment);
  }
}

run();
