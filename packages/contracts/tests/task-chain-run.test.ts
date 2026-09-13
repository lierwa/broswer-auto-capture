import assert from "node:assert/strict"
import test from "node:test"
import { CONTRACT_VERSION, modelCallSummary, readTaskContractJson, requireCurrentTaskContract, sameRunBinding,
  taskCheckpointSchema, taskResumeRequestSchema, taskRunOutcomeSchema, taskRunRequestSchema, taskRunSchema,
  type TaskCheckpoint, type TaskRun } from "@browser-capture/contracts"
import { budget, digest, extractionFixture, ids, playbackFixture, reference } from "./task-chain-fixtures.js"

const binding = { runId: ids.run, invocationId: ids.invocation, taskId: ids.task, authorizationId: ids.authorization,
  plan: reference(ids.plan), chain: reference(ids.chain), inputDigest: digest }
const input = { destination: "https://example.com/first" }
const consumed = { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
const checkpoint: TaskCheckpoint = { contractVersion: CONTRACT_VERSION, id: ids.checkpoint, binding, mode: "replay", sequence: 0,
  cursor: "open", resumeWhen: null, input, nodeOutputs: {}, variables: {}, loops: {}, invocations: [], outputs: {}, artifacts: [],
  browser: { sessionId: "fixture-session", tabId: "fixture-tab", url: "https://example.com/", observationDigest: digest, observedAt: "2026-09-12T00:00:00Z" },
  consumed, events: [], modelCalls: [], auditComplete: true,
  pendingEffect: { kind: "browser", nodeId: "open", stableKey: "first", idempotencyKey: "persisted-effect-key", status: "uncertain" } }
const run: TaskRun = { contractVersion: CONTRACT_VERSION, kind: "run", binding, mode: "replay", input, budget,
  sequence: 0, status: "running", outputs: {}, checkpoint: null, consumed, outcome: null, events: [], modelCalls: [], auditComplete: true }

test("独立运行请求与同运行恢复绑定；拒绝注入游标、消耗与审计", () => {
  const request = { contractVersion: CONTRACT_VERSION, requestId: ids.request, binding, mode: "replay", input }
  assert.equal(taskRunRequestSchema.safeParse(request).success, true)
  for (const property of ["cursor", "modelCalls", "consumed", "completedStableKeys", "checkpoint"]) {
    assert.equal(taskRunRequestSchema.safeParse({ ...request, [property]: 0 }).success, false)
  }
  const resume = { contractVersion: CONTRACT_VERSION, requestId: ids.request, binding, checkpointId: ids.checkpoint, expectedSequence: 0 }
  assert.equal(taskResumeRequestSchema.safeParse(resume).success, true)
  assert.equal(taskResumeRequestSchema.safeParse({ ...resume, input }).success, false)
  for (const replacement of [{ runId: ids.request }, { invocationId: ids.request }, { taskId: ids.request },
    { authorizationId: ids.request }, { inputDigest: "b".repeat(64) }, { chain: { ...binding.chain, version: 2 } },
    { plan: { ...binding.plan, digest: "b".repeat(64) } }]) {
    assert.equal(sameRunBinding(binding, { ...binding, ...replacement }), false)
  }
  assert.equal(sameRunBinding(binding, structuredClone(binding)), true)
})

test("检查点保留幂等副作用、变量、稳定键与浏览器摘要；不能替换运行绑定", () => {
  assert.deepEqual(taskCheckpointSchema.parse(checkpoint), checkpoint)
  const outcome = { status: "paused" as const, cause: "interrupted" as const, checkpointId: checkpoint.id, reason: "中断等待核验", evidence: [] }
  const paused = { ...run, status: "paused", checkpoint, outcome }
  assert.equal(taskRunSchema.safeParse(paused).success, true)
  assert.equal(taskRunSchema.safeParse({ ...paused, checkpoint: null }).success, false)
  assert.equal(taskRunSchema.safeParse({ ...paused, checkpoint: { ...checkpoint, binding: { ...binding, runId: ids.request } } }).success, false)
  assert.equal(taskRunSchema.safeParse({ ...paused, outcome: { ...outcome, checkpointId: ids.request } }).success, false)
  assert.equal(taskCheckpointSchema.safeParse({ ...checkpoint, loops: { repeat: { index: 2, completedStableKeys: ["same", "same"] } } }).success, false)
})

test("模型审计未知不折算为零，计数必须与实际回报一致", () => {
  const audit = { callId: ids.request, invocationId: ids.invocation, nodeId: "think", purpose: "explicit_llm" as const,
    model: "fixture-model", intendedAt: "2026-09-12T00:00:00Z", status: "intended" as const, reportedInvocations: null }
  assert.deepEqual(modelCallSummary([], false), { intents: 0, reportedInvocations: null })
  assert.deepEqual(modelCallSummary([], true), { intents: 0, reportedInvocations: 0 })
  assert.deepEqual(modelCallSummary([audit], true), { intents: 1, reportedInvocations: null })
  assert.equal(taskRunSchema.safeParse({ ...run, modelCalls: [audit] }).success, false)
  assert.equal(taskRunSchema.safeParse({ ...run, modelCalls: [audit], consumed: { ...consumed, llmCalls: null } }).success, true)
  const reported = { ...audit, status: "completed", reportedInvocations: 2 }
  assert.equal(taskRunSchema.safeParse({ ...run, modelCalls: [reported], consumed: { ...consumed, llmCalls: 2 } }).success, true)
  assert.equal(taskRunSchema.safeParse({ ...run, modelCalls: [reported, reported], consumed: { ...consumed, llmCalls: 4 } }).success, false)
  assert.equal(taskRunSchema.safeParse({ ...run, modelCalls: [{ ...reported, purpose: "exploration" }], consumed: { ...consumed, llmCalls: 2 } }).success, false)
})

test("完成、部分完成、阻断、失败、取消与人工等待各自保留所需事实", () => {
  const base = { reason: "可验证原因", evidence: [] }
  const outcomes = [
    { ...base, status: "completed", completionEvidence: ["observed"] },
    { ...base, status: "partial", remaining: ["剩余输入"] },
    { ...base, status: "blocked", code: "access_restricted" },
    { ...base, status: "failed", code: "command_failed" }, { ...base, status: "cancelled" },
    { ...base, status: "waiting_for_human", checkpointId: ids.checkpoint, waitpointId: ids.request },
  ]
  for (const outcome of outcomes) assert.equal(taskRunOutcomeSchema.safeParse(outcome).success, true)
  assert.equal(taskRunOutcomeSchema.safeParse({ ...base, status: "completed" }).success, false)
  assert.equal(taskRunOutcomeSchema.safeParse({ ...base, status: "partial", remaining: [] }).success, false)
  assert.equal(taskRunSchema.safeParse({ ...run, status: "completed", outcome: outcomes[1] }).success, false)
})

test("历史 JSON 原文保留为 legacy_read_only，不填默认版本、不推测迁移", () => {
  const oldPayloads = [
    { goal: "旧需求", deliverables: [{ entity: "任意历史对象", fields: ["名称"] }] },
    { id: ids.plan, version: 33, proposal: { steps: [{ kind: "collect" }] } },
    { id: ids.chain, graph: { entry: "open", nodes: [{ kind: "navigate", url: "https://example.com" }] } },
    { id: ids.run, capture: { steps: [], coverage: "partial" }, legacyExtra: { keep: true } },
    { workflowId: ids.chain, workflowVersion: 1, inputs: [{ stableKey: "old", value: "old" }] },
  ]
  for (const raw of oldPayloads) {
    const json = ` \n${JSON.stringify(raw, null, 2)}\n`
    const result = readTaskContractJson(json)
    assert.equal(result.status, "legacy_read_only")
    assert.equal(result.originalJson, json)
    if (result.status === "legacy_read_only") assert.deepEqual(result.raw, raw)
    assert.throws(() => requireCurrentTaskContract(result), /legacy_read_only/)
  }
})

test("当前协议可往返；未知版本与损坏内容保留原文并拒绝新执行入口", () => {
  for (const raw of [extractionFixture.requirement, extractionFixture.plan, playbackFixture.chain, run]) {
    const result = readTaskContractJson(JSON.stringify(raw))
    assert.equal(result.status, "current")
    assert.deepEqual(requireCurrentTaskContract(result), raw)
  }
  for (const [raw, expected] of [
    [JSON.stringify({ ...extractionFixture.chain, contractVersion: "bat-task-chain/v999" }), "unsupported_version"],
    [JSON.stringify({ contractVersion: CONTRACT_VERSION, kind: "chain" }), "invalid"],
    ["{broken", "invalid"],
  ] as const) {
    const result = readTaskContractJson(raw)
    assert.equal(result.status, expected)
    assert.equal(result.originalJson, raw)
    assert.throws(() => requireCurrentTaskContract(result))
  }
})
