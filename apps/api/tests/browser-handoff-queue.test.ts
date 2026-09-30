import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { taskExecutionSchema, taskPlanSchema, type RunnableTaskRelease, type TaskPlan } from "@browser-capture/contracts"
import { digestJson, stableUuid } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createApplication } from "../src/app.js"
import { queuedExecution } from "../src/task-chain/queued-runs.js"
import { TaskPlanExecutor } from "../src/task-chain/plan-executor.js"
import type { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { UpstreamProtocolError, type UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { testAIModel } from "./fixtures/ai-model.js"
import { projectRoot } from "./helpers.js"

function startupFailure(options: { resume?: boolean; missingReport?: boolean; unconfirmed?: boolean; wrongOwner?: boolean;
  handoffAttempted?: boolean; anonymousError?: boolean } = {}) {
  const requirement = structuredClone(extractionFixture.requirement)
  const plan = taskPlanSchema.parse({ ...extractionFixture.plan, browserHandoff: "close",
    requirement: { ...extractionFixture.plan.requirement, digest: digestJson(requirement) } })
  const chain = structuredClone(extractionFixture.chain); chain.plan.digest = digestJson(plan)
  const release = { id: randomUUID(), version: 1, content: { steps: [{ stepId: chain.stepId, chain }] } } as unknown as RunnableTaskRelease
  const record = queuedExecution(plan.taskId, randomUUID(), plan, requirement, release,
    { destination: "https://example.test/" }, { nodeDelayMs: 0 }, { headless: false })
  const owner = stableUuid(record.id, "managed-window"), audits: unknown[] = []
  if (options.resume) record.browserHandoff = { status: "active", purpose: "delivery", leaseId: owner, ownerId: owner,
    targetDigest: "c".repeat(64), reason: null, updatedAt: record.updatedAt }
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => options.unconfirmed && stage === "browser_close"
    ? { stage, status: "unconfirmed" as const, code: "cleanup_browser_close_failed" as const }
    : { stage, status: stage === "browser_close" ? "not_required" as const : "confirmed" as const, code: null }),
  options.unconfirmed ? null : false)
  const repository = { plan: () => plan, requirement: () => requirement, chain: () => chain, runs: () => [],
    saveExecution: (value: unknown) => taskExecutionSchema.parse(value), saveCleanupAudit: (value: unknown) => { audits.push(value) } }
  const store = { snapshot: () => ({ active: null, confirmedVersion: requirement.version }) }
  const host = { group: async (input: Parameters<TaskRuntimeHost["group"]>[0]) => {
    if (options.handoffAttempted) input.onHandoffFailure?.("delivery", "fixture_handoff_unconfirmed")
    if (!options.missingReport) input.onCleanup?.(report)
    if (options.wrongOwner) record.browserHandoff.ownerId = record.browserHandoff.leaseId = randomUUID()
    throw options.anonymousError ? new Error("fixture_start_failed") : new UpstreamProtocolError("hybrid_runner_failed", "fixture_sdk_start_failed")
  } }
  const executor = new TaskPlanExecutor(store as never, repository as never, host as never)
  return { record, executor, audits, report }
}

// WHY：首连尚无链路调用时，启动 owner 不能伪装已交付占用；原协议错误仍保留但不能授权模型修链。
test("首连失败已有同owner真实释放证明时不残留租约，连接错误不误判为链路修复", async () => {
  const f = startupFailure()
  const result = await f.executor.execute(f.record, new AbortController().signal)
  assert.equal(result.status, "failed"); assert.equal(result.cleanup.status, "confirmed")
  assert.equal(result.browserHandoff.status, "not_requested")
  assert.equal(result.browserHandoff.leaseId, null); assert.equal(result.browserHandoff.ownerId, null)
  assert.equal(result.result?.failure?.classification, "external"); assert.equal(result.result?.failure?.repairable, false)
  assert.equal(result.result?.failure?.code, "hybrid_runner_failed")
  assert.match(result.reason, /fixture_sdk_start_failed/); assert.ok(result.steps.every(step => step.runIds.length === 0))
  assert.equal(f.audits.length, 1)
})

test("恢复已交付页、交付回执不明或释放证明不足仍保留租约，不以SDK清理确认推页面结束", async () => {
  for (const options of [{ resume: true }, { handoffAttempted: true }, { missingReport: true },
    { unconfirmed: true }, { wrongOwner: true }]) {
    const f = startupFailure(options), result = await f.executor.execute(f.record, new AbortController().signal)
    assert.equal(result.browserHandoff.status, "unavailable")
    assert.notEqual(result.browserHandoff.leaseId, null)
    if (options.resume) assert.equal(result.browserHandoff.purpose, null)
  }
  const unknown = startupFailure({ anonymousError: true }), result = await unknown.executor.execute(unknown.record, new AbortController().signal)
  assert.equal(result.result?.failure?.classification, "deterministic")
  assert.equal(result.result?.failure?.repairable, true)
})

function deliveryRecord(taskId: string) {
  const plan = { id: randomUUID(), version: 1, browserHandoff: "keep_open", steps: [],
    requirement: { id: randomUUID(), version: 1, revision: 1, digest: "a".repeat(64) },
    outputContract: { schema: { type: "null" } } } as unknown as TaskPlan
  const release = { id: randomUUID(), version: 1, content: { steps: [] } } as unknown as RunnableTaskRelease
  return queuedExecution(taskId, randomUUID(), plan,
    { version: 1 } as Parameters<typeof queuedExecution>[3], release, null, { nodeDelayMs: 0 }, { headless: false })
}

test("queued delivery has no lease and legacy ownerless pending recovers without a global lock", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-handoff-queue-"))
  const options = { root: projectRoot, directory,
    aiModel: testAIModel(async function* () { yield { type: "turn_succeeded" as const, outputText: "" } }) }
  try {
    const first = await createApplication(options)
    const taskId = first.store.taskAction({ type: "create", requestId: randomUUID() })
    const record = deliveryRecord(taskId)
    assert.equal(record.browserHandoff.status, "not_requested")
    first.taskChain.repository.saveExecution(record)
    assert.equal(first.store.activeBrowserWindowLease(), null)
    first.taskChain.repository.saveExecution({ ...record, browserHandoff: {
      ...record.browserHandoff, status: "pending", purpose: "delivery", updatedAt: new Date().toISOString() } })
    await first.app.close()

    const restored = await createApplication(options)
    try {
      const recovered = restored.taskChain.repository.execution(taskId, record.id)
      assert.equal(recovered.status, "paused")
      assert.equal(recovered.browserHandoff.status, "not_requested")
      assert.equal(restored.store.activeBrowserWindowLease(), null)
    } finally { await restored.app.close() }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("old execution lease remains actionable while interview restarts and cleanup is unresolved", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-handoff-history-"))
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "confirmed" as const,
    code: null })), false)
  const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("unavailable") },
    managedWindowAction: async ({ ownerId, leaseId }) => ({ window: { leaseId, ownerId,
      targetDigest: null, active: false, reason: null }, report }) }
  const api = await createApplication({ root: projectRoot, directory, upstreamBrowserRuntime: upstream,
    aiModel: testAIModel(async function* () { yield { type: "turn_succeeded", outputText: "" } }) })
  try {
    const taskId = api.store.taskAction({ type: "create", requestId: randomUUID() })
    const record = deliveryRecord(taskId), owner = stableUuid(record.id, "managed-window"), now = new Date().toISOString()
    record.status = "cleanup_required"; record.sequence = 2
    record.cleanup = { status: "unconfirmed", attempt: 1, code: "runner_close_unconfirmed",
      evidenceDigest: "b".repeat(64), updatedAt: now }
    record.cleanupResume = { status: "completed", reason: "业务已完成", result: null }
    record.browserHandoff = { status: "active", purpose: "delivery", leaseId: owner, ownerId: owner,
      targetDigest: "c".repeat(64), reason: null, updatedAt: now }
    api.taskChain.repository.saveExecution(record)
    const summary = api.taskChain.projectTasks([{ ...api.store.task(taskId), status: "draft" }])[0]!
    assert.equal(summary.attention?.id, record.id)
    assert.equal(summary.attention?.kind, "action_required")
    const snapshot = await api.taskChain.controlBrowserHandoff(taskId, { action: "end", requestId: randomUUID(),
      executionId: record.id, expectedSequence: record.sequence })
    assert.equal(api.taskChain.repository.execution(taskId, record.id).browserHandoff.status, "ended")
    assert.equal(api.taskChain.repository.execution(taskId, record.id).status, "cleanup_required")
    assert.equal(snapshot.taskId, taskId)
    assert.equal(api.store.activeBrowserWindowLease(), null)
  } finally { await api.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("foreground denial returns readable error without changing completed delivery", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-handoff-focus-error-"))
  const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("unavailable") },
    managedWindowAction: async () => {
      throw new UpstreamProtocolError("hybrid_runner_failed", "ValueError:hybrid_managed_window_foreground_denied")
    } }
  const api = await createApplication({ root: projectRoot, directory, upstreamBrowserRuntime: upstream,
    aiModel: testAIModel(async function* () { yield { type: "turn_succeeded", outputText: "" } }) })
  try {
    const taskId = api.store.taskAction({ type: "create", requestId: randomUUID() })
    const record = deliveryRecord(taskId), owner = stableUuid(record.id, "managed-window")
    record.status = "completed"; record.sequence = 2
    record.output = { kind: "value", contract: { id: "result", version: 1 }, value: ["retained"] }
    record.result = { status: "completed", summary: "业务已完成", nextAction: "rerun",
      payload: { mode: "data", output: record.output }, failure: null }
    record.browserHandoff = { status: "active", purpose: "delivery", leaseId: owner, ownerId: owner,
      targetDigest: "c".repeat(64), reason: null, updatedAt: new Date().toISOString() }
    api.taskChain.repository.saveExecution(record)
    const before = api.taskChain.repository.execution(taskId, record.id)
    const response = await api.app.inject({ method: "POST", url: `/api/task-chain/handoff?taskId=${taskId}`,
      headers: { host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin" },
      payload: { action: "focus", requestId: randomUUID(), executionId: record.id, expectedSequence: record.sequence } })
    assert.equal(response.statusCode, 409)
    assert.deepEqual(response.json(), { code: "browser_handoff_foreground_denied",
      error: "系统未允许自动切换到原窗口；窗口仍保留，请通过任务栏手动切换。" })
    assert.deepEqual(api.taskChain.repository.execution(taskId, record.id), before)
  } finally { await api.app.close(); await rm(directory, { recursive: true, force: true }) }
})
