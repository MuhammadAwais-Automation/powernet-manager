import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log(
      'SUPABASE_DB_URL not set. After `supabase link`, run:\n' +
        '  supabase db push --yes\n' +
        'Or add SUPABASE_DB_URL to .env.local and re-run this script.',
    );
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const sql = readFileSync(
    resolve(process.cwd(), 'scripts/sql/migration_promised_date.sql'),
    'utf8',
  );
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Applied migration_promised_date.sql');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});