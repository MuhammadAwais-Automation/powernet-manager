const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-billing-test')
const source = path.join(root, 'src', 'lib', 'billing', 'core.ts')

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true })

const tscArgs = [
  'tsc',
  source,
  '--module', 'commonjs',
  '--target', 'ES2020',
  '--outDir', outDir,
  '--skipLibCheck',
]

if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/c', 'npx', ...tscArgs], { stdio: 'inherit' })
} else {
  execFileSync('npx', tscArgs, { stdio: 'inherit' })
}

const core = require(path.join(outDir, 'core.js'))

assert.strictEqual(core.normalizeBillingMonth('2026-04'), '2026-04')
assert.strictEqual(core.normalizeBillingMonth('2026-04-15'), '2026-04')
assert.throws(() => core.normalizeBillingMonth('Apr 2026'), /YYYY-MM/)

assert.strictEqual(core.isBillableCustomerStatus('active'), true)
assert.strictEqual(core.isBillableCustomerStatus('free'), false)
assert.strictEqual(core.isBillableCustomerStatus('disconnected'), false)

assert.strictEqual(core.getCustomerBillAmount({ due_amount: 1500, package: { default_price: 2000 } }), 1500)
assert.strictEqual(core.getCustomerBillAmount({ due_amount: null, package: { default_price: 2000 } }), 2000)
assert.strictEqual(core.getCustomerBillAmount({ due_amount: null, package: null }), 0)

console.log('billing-core tests passed')
