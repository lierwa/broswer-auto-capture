// WHY：真实两个Runner间保留站点冷却；实际源站请求数是验收分母，不用命令数替代。
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { RunnerProcess } from '../src/upstream-browser/service.js'
import { hybridExecuteRequestSchema } from '../src/upstream-browser/hybrid-protocol.js'

const root = process.cwd(), parent = path.join(root, 'work/antibot-service/reports')
const out = await mkdtemp(path.join(parent, 'cooldown-')), profile = path.join(out, 'profile')
const declared = process.argv.includes('--declared-policy')
const noHeader = process.argv.includes('--no-retry-after'), cooldownSeconds = declared ? 6 : noHeader ? 30 : 20
const save = (name: string, value: unknown) => writeFile(path.join(out, name), JSON.stringify(value, null, 2))
let status = declared ? 200 : 429, blockedAt = 0
const visits: Array<{ status: number; at: number; scope: string }> = []
const denied = createServer((request, response) => {
  if (request.url === '/document') { blockedAt = status === 429 ? Date.now() : blockedAt; visits.push({ status, at: Date.now(), scope: 'limited' }) }
  response.writeHead(status, { 'content-type': 'text/html', 'cache-control': 'no-store', ...(status === 429 && !noHeader ? { 'Retry-After': '20' } : {}) })
  response.end('<title>Owned cooldown</title><link rel="icon" href="data:,"><main>Owned document</main>')
})
const normal = createServer((request, response) => {
  if (request.url === '/document') visits.push({ status: 200, at: Date.now(), scope: 'other-origin' })
  response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
  response.end('<title>Owned independent origin</title><link rel="icon" href="data:,"><main>Normal</main>')
})
for (const server of [denied, normal]) await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const origins = [denied, normal].map(server => `http://127.0.0.1:${(server.address() as { port: number }).port}`)
if (declared) await save('policy.json', { version: 1, policies: [{ origin: origins[0], source: 'operator',
  rates: [{ limit: 1, intervalMs: cooldownSeconds * 1000 }] }] })
let runner: RunnerProcess | undefined
const results: Array<{ label: string; error: string | null }> = []
async function launch() {
  runner = new RunnerProcess(root, new AbortController().signal, undefined, { browserMode: 'dedicated-headless',
    ...(process.argv.includes('--response-diagnostics') ? {
      runnerScript: path.join(root, 'apps/api/tests/antibot-m0/diagnostic_runner.py') } : {}),
    runnerEnvironment: { BAT_ACCESS_STATE_DIR: path.join(out, 'access-state'),
      BAT_ACCESS_POLICY_FILE: path.join(out, 'policy.json'),
      BAT_RESPONSE_DIAGNOSTIC_PATH: path.join(out, 'responses.jsonl') } })
  await runner.startHybrid({ headless: true, profilePath: profile, allowedOrigins: origins,
    managedWindow: { ownerId: randomUUID(), resume: false } })
}
async function navigate(label: string, origin: string) {
  let error: string | null = null
  try {
    await runner!.request(hybridExecuteRequestSchema.parse({ id: randomUUID(), type: 'hybrid_execute', command: {
      name: 'browser.workflow-step', version: 2, actionName: 'navigate', args: { url: origin + '/document', new_tab: false },
      target: null, postconditions: [{ kind: 'url', bindingArgument: 'url' }] } }))
  } catch (caught) { error = caught instanceof Error ? caught.message : 'unknown' }
  results.push({ label, error }); await save('observed.json', { results, visits, expectedLimitedVisitsBeforeExpiry: 1 })
  return error
}
console.log(JSON.stringify({ evidence: out }))
try {
  await launch()
  if (declared) {
    assert.equal(await navigate('first-admitted', origins[0]!), null); blockedAt = Date.now()
  }
  assert.match(await navigate('first', origins[0]!) ?? '', /capture_rate_limited/)
  const closed = await runner!.close(); await save('first-closed.json', closed); assert.equal(closed.status, 'confirmed')
  await launch(); assert.match(await navigate('new-runner-before-expiry', origins[0]!) ?? '', /capture_rate_limited/)
  assert.equal(visits.filter(v => v.scope === 'limited').length, 1, 'new-runner-repeated-request-during-retry-after')
  assert.equal(await navigate('other-origin', origins[1]!), null)
  await delay(Math.max(0, blockedAt + cooldownSeconds * 1000 + 250 - Date.now()))
  status = 200; assert.equal(await navigate('after-real-expiry', origins[0]!), null)
  assert.deepEqual(visits.map(v => [v.scope, v.status]), [['limited', declared ? 200 : 429], ['other-origin', 200], ['limited', 200]])
  await save('passed.json', { persistentAcrossRunners: true, actualLimitedRequestsBeforeExpiry: 1,
    otherOriginNormal: true, actualExpiry: true, declaredPolicy: declared, missingRetryAfter: noHeader, cooldownSeconds, modelCalls: 0 })
} finally {
  if (runner) { const closed = await runner.close(); await save('closed.json', closed); assert.equal(closed.status, 'confirmed') }
  for (const server of [denied, normal]) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  assert.equal(path.dirname(path.resolve(profile)), path.resolve(out))
  assert.ok(path.resolve(out).startsWith(path.resolve(parent) + path.sep))
  await rm(profile, { recursive: true, maxRetries: 5, retryDelay: 100 })
  await save('profile-deleted.json', { permanentlyDeleted: true })
}
