// 仅由显式环境开关启用；读取已完成的真实来源链，不生成来源、不调用模型。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createAI, localStore } from "@agent-platform/ai-connect/server"
import { taskPlanSchema, taskRunSchema, type TaskRun } from "@browser-capture/contracts"
import { checkpointBrowserReceipt, compileTaskChain, TaskChainRuntime } from "@browser-capture/runtime"
import { SHARED_AI_SUBJECT } from "../src/app.js"
import { hybridCompilerResponseSchema } from "../src/upstream-browser/hybrid-schema.js"
import { PythonUpstreamBrowserRuntime, RunnerProcess } from "../src/upstream-browser/service.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"

if (process.env.BAT_RUN_REAL_REPEAT_RESUME !== "1") throw new Error("explicit_real_repeat_resume_required")
const sourceDirectory = process.env.BAT_REAL_REPEAT_DIRECTORY
if (!sourceDirectory || !path.isAbsolute(sourceDirectory)) throw new Error("real_repeat_directory_required")
const root = process.cwd()
const read = async (name: string) => JSON.parse(await readFile(path.join(sourceDirectory, name), "utf8"))
const plan = taskPlanSchema.parse(await read("sample-plan.json"))
const chain = compileTaskChain(await read("chain.json")).chain
assert.equal(chain.plan.id, plan.id, "real_chain_plan_mismatch")
const priorRun = taskRunSchema.parse(await read("run.json"))
assert.equal(priorRun.status, "completed", "complete_replay_required_before_resume_acceptance")
assert.equal(priorRun.modelCalls.length, 0, "ordinary_replay_model_call")
const compilation = hybridCompilerResponseSchema.parse((await read("compilation.json")).response).compilation
assert.ok(compilation.compilerVersion === "bat-hybrid/2", "natural_compilation_required")
const repeat = compilation.repeatMethods?.[0]
assert.ok(repeat, "real_repeat_method_missing")
const readNodeId = repeat.readSegmentId
const pureNodes = new Set(chain.nodes.filter((node) => ["data", "function", "loop", "branch", "condition"].includes(node.kind))
  .map((node) => node.id))
const navigation = chain.nodes.find((node) => node.kind === "capability"
  && node.capability.name === "browser.workflow-step" && node.config !== null
  && typeof node.config === "object" && !Array.isArray(node.config) && node.config.actionName === "navigate"
  && node.input.url?.source === "constant" && typeof node.input.url.value === "string")
assert.ok(navigation?.kind === "capability" && navigation.input.url?.source === "constant"
  && typeof navigation.input.url.value === "string", "real_chain_entry_origin_missing")
const origin = new URL(navigation.input.url.value).origin
const directory = await mkdtemp(path.join(tmpdir(), "bat-g5-repeat-resume-")), ownerId = randomUUID()
const save = async (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const browser = new PythonUpstreamBrowserRuntime({ root, directory, subject: ai.forSubject(SHARED_AI_SUBJECT) })
const request = requestFor(chain, null, "replay", randomUUID(), randomUUID())
assert.deepEqual(priorRun.binding.chain, request.binding.chain, "prior_replay_used_different_chain")
const reports: RunnerCleanupReport[] = [], handoffs: Array<{ ownerId: string; leaseId: string; targetDigest: string }> = []
const result = { paused: false, pureBoundary: false, handoff: false, focus: false, sameRun: false,
  firstReadNotReplayed: false, completed: false, modelCalls: 0, cleanupConfirmed: false, failure: null as string | null }
let latest: TaskRun | null = null
const persist = async (run: TaskRun) => { latest = structuredClone(run); await save("latest-run.json", run) }
const profilePath = path.join(directory, "browser-profile", "default")
async function windowAction(action: "inspect" | "focus" | "end") {
  const runner = new RunnerProcess(root, new AbortController().signal)
  try { return await runner.managedWindowAction({ action, ownerId, leaseId: ownerId, profilePath }) }
  finally { reports.push(await runner.close()) }
}
function safeError(error: unknown) {
  const code = error instanceof Error ? error.message.split("\n", 1)[0]! : "unknown"
  return /^[a-zA-Z0-9_:.-]{1,240}$/.test(code) ? code : error instanceof Error ? error.name : "unknown"
}
try {
  const interrupt = new AbortController()
  const paused = await browser.withCapabilities({ signal: AbortSignal.timeout(360_000), ownerId,
    headless: false, allowedOrigins: [origin], managedWindow: { ownerId, resume: false },
    handoffPurpose: () => "human_wait", onHandoff: (_purpose, lease) => { handoffs.push(lease) },
    onHandoffFailure: (_purpose, reason) => { result.failure = safeError(new Error(reason)) },
    onCleanup: (report) => { reports.push(report) } }, (capabilities) => new TaskChainRuntime().execute({ chain, request,
    capabilities: { ...capabilities, persist }, control: { signal: interrupt.signal, pacing: {
      beforeNode: async () => {
        const firstRead = latest?.events.find((event) => event.nodeId === readNodeId && event.status === "finished"
          && event.outcome === "success")
        if (firstRead && latest?.events.some((event) => event.sequence > firstRead.sequence
          && event.status === "finished" && pureNodes.has(event.nodeId))) interrupt.abort()
      },
    } } }))
  await save("paused-run.json", paused)
  assert.equal(paused.status, "paused", "repeat_did_not_pause_at_pure_boundary")
  assert.ok(paused.outcome?.status === "paused" && paused.outcome.cause === "interrupted", "unexpected_pause_cause")
  assert.equal(paused.checkpoint?.pendingEffect, null, "pending_effect_must_not_resume")
  const lastBrowser = paused.events.findLast((event) => event.browserStateDigest !== undefined)
  assert.equal(paused.checkpoint?.browserNodeId, lastBrowser?.nodeId, "checkpoint_lost_browser_predecessor")
  assert.ok([readNodeId, repeat.continuationSegmentId].includes(paused.checkpoint?.browserNodeId ?? ""),
    "checkpoint_browser_outside_repeat")
  assert.ok(checkpointBrowserReceipt(paused.checkpoint!), "checkpoint_browser_receipt_missing")
  result.paused = true
  result.pureBoundary = pureNodes.has(paused.events.findLast((event) => event.status === "finished")!.nodeId)
  assert.equal(result.pureBoundary, true, "pause_not_after_pure_node")
  assert.equal(handoffs.length, 1, "paused_window_not_handed_off")
  assert.equal(handoffs[0]!.ownerId, ownerId, "handoff_owner_changed")
  assert.equal(handoffs[0]!.leaseId, ownerId, "handoff_lease_changed")
  const lease = JSON.parse(await readFile(path.join(directory, "browser-profile", "managed-window-lease.json"), "utf8"))
  assert.equal(lease.ownerId, ownerId, "persisted_lease_owner_changed")
  assert.equal(lease.status, "handoff", "persisted_window_not_handed_off")
  result.handoff = true
  const focus = await windowAction("focus")
  assert.equal(focus.report.status, "confirmed", "focus_runner_cleanup_unconfirmed")
  assert.equal(focus.window.targetDigest, handoffs[0]!.targetDigest, "focus_target_changed")
  result.focus = focus.window.active
  assert.equal(result.focus, true, "handoff_window_not_active")
  // WHY：从持久化合同重新读入；runtime 中断信号不复用浏览器 owner 信号，窗口可以由新 Runner 接管。
  const persisted = taskRunSchema.parse(JSON.parse(await readFile(path.join(directory, "paused-run.json"), "utf8")))
  const checkpoint = persisted.checkpoint!
  const firstRead = checkpoint.events.find((event) => event.nodeId === readNodeId && event.status === "finished"
    && event.outcome === "success")!
  const resumed = await browser.withCapabilities({ signal: AbortSignal.timeout(360_000), ownerId,
    headless: false, allowedOrigins: [origin], managedWindow: { ownerId, resume: true },
    onCleanup: (report) => { reports.push(report) } }, (capabilities) => new TaskChainRuntime().execute({ chain, request,
    capabilities: { ...capabilities, persist }, control: { checkpoint, resumeRequest: {
      contractVersion: checkpoint.contractVersion, requestId: randomUUID(), binding: checkpoint.binding,
      checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence,
    } } }))
  await save("resumed-run.json", resumed)
  result.sameRun = resumed.binding.runId === persisted.binding.runId && resumed.binding.invocationId === persisted.binding.invocationId
  result.firstReadNotReplayed = resumed.events.filter((event) => event.status === "finished" && event.outcome === "success"
    && event.nodeId === firstRead.nodeId && event.idempotencyKey === firstRead.idempotencyKey).length === 1
  result.completed = resumed.status === "completed"
  result.modelCalls = resumed.modelCalls.length
  assert.deepEqual(resumed.events.slice(0, persisted.events.length), persisted.events, "prior_events_rewritten")
  assert.equal(result.sameRun, true, "resume_created_different_run")
  assert.equal(result.firstReadNotReplayed, true, "first_read_replayed")
  assert.equal(result.completed, true, "real_resume_not_completed")
  assert.equal(result.modelCalls, 0, "ordinary_resume_model_call")
} catch (error) {
  result.failure ??= safeError(error)
  process.exitCode = 1
} finally {
  try {
    let inspection = await windowAction("inspect")
    if (inspection.window.active) {
      await windowAction("end")
      inspection = await windowAction("inspect")
    }
    result.cleanupConfirmed = !inspection.window.active && inspection.report.status === "confirmed"
      && reports.every((report) => report.status === "confirmed")
  } catch (error) { result.failure ??= safeError(error); process.exitCode = 1 }
  await save("recovery-result.json", { ...result, ownerId, sourceDirectory, cleanup: reports })
  if (!result.cleanupConfirmed) process.exitCode = 1
  console.log(JSON.stringify({ ...result, directory }))
}
