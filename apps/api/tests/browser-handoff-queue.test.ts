import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import type { RunnableTaskRelease, TaskPlan } from "@browser-capture/contracts"
import { stableUuid } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import { queuedExecution } from "../src/task-chain/queued-runs.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { UpstreamProtocolError, type UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { testAIModel } from "./fixtures/ai-model.js"
import { projectRoot } from "./helpers.js"

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
