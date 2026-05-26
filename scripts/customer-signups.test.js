const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-customer-signups-test')
const source = path.join(root, 'src', 'lib', 'notifications', 'customer-signups.ts')

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

const signups = require(path.join(outDir, 'customer-signups.js'))

const notification = signups.buildCustomerSignupNotification({
  requestId: 'req-1',
  customerName: 'Ali Khan',
  houseId: 'A-12',
  areaName: 'Cantt',
  packageName: '20 Mbps',
  createdAt: '2026-05-26T10:00:00.000Z',
})

assert.strictEqual(notification.kind, 'customer_signup')
assert.strictEqual(notification.type, 'customer_signup_pending')
assert.strictEqual(notification.dedupeKey, 'customer-signup:req-1')
assert.strictEqual(notification.requestId, 'req-1')
assert.strictEqual(notification.houseId, 'A-12')
assert.strictEqual(notification.read, false)
assert.match(notification.message, /Ali Khan/)
assert.match(notification.message, /A-12/)
assert.match(notification.message, /Cantt/)
assert.match(notification.message, /20 Mbps/)

console.log('customer-signups tests passed')
