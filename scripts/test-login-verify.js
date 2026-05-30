const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
  if (match) {
    env[match[1]] = match[2].replace(/(^['"]|['"]$)/g, '').trim();
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

async function run() {
  console.log('Calling verify_staff_login RPC for user "aaa"...');
  
  // Note: Password for test user "aaa" might be 'aaa' or similar, but even a failed login
  // will tell us if it can at least execute the RPC and what fields it would return if successful.
  // Wait, let's call the RPC with password 'aaa'
  const { data, error } = await supabase.rpc('verify_staff_login', {
    p_username: 'aaa',
    p_password: 'testpass123'
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Response:', JSON.stringify(data, null, 2));
  }
}

run();
