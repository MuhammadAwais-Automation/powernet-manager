const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-notification-navigation-test')
const source = path.join(root, 'src', 'lib', 'notifications', 'navigation.ts')

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

const navigation = require(path.join(outDir, 'navigation.js'))

assert.deepStrictEqual(
  navigation.getNotificationNavigationTarget({ kind: 'billing', billId: 'bill-1' }),
  { page: 'billing', billId: 'bill-1' }
)

assert.deepStrictEqual(
  navigation.getNotificationNavigationTarget({ kind: 'complaint', complaintId: 'complaint-1' }),
  { page: 'complaints', complaintId: 'complaint-1' }
)

assert.strictEqual(navigation.getNotificationNavigationTarget(null), null)
assert.strictEqual(navigation.getNotificationNavigationTarget({ kind: 'unknown' }), null)

console.log('notification-navigation tests passed')
