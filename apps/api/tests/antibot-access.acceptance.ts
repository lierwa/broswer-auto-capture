// WHY：保护真实主文档5xx归因、一次访问和同URL恢复；只创建专属无头测试浏览器。
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { RunnerProcess } from '../src/upstream-browser/service.js'
import { hybridExternalFailure } from '../src/upstream-browser/hybrid-runtime.js'
import { hybridExecuteRequestSchema, hybridExecuteResultSchema } from '../src/upstream-browser/hybrid-protocol.js'

const root = process.cwd(), parent = path.join(root, 'work/antibot-service/reports')
await mkdir(parent, { recursive: true })
const out = await mkdtemp(path.join(parent, 'document-access-')), profile = path.join(out, 'profile')
const save = (name: string, value: unknown) => writeFile(path.join(out, name), JSON.stringify(value, null, 2))
let status = 503
const visits: number[] = []
const server = createServer((request, response) => {
  if (request.url === '/document') visits.push(status)
  // 此用例隔离响应归因和同URL恢复；无期限退避由antibot-cooldown的真实30秒用例覆盖。
  response.writeHead(status, { 'content-type': 'text/html', 'cache-control': 'no-store', 'Retry-After': '0' })
  response.end('<title>Owned status fixture</title><link rel="icon" href="data:,"><main>Local status boundary</main>')
})
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const runner = new RunnerProcess(root, new AbortController().signal, undefined, { browserMode: 'dedicated-headless',
  runnerEnvironment: { BAT_ACCESS_STATE_DIR: path.join(out, 'access-state') } })
const results: Array<{ status: number; error: string | null; external: ReturnType<typeof hybridExternalFailure>;
  modelCalls: number | null }> = []
console.log(JSON.stringify({ evidence: out }))
try {
  await runner.startHybrid({ headless: true, profilePath: profile, allowedOrigins: [origin],
    managedWindow: { ownerId: randomUUID(), resume: false } })
  for (const current of [503, 429, 200]) {
    status = current
    try {
      const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
        id: randomUUID(), type: 'hybrid_execute', command: { name: 'browser.workflow-step', version: 2,
          actionName: 'navigate', args: { url: `${origin}/document`, new_tab: false }, target: null,
          postconditions: [{ kind: 'url', bindingArgument: 'url' }] } })))
      results.push({ status, error: null, external: null, modelCalls: result.modelCalls })
    } catch (error) {
      results.push({ status, error: error instanceof Error ? error.message : 'unknown',
        external: hybridExternalFailure(error, null), modelCalls: null })
    }
  }
  await save('observed.json', { results, visits })
  assert.equal(results[0]?.external?.externalFailure?.category, 'transient', '503-not-classified-as-external')
  assert.equal(results[0]?.external?.externalFailure?.httpStatus, 503)
  assert.equal(results[0]?.external?.outcome, 'blocked')
  assert.equal(results[1]?.external?.externalFailure?.category, 'rate_limited')
  assert.equal(results[2]?.error, null, 'stale-status-blocked-recovery')
  assert.equal(results[2]?.modelCalls, 0)
  assert.deepEqual(visits, [503, 429, 200], 'navigation-repeated')
  await save('passed.json', { external503: true, existing429: true, sameUrl200Recovery: true,
    serverAllowsImmediateRetry: true, visits })
} finally {
  const cleanup = await runner.close()
  await save('closed.json', cleanup)
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  assert.equal(cleanup.status, 'confirmed')
  assert.equal(path.dirname(path.resolve(profile)), path.resolve(out))
  assert.ok(path.resolve(out).startsWith(path.resolve(parent) + path.sep))
  await rm(profile, { recursive: true, maxRetries: 5, retryDelay: 100 })
  await save('profile-deleted.json', { permanentlyDeleted: true })
}
