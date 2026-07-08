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
assert.strictEqual(core.isBillableCustomerStatus('shifted'), false)
assert.strictEqual(core.isBillableCustomerStatus('tdc'), false)

assert.strictEqual(core.getCustomerBillAmount({ due_amount: 1500, package: { default_price: 2000 } }), 1500)
assert.strictEqual(core.getCustomerBillAmount({ due_amount: null, package: { default_price: 2000 } }), 2000)
assert.strictEqual(core.getCustomerBillAmount({ due_amount: null, package: null }), 0)
assert.strictEqual(core.getCustomerBillAmount({ due_amount: 0, package: { default_price: 2000 } }), 0)

assert.strictEqual(
  core.getCustomerSecondaryId({ username: 'a027', customer_code: 'C-123', house_id: 'H-9' }),
  'a027'
)
assert.strictEqual(
  core.getCustomerSecondaryId({ username: null, customer_code: 'C-123', house_id: 'H-9' }),
  'H-9'
)
assert.strictEqual(
  core.getCustomerSecondaryId({ username: null, customer_code: 'C-123', house_id: null }),
  undefined
)

assert.strictEqual(core.getBillCollectionStatus({ amount: 1700, paid_amount: 0, status: 'pending' }), 'pending')
assert.strictEqual(core.getBillCollectionStatus({ amount: 1700, paid_amount: 700, status: 'pending' }), 'partial')
assert.strictEqual(core.getBillCollectionStatus({ amount: 1700, paid_amount: 1700, status: 'pending' }), 'paid')
assert.strictEqual(core.getBillCollectionStatus({ amount: 1700, paid_amount: 0, status: 'overdue' }), 'overdue')
assert.strictEqual(
  core.getCustomerLedgerCollectionStatus([
    { amount: 2200, paid_amount: 2200, status: 'paid' },
    { amount: 2200, paid_amount: 0, status: 'pending' },
    { amount: 2200, paid_amount: 0, status: 'pending' },
  ]),
  'partial'
)
assert.deepStrictEqual(
  core.getLedgerPartialCustomerIds([
    { customer_id: 'c1', amount: 2200, paid_amount: 2200, status: 'paid' },
    { customer_id: 'c1', amount: 2200, paid_amount: 0, status: 'pending' },
    { customer_id: 'c2', amount: 2200, paid_amount: 0, status: 'pending' },
  ]),
  ['c1']
)
assert.strictEqual(core.getPaymentSourceLabel('office'), 'Paid in Office')
assert.strictEqual(core.getPaymentSourceLabel('agent'), 'Collected by Agent')

assert.strictEqual(core.formatBillCollectionStatusLabel('partial'), 'Less Paid')
assert.strictEqual(core.formatBillCollectionStatusLabel('paid'), 'Paid')
assert.strictEqual(core.formatBillCollectionStatusLabel('overdue'), 'Overdue')
assert.strictEqual(core.formatBillCollectionStatusLabel('pending'), 'Pending')
assert.strictEqual(core.formatPaymentOutcomeLabel(true), 'Paid in Full')
assert.strictEqual(core.formatPaymentOutcomeLabel(false), 'Less Paid')

console.log('billing-core tests passed')
