const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-dashboard-realtime-test')
const sources = [
  path.join(root, 'src', 'lib', 'dashboard', 'summary.ts'),
  path.join(root, 'src', 'lib', 'db', 'complaint-statuses.ts'),
]

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true })

const tscArgs = [
  'tsc',
  ...sources,
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

const summary = require(path.join(outDir, 'dashboard', 'summary.js'))
const statuses = require(path.join(outDir, 'db', 'complaint-statuses.js'))

assert.strictEqual(summary.getDashboardRefreshToken(2, 3), 5)
assert.strictEqual(summary.getDashboardRefreshToken(0, 0), 0)

assert.deepStrictEqual(
  summary.normalizeDashboardStats({
    totalCustomers: 9,
    activeCustomers: 7,
    unpaidBills: 4,
    openComplaints: 2,
    monthlyRevenue: 1800,
    activeStaff: 3,
  }),
  {
    totalCustomers: 9,
    activeCustomers: 7,
    unpaidBills: 4,
    openComplaints: 2,
    monthlyRevenue: 1800,
    activeStaff: 3,
    revenueByMonth: [],
    complaintsByStatus: { open: 0, in_progress: 0, resolved: 0 },
  }
)

assert.deepStrictEqual(
  summary.normalizeDashboardStats({
    complaintsByStatus: { open: 5, in_progress: 2 },
    revenueByMonth: [{ m: 'May', v: 12 }],
  }).complaintsByStatus,
  { open: 5, in_progress: 2, resolved: 0 }
)

assert.deepStrictEqual(
  statuses.RECENT_COMPLAINT_STATUSES,
  ['open', 'in_progress', 'resolved']
)

console.log('dashboard-realtime tests passed')
