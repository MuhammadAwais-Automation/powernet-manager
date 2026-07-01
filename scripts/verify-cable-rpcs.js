const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env.local');
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of envLines) {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const month = new Date().toISOString().slice(0, 7);

  const checks = [
    ['get_dashboard_summary', () => supabase.rpc('get_dashboard_summary')],
    ['get_reports_summary both', () => supabase.rpc('get_reports_summary', { p_month: month, p_area_id: null, p_service_type: 'both' })],
    ['get_reports_summary cable', () => supabase.rpc('get_reports_summary', { p_month: month, p_area_id: null, p_service_type: 'cable' })],
    ['get_area_financial_summaries both', () => supabase.rpc('get_area_financial_summaries', { p_month: month, p_service_type: 'both' })],
    ['cable_bills table', () => supabase.from('cable_bills').select('id', { count: 'exact', head: true })],
    ['has_cable column', () => supabase.from('customers').select('has_cable').limit(1)],
  ];

  for (const [name, fn] of checks) {
    const { data, error } = await fn();
    if (error) {
      console.log('FAIL', name, error.message);
    } else {
      const preview = name === 'get_dashboard_summary'
        ? { monthlyCableRevenue: data?.monthlyCableRevenue, monthlyInternetRevenue: data?.monthlyInternetRevenue }
        : name.startsWith('get_reports_summary')
          ? { serviceType: data?.serviceType, revenue: data?.cards?.revenue }
          : Array.isArray(data)
            ? { rows: data.length }
            : data;
      console.log('OK', name, JSON.stringify(preview));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
