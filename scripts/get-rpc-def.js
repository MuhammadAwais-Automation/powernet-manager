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

async function check() {
  const { data, error } = await supabase.rpc('verify_staff_login', {
    p_username: 'nonexistent_test_user_xyz',
    p_password: 'wrong_password'
  });

  console.log('Result for dummy call:', data, error);
}

check();
