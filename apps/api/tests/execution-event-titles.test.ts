import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, runnableTaskReleaseSchema, taskExecutionCandidateSchema,
  taskExecutionEventSchema } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createTaskDraft, draftReference } from "../src/task-chain/chain-revision.js"
import { queuedDraftExecution, queuedExecution } from "../src/task-chain/queued-runs.js"
import { TaskChainService } from "../src/task-chain/service.js"

const now = "2026-09-27T00:00:00.000Z"

test("历史事件从精确旧 Release 按步骤投影动作标题", () => {
  const { draft, requirement } = twoStepDraft()
  const release = runnableTaskReleaseSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "release",
    id: randomUUID(), taskId: draft.taskId, version: 1, requirement: draft.requirement, content: draft.content,
    validation: [{ phase: "sample", executionId: null, inputDigest: digestJson(null), modelCalls: null,
      completedAt: now, steps: draft.content.steps.map((step) => ({ stepId: step.stepId,
        chain: { id: step.chain.id, version: step.chain.version, digest: executableChainDigest(step.chain) },
        runIds: [], outputDigest: digestJson(null) })) }], createdAt: now })
  const latest = structuredClone(release)
  latest.version = 2
  latest.content.steps[0]!.chain.nodes.find((node) => node.id === "act")!.label = "新版第一动作"
  const execution = queuedExecution(draft.taskId, randomUUID(), draft.content.plan, requirement,
    release, { destination: "https://example.com" }, { nodeDelayMs: 0 }, { headless: false })
  const runs = attachRuns(execution)
  let requestedVersion = 0
  const service = eventService({ execution: () => execution, candidate: () => null,
    release: (_taskId: string, id: string, version: number, digest: string) => {
      assert.equal(id, release.id); assert.equal(digest, execution.release!.digest)
      requestedVersion = version
      return version === 1 ? release : latest
    }, run: (_taskId: string, id: string) => runs.get(id)! })
  const batch = service.executionEvents(draft.taskId, execution.id, 0)
  assert.equal(requestedVersion, 1)
  assert.deepEqual(batch.events.map((item) => [item.stepTitle, item.nodeTitle]),
    [["旧第一阶段", "旧第一动作"], ["旧第二阶段", "旧第二动作"]])
  assert.equal(service.executionEvents(draft.taskId, execution.id, 1).events[0]?.nodeTitle, "旧第二动作")
  const oldWireEvent = taskExecutionEventSchema.parse({ ...batch.events[0], stepTitle: undefined, nodeTitle: undefined })
  assert.equal(oldWireEvent.stepTitle, null)
  assert.equal(oldWireEvent.nodeTitle, null)
  runs.get(execution.steps[0]!.runIds[0]!)!.events[0]!.nodeId = "open"
  assert.equal(service.executionEvents(draft.taskId, execution.id, 0).events[0]?.nodeTitle, "打开页面")
})

test("草稿试跑只使用该 execution 冻结候选，候选身份不符时不投影标题", () => {
  const { draft } = twoStepDraft()
  const execution = queuedDraftExecution(draft.taskId, randomUUID(), draft,
    { destination: "https://example.com" }, { nodeDelayMs: 0 })
  const runs = attachRuns(execution)
  const candidate = taskExecutionCandidateSchema.parse({ executionId: execution.id, taskId: draft.taskId,
    draft: draftReference(draft), content: structuredClone(draft.content), createdAt: now })
  let frozen = candidate
  const service = eventService({ execution: () => execution, release: () => { throw new Error("wrong_release_path") },
    candidate: () => frozen, run: (_taskId: string, id: string) => runs.get(id)! })
  assert.deepEqual(service.executionEvents(draft.taskId, execution.id, 0).events.map((item) => item.nodeTitle),
    ["旧第一动作", "旧第二动作"])
  frozen = { ...candidate, draft: { ...candidate.draft, checksum: "b".repeat(64) } }
  assert.deepEqual(service.executionEvents(draft.taskId, execution.id, 0).events.map((item) => item.nodeTitle),
    [null, null])
})

function twoStepDraft() {
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.confirmation = { confirmedAt: now, requestId: randomUUID() }
  const plan = structuredClone(extractionFixture.plan)
  plan.requirement.digest = digestJson(requirement)
  plan.steps[0]!.title = "旧第一阶段"
  const first = structuredClone(extractionFixture.chain)
  first.nodes.find((node) => node.id === "act")!.label = "旧第一动作"
  const second = structuredClone(first)
  second.id = randomUUID(); second.stepId = "second"
  second.nodes.find((node) => node.id === "act")!.label = "旧第二动作"
  plan.steps.push({ ...structuredClone(plan.steps[0]!), id: "second", title: "旧第二阶段",
    dependsOn: ["perform"], chain: { id: second.id, version: second.version } })
  plan.budget = { ...plan.budget, maxTransitions: plan.budget.maxTransitions * 2,
    maxBrowserCommands: plan.budget.maxBrowserCommands * 2, maxActiveMs: plan.budget.maxActiveMs * 2,
    maxLlmCalls: plan.budget.maxLlmCalls * 2, maxInvocations: plan.budget.maxInvocations * 2 }
  first.plan.digest = digestJson(plan); second.plan.digest = digestJson(plan)
  return { draft: createTaskDraft({ taskId: plan.taskId, requirement, baseRelease: null,
    plan, chains: [first, second] }), requirement }
}

function attachRuns(execution: ReturnType<typeof queuedExecution> | ReturnType<typeof queuedDraftExecution>) {
  const runs = new Map<string, { binding: { taskId: string; authorizationId: string;
    plan: typeof execution.plan; chain: typeof execution.steps[number]["chain"] }; sequence: number;
    events: Array<{ sequence: number; at: string; invocationId: string; nodeId: string; status: "finished";
      outcome: string; idempotencyKey: string; stableKey: null }> }>()
  for (const step of execution.steps) {
    const runId = randomUUID()
    step.runIds.push(runId)
    runs.set(runId, { binding: { taskId: execution.taskId, authorizationId: execution.authorizationId,
      plan: execution.plan, chain: step.chain }, sequence: 1,
    events: [{ sequence: 1, at: now, invocationId: randomUUID(), nodeId: "act", status: "finished",
      outcome: "success", idempotencyKey: `event:${step.stepId}`, stableKey: null }] })
  }
  return runs
}

function eventService(repository: object) {
  return Object.assign(Object.create(TaskChainService.prototype) as TaskChainService, { repository })
}
