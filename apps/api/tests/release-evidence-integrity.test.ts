import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { digestJson } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createTaskDraft, draftReference, recordDraftTrial } from "../src/task-chain/chain-revision.js"
import { assertMethodRevisionSourceCompatible, mergeMethodRevision, resolveMethodRevisionBase } from "../src/task-chain/method-revision.js"
import { TaskPreparationCoordinator } from "../src/task-chain/preparation.js"
import { TaskProductService } from "../src/task-chain/product.js"
import { createChainPresentation } from "../src/task-chain/presentation.js"
import { completedDraftExecution, completedDraftRuns } from "./fixtures/completed-draft-trial.js"

function fixture(emptyEach = false) {
  const { requirement, plan, chain } = structuredClone(extractionFixture)
  requirement.confirmation = { confirmedAt: "2026-09-22T00:00:00.000Z", requestId: randomUUID() }
  if (emptyEach) {
    plan.inputContract = { ...plan.inputContract, schema: { type: "array", items: plan.inputContract.schema } }
    plan.outputContract = { ...plan.outputContract, schema: { type: "array", items: plan.outputContract.schema } }
    requirement.inputContract = plan.inputContract; requirement.outputContract = plan.outputContract
    plan.steps[0]!.input = { source: "variable", name: "item", path: [] }
    plan.steps[0]!.invocation = { mode: "each", collection: { source: "input", path: [] }, itemVariable: "item",
      stableKeyPath: ["destination"], maxItems: 10, onItemFailure: "stop" }
  }
  plan.requirement.digest = digestJson(requirement); chain.plan.digest = digestJson(plan)
  let draft = createTaskDraft({ taskId: plan.taskId, requirement, baseRelease: null, plan, chains: [chain] })
  const executions = [completedDraftExecution(draft, "sample", "https://example.com"),
    completedDraftExecution(draft, "verification", "https://example.org")]
  if (emptyEach) for (const execution of executions) {
    execution.input = []; execution.inputDigest = digestJson([])
    execution.steps[0]!.runIds = []; execution.steps[0]!.invocationIds = []; execution.steps[0]!.output = []
    if (execution.output?.kind === "value") execution.output.value = []
  }
  const runs = emptyEach ? [] : executions.flatMap(execution => completedDraftRuns(draft, execution))
  for (const execution of executions) draft = recordDraftTrial(draft, execution)
  const candidates = executions.map(execution => ({ executionId: execution.id, taskId: draft.taskId,
    draft: draftReference(draft), content: structuredClone(draft.content), createdAt: execution.createdAt }))
  const releases: unknown[] = []
  const store = { snapshot: () => ({ active: false, revision: 1, confirmedVersion: 1,
    drafts: [{ version: 1, revision: 1 }], decisions: [{ kind: "draft_confirmation", draftVersion: 1,
      createdAt: "2026-09-22T00:00:00.000Z" }] }),
    db: { transaction: (run: () => unknown) => run() }, readRevision: () => null }
  const repository = { draft: () => draft, findRequirement: () => requirement, nextReleaseVersion: () => 1,
    execution: (_: string, id: string) => executions.find(item => item.id === id),
    candidate: (_: string, id: string) => candidates.find(item => item.executionId === id),
    run: (_: string, id: string) => runs.find(item => item.binding.runId === id),
    saveRelease: (release: unknown) => releases.push(release), deleteDraft: () => {} }
  return { draft, executions, runs, candidates, releases, store, repository,
    product: new TaskProductService(store as never, repository as never) }
}

test("方法修订用当前工具来源且要求新历史，不要求旧 registry 继续存在", () => {
  const checksum = "a".repeat(64)
  const request = (historyRef: string, actionRegistryVersion: string) => {
    const requirement = { id: "requirement", version: 1, text: "执行任务", taskText: "执行任务", sourceDigest: checksum }
    const plan = { id: "plan", version: 1, sourceDigest: checksum, stepId: "perform",
      inputSchemaDigest: checksum, outputSchemaDigest: checksum, callMode: "once", entryUrls: [],
      resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" }, semanticOperations: [] }
    const trace = { completed: true, source: { provider: "browser-use", version: "0.13.8", historyRef },
      actions: [], observations: [] }
    return { compilerVersion: "bat-hybrid/3", actionRegistryVersion,
      requirement: { ...requirement, digest: digestJson(requirement) }, plan: { ...plan, digest: digestJson(plan) },
      runtimeInputSchema: { type: "null" }, trace: { ...trace, digest: digestJson(trace) } }
  }
  const previous = request("history:previous", checksum), current = request("history:current", "b".repeat(64))
  const oldSource = { artifact: { result: { request: previous } } } as never
  const source = { request: current, history: { localRef: "history:current", digest: "c".repeat(64) } }
  assert.doesNotThrow(() => assertMethodRevisionSourceCompatible(oldSource, source))
  assert.throws(() => assertMethodRevisionSourceCompatible(oldSource, { ...source,
    request: { ...current, trace: { ...current.trace, source: previous.trace.source } } }), /fresh_source_required/)
  assert.throws(() => assertMethodRevisionSourceCompatible(oldSource, { ...source,
    request: { ...current, actionRegistryVersion: "invalid" } }))
})

test("方法修订推进草稿 revision 并使两次旧验证失效，未选步骤和旧草稿保持原值", () => {
  const f = fixture(), plan = structuredClone(f.draft.content.plan)
  const first = structuredClone(f.draft.content.steps[0]!.chain)
  const following = { ...structuredClone(first), id: randomUUID(), stepId: "following" }
  plan.steps.push({ ...structuredClone(plan.steps[0]!), id: following.stepId, dependsOn: [first.stepId],
    chain: { id: following.id, version: following.version } })
  plan.budget = Object.fromEntries(Object.entries(plan.budget).map(([name, value]) => [name, value * 2])) as typeof plan.budget
  first.plan.digest = digestJson(plan); following.plan.digest = digestJson(plan)
  let current = createTaskDraft({ taskId: f.draft.taskId, requirement: f.repository.findRequirement(),
    baseRelease: null, plan, chains: [first, following] })
  for (const mode of ["sample", "verification"] as const)
    current = recordDraftTrial(current, completedDraftExecution(current, mode, `https://example.test/${mode}`))
  const before = structuredClone(current), repository = { draft: () => current }
  assert.equal(current.validation.records.length, 2)
  const requirement = f.repository.findRequirement()
  const base = resolveMethodRevisionBase(repository as never, current.taskId, requirement,
    { kind: "draft", reference: draftReference(current) })
  const replacement = { ...structuredClone(first), version: first.version + 1, implementationSummary: "修订后的通用方法" }
  const next = mergeMethodRevision(repository as never, current.taskId, requirement, base, first.stepId,
    { chains: [replacement], presentations: [createChainPresentation(replacement)] })
  assert.equal(next.revision, current.revision + 1)
  assert.notEqual(next.checksum, current.checksum)
  assert.deepEqual(next.validation.records, [])
  assert.deepEqual(next.content.steps[1], current.content.steps[1])
  assert.deepEqual(current, before)
  assert.equal(recordDraftTrial(next, f.executions[0]!).validation.records.length, 0)
})

test("完整且属于当前 execution 的运行证据可发布", () => {
  const f = fixture()
  assert.equal(f.product.draftReadiness(f.draft).phase, "ready")
  f.product.publishDraft(f.draft.taskId, f.draft, () => {})
  assert.equal(f.releases.length, 1)
})

test("真实空集合的逐项步骤接受零调用，但不把同值复跑当不同输入复验", () => {
  const f = fixture(true)
  assert.deepEqual(f.product.draftReadiness(f.draft), { phase: "verification_needed", distinctInputRequired: true })
})

// 保护真实发布入口：摘要 completed 不能代替缺失、串用或不一致的底层运行证据。
const mutations: Record<string, (f: ReturnType<typeof fixture>) => void> = {
  "空调用": f => { f.executions[1]!.steps[0]!.runIds = []; f.executions[1]!.steps[0]!.invocationIds = [] },
  "缺少步骤": f => { f.executions[1]!.steps = [] },
  "步骤仍在运行": f => { f.executions[1]!.steps[0]!.status = "running" },
  "计划摘要失配": f => { f.executions[1]!.plan.digest = "b".repeat(64); f.runs[1]!.binding.plan.digest = "b".repeat(64) },
  "链路摘要失配": f => { f.executions[1]!.steps[0]!.chain.digest = "b".repeat(64); f.runs[1]!.binding.chain.digest = "b".repeat(64) },
  "需求版本失配": f => { f.executions[1]!.requirement = { ...f.executions[1]!.requirement, revision: 100 } },
  "候选属于其它执行": f => { f.candidates[1]!.executionId = randomUUID() },
  "调用授权串用": f => { f.runs[1]!.binding.authorizationId = randomUUID() },
  "调用身份串用": f => { f.runs[1]!.binding.invocationId = randomUUID() },
  "调用模式串用": f => { f.runs[1]!.mode = "sample" },
  "重复运行引用": f => { f.executions[1]!.steps[0]!.runIds.push(f.executions[1]!.steps[0]!.runIds[0]!) },
  "调用输入与摘要失配": f => { f.runs[1]!.input = { destination: "https://example.net" } },
  "执行输入与摘要失配": f => { f.executions[1]!.input = { destination: "https://example.net" } },
  "执行输出与运行不一致": f => { f.executions[1]!.steps[0]!.output = { title: "伪结果", link: "https://example.org" } },
  "最终输出与步骤不一致": f => { f.executions[1]!.output = { kind: "value", value: null, contract: { id: "wrong", version: 1 } } },
  "审计不完整": f => { f.runs[1]!.auditComplete = false },
}
for (const [name, mutate] of Object.entries(mutations)) test(`拒绝发布证据：${name}`, () => {
  const f = fixture(); mutate(f)
  assert.notEqual(f.product.draftReadiness(f.draft).phase, "ready")
  assert.throws(() => f.product.publishDraft(f.draft.taskId, f.draft, () => {}))
  assert.equal(f.releases.length, 0)
})

for (const invalid of [false, true]) test(`准备阶段与发布采用相同运行证据：${invalid ? "拒绝空调用" : "完整复验可完成"}`, () => {
  const f = fixture(), record = f.executions[1]!
  if (invalid) { record.steps[0]!.runIds = []; record.steps[0]!.invocationIds = [] }
  const job = { id: randomUUID(), taskId: f.draft.taskId, type: "prepare", status: "running", sequence: 1,
    resultId: null, reason: "正在验证", preparation: { phase: "validating_verification", candidatePlan: f.draft.content.plan,
      draft: draftReference(f.draft), validationExecutionIds: [record.id], inputRequest: null } }
  const repository = { ...f.repository, jobs: () => [job], saveDraft: () => {}, saveJob: () => {} }
  const preparation = new TaskPreparationCoordinator(f.store as never, repository as never, {} as never,
    () => { throw Error("unexpected_trial") }, () => {})
  preparation.onExecutionSettled(record)
  assert.equal(job.status, invalid ? "failed" : "completed")
  assert.equal(job.preparation.phase === "ready", !invalid)
  assert.equal(job.resultId, invalid ? null : f.draft.id)
})
