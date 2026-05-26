const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-complaint-intake-test')
const source = path.join(root, 'src', 'lib', 'notifications', 'complaints.ts')

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

const complaints = require(path.join(outDir, 'complaints.js'))

assert.strictEqual(
  complaints.didComplaintStatusChange(null, { id: 'complaint-1', status: 'open' }),
  true,
  'new open complaints should trigger an intake notification'
)

const notification = complaints.buildComplaintNotification({
  complaintId: 'complaint-1',
  complaintCode: 'CMP-1001',
  customerName: 'Awais Customer',
  technicianName: null,
  priority: 'medium',
  status: 'open',
  updatedAt: '2026-05-26T00:00:00.000Z',
})

assert.strictEqual(notification.type, 'complaint_created')
assert.strictEqual(notification.title, 'New Customer Complaint')
assert.match(notification.message, /Awaiting assignment/)
assert.strictEqual(notification.dedupeKey, 'complaint:complaint-1:open')

console.log('complaint-intake tests passed')
