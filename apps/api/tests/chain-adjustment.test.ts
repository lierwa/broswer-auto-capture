import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { CONTRACT_VERSION, UNRECORDED_EXECUTION_CLEANUP, runnableTaskReleaseSchema,
  taskExecutionSchema, type TaskAuthoringJob, type TaskDraft } from "@browser-capture/contracts"
import { taskChainCommandSchema } from "@browser-capture/contracts/api"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { TaskAdjustmentService } from "../src/task-chain/adjustment.js"
import { adjustmentSuggestionJsonSchema, adjustmentSuggestionSchema, parseAdjustmentSuggestion } from "../src/task-chain/adjustment-prompt.js"
import { createTaskDraft, releaseReference } from "../src/task-chain/chain-revision.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { fixture as withFixture } from "./helpers.js"

function fixture() {
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.confirmation = { confirmedAt: new Date().toISOString(), requestId: randomUUID() }
  const plan = structuredClone(extractionFixture.plan)
  plan.requirement.digest = digestJson(requirement)
  const chain = structuredClone(extractionFixture.chain)
  chain.plan.digest = digestJson(plan)
  const dataNode = chain.nodes.find((node) => node.kind === "data")
  if (dataNode?.kind === "data") dataNode.arguments = { source: { source: "node", nodeId: "observe", path: [] } }
  const draftContent = createTaskDraft({ taskId: plan.taskId, requirement, baseRelease: null, plan, chains: [chain] }).content
  const now = new Date().toISOString()
  const release = runnableTaskReleaseSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "release",
    id: randomUUID(), taskId: plan.taskId, version: 1, requirement: draftContent.plan.requirement,
    content: draftContent, validation: [{ phase: "sample", executionId: randomUUID(),
      inputDigest: digestJson({ destination: "https://example.com" }),
      steps: [{ stepId: "perform", chain: { id: chain.id, version: chain.version,
        digest: executableChainDigest(chain) }, runIds: [], outputDigest: digestJson(null) }],
      modelCalls: 0, completedAt: now }], createdAt: now })
  const execution = taskExecutionSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "execution",
    id: randomUUID(), taskId: plan.taskId, authorizationId: randomUUID(),
    plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, requirement: draftContent.plan.requirement,
    release: releaseReference(release), input: { destination: "https://example.com" },
    inputDigest: digestJson({ destination: "https://example.com" }), status: "completed", sequence: 1,
    currentStepId: null, currentRunId: null, steps: [{ stepId: "perform", chain: { id: release.content.steps[0]!.chain.id,
      version: release.content.steps[0]!.chain.version,
      digest: executableChainDigest(release.content.steps[0]!.chain) }, invocationIds: [], runIds: [],
      status: "completed", output: null, reason: null }], output: null, reason: "本次运行完成。",
    cleanup: UNRECORDED_EXECUTION_CLEANUP, cleanupResume: null, reviews: [], createdAt: now, updatedAt: now })
  let currentExecution = execution, job: TaskAuthoringJob | null = null, draft: TaskDraft | null = null
  const jobs = new Map<string, TaskAuthoringJob>()
  const operations = new Map<string, string>()
  const store = { db: { transaction: (run: () => unknown) => run() },
    operation: (scope: string, id: string) => operations.get(`${scope}:${id}`),
    recordOperation: (scope: string, id: string, _command: unknown, result: string) => {
      operations.set(`${scope}:${id}`, result)
    } }
  const repository = {
    execution: (_taskId: string, id: string) => { assert.equal(id, execution.id); return currentExecution },
    saveExecution: (value: typeof execution) => { currentExecution = value; return value },
    draft: () => draft,
    saveDraft: (value: TaskDraft) => { draft = value; return value },
    saveJob: (value: TaskAuthoringJob) => { jobs.set(value.id, value); job = value; return value },
    job: (_taskId: string, id: string) => { const value = jobs.get(id); assert.ok(value); return value },
    latestAdjustmentJob: () => job,
    requirement: () => requirement,
    nextChainVersion: () => 2,
  }
  let currentRelease: typeof release | null = release
  const product = { currentRelease: () => currentRelease, assertCurrentDraftRequirement: () => undefined }
  let response: unknown = null, prompt = "", modelCalls = 0
  const ai = { selection: () => ({ modelId: "test-model", reasoningEffort: "none" }),
    prepare: async () => ({ generateObject: async (input: { prompt: string; parse(value: unknown): unknown }) => {
      modelCalls++
      prompt = input.prompt
      return input.parse(await response)
    } }) }
  const service = new TaskAdjustmentService(store as never, repository as never, product as never, ai as never, () => {})
  const request = { type: "request_chain_adjustment" as const, requestId: randomUUID(),
    executionId: execution.id, expectedSequence: execution.sequence, chain: execution.steps[0]!.chain,
    stepId: "perform", nodeId: "open", feedback: "导航等待不足，请适当延长。" }
  const original = chain.nodes.find((node) => node.id === "open")!
  assert.equal(original.kind, "browser")
  const changed = { ...original, timeoutMs: original.timeoutMs + 1000 }
  const suggest = () => { response = { decision: "suggestion", summary: "延长导航等待时间",
    rationale: "原执行证据显示导航需要更久。", question: null,
    operationsJson: JSON.stringify([{ chainId: chain.id, operations: [{ type: "replace_node" as const, node: changed }] }]) } }
  return { service, request, suggest, respond: (value: unknown) => { response = value },
    setCurrentRelease: (value: typeof release | null) => { currentRelease = value },
    get modelCalls() { return modelCalls }, get original() { return original },
    storedJob: (id: string) => jobs.get(id),
    get job(): TaskAuthoringJob { return job! }, get draft(): TaskDraft | null { return draft },
    get execution() { return currentExecution }, get prompt() { return prompt }, release, chain }
}

function failedCompletedSuggestion(state: ReturnType<typeof fixture>, operation: unknown) {
  state.service.request(state.release.taskId, state.request)
  const source = state.job, invocationId = randomUUID()
  const transport = { decision: "suggestion", summary: "调整结果动作",
    rationale: "使用原运行证据审阅本次修改。", question: null,
    operationsJson: JSON.stringify([{ chainId: state.chain.id, operations: [operation] }]) }
  const text = JSON.stringify(transport), midpoint = Math.ceil(text.length / 2)
  const model = { connectionId: randomUUID(), modelId: "test-model", reasoningEffort: "medium" as const }
  source.status = "failed"; source.sequence++; source.reason = "原建议节点操作未通过合同。"
  source.audit = { purpose: "chain_adjustment", model: model.modelId, effort: model.reasoningEffort,
    status: "failed", reportedInvocations: 1, escalations: [], events: [
      parseAIEvent({ type: "generation.started", invocationId, sequence: 0, createdAt: 1, output: "object", model }),
      parseAIEvent({ type: "text.delta", invocationId, sequence: 1, createdAt: 2, text: text.slice(0, midpoint) }),
      parseAIEvent({ type: "text.delta", invocationId, sequence: 2, createdAt: 2, text: text.slice(midpoint) }),
      parseAIEvent({ type: "generation.completed", invocationId, sequence: 3, createdAt: 3,
        providerId: "fixture", modelId: model.modelId, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }),
    ] }
  return source
}

test("模型建议在接受前不创建草稿，接受一次后生成待验证修订并保留旧运行", async () => {
  const state = fixture()
  state.service.request(state.release.taskId, state.request)
  assert.equal(state.draft, null)
  assert.equal(state.execution.reviews.at(-1)?.decision, "chain_revision")
  state.suggest()
  await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
  assert.equal(state.draft, null)
  assert.equal(state.job.adjustment?.candidate?.diff[0]?.changedActions, 1)
  assert.equal(state.job.audit?.purpose, "chain_adjustment")
  assert.match(state.prompt, /导航等待不足/)
  assert.match(state.prompt, new RegExp(state.execution.id))
  const accept = { type: "accept_chain_adjustment" as const, requestId: randomUUID(),
    jobId: state.job.id, expectedSequence: state.job.sequence }
  state.service.accept(state.release.taskId, accept)
  state.service.accept(state.release.taskId, accept)
  const applied = state.draft as TaskDraft | null
  assert.equal(applied?.revision, 1)
  assert.equal(applied?.validation.records.length, 0)
  assert.equal(state.job.adjustment?.decision, "accepted")
  assert.deepEqual(state.execution.release, releaseReference(state.release))
  assert.equal(state.execution.steps[0]?.chain.version, state.chain.version)
})

test("取消生成后即使模型迟到，也不产生候选或草稿", async () => {
  const state = fixture(), controller = new AbortController()
  let resolve!: (value: unknown) => void
  state.respond(new Promise((done) => { resolve = done }))
  state.service.request(state.release.taskId, state.request)
  const work = state.service.generate(state.release.taskId, state.job.id, controller.signal)
  state.service.decline(state.release.taskId, { type: "cancel_chain_adjustment", requestId: randomUUID(),
    jobId: state.job.id, expectedSequence: state.job.sequence })
  controller.abort()
  resolve({ decision: "clarification", summary: "迟到结果", rationale: "无", question: "请说明。", operationsJson: null })
  await work
  assert.equal(state.job.adjustment?.decision, "cancelled")
  assert.equal(state.job.adjustment?.candidate, null)
  assert.equal(state.draft, null)
})

test("越界链路操作不能形成可接受候选", async () => {
  const state = fixture()
  state.service.request(state.release.taskId, state.request)
  state.respond({ decision: "suggestion", summary: "越界", rationale: "无", question: null,
    operationsJson: JSON.stringify([{ chainId: randomUUID(), operations: [{ type: "remove_node", nodeId: "open" }] }]) })
  await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
  assert.equal(state.job.status, "failed")
  assert.equal(state.job.adjustment?.candidate, null)
  assert.equal(state.draft, null)
})

test("模型结构化输出外壳有界，完整节点操作仍由服务端校验", async () => {
  const schema = adjustmentSuggestionJsonSchema()
  assert.ok(JSON.stringify(schema).length < 5_000, "模型传输 schema 不应展开递归节点合同")
  const state = fixture()
  state.service.request(state.release.taskId, state.request)
  state.respond({ decision: "suggestion", summary: "错误操作", rationale: "无", question: null,
    operationsJson: JSON.stringify([{ chainId: state.chain.id,
      operations: [{ type: "replace_node", node: { id: "open" } }] }]) })
  await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
  assert.equal(state.job.status, "failed")
  assert.match(state.job.reason ?? "", /0\.operations\.0\.node/)
  assert.equal(state.job.adjustment?.candidate, null)
  assert.equal(state.draft, null)
  const malformed = fixture()
  malformed.service.request(malformed.release.taskId, malformed.request)
  malformed.respond({ decision: "suggestion", summary: "错误文本", rationale: "无", question: null,
    operationsJson: "[{" })
  await malformed.service.generate(malformed.release.taskId, malformed.job.id, new AbortController().signal)
  assert.match(malformed.job.reason ?? "", /不是完整 JSON/)
  assert.equal(malformed.draft, null)
})

test("replace_node 仅删除与 node.id 相同的冗余 nodeId，其他额外字段仍拒绝", () => {
  const state = fixture(), node = { ...state.original, label: "组装最终读取结果" }
  const transport = (operation: unknown) => adjustmentSuggestionSchema.parse({
    decision: "suggestion", summary: "修改动作标题", rationale: "原结果证据", question: null,
    operationsJson: JSON.stringify([{ chainId: state.chain.id, operations: [operation] }]),
  })
  const accepted = parseAdjustmentSuggestion(transport({ type: "replace_node", nodeId: node.id, node }))
  assert.deepEqual(accepted.operations?.[0]?.operations[0], { type: "replace_node", node })
  assert.throws(() => parseAdjustmentSuggestion(transport({ type: "replace_node", nodeId: "other", node })),
    /nodeId 与 node.id 不一致/)
  assert.throws(() => parseAdjustmentSuggestion(transport({ type: "replace_node", nodeId: node.id,
    node, unexpected: true })), /unrecognized_keys/)
})

test("已完成模型输出可离线派生审阅 job，原失败审计不变且恢复不调用模型", () => {
  const state = fixture(), node = { ...state.original, label: "组装最终读取结果" }
  const source = failedCompletedSuggestion(state, { type: "replace_node", nodeId: node.id, node })
  const oldJob = structuredClone(source), oldExecution = structuredClone(state.execution)
  assert.equal(state.service.recovery(state.release.taskId, source)?.available, true)
  assert.equal(taskChainCommandSchema.safeParse({ type: "recover_chain_adjustment", requestId: randomUUID(),
    jobId: source.id, expectedSequence: source.sequence, operations: [] }).success, false)
  const command = { type: "recover_chain_adjustment" as const, requestId: randomUUID(),
    jobId: source.id, expectedSequence: source.sequence }
  state.service.recover(state.release.taskId, command)
  state.service.recover(state.release.taskId, command)
  const derived = state.job
  assert.notEqual(derived.id, source.id)
  assert.equal(derived.adjustment?.recoveredFromJobId, source.id)
  assert.equal(derived.adjustment?.decision, "pending")
  assert.deepEqual(derived.adjustment?.candidate?.operations[0]?.operations[0], { type: "replace_node", node })
  assert.equal(derived.audit, null)
  assert.equal(state.modelCalls, 0)
  assert.equal(state.draft, null)
  assert.deepEqual(state.storedJob(source.id), oldJob)
  assert.deepEqual(state.execution, oldExecution)
  state.service.accept(state.release.taskId, { type: "accept_chain_adjustment", requestId: randomUUID(),
    jobId: derived.id, expectedSequence: derived.sequence })
  const applied = state.draft as TaskDraft | null
  assert.equal(applied?.revision, 1)
})

test("离线恢复拒绝过期证据及不完整模型事件，不产生派生 job", () => {
  const state = fixture(), node = { ...state.original, label: "组装最终读取结果" }
  const source = failedCompletedSuggestion(state, { type: "replace_node", nodeId: node.id, node })
  state.execution.reason = "原运行事实后来发生变化。"
  assert.equal(state.service.recovery(state.release.taskId, source)?.available, false)
  assert.throws(() => state.service.recover(state.release.taskId, { type: "recover_chain_adjustment",
    requestId: randomUUID(), jobId: source.id, expectedSequence: source.sequence }), /原运行证据已变化/)
  assert.equal(state.job.id, source.id)
  assert.equal(state.draft, null)
  const incomplete = fixture(), other = failedCompletedSuggestion(incomplete,
    { type: "replace_node", nodeId: incomplete.original.id, node: { ...incomplete.original, label: "新标题" } })
  other.audit!.events.push(parseAIEvent({ type: "generation.failed", invocationId: other.audit!.events[0]!.invocationId,
    sequence: 4, createdAt: 4, code: "ai_generation_failed" }))
  assert.equal(incomplete.service.recovery(incomplete.release.taskId, other)?.available, false)
  assert.throws(() => incomplete.service.recover(incomplete.release.taskId, { type: "recover_chain_adjustment",
    requestId: randomUUID(), jobId: other.id, expectedSequence: other.sequence }), /未完整成功结束/)
  assert.equal(incomplete.modelCalls, 0)
})

test("建议生成后发布基线变化时，接受保持草稿未写入", async () => {
  const state = fixture()
  state.service.request(state.release.taskId, state.request)
  state.suggest()
  await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
  state.setCurrentRelease(null)
  assert.throws(() => state.service.accept(state.release.taskId, { type: "accept_chain_adjustment",
    requestId: randomUUID(), jobId: state.job.id, expectedSequence: state.job.sequence }), /发布基线已变化/)
  assert.equal(state.draft, null)
})

test("原运行证据变化时，候选失效且不写草稿", async () => {
  const state = fixture()
  state.service.request(state.release.taskId, state.request)
  state.suggest()
  await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
  state.execution.reason = "运行结论后来发生变化。"
  assert.throws(() => state.service.accept(state.release.taskId, { type: "accept_chain_adjustment",
    requestId: randomUUID(), jobId: state.job.id, expectedSequence: state.job.sequence }), /原运行证据已变化/)
  assert.equal(state.draft, null)
})

test("旧内部候选可读但不能绕过模型建议审计门", async () => {
  const state = fixture()
  state.service.request(state.release.taskId, state.request)
  state.suggest()
  await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
  state.job.adjustment!.candidate!.provenance = "internal_manual_review"
  assert.throws(() => state.service.accept(state.release.taskId, { type: "accept_chain_adjustment",
    requestId: randomUUID(), jobId: state.job.id, expectedSequence: state.job.sequence }), /缺少可信生成审计/)
  assert.equal(state.draft, null)
})

test("拒绝建议和过期基线均不写入草稿", async () => {
  const state = fixture()
  state.service.request(state.release.taskId, state.request)
  state.suggest()
  await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
  state.service.decline(state.release.taskId, { type: "reject_chain_adjustment", requestId: randomUUID(),
    jobId: state.job.id, expectedSequence: state.job.sequence })
  assert.equal(state.draft, null)
  assert.equal(state.job.adjustment?.decision, "rejected")
  assert.throws(() => state.service.accept(state.release.taskId, { type: "accept_chain_adjustment",
    requestId: randomUUID(), jobId: state.job.id, expectedSequence: state.job.sequence }), /修改请求已变化/)
})

test("证据不足或需求偏离时保存人工决策边界，不生成节点候选", async () => {
  for (const decision of ["clarification", "requirement_revision"] as const) {
    const state = fixture()
    state.service.request(state.release.taskId, state.request)
    state.respond({ decision, summary: "需要确认预期", rationale: "运行无法证明新的目标",
      question: "请确认预期的来源与结果。", operationsJson: null })
    await state.service.generate(state.release.taskId, state.job.id, new AbortController().signal)
    assert.equal(state.job.adjustment?.decision, decision === "clarification" ? "needs_clarification" : decision)
    assert.equal(state.job.adjustment?.candidate, null)
    assert.equal(state.draft, null)
  }
})

test("服务重启把排队中的建议生成标为中断，保留反馈和证据引用", async () => withFixture(async ({ store, create }) => {
  const state = fixture(), taskId = create()
  state.service.request(state.release.taskId, state.request)
  const original = { ...state.job, taskId }
  new TaskContractRepository(store).saveJob(original)
  const recovered = new TaskContractRepository(store).job(taskId, original.id)
  assert.equal(recovered.status, "interrupted")
  assert.equal(recovered.adjustment?.decision, "generating")
  assert.equal(recovered.adjustment?.feedback, state.request.feedback)
  assert.equal(recovered.adjustment?.sourceEvidenceDigest, original.adjustment?.sourceEvidenceDigest)
  assert.equal(recovered.adjustment?.candidate, null)
}))
