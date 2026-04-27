const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(Boolean)) {
  const index = line.indexOf('=')
  if (index > 0) process.env[line.slice(0, index)] = line.slice(index + 1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function getRows(result) {
  if (Array.isArray(result.data)) return result.data.length
  if (typeof result.count === 'number') return result.count
  return result.data ? 1 : 0
}

async function timed(label, fn, budgetMs) {
  await fn()

  const samples = []
  let lastResult = null
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now()
    lastResult = await fn()
    samples.push(Math.round(performance.now() - start))
  }

  const sorted = [...samples].sort((a, b) => a - b)
  const ms = sorted[Math.floor(sorted.length / 2)]
  const result = lastResult ?? {}
  const bytes = result.data ? Buffer.byteLength(JSON.stringify(result.data)) : 0
  const ok = !result.error && ms <= budgetMs
  console.log(JSON.stringify({
    label,
    medianMs: ms,
    samplesMs: samples,
    budgetMs,
    rows: getRows(result),
    bytes,
    ok,
    error: result.error?.message,
  }))
  if (!ok) process.exitCode = 1
}

async function main() {
  await timed(
    'customers first page lean',
    () => supabase
      .from('customers')
      .select('id,customer_code,username,full_name,cnic,phone,status,due_amount,area:areas(id,name),package:packages(id,name)', { count: 'exact' })
      .order('customer_code')
      .range(0, 49),
    700
  )

  await timed(
    'dashboard summary rpc',
    () => supabase.rpc('get_dashboard_summary'),
    700
  )

  await timed(
    'areas active',
    () => supabase.from('areas').select('id,code,name,type,is_active').eq('is_active', true).order('type').order('name'),
    700
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
