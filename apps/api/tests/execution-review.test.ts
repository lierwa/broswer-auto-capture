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
  assert.deepEqual(Object.keys(record.reviews[0]!.context!).sort(), ["resultDigest", "selection"])
  operation = null
  record = appendExecutionReview(record, { requestId: randomUUID(), expectedSequence: record.sequence,
    decision: "requirement_revision", feedback: "B其它说明" })
  const retried = saveExecutionReview(store as never, repository as never, original.taskId, command)!
  assert.equal(retried.id, first.id); assert.equal(retried.feedback, "A原说明")
  assert.equal(operation, first.id); assert.equal(record.reviews.length, 2)
  assert.deepEqual(retried.context, first.context)
})

test("已有所选调用反馈恢复不重读丢失run，也不重复保存execution", () => {
  const original = execution(), command = { type: "review_execution" as const, requestId: randomUUID(),
    executionId: original.id, expectedSequence: original.sequence, decision: "requirement_revision" as const,
    feedback: "原说明", selection: { stepId: "collect", runId: randomUUID() } }
  const record = appendExecutionReview(original, command, { selection: command.selection, resultDigest: digest })
  let writes = 0
  const store = { operation: () => null, recordOperation() { writes++ } }
  const repository = { execution: () => record, saveExecution() { assert.fail("不得重复保存") }, run() { assert.fail("不得重读run") } }
  const receipt = saveExecutionReview(store as never, repository as never, original.taskId, command)
  assert.equal(receipt.context.requirement.id, original.requirement.id)
  assert.deepEqual(receipt.context.selection, command.selection)
  assert.equal(receipt.context.resultDigest, digest)
  assert.equal(writes, 1)
})

test("operation存在但反馈缺失时先报不一致，不修改execution", () => {
  const original = execution(), store = { operation: () => randomUUID(), recordOperation() { assert.fail("不能覆写operation") } }
  const repository = { execution: () => original, saveExecution() { assert.fail("不能先写execution") } }
  assert.throws(() => saveExecutionReview(store as never, repository as never, original.taskId, {
    type: "review_execution", requestId: randomUUID(), executionId: original.id, expectedSequence: original.sequence,
    decision: "requirement_revision", feedback: "保留原说明",
  }), /已保存反馈的记录缺失/)
})

test("回流摘要只消费最后实际输出生产者安全事实，不借无关同值洗掉脱敏", () => {
  const secret = "renamed-source-must-stay-private"
  for (const status of ["recorded", "redacted", "missing", "pending", "old_recorded"] as const) {
    const original = execution(), runId = randomUUID(), invocationId = randomUUID()
    original.steps[0]!.runIds = [runId]; original.steps[0]!.invocationIds = [invocationId]
    const output = { kind: "value", contract: { id: "output", version: 1 }, value: secret }
    const fact = (nodeId: string, safe: unknown) => ({ nodeId, status: "finished", outcome: "success", execution: { output: safe } })
    const run = { binding: { taskId: original.taskId, authorizationId: original.authorizationId,
      runId, invocationId, plan: original.plan, chain }, outputs: { final: output }, input: null,
      status: "completed", outcome: null, sequence: 1, events: [
        fact("unrelated", { status: "recorded", value: secret }),
        fact("producer", { status: "recorded", value: secret }),
        ...(status === "old_recorded" ? [{ nodeId: "alias", status: "finished", outcome: "success", execution: {
          input: { status: "redacted", reason: "sensitive_fields" }, output: { status: "recorded", value: secret } } }] : []),
        { nodeId: "producer", status: "started", outcome: null, execution: { input: { status: "recorded", value: secret } } },
        status === "pending" ? { nodeId: "producer", status: "started", outcome: null, execution: {} }
          : fact("producer", ["recorded", "old_recorded"].includes(status)
            ? { status: "recorded", value: secret } : { status, reason: "raw_source" }),
      ].map((event, index) => ({ ...event, sequence: index + 1, invocationId })) }
    let saved = original
    let runReads = 0, chainReads = 0
    const repository = { execution: () => saved, saveExecution(value: TaskExecution) { saved = value }, run: () => { runReads++; return run },
      chain: () => { chainReads++; return { nodes: [{ id: "producer", kind: "emit", name: "final", writes: [], output: { kind: "value",
        value: status === "old_recorded" ? { source: "node", nodeId: "alias", path: [] } : { source: "constant", value: secret } } },
        { id: "alias", kind: "function", inputs: { payload: { source: "input", path: [] } }, writes: [] }] } } }
    const store = { operation: () => null, recordOperation() {} }
    const receipt = saveExecutionReview(store as never, repository as never, original.taskId, {
      type: "review_execution", requestId: randomUUID(), executionId: original.id,
      expectedSequence: original.sequence, decision: "requirement_revision", feedback: "结果范围需重看",
      selection: { stepId: "collect", runId },
    })
    if (status === "recorded") assert.match(receipt.summary, new RegExp(secret))
    else { assert.doesNotMatch(receipt.summary, new RegExp(secret)); assert.match(receipt.summary, /安全摘要未留存/) }
    assert.equal(runReads, 1)
    if (status === "recorded") {
      saved = original
      const accepted = saveExecutionReview(store as never, repository as never, original.taskId, {
        type: "review_execution", requestId: randomUUID(), executionId: original.id,
        expectedSequence: original.sequence, decision: "accepted", feedback: null, selection: { stepId: "collect", runId },
      })
      assert.equal(chainReads, 1, "普通验收不读取链路组装回流摘要")
      assert.doesNotMatch(accepted.summary, new RegExp(secret))
    }
  }
})
