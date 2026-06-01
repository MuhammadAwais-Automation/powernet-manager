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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('=== TESTING ANONYMOUS/CLIENT BILLS QUERY ===');
  
  const { data, error } = await supabase
    .from('bills')
    .select('id, month, amount, status')
    .limit(5);

  if (error) {
    console.error('Query Failed (RLS active or Schema Error):', error);
  } else {
    console.log(`Query Succeeded! Fetched ${data.length} rows.`);
    console.log('Rows:', data);
  }
}

run();
