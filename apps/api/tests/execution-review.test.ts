import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { CONTRACT_VERSION, UNRECORDED_BROWSER_HANDOFF, UNRECORDED_EXECUTION_CLEANUP, type TaskExecution } from "@browser-capture/contracts"
import { appendExecutionReview, saveExecutionReview } from "../src/task-chain/execution-review.js"

const digest = "a".repeat(64)
const chain = { id: randomUUID(), version: 2, digest }

function execution(status: TaskExecution["status"] = "completed"): TaskExecution {
  const now = new Date().toISOString()
  return { contractVersion: CONTRACT_VERSION, kind: "execution", id: randomUUID(), taskId: randomUUID(),
    authorizationId: randomUUID(), plan: { id: randomUUID(), version: 1, digest },
    requirement: { id: randomUUID(), version: 1, revision: 1, digest }, release: { id: randomUUID(), version: 3, digest },
    input: null, inputDigest: digest, pacing: { nodeDelayMs: 0 },
    consumed: { transitions: 3, browserCommands: 2, activeMs: 20, llmCalls: 0, invocations: 1 },
    status, sequence: 4, cleanup: { ...UNRECORDED_EXECUTION_CLEANUP }, cleanupResume: null,
    browserHandoff: { ...UNRECORDED_BROWSER_HANDOFF },
    currentStepId: null, currentRunId: null,
    steps: [{ stepId: "collect", chain, invocationIds: [], runIds: [],
      consumed: { transitions: 3, browserCommands: 2, activeMs: 20, llmCalls: 0, invocations: 1 },
      status: status === "completed" ? "completed" : "failed", output: null, reason: null }],
    output: null, reason: "正式链路已沿合法控制流结束。", reviews: [], createdAt: now, updatedAt: now }
}

test("用户验收追加独立事实，运行结果和链路版本保持不变", () => {
  const before = execution()
  const accepted = appendExecutionReview(before, { requestId: randomUUID(), expectedSequence: before.sequence,
    decision: "accepted", feedback: null })
  assert.equal(accepted.sequence, before.sequence + 1)
  assert.equal(accepted.reviews[0]?.decision, "accepted")
  assert.match(accepted.reviews[0]!.summary, /浏览器命令 2，模型调用 0/)
  assert.deepEqual(accepted.steps, before.steps)
  assert.deepEqual(accepted.output, before.output)

  const returned = appendExecutionReview(accepted, { requestId: randomUUID(), expectedSequence: accepted.sequence,
    decision: "requirement_revision", feedback: "来源范围理解错了" })
  assert.deepEqual(returned.reviews.map((item) => item.decision), ["accepted", "requirement_revision"])
  assert.equal(returned.reviews[1]?.feedback, "来源范围理解错了")
})

test("需求修订必须说明业务变化，未完成结果不能标记符合预期", () => {
  const before = execution()
  assert.throws(() => appendExecutionReview(before, { requestId: randomUUID(), expectedSequence: before.sequence,
    decision: "requirement_revision", feedback: null }), /请说明需要重新梳理/)
  const failed = execution("failed")
  assert.throws(() => appendExecutionReview(failed, { requestId: randomUUID(), expectedSequence: failed.sequence,
    decision: "accepted", feedback: null }), /只有技术运行完成/)
})

test("取消与待清理保留业务结论；响应丢失重试不重复追加", () => {
  for (const status of ["cancelled", "cleanup_required"] as const) {
    const record = execution(status)
    if (status === "cleanup_required") {
      record.cleanupResume = { status: "completed", reason: "已完成", result: null }
      record.cleanup = { status: "unconfirmed", attempt: 1, code: "fixture_unconfirmed", evidenceDigest: digest,
        updatedAt: record.updatedAt }
    }
    const command = { requestId: randomUUID(), expectedSequence: record.sequence,
      decision: "requirement_revision" as const, feedback: "原范围理解错误" }
    const reviewed = appendExecutionReview(record, command)
    assert.equal(appendExecutionReview(reviewed, command), reviewed)
    assert.equal(reviewed.reviews.length, 1)
    assert.equal(reviewed.status, status)
  }
})

test("保存反馈后operation写入中断，再有B反馈仍精确重试A及原结果引用", () => {
  const original = execution(), command = { type: "review_execution" as const, requestId: randomUUID(),
    executionId: original.id, expectedSequence: original.sequence, decision: "requirement_revision" as const, feedback: "A原说明" }
  let record = original, operation: string | null = null
  const store = { operation: () => operation, recordOperation: (_kind: string, _id: string, _command: unknown, id: string) => { operation = id } }
  const repository = { execution: () => record, saveExecution: (value: TaskExecution) => { record = value } }
  const first = saveExecutionReview(store as never, repository as never, original.taskId, command)!
  assert.equal(first.context?.requirement.version, original.requirement.version)
  assert.equal(first.context?.executionId, original.id)
  operation = null
  record = appendExecutionReview(record, { requestId: randomUUID(), expectedSequence: record.sequence,
    decision: "requirement_revision", feedback: "B其它说明" })
  const retried = saveExecutionReview(store as never, repository as never, original.taskId, command)!
  assert.equal(retried.id, first.id); assert.equal(retried.feedback, "A原说明")
  assert.equal(operation, first.id); assert.equal(record.reviews.length, 2)
})
