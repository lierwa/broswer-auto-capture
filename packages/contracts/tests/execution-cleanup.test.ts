import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import {
  CONTRACT_VERSION, executionCleanupSchema, taskExecutionSchema, taskExecutionResultSchema,
} from "@browser-capture/contracts"

const digest = "a".repeat(64)

function historicalExecution() {
  const now = new Date().toISOString()
  return { contractVersion: CONTRACT_VERSION, kind: "execution" as const, id: randomUUID(), taskId: randomUUID(),
    authorizationId: randomUUID(), plan: { id: randomUUID(), version: 1, digest },
    requirement: { id: randomUUID(), version: 1, revision: 1, digest }, input: null, inputDigest: digest,
    status: "completed" as const, sequence: 2, currentStepId: null, currentRunId: null, steps: [],
    output: null, reason: "历史运行已经完成。", createdAt: now, updatedAt: now }
}

test("历史 execution 缺少 cleanup 时只读为 not_recorded，新状态与清理动作可表达", () => {
  const parsed = taskExecutionSchema.parse(historicalExecution())
  assert.deepEqual(parsed.cleanup, { status: "not_recorded", attempt: 0, code: null,
    evidenceDigest: null, updatedAt: null })

  const updatedAt = new Date().toISOString()
  const cleanup = { status: "unconfirmed" as const, attempt: 1, code: "runner_close_unconfirmed",
    evidenceDigest: digest, updatedAt }
  assert.equal(taskExecutionSchema.parse({ ...parsed, status: "cleanup_required", cleanup }).status, "cleanup_required")
  assert.equal(taskExecutionResultSchema.parse({ status: "cleanup_required", summary: "任务步骤已完成，资源回收待确认。",
    nextAction: "cleanup", payload: { mode: "execution", completedSteps: 1, totalSteps: 1, evidence: [] },
    failure: null }).nextAction, "cleanup")
})

test("cleanup 合同拒绝没有尝试元数据或终态证据的伪结论", () => {
  assert.equal(executionCleanupSchema.safeParse({ status: "pending", attempt: 0, code: null,
    evidenceDigest: null, updatedAt: null }).success, false)
  assert.equal(executionCleanupSchema.safeParse({ status: "unconfirmed", attempt: 1, code: null,
    evidenceDigest: digest, updatedAt: new Date().toISOString() }).success, false)
  assert.equal(executionCleanupSchema.safeParse({ status: "confirmed", attempt: 1, code: null,
    evidenceDigest: null, updatedAt: new Date().toISOString() }).success, false)
})

test("execution 保留单次浏览器显示模式，历史记录仍可读取", () => {
  assert.equal(taskExecutionSchema.parse(historicalExecution()).browser, undefined)
  const selected = taskExecutionSchema.parse({ ...historicalExecution(), browser: { headless: true } })
  assert.deepEqual(selected.browser, { headless: true })
  assert.equal(taskExecutionSchema.safeParse({ ...selected, browser: { headless: "true" } }).success, false)
})
