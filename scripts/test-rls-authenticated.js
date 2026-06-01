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
const supabaseKey = env.SUPABASE_SERVICE_KEY; // Admin service key to create user
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('=== RUNNING AUTHENTICATED CLIENT RLS SIMULATION ===');
  
  const testEmail = `test_rls_user_${Date.now()}@powernet.local`;
  const testPassword = 'temporarySecurePassword123!';
  
  // 1. Create a temporary auth user using admin client
  console.log(`Creating temporary auth user: ${testEmail}...`);
  const { data: authUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true
  });

  if (createErr) {
    console.error('Failed to create auth user:', createErr);
    return;
  }

  const userId = authUser.user.id;
  console.log(`Temporary Auth User created successfully! ID: ${userId}`);

  try {
    // 2. Sign in using the public client to get an authenticated session
    console.log('Signing in as the temporary user to establish authenticated context...');
    const { data: sessionData, error: signInErr } = await supabaseClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (signInErr) {
      console.error('Sign in failed:', signInErr);
      return;
    }

    console.log('Sign in successful! Client is now authenticated.');
    console.log('Executing query on "bills" table in authenticated context...');

    // 3. Query the bills table under the authenticated context
    const { data: bills, error: billsErr } = await supabaseClient
      .from('bills')
      .select('id, month, amount, status')
      .limit(5);

    if (billsErr) {
      console.log('QUERY FAILED (Expected if RLS blocks authenticated role):', billsErr);
    } else {
      console.log(`QUERY SUCCEEDED! Fetched ${bills.length} bills rows in authenticated context.`);
      console.log('Rows returned:', bills);
    }

  } finally {
    // 4. Clean up the temporary user
    console.log(`Cleaning up temporary user: ${userId}...`);
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      console.error('Failed to delete temporary user:', deleteErr);
    } else {
      console.log('Temporary user successfully deleted!');
    }
  }
}

run();
