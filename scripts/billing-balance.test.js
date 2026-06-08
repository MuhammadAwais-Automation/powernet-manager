const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-billing-balance-test')
const source = path.join(root, 'src', 'lib', 'billing', 'core.ts')

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true })

const tscArgs = [
  'tsc',
  source,
  '--module',
  'commonjs',
  '--target',
  'ES2020',
  '--outDir',
  outDir,
  '--skipLibCheck',
]

if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'npx', ...tscArgs], { stdio: 'inherit' })
} else {
  execFileSync('npx', tscArgs, { stdio: 'inherit' })
}

const core = require(path.join(outDir, 'core.js'))

const shamaBills = [
  { id: 'jun', month: '2026-06', amount: 2200, paid_amount: 0, status: 'pending' },
  { id: 'may', month: '2026-05', amount: 2200, paid_amount: 0, status: 'pending' },
  { id: 'apr', month: '2026-04', amount: 2200, paid_amount: 0, status: 'pending' },
]

assert.deepStrictEqual(
  core.buildCustomerBalanceSummary(shamaBills, '2026-06'),
  {
    currentDue: 2200,
    previousDue: 4400,
    totalOutstanding: 6600,
    totalPaid: 0,
    openBillCount: 3,
    currentBillId: 'jun',
  },
)

assert.deepStrictEqual(
  core.buildCustomerBalanceSummary([
    { id: 'jun', month: '2026-06', amount: 2200, paid_amount: 1000, status: 'pending' },
    { id: 'may', month: '2026-05', amount: 2200, paid_amount: 2200, status: 'paid' },
    { id: 'apr', month: '2026-04', amount: 2200, paid_amount: 500, status: 'overdue' },
  ], '2026-06'),
  {
    currentDue: 1200,
    previousDue: 1700,
    totalOutstanding: 2900,
    totalPaid: 3700,
    openBillCount: 2,
    currentBillId: 'jun',
  },
)

assert.deepStrictEqual(
  core.buildPaymentCollectionSummary([
    { amount: 1000, paid_at: '2026-06-05T10:00:00Z', collected_by: 'agent-a' },
    { amount: 1200, paid_at: '2026-06-07T10:00:00Z', collected_by: 'agent-b' },
    { amount: 2200, paid_at: '2026-05-31T10:00:00Z', collected_by: 'agent-a' },
  ], '2026-06'),
  {
    totalCollected: 2200,
    dailyCollections: [
      { d: '05', v: 1000 },
      { d: '07', v: 1200 },
    ],
    agentCollections: [
      { staffId: 'agent-b', collected: 1200, payments: 1 },
      { staffId: 'agent-a', collected: 1000, payments: 1 },
    ],
  },
)

console.log('billing-balance tests passed')
