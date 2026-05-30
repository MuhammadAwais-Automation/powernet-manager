const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-reports-test')
const source = path.join(root, 'src', 'lib', 'reports', 'core.ts')

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

assert.strictEqual(core.normalizeReportMonth('2026-04'), '2026-04')
assert.strictEqual(core.normalizeReportMonth('2026-04-28'), '2026-04')
assert.throws(() => core.normalizeReportMonth('Apr 2026'), /YYYY-MM/)

assert.strictEqual(core.toChartThousands(0), 0)
assert.strictEqual(core.toChartThousands(1499), 1)
assert.strictEqual(core.toChartThousands(1500), 2)
assert.deepStrictEqual(
  core.normalizeCurrencyChartForThousands([{ d: '17', v: 39500 }], 138750),
  [{ d: '17', v: 40 }],
)
assert.deepStrictEqual(
  core.normalizeCurrencyChartForThousands([{ d: 'May', v: 6387 }], 6386580),
  [{ d: 'May', v: 6387 }],
)

const summary = {
  revenueMonths: [{ d: 'Mar', v: 420 }, { d: 'Apr', v: 485 }],
  dailyCollections: [{ d: 'Mon', v: 62 }],
  complaintsMonths: [{ d: 'Apr', v: 12 }],
  customersMonths: [{ d: 'Apr', v: 1248 }],
  customerGrowthMonths: [{ d: 'Apr', v: 42 }],
}

assert.deepStrictEqual(core.getReportChart(summary, 'Revenue').data, summary.revenueMonths)
assert.deepStrictEqual(core.getReportChart(summary, 'Collections').data, summary.dailyCollections)
assert.strictEqual(core.getReportChart(summary, 'Complaints').unit, '')
assert.strictEqual(core.getReportChart(summary, 'Customers').label, 'Net Customer Growth')
assert.deepStrictEqual(core.getReportChart(summary, 'Customers').data, summary.customerGrowthMonths)

assert.deepStrictEqual(core.normalizeAreaFilter(''), undefined)
assert.deepStrictEqual(core.normalizeAreaFilter('all'), undefined)
assert.deepStrictEqual(core.normalizeAreaFilter(' area-1 '), 'area-1')
assert.strictEqual(core.getAreaScopeLabel(undefined), 'All Areas')
assert.strictEqual(core.getAreaScopeLabel('area-1', 'Army Area'), 'Army Area')

const csv = core.buildCsv([
  ['Agent', 'Collected'],
  ['Hassan, Raza', 428000],
  ['Receipt "A"', 1500],
])

assert.strictEqual(csv, 'Agent,Collected\r\n"Hassan, Raza",428000\r\n"Receipt ""A""",1500')

console.log('reports-core tests passed')
