import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { CONTRACT_VERSION, UNRECORDED_EXECUTION_CLEANUP, type TaskExecution } from "@browser-capture/contracts"
import { appendExecutionReview } from "../src/task-chain/execution-review.js"

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
    currentStepId: null, currentRunId: null,
    steps: [{ stepId: "collect", chain, invocationIds: [], runIds: [],
      consumed: { transitions: 3, browserCommands: 2, activeMs: 20, llmCalls: 0, invocations: 1 },
      status: status === "completed" ? "completed" : "failed", output: null, reason: null }],
    output: null, reason: "正式链路已沿合法控制流结束。", reviews: [], createdAt: now, updatedAt: now }
}

test("用户验收追加独立事实，运行结果和链路版本保持不变", () => {
  const before = execution()
  const accepted = appendExecutionReview(before, { requestId: randomUUID(), expectedSequence: before.sequence,
    decision: "accepted", feedback: null, chain: null })
  assert.equal(accepted.sequence, before.sequence + 1)
  assert.equal(accepted.reviews[0]?.decision, "accepted")
  assert.match(accepted.reviews[0]!.summary, /浏览器命令 2，模型调用 0/)
  assert.deepEqual(accepted.steps, before.steps)
  assert.deepEqual(accepted.output, before.output)

  const returned = appendExecutionReview(accepted, { requestId: randomUUID(), expectedSequence: accepted.sequence,
    decision: "requirement_revision", feedback: "来源范围理解错了", chain: null })
  assert.deepEqual(returned.reviews.map((item) => item.decision), ["accepted", "requirement_revision"])
  assert.equal(returned.reviews[1]?.feedback, "来源范围理解错了")
})

test("局部修订只能引用本次运行实际使用的链路，未完成结果不能标记符合预期", () => {
  const before = execution()
  const revised = appendExecutionReview(before, { requestId: randomUUID(), expectedSequence: before.sequence,
    decision: "chain_revision", feedback: "读取节点需要调整", chain })
  assert.deepEqual(revised.reviews[0]?.chain, chain)
  assert.throws(() => appendExecutionReview(before, { requestId: randomUUID(), expectedSequence: before.sequence,
    decision: "chain_revision", feedback: null, chain: { ...chain, version: 99 } }), /请选择本次运行实际使用的链路/)
  const failed = execution("failed")
  assert.throws(() => appendExecutionReview(failed, { requestId: randomUUID(), expectedSequence: failed.sequence,
    decision: "accepted", feedback: null, chain: null }), /只有技术运行完成/)
})
