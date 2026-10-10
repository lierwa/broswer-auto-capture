// WHY：复用已校准holdout原页面/探针；只追加实际账号借用路径的对照驱动。
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { createHoldoutFixture } from './antibot-m0/holdout.js'

const root = process.cwd(), out = await mkdtemp(path.join(root, 'work/antibot-service/reports/account-runtime-'))
const fixture = await createHoldoutFixture(root, out)
const cases = [fixture.add('bat-execute', 0), fixture.add('bat-execute', 1)]
for (const value of cases) value.item.collect = true
const driver = 'patchright'
await writeFile(path.join(out, 'input.json'), JSON.stringify({ out, driver, cases: cases.map(value => ({ id: value.item.id, url: value.url })) }))
console.log(JSON.stringify({ out, driver, requirement: 'account borrow preserves functionality without Runtime detection' }))
try {
  const child = await promisify(execFile)(path.join(root, 'work/upstream-browser-hybrid/.venv/Scripts/python.exe'),
    ['apps/api/tests/account-borrow-runtime.acceptance.py', path.join(out, 'input.json')], { cwd: root, timeout: 100_000, maxBuffer: 1_000_000 })
  await writeFile(path.join(out, 'runner.log'), child.stdout + '\n' + child.stderr)
  const result = cases.map(value => ({ ...value.item, requests: value.item.requests.length }))
  assert.ok(result.every(value => value.result?.status === 'observed' && value.submissions === 1))
  assert.deepEqual(result[0]!.violations, [])
  assert.deepEqual(result[1]!.violations, ['connect-src'], 'native-CSP-not-preserved')
  const report = { driver, normal: result[0]!.result, accountBorrow: result[1]!.result, modelCalls: 0,
    wholeShieldAcceptance: false, scope: 'calibrated independent Runtime mechanism, actual borrow path' }
  await writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  assert.equal(report.normal?.detected, false, 'existing-TaskBrowser-regressed')
  const focus = JSON.parse(await readFile(path.join(out, 'focus.json'), 'utf8'))
  assert.equal(focus.changed, false, 'borrow-changed-native-background-focus')
  assert.equal(report.accountBorrow?.detected, false, 'account-Runtime-regressed')
  console.log(JSON.stringify({ out, normalRuntimeDetected: report.normal?.detected,
    borrowRuntimeDetected: report.accountBorrow?.detected, resources: JSON.parse(await readFile(path.join(out, 'closed.json'), 'utf8')) }))
} catch (error) {
  const value = error as { stdout?: string; stderr?: string; message?: string }
  await writeFile(path.join(out, 'first-failure.log'), [value.message, value.stdout, value.stderr].filter(Boolean).join('\n'))
  throw error
} finally { await fixture.close() }
