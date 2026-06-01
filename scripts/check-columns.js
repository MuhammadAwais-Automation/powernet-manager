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
  console.log('=== TESTING FOR MISSING PAYMENT_SOURCE COLUMN IN BILLS TABLE ===');
  
  // Try querying with payment_source
  const { data, error } = await supabase
    .from('bills')
    .select('id, payment_source')
    .limit(1);

  if (error) {
    console.log('TEST RESULT: payment_source query FAILED!');
    console.error('Error Details:', error);
  } else {
    console.log('TEST RESULT: payment_source query SUCCEEDED! Column exists.');
    console.log('Data returned:', data);
  }
}

run();
