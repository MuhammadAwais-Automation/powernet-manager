const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const root = process.cwd()
const outDir = path.join(root, '.tmp-billing-query-test')
const source = path.join(root, 'src', 'lib', 'billing', 'query.ts')

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

const query = require(path.join(outDir, 'query.js'))

assert.deepStrictEqual(query.getBillRange(0, 50), { from: 0, to: 49 })
assert.deepStrictEqual(query.getBillRange(2, 25), { from: 50, to: 74 })
assert.throws(() => query.getBillRange(-1, 50), /page/)
assert.throws(() => query.getBillRange(0, 0), /page size/)

assert.strictEqual(query.normalizeBillStatusFilter('All'), undefined)
assert.strictEqual(query.normalizeBillStatusFilter('Paid'), 'paid')
assert.strictEqual(query.normalizeBillStatusFilter('Overdue'), 'overdue')
assert.strictEqual(query.normalizeBillStatusFilter('Unpaid'), 'unpaid')

console.log('billing-query tests passed')
