// 显式启用的协议验收，不创建业务任务，不调用模型，不把公开 HTTP 状态演示站当业务验收。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
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
const directory = await mkdtemp(path.join(tmpdir(), "bat-human-wait-real-"))
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const chainInput = capabilityEffectChain()
chainInput.budget.maxBrowserCommands = 20; chainInput.budget.maxActiveMs = 180_000
const navigate = chainInput.nodes.find((node) => node.id === "observe")!
assert.equal(navigate.kind, "capability")
if (navigate.kind !== "capability") throw new Error("fixture")
navigate.capability.name = "browser.workflow-step"; navigate.effect = "idempotent_write"; navigate.timeoutMs = 60_000
navigate.input = { url: { source: "constant", value: target.href } }
navigate.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
chainInput.nodes = chainInput.nodes.filter((node) => node.id !== "capability")
chainInput.edges = chainInput.edges.filter((edge) => edge.from !== "capability")
  .map((edge) => edge.to === "capability" ? { ...edge, to: "done" } : edge)
const terminal = chainInput.nodes.find((node) => node.id === "done")!
if (terminal.kind === "terminal") terminal.evidence = [{ source: "node", nodeId: "observe", path: [] }]
const chain = taskChainSchema.parse(chainInput), request = requestFor(chain, null)
const reports: RunnerCleanupReport[] = [], handoffs: Array<{ ownerId: string; leaseId: string; targetDigest: string }> = []
const result = { initialWaiting: false, stillWaiting: false, sameRun: false, sameBrowser: false,
  noFalseCompletion: false, modelCalls: 0, cleanupConfirmed: false, failure: null as string | null }
const persist = (run: TaskRun) => save("latest-run.json", run)
const profilePath = path.join(directory, "browser-profile", "default")
async function windowAction(action: "inspect" | "end") {
  const runner = new RunnerProcess(root, AbortSignal.timeout(45_000))
  try { return await runner.managedWindowAction({ action, ownerId, leaseId: ownerId, profilePath }) }
  finally { reports.push(await runner.close()) }
}
function run(checkpoint?: NonNullable<TaskRun["checkpoint"]>) {
  return withHybridCapabilities({ root, directory, ownerId, signal: AbortSignal.timeout(180_000),
    headless: false, allowedOrigins: [target.origin], managedWindow: { ownerId, resume: Boolean(checkpoint) },
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
try {
  const first = await run()
  await save("first-run.json", first)
  assert.equal(first.status, "waiting_for_human", "real_http401_did_not_wait")
  assert.equal(first.externalFailure?.httpStatus, 401, "real_http401_evidence_missing")
  assert.equal(first.checkpoint?.cursor, "observe", "wait_cursor_changed")
  assert.equal(handoffs.length, 1, "first_wait_handoff_missing")
  assert.equal(handoffs[0]!.ownerId, ownerId, "first_wait_owner_changed")
  result.initialWaiting = true
  const persisted = taskRunSchema.parse(JSON.parse(await readFile(path.join(directory, "first-run.json"), "utf8")))
  const second = await run(persisted.checkpoint!)
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
  assert.equal(handoffs.length, 2, "second_wait_handoff_missing")
  assert.ok(handoffs.every((lease) => lease.ownerId === ownerId && lease.leaseId === ownerId), "handoff_owner_changed")
  assert.deepEqual(second.events.slice(0, first.events.length), first.events, "first_failure_history_changed")
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
  } catch (error) { result.failure ??= safeError(error); process.exitCode = 1 }
  if (!result.cleanupConfirmed) process.exitCode = 1
  await save("receipt.json", { ...result, ownerId, source: target.href,
    scope: "public HTTP401 protocol only; authenticated completion not tested", cleanup: reports })
  console.log(JSON.stringify({ ...result, directory }))
}
