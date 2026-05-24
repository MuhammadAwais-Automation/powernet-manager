const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-realtime-resilience-test')
const source = path.join(root, 'src', 'lib', 'notifications', 'realtime-resilience.ts')

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

const resilience = require(path.join(outDir, 'realtime-resilience.js'))

assert.strictEqual(resilience.isUnhealthyRealtimeStatus('CHANNEL_ERROR'), true)
assert.strictEqual(resilience.isUnhealthyRealtimeStatus('TIMED_OUT'), true)
assert.strictEqual(resilience.isUnhealthyRealtimeStatus('CLOSED'), true)
assert.strictEqual(resilience.isUnhealthyRealtimeStatus('SUBSCRIBED'), false)

assert.strictEqual(resilience.getReconnectDelayMs(0), 1000)
assert.strictEqual(resilience.getReconnectDelayMs(1), 2000)
assert.strictEqual(resilience.getReconnectDelayMs(4), 16000)
assert.strictEqual(resilience.getReconnectDelayMs(10), 30000)

assert.strictEqual(resilience.shouldUsePollingFallback({
  billingConnected: true,
  complaintsConnected: true,
}), false)
assert.strictEqual(resilience.shouldUsePollingFallback({
  billingConnected: false,
  complaintsConnected: true,
}), true)
assert.strictEqual(resilience.shouldUsePollingFallback({
  billingConnected: true,
  complaintsConnected: false,
}), true)

console.log('realtime-resilience tests passed')
