import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { CONTRACT_VERSION } from "@browser-capture/contracts"
import { digestJson, stableUuid } from "@browser-capture/runtime"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { TaskChainService } from "../src/task-chain/service.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"

// WHY：再次运行只做一次原 owner 释放核验；必须先持久化旧失败，不能复用/覆盖原 execution。
for (const trigger of ["worker_exit", "rerun"] as const) test(`${trigger} verifies the old owner once and retains the original failure`, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-cleanup-rerun-")), store = await ProductStore.open(directory)
  try {
    const taskId = store.taskAction({ type: "create", requestId: randomUUID() }), repository = new TaskContractRepository(store)
    const original = saveTerminal(repository, taskId, "failed").execution, owner = stableUuid(original.id, "managed-window")
    const resume = { status: original.status, reason: original.reason, result: original.result }
    const pending = repository.saveExecution({ ...original, status: "cleanup_required", cleanupResume: resume,
      cleanup: { ...original.cleanup, status: "unconfirmed", code: "runner_close_unconfirmed", evidenceDigest: "b".repeat(64) },
      browserHandoff: { status: "unavailable", purpose: null, ownerId: owner, leaseId: owner,
        targetDigest: null, reason: null, updatedAt: original.updatedAt } })
    const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => stage === "browser_close"
      ? { stage, status: "unconfirmed" as const, code: "cleanup_browser_close_failed" as const }
      : { stage, status: "confirmed" as const, code: null }), null)
    repository.saveCleanupAudit({ id: randomUUID(), taskId, executionId: pending.id, ownerId: owner,
      source: "runner", attempt: 1, ...report, createdAt: original.updatedAt })
    let checks = 0, accepted = 0
    const service = Object.assign(Object.create(TaskChainService.prototype), {
      store, repository, controllers: new Map(), cleanupInFlight: new Set(), activeWork: new Set(),
      queue: [{ taskId, id: pending.id }], draining: false, closing: false,
      executor: { execute: async () => pending },
      preparation: { onExecutionSettled: () => {} }, snapshot: () => ({ taskId }),
      upstream: { managedWindowAction: async (input: { action: string; ownerId: string; leaseId: string }) => {
        checks++; assert.deepEqual(input, { action: "verify_closed", ownerId: owner, leaseId: owner })
        return { report: { status: "confirmed" }, window: { ownerId: owner, leaseId: owner, active: false } }
      } }, dispatch: () => {
        accepted++; const old = repository.execution(taskId, original.id)
        assert.equal(old.status, "failed"); assert.equal(old.cleanup.status, "confirmed")
        assert.deepEqual(old.result, original.result)
        return { snapshot: { taskId }, acceptedExecution: null }
      },
    }) as TaskChainService
    if (trigger === "rerun") await service.dispatchAsync(taskId, { type: "run_task", requestId: randomUUID(), release: original.plan,
      input: null, pacing: { nodeDelayMs: 0 } })
    else await (service as unknown as { drain(): Promise<void> }).drain()
    assert.equal(checks, 1); assert.equal(accepted, trigger === "rerun" ? 1 : 0)
    assert.equal(repository.execution(taskId, pending.id).status, "failed")
    assert.deepEqual(repository.execution(taskId, pending.id).result, original.result)
    assert.equal(repository.executionHistory(taskId, 0, 10).length, 1)
    assert.deepEqual(repository.run(taskId, original.steps[0]!.runIds[0]!).outcome,
      { status: "failed", code: "target_missing", reason: original.reason, evidence: [] })
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("终态 pending 重启保留业务结论并进入同次清理，confirmed 不变且重复恢复幂等", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-cleanup-terminal-"))
  let store = await ProductStore.open(directory)
  try {
    const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
    const repository = new TaskContractRepository(store)
    const fixtures = [saveTerminal(repository, taskId, "completed"), saveTerminal(repository, taskId, "failed"),
      saveTerminal(repository, taskId, "completed", true)]
    await store.close()
    store = await ProductStore.open(directory)
    const reopened = new TaskContractRepository(store)
    for (const { execution, run } of fixtures) {
      assert.deepEqual(reopened.run(taskId, run.binding.runId), run)
      const restored = reopened.execution(taskId, execution.id)
      if (execution.cleanup.status === "confirmed") { assert.deepEqual(restored, execution); continue }
      assert.equal(restored.status, "cleanup_required")
      assert.equal(restored.sequence, execution.sequence + 1)
      assert.deepEqual(restored.cleanup, execution.cleanup)
      assert.deepEqual(restored.cleanupResume, { status: execution.status, reason: execution.reason, result: execution.result })
      assert.deepEqual(restored.steps, execution.steps)
      assert.deepEqual(restored.output, execution.output)
      assert.deepEqual(restored.consumed, execution.consumed)
      assert.deepEqual(restored.result?.payload, execution.result?.payload)
      assert.deepEqual(restored.result?.failure, execution.result?.failure)
      assert.equal(restored.result?.nextAction, "cleanup")
    }
    const beforeAgain = reopened.executions(taskId)
    const again = new TaskContractRepository(store)
    assert.deepEqual(again.executions(taskId), beforeAgain)
    for (const original of beforeAgain.filter((execution) => execution.status === "cleanup_required")) {
      const pending = again.updateExecutionCleanup(taskId, original.id, original.sequence,
        { ...original.cleanup, attempt: original.cleanup.attempt + 1 }, "cleanup_required")
      assert.equal(pending.id, original.id)
      assert.deepEqual(pending.cleanupResume, original.cleanupResume)
      const resume = pending.cleanupResume!
      // 这里只验证已有确认合同的状态归还，不执行或伪造任何真实资源清理。
      const closed = again.updateExecutionCleanup(taskId, pending.id, pending.sequence,
        { ...pending.cleanup, status: "confirmed", evidenceDigest: digestJson({ fixture: pending.id }) },
        { status: resume.status, reason: resume.reason, result: resume.result, cleanupResume: null })
      assert.equal(closed.status, resume.status)
      assert.equal(closed.reason, resume.reason)
      assert.deepEqual(closed.result, resume.result)
      assert.equal(closed.cleanupResume, null)
    }
    const automatic = saveTerminal(again, taskId, "completed").execution
    assert.throws(() => again.updateExecutionCleanup(taskId, automatic.id, automatic.sequence,
      { ...automatic.cleanup, attempt: automatic.cleanup.attempt + 1 }), /资源清理状态已经变化/)
  } finally {
    await store.close().catch(() => {})
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}bat-cleanup-terminal-`))
    await rm(directory, { recursive: true, force: true })
  }
})

function saveTerminal(repository: TaskContractRepository, taskId: string, status: "completed" | "failed", confirmed = false) {
  const now = "2026-09-21T17:00:00.000Z", digest = "a".repeat(64), id = randomUUID()
  const plan = { id: randomUUID(), version: 1, digest }, chain = { id: randomUUID(), version: 1, digest }
  const consumed = { transitions: 3, browserCommands: 2, activeMs: 20, llmCalls: 0, invocations: 1 }
  const output = { kind: "value" as const, contract: { id: "result", version: 1 }, value: `保存的${status}结果` }
  const reason = status === "completed" ? "业务已完成" : "原业务失败：目标缺失"
  const run = repository.saveRun({ contractVersion: CONTRACT_VERSION, kind: "run",
    binding: { taskId, runId: randomUUID(), invocationId: randomUUID(), authorizationId: randomUUID(),
      plan, chain, inputDigest: digestJson(null) }, mode: "replay", input: null,
    budget: { maxTransitions: 10, maxBrowserCommands: 10, maxActiveMs: 1000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    sequence: 3, status, outputs: { result: output }, checkpoint: null, consumed, events: [], modelCalls: [], auditComplete: true,
    outcome: status === "completed" ? { status, reason, evidence: [], completionEvidence: ["done"] }
      : { status, code: "target_missing", reason, evidence: [] } })
  const failure = status === "failed" ? { classification: "deterministic", code: "target_missing", repairable: true,
    executionId: id, stepId: "perform", runId: run.binding.runId, runSequence: run.sequence,
    checkpointId: null, eventSequence: null, reason, digest } : null
  const execution = repository.saveExecution({ contractVersion: CONTRACT_VERSION, kind: "execution", id, taskId,
    authorizationId: run.binding.authorizationId, plan, requirement: { id: randomUUID(), version: 1, revision: 1, digest },
    mode: "replay", input: null, inputDigest: digestJson(null), status, sequence: 4, consumed,
    currentStepId: null, currentRunId: null,
    steps: [{ stepId: "perform", chain, invocationIds: [run.binding.invocationId], runIds: [run.binding.runId],
      consumed, status, output, reason }], output, reason,
    cleanup: { status: confirmed ? "confirmed" : "pending", attempt: 1, code: null,
      evidenceDigest: confirmed ? digest : null, updatedAt: now }, cleanupResume: null,
    result: { status, summary: reason, nextAction: status === "completed" ? "rerun" : "none",
      payload: { mode: "data", output }, failure }, createdAt: now, updatedAt: now })
  return { execution, run }
}
