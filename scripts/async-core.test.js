const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-async-test')
const source = path.join(root, 'src', 'lib', 'async', 'with-timeout.ts')

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

const { withTimeout } = require(path.join(outDir, 'with-timeout.js'))

async function run() {
  const value = await withTimeout(Promise.resolve('ok'), 100, 'too slow')
  assert.strictEqual(value, 'ok')

  await assert.rejects(
    () => withTimeout(new Promise(resolve => setTimeout(() => resolve('late'), 50)), 5, 'custom timeout'),
    /custom timeout/
  )
}

run()
  .then(() => console.log('async-core tests passed'))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
