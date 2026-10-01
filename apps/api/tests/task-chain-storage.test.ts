import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import Database from "better-sqlite3"
import { CONTRACT_VERSION } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"

const budget = { maxTransitions: 30, maxBrowserCommands: 10, maxActiveMs: 30_000,
  maxLlmCalls: 0, maxInvocations: 5, maxDepth: 3 }

test("v20 迁移保留旧表 JSON 原字节", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-contract-")), taskId = randomUUID()
  let store = await ProductStore.open(directory)
  store.taskAction({ type: "create", requestId: taskId })
  const created = store.list()[0]!.id
  await store.close()
  const file = path.join(directory, "workbench.sqlite"), legacyBody = ' { "legacy": true, "rows": [1, 2] }\n'
  const raw = new Database(file)
  try {
    raw.exec("DROP TABLE browserSettings; DROP INDEX operations_task; ALTER TABLE operations DROP COLUMN taskId; PRAGMA user_version=18")
    raw.prepare("INSERT INTO plans(id,taskId,body) VALUES(?,?,?)").run("legacy-plan", created, legacyBody)
  } finally { raw.close() }
  store = await ProductStore.open(directory)
  try {
    const migrated = new Database(file, { readonly: true })
    try {
      assert.equal(migrated.pragma("user_version", { simple: true }), 20)
      const row = migrated.prepare("SELECT body FROM plans WHERE id = ? AND taskId = ?")
        .get("legacy-plan", created) as { body: string } | undefined
      assert.equal(row?.body, legacyBody)
    } finally { migrated.close() }
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("服务重启把未持久排队器的工作收敛为可解释终态", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-recovery-"))
  let store = await ProductStore.open(directory)
  const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
  const repository = new TaskContractRepository(store), now = new Date().toISOString()
  const planId = randomUUID(), requirementId = randomUUID(), authorizationId = randomUUID(), digest = "a".repeat(64)
  repository.saveJob({ id: randomUUID(), taskId, type: "plan", key: "queued-plan", status: "queued", sequence: 0,
    reason: null, resultId: null, audit: null, createdAt: now, updatedAt: now })
  repository.saveRun({ contractVersion: CONTRACT_VERSION, kind: "run", binding: { runId: randomUUID(),
    invocationId: randomUUID(), taskId, authorizationId, plan: { id: planId, version: 1, digest },
    chain: { id: randomUUID(), version: 1, digest }, inputDigest: digestJson({}) }, mode: "sample", input: {}, budget,
    sequence: 0, status: "queued", outputs: {}, checkpoint: null, consumed: { transitions: 0, browserCommands: 0,
      activeMs: 0, llmCalls: 0, invocations: 0 }, outcome: null, events: [], modelCalls: [], auditComplete: true })
  repository.saveExecution({ contractVersion: CONTRACT_VERSION, kind: "execution", id: randomUUID(), taskId,
    authorizationId, plan: { id: planId, version: 1, digest }, requirement: { id: requirementId, version: 1,
      revision: 1, digest }, input: {}, inputDigest: digestJson({}), status: "queued", sequence: 0,
    currentStepId: null, currentRunId: null, steps: [], output: null, reason: "等待执行。", createdAt: now, updatedAt: now })
  const pendingCleanupId = randomUUID()
  repository.saveExecution({ contractVersion: CONTRACT_VERSION, kind: "execution", id: pendingCleanupId, taskId,
    authorizationId, plan: { id: planId, version: 1, digest }, requirement: { id: requirementId, version: 1,
      revision: 1, digest }, input: {}, inputDigest: digestJson({}), status: "running", sequence: 3,
    cleanup: { status: "pending", attempt: 1, code: null, evidenceDigest: null, updatedAt: now }, cleanupResume: null,
    currentStepId: null, currentRunId: null, steps: [], output: null, reason: "正在执行。", createdAt: now, updatedAt: now })
  await store.close()
  store = await ProductStore.open(directory)
  try {
    const recovered = new TaskContractRepository(store)
    assert.equal(recovered.jobs(taskId)[0]?.status, "interrupted")
    assert.equal(recovered.runs(taskId)[0]?.status, "failed")
    assert.equal(recovered.runs(taskId)[0]?.outcome?.status, "failed")
    const executions = recovered.executions(taskId)
    assert.equal(executions.find((execution) => execution.id !== pendingCleanupId)?.status, "paused")
    const cleanupRequired = executions.find((execution) => execution.id === pendingCleanupId)
    assert.equal(cleanupRequired?.status, "cleanup_required")
    assert.equal(cleanupRequired?.cleanup.status, "pending")
    assert.equal(cleanupRequired?.cleanupResume?.status, "paused")
    assert.equal(cleanupRequired?.sequence, 4)
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("ExecutionCleanup 兼容旧记录并以 execution sequence 串行持久化", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-execution-cleanup-"))
  let store = await ProductStore.open(directory)
  const taskId = store.taskAction({ type: "create", requestId: randomUUID() }), executionId = randomUUID()
  const now = new Date().toISOString(), digest = "b".repeat(64)
  try {
    const repository = new TaskContractRepository(store)
    repository.saveExecution({ contractVersion: CONTRACT_VERSION, kind: "execution", id: executionId, taskId,
      authorizationId: randomUUID(), plan: { id: randomUUID(), version: 1, digest },
      requirement: { id: randomUUID(), version: 1, revision: 1, digest }, input: null, inputDigest: digest,
      status: "completed", sequence: 0, currentStepId: null, currentRunId: null, steps: [], output: null,
      reason: "链路已完成。", createdAt: now, updatedAt: now })
    assert.equal(repository.execution(taskId, executionId).cleanup.status, "not_recorded")

    await store.close()
    const raw = new Database(path.join(directory, "workbench.sqlite"))
    try { raw.prepare("UPDATE taskExecutions SET body=json_remove(body, '$.cleanup') WHERE id=?").run(executionId) }
    finally { raw.close() }

    store = await ProductStore.open(directory)
    const reopened = new TaskContractRepository(store), legacy = reopened.execution(taskId, executionId)
    assert.equal(legacy.cleanup.status, "not_recorded")
    const pending = reopened.updateExecutionCleanup(taskId, executionId, legacy.sequence, {
      status: "pending", attempt: 1, code: null, evidenceDigest: null, updatedAt: new Date().toISOString(),
    })
    assert.equal(pending.sequence, legacy.sequence + 1)
    assert.throws(() => reopened.updateExecutionCleanup(taskId, executionId, legacy.sequence, {
      status: "confirmed", attempt: 1, code: null, evidenceDigest: digest, updatedAt: new Date().toISOString(),
    }), /运行状态已经变化/)
    const unconfirmed = reopened.updateExecutionCleanup(taskId, executionId, pending.sequence, {
      status: "unconfirmed", attempt: 1, code: "runner_close_unconfirmed", evidenceDigest: digest,
      updatedAt: new Date().toISOString(),
    })
    assert.equal(unconfirmed.status, "cleanup_required")

    await store.close()
    store = await ProductStore.open(directory)
    const restored = new TaskContractRepository(store).execution(taskId, executionId)
    assert.equal(restored.status, "cleanup_required")
    assert.deepEqual(restored.cleanup, unconfirmed.cleanup)
    assert.equal(restored.sequence, 2)
  } finally {
    await store.close().catch(() => {})
    await rm(directory, { recursive: true, force: true })
  }
})
