import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('SUPABASE_DB_URL not set — run scripts/sql/migration_payment_verification_insert_guard.sql in Supabase SQL editor.');
    process.exit(0);
  }

  const { default: pg } = await import('pg');
  const sql = readFileSync(
    resolve(process.cwd(), 'scripts/sql/migration_payment_verification_insert_guard.sql'),
    'utf8',
  );
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Applied migration_payment_verification_insert_guard.sql');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
