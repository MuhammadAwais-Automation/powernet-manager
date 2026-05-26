const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-customer-auth-core-test')
const source = path.join(root, 'src', 'lib', 'admin', 'customer-auth-core.ts')

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

const core = require(path.join(outDir, 'customer-auth-core.js'))

assert.strictEqual(core.normalizeCustomerAuthIdentifier(' ID NO A-27/2 '), 'id_no_a_27_2')
assert.strictEqual(core.makeCustomerAuthEmail('A-27/2'), 'customer_a_27_2@powernet.local')
assert.strictEqual(
  core.pickCustomerLoginIdentifier({
    house_id: null,
    username: 'pn-009',
    address_value: 'QTR 6',
    customer_code: 'C-1',
  }),
  'pn-009'
)
assert.strictEqual(
  core.pickCustomerLoginIdentifier({
    house_id: 'H-44',
    username: 'pn-009',
    address_value: 'QTR 6',
    customer_code: 'C-1',
  }),
  'H-44'
)
assert.strictEqual(core.validateCustomerTemporaryPassword('short'), 'Temporary password must be at least 8 characters')
assert.strictEqual(core.validateCustomerTemporaryPassword('goodpass8'), null)

console.log('customer auth core tests passed')
