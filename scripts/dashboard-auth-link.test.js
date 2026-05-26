const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-dashboard-auth-link-test')
const source = path.join(root, 'src', 'lib', 'auth', 'staff-auth-link.ts')

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

const link = require(path.join(outDir, 'staff-auth-link.js'))

assert.strictEqual(link.staffUsernameFromAuthEmail('saif-ullah@powernet.local'), 'saif-ullah')
assert.strictEqual(link.staffUsernameFromAuthEmail(' Saif-Ullah@PowerNet.Local '), 'saif-ullah')
assert.strictEqual(link.staffUsernameFromAuthEmail('admin@example.com'), null)
assert.strictEqual(link.staffUsernameFromAuthEmail(null), null)

assert.strictEqual(link.canAcceptStaffAuthLink(null, 'auth-1'), true)
assert.strictEqual(link.canAcceptStaffAuthLink('auth-1', 'auth-1'), true)
assert.strictEqual(link.canAcceptStaffAuthLink('auth-2', 'auth-1'), false)
assert.strictEqual(link.canAcceptStaffAuthLink('', 'auth-1'), true)

console.log('dashboard auth link tests passed')
