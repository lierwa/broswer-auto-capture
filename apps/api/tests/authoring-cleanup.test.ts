import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { taskAuthoringJobSchema } from "@browser-capture/contracts"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { saveAuthoringCleanup, settleAuthoringCleanup, CLEANUP_PENDING_REASON } from "../src/task-chain/authoring-cleanup.js"
import { authoringResourceRecords } from "../src/task-chain/resource-recovery.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"

// 不变量：中断业务状态不可被清理改成成功；只允许原 owner、已退出控制器的窗口收尾。
test("准备清理持久化、恢复和 owner/控制器边界", async () => {
  const base = path.resolve("work"), directory = await mkdtemp(path.join(base, "authoring-cleanup-test-"))
  const store = await ProductStore.open(directory), repository = new TaskContractRepository(store)
  try {
    const taskId = store.taskAction({ type: "create", requestId: randomUUID() }), ownerId = randomUUID()
    const now = new Date().toISOString(), job = taskAuthoringJobSchema.parse({
      id: randomUUID(), taskId, type: "prepare", key: "test", status: "interrupted", sequence: 0,
      reason: "生成已中断。" + CLEANUP_PENDING_REASON, resultId: null, browserRunId: ownerId,
      browser: { mode: "daily", headless: false }, audit: null, createdAt: now, updatedAt: now,
    })
    const pending = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => stage === "browser_close"
      ? { stage, status: "unconfirmed", code: "cleanup_browser_close_unverified" }
      : { stage, status: "confirmed", code: null }), null)
    saveAuthoringCleanup(repository, job, pending); repository.saveJob(job)
    const original = job.cleanupEvidence!, saved = repository.job(taskId, job.id)
    assert.equal(saved.cleanup?.status, "unconfirmed")
    assert.deepEqual(authoringResourceRecords(store), [{ id: job.id, taskId }])
    let calls = 0, foreign = true, active = true
    const upstream = { managedWindowAction: async (input: { action: string; ownerId: string; controllerReleased?: boolean }) => {
      calls++; assert.equal(input.ownerId, ownerId)
      if (input.action === "end") { assert.equal(input.controllerReleased, true); active = false }
      return { window: { ownerId: foreign ? randomUUID() : ownerId, leaseId: ownerId, active },
        report: cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "confirmed", code: null })), false) }
    } } as unknown as UpstreamBrowserRuntime
    assert.equal(await settleAuthoringCleanup(repository, upstream, saved, true), false); assert.equal(calls, 0)
    assert.equal(await settleAuthoringCleanup(repository, upstream, saved, false), false); assert.equal(calls, 1)
    foreign = false
    assert.equal(await settleAuthoringCleanup(repository, upstream, saved, false), true)
    assert.equal(calls, 3); assert.equal(saved.status, "interrupted"); assert.equal(saved.cleanup?.status, "confirmed")
    assert.equal(saved.reason, "生成已中断。")
    assert.notEqual(saved.cleanupEvidence?.artifactId, original.artifactId)
    assert.equal((repository.artifact(taskId, original.artifactId).body as any).report.status, "unconfirmed")
    assert.deepEqual(authoringResourceRecords(store), [])
    const running = { ...saved, cleanupEvidence: original, cleanup: job.cleanup }
    const artifact = repository.artifact(taskId, original.artifactId).body as any
    artifact.report.stages = artifact.report.stages.map((s: any) => ({ ...s, status: "unconfirmed", code: "cleanup_browser_close_unverified" }))
    saveAuthoringCleanup(repository, running, cleanupReport(artifact.report.stages, true))
    assert.equal(await settleAuthoringCleanup(repository, upstream, running, false), false); assert.equal(calls, 3)
  } finally { await store.close(); assert.equal(path.dirname(directory), base); await rm(directory, { recursive: true }) }
})
