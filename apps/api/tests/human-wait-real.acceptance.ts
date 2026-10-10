// 显式启用的协议验收，不创建业务任务，不调用模型，不把公开 HTTP 状态演示站当业务验收。
import assert from "node:assert/strict"
import { randomUUID, X509Certificate, createHash } from "node:crypto"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { setTimeout as delay } from 'node:timers/promises'
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from 'zod'
import { taskChainSchema, taskRunSchema, type TaskRun } from "@browser-capture/contracts"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { capabilityEffectChain, requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"

if (process.env.BAT_RUN_REAL_HUMAN_WAIT !== "1") throw new Error("explicit_real_human_wait_required")
const target = new URL(process.env.BAT_HUMAN_WAIT_URL ?? "invalid:")
if (target.protocol !== "https:" || target.username || target.password) throw new Error("public_https_401_url_required")
const root = process.cwd(), ownerId = randomUUID()
const manual = process.env.BAT_HUMAN_WAIT_MANUAL === '1'
const publicManual = process.env.BAT_HUMAN_WAIT_PUBLIC_MANUAL === '1'
const interactive = manual || publicManual
if (publicManual && (manual || target.href !== 'https://www.scrapingcourse.com/cloudflare-challenge')) throw Error('public_practice_fixture_required')
const caseId = /^\/case\/([a-f0-9-]{36})\/captcha$/.exec(target.pathname)?.[1]
if (manual && (!caseId || target.hostname !== `${caseId}.localhost` || target.port !== '4183')) throw Error('owned_captcha_url_required')
const directory = await mkdtemp(path.join(interactive ? path.join(root, 'work/antibot-service') : tmpdir(), "bat-human-wait-real-"))
const startedAt = new Date().toISOString()
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const chainInput = capabilityEffectChain()
chainInput.budget.maxBrowserCommands = 20; chainInput.budget.maxActiveMs = 180_000
const navigate = chainInput.nodes.find((node) => node.id === "observe")!
assert.equal(navigate.kind, "capability")
if (navigate.kind !== "capability") throw new Error("fixture")
navigate.capability.name = "browser.workflow-step"; navigate.effect = "idempotent_write"; navigate.timeoutMs = 60_000
navigate.input = { url: { source: "constant", value: target.href } }
navigate.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
if (publicManual) {
  const read = chainInput.nodes.find(node => node.id === 'capability')!
  assert.equal(read.kind, 'capability')
  if (read.kind !== 'capability') throw Error('fixture')
  const schema = { type: 'object' as const, properties: { body: { type: 'string' as const } }, required: ['body'], additionalProperties: false }
  read.capability.name = 'browser.read-fields'; read.effect = 'read'; read.input = {}
  read.outputContract = { ...read.outputContract, schema }
  read.config = { runtimeScopeFrom: 'observe', scope: { url: target.href }, specification: {
    container: 'body', fields: { body: { selector: ':scope', attribute: null, valueType: 'string' } }, maxItems: 1, outputSchema: schema } }
} else {
  chainInput.nodes = chainInput.nodes.filter((node) => node.id !== "capability")
  chainInput.edges = chainInput.edges.filter((edge) => edge.from !== "capability")
    .map((edge) => edge.to === "capability" ? { ...edge, to: "done" } : edge)
}
const terminal = chainInput.nodes.find((node) => node.id === "done")!
if (terminal.kind === "terminal") terminal.evidence = [{ source: "node", nodeId: publicManual ? "capability" : "observe", path: [] }]
const chain = taskChainSchema.parse(chainInput), request = requestFor(chain, null)
const reports: RunnerCleanupReport[] = [], handoffs: Array<{ ownerId: string; leaseId: string; targetDigest: string }> = []
const result = { initialWaiting: false, stillWaiting: false, unresolvedRetryPerformed: !publicManual,
  sameRun: false, sameBrowser: false,
  noFalseCompletion: false, resolvedCompletion: false, profileDeleted: false,
  modelCalls: 0, cleanupConfirmed: false, failure: null as string | null }
const persist = (run: TaskRun) => save("latest-run.json", run)
const profilePath = path.join(directory, "browser-profile", "default")
const localPin = manual ? createHash('sha256').update(new X509Certificate(await readFile(path.join(root,
  'work/antibot-service/tls/cert.pem'))).publicKey.export({ type: 'spki', format: 'der' })).digest('base64') : null
const runnerOptions = { browserMode: 'dedicated-visible' as const, ...(localPin ? {
  runnerScript: path.join(root, 'apps/api/tests/antibot-m0/diagnostic_runner.py'),
  runnerEnvironment: { BAT_LOCAL_TLS_SPKI: localPin, BAT_LOCAL_TLS_PROFILE: profilePath },
} : {}) }
async function windowAction(action: "inspect" | "end") {
  const runner = new RunnerProcess(root, AbortSignal.timeout(45_000), undefined, runnerOptions)
  try { return await runner.managedWindowAction({ action, ownerId, leaseId: ownerId, profilePath }) }
  finally { reports.push(await runner.close()) }
}
function run(checkpoint?: NonNullable<TaskRun["checkpoint"]>) {
  return withHybridCapabilities({ root, directory, ownerId, signal: AbortSignal.timeout(180_000),
    createRunner: (root, signal, diagnostic) => new RunnerProcess(root, signal, diagnostic, runnerOptions),
    headless: false, allowedOrigins: [target.origin], managedWindow: { ownerId, resume: manual || Boolean(checkpoint) },
    handoffPurpose: () => "human_wait", onHandoff: (_purpose, lease) => { handoffs.push(lease) },
    onHandoffFailure: (_purpose, reason) => { result.failure ??= reason },
    onCleanup: (report) => { reports.push(report) } }, (capabilities) => new TaskChainRuntime().execute({ chain, request,
    capabilities: { ...capabilities, persist }, ...(checkpoint ? { control: { checkpoint, resumeRequest: {
      contractVersion: checkpoint.contractVersion, requestId: randomUUID(), binding: checkpoint.binding,
      checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } } } : {}) }))
}
function safeError(error: unknown) {
  const message = error instanceof Error ? error.message.split("\n", 1)[0]! : "unknown"
  return /^[a-zA-Z0-9_:.-]{1,240}$/.test(message) ? message : error instanceof Error ? error.name : "unknown"
}
async function waitForEvent(outcome: string, timeout: number) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    // WSL 活动 SQLite 的事实通过已有源站报告读取，Windows 不另开同一 WAL 的连接。
    const response = await fetch('http://127.0.0.1:4188/api/report', { signal: AbortSignal.timeout(15_000) })
    assert.ok(response.ok, 'captcha_report_unavailable')
    const report = z.object({ business: z.array(z.object({ case_id: z.string(), at: z.string(), action: z.string(), value: z.string() })) }).parse(await response.json())
    if (report.business.some(event => event.case_id === caseId && event.at >= startedAt && event.action === 'captcha'
      && JSON.parse(event.value).outcome === outcome)) return
    await delay(3000)
  }
  throw Error(`captcha_${outcome}_timeout`)
}
async function waitForPublicHuman() {
  const deadline = Date.now() + 600_000
  while (Date.now() < deadline) {
    try { if (JSON.parse(await readFile(path.join(directory, 'human-done.json'), 'utf8')).completed === true) return }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    await delay(1000)
  }
  throw Error('public_human_timeout')
}
async function warmOwnedWindow() {
  const runner = new RunnerProcess(root, AbortSignal.timeout(90_000), undefined, runnerOptions)
  try {
    await runner.startHybrid({ headless: false, profilePath, allowedOrigins: [target.origin], managedWindow: { ownerId, resume: false } })
    try {
      await runner.request({ id: randomUUID(), type: 'hybrid_execute', command: {
        name: 'browser.workflow-step', version: 2, actionName: 'navigate', args: { url: target.href, new_tab: false },
        target: null, postconditions: [{ kind: 'url', bindingArgument: 'url' }] } })
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('capture_authentication_required')) throw error
    }
    // 冷 PoW 由原盾自行执行；只等源站已展示人工挑战的事实，不代填/读取答案。
    await waitForEvent('required', 60_000)
    await runner.handoff()
  } finally { reports.push(await runner.close()) }
}
try {
  await save('manifest.json', { ownerId, profilePath, target: target.href, root, manual, publicManual })
  console.log(JSON.stringify({ stage: 'starting', directory, publicManual }))
  if (manual) await warmOwnedWindow()
  const first = await run()
  await save("first-run.json", first)
  assert.equal(first.status, "waiting_for_human", "real_http401_did_not_wait")
  assert.equal(first.externalFailure?.httpStatus, publicManual ? 403 : 401, "real_challenge_status_missing")
  if (publicManual) assert.equal(first.externalFailure?.category, 'verification')
  assert.equal(first.checkpoint?.cursor, "observe", "wait_cursor_changed")
  assert.equal(handoffs.length, 1, "first_wait_handoff_missing")
  assert.equal(handoffs[0]!.ownerId, ownerId, "first_wait_owner_changed")
  result.initialWaiting = true
  const persisted = taskRunSchema.parse(JSON.parse(await readFile(path.join(directory, "first-run.json"), "utf8")))
  // 外站不为证明仍在等待而重新提交挑战；原401本地重复等待回归保持。
  const second = publicManual ? persisted : await run(persisted.checkpoint!)
  await save("second-run.json", second)
  result.stillWaiting = second.status === "waiting_for_human"
  result.sameRun = second.binding.runId === first.binding.runId
  result.sameBrowser = second.checkpoint?.browser?.sessionId === first.checkpoint?.browser?.sessionId
    && second.checkpoint?.browser?.tabId === first.checkpoint?.browser?.tabId
  result.noFalseCompletion = !second.events.some((event) => event.nodeId === "observe" && event.outcome === "success")
  result.modelCalls = second.modelCalls.length
  assert.equal(result.stillWaiting, true, "unresolved_http401_falsely_completed")
  assert.equal(result.sameRun, true, "resume_changed_run")
  assert.equal(result.sameBrowser, true, "resume_changed_browser")
  assert.equal(result.noFalseCompletion, true, "unresolved_action_marked_successful")
  assert.equal(result.modelCalls, 0, "ordinary_resume_called_model")
  assert.equal(handoffs.length, publicManual ? 1 : 2, "second_wait_handoff_missing")
  assert.ok(handoffs.every((lease) => lease.ownerId === ownerId && lease.leaseId === ownerId), "handoff_owner_changed")
  assert.deepEqual(second.events.slice(0, first.events.length), first.events, "first_failure_history_changed")
  if (interactive) {
    console.log(JSON.stringify({ stage: 'ready_for_human', directory, ownerId }))
    if (publicManual) await waitForPublicHuman()
    else await waitForEvent('passed', 600_000)
    const resumed = await run(second.checkpoint!)
    await save('resolved-run.json', resumed)
    assert.equal(resumed.status, 'completed', 'manual_answer_did_not_resume')
    assert.equal(resumed.binding.runId, first.binding.runId, 'resolved_run_changed')
    assert.equal(resumed.modelCalls.length, 0, 'manual_resume_called_model')
    assert.deepEqual(resumed.events.slice(0, second.events.length), second.events, 'first_failure_history_changed')
    if (publicManual) assert.ok(JSON.stringify(resumed).includes('bypassed the Cloudflare challenge'), 'public_success_content_missing')
    result.resolvedCompletion = true
  }
} catch (error) {
  result.failure ??= safeError(error); process.exitCode = 1
} finally {
  // 真实 401 未解除，本协议探测到此停止并结束唯一自有窗口；不伪造登录完成或业务 cancelled 记录。
  try {
    const before = await windowAction("inspect")
    if (before.window.active) await windowAction("end")
    const after = await windowAction("inspect")
    result.cleanupConfirmed = !after.window.active && after.report.status === "confirmed"
      && reports.every((report) => report.status === "confirmed")
    if (interactive && result.cleanupConfirmed) {
      assert.equal(path.dirname(path.dirname(profilePath)), directory)
      assert.equal(path.dirname(directory), path.join(root, 'work/antibot-service'))
      await rm(path.dirname(profilePath), { recursive: true, maxRetries: 5, retryDelay: 100 })
        .catch(error => { if (error.code !== 'ENOENT') throw error })
      result.profileDeleted = true
    }
  } catch (error) { result.failure ??= safeError(error); process.exitCode = 1 }
  if (!result.cleanupConfirmed) process.exitCode = 1
  await save("receipt.json", { ...result, ownerId, source: target.href,
    scope: publicManual ? 'public manual challenge; same TaskRun resume, new navigation and business read; no model or automated solving'
      : manual ? 'owned HTTPS4183 manual CAPTCHA and same-run recovery; no automated solving' : "public HTTP401 protocol only; authenticated completion not tested", cleanup: reports })
  console.log(JSON.stringify({ ...result, directory }))
}
