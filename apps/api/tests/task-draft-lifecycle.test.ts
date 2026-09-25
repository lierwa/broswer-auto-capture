import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { taskExecutionSchema, type TaskExecution } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createTaskDraft, draftReference, recordDraftTrial, updateTaskDraft } from "../src/task-chain/chain-revision.js"
import { DomainError } from "../src/errors.js"
import { createChainPresentation } from "../src/task-chain/presentation.js"
import { TaskProductService } from "../src/task-chain/product.js"

test("仅在当前草稿完成样本试跑和不同输入的独立复验后发布 Release", () => {
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.confirmation = { confirmedAt: "2026-09-22T00:00:00.000Z", requestId: randomUUID() }
  const plan = structuredClone(extractionFixture.plan)
  plan.requirement.digest = digestJson(requirement)
  const chain = structuredClone(extractionFixture.chain)
  chain.plan.digest = digestJson(plan)
  let draft = createTaskDraft({ taskId: draftTaskId(plan.taskId), requirement, baseRelease: null,
    plan, chains: [chain], presentations: [createChainPresentation(chain)] })
  const executions = new Map<string, TaskExecution>()
  const releases: unknown[] = []
  let deleted = false
  const store = { snapshot: () => ({ active: false, revision: 1, confirmedVersion: 1,
    drafts: [{ version: 1, revision: 1 }],
    decisions: [{ kind: "draft_confirmation", draftVersion: 1, createdAt: "2026-09-22T00:00:00.000Z" }] }),
    db: { transaction: (run: () => unknown) => run() } }
  const repository = {
    draft: () => draft, findRequirement: () => requirement, nextReleaseVersion: () => 1,
    execution: (_taskId: string, id: string) => {
      const execution = executions.get(id)
      if (!execution) throw new DomainError("execution_not_found", "missing", 404)
      return execution
    },
    candidate: (_taskId: string, id: string) => {
      const execution = executions.get(id)
      return execution && { executionId: execution.id, taskId: draft.taskId,
        draft: draftReference(draft), content: structuredClone(draft.content), createdAt: execution.createdAt }
    },
    run: () => { throw new Error("unexpected_run") },
    saveRelease: (release: unknown) => { releases.push(release); return release },
    deleteDraft: () => { deleted = true },
  }
  const product = new TaskProductService(store as never, repository as never)
  const recordTrial = (mode: "sample" | "verification", destination: string) => {
    const execution = completedDraftExecution(draft, mode, destination)
    executions.set(execution.id, execution)
    draft = recordDraftTrial(draft, execution)
    return execution
  }
  assert.equal(releases.length, 0)
  draft.validation.records.push({ executionId: randomUUID(), revision: draft.revision, checksum: draft.checksum,
    inputDigest: "a".repeat(64), completedAt: "2026-09-22T00:00:00.000Z" })
  assert.deepEqual(product.draftReadiness(draft), { phase: "sample_needed", distinctInputRequired: false })
  draft.validation.records.pop()
  assert.deepEqual(product.draftReadiness(draft), { phase: "sample_needed", distinctInputRequired: false })
  assert.equal(product.nextTrialMode(draft, { destination: "https://example.com" }), "sample")
  const sample = recordTrial("sample", "https://example.com")
  assert.deepEqual(product.draftReadiness(draft), { phase: "verification_needed", distinctInputRequired: true })
  assert.throws(() => product.publishDraft(draft.taskId, draft), /代表试跑和独立复验/)
  assert.equal(releases.length, 0)
  assert.equal(deleted, false)
  assert.throws(() => product.nextTrialMode(draft, { destination: "https://example.com" }), /另一组不同的业务输入/)
  assert.equal(product.nextTrialMode(draft, { destination: "https://example.org" }), "verification")
  const verification = recordTrial("verification", "https://example.org")
  draft.validation.records.reverse()
  assert.deepEqual(product.draftReadiness(draft), { phase: "verification_needed", distinctInputRequired: true })
  assert.throws(() => product.publishDraft(draft.taskId, draft), /代表试跑和独立复验/)
  draft.validation.records.reverse()
  assert.deepEqual(product.draftReadiness(draft), { phase: "ready", distinctInputRequired: false })
  const release = product.publishDraft(draft.taskId, draft)
  assert.equal(release.version, 1)
  assert.deepEqual(release.content, draft.content)
  assert.deepEqual(release.validation.map((item) => [item.phase, item.executionId]),
    [["sample", sample.id], ["verification", verification.id]])
  assert.notEqual(release.validation[0]?.inputDigest, release.validation[1]?.inputDigest)
  assert.equal(releases.length, 1)
  assert.equal(deleted, true)
  assert.equal(product.nextTrialMode(draft, { destination: "https://example.com" }), "sample")
})

test("显式浏览器预算修订换新版本并失效旧验证，不能越过计划步骤授权", () => {
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.confirmation = { confirmedAt: "2026-09-24T00:00:00.000Z", requestId: randomUUID() }
  const plan = structuredClone(extractionFixture.plan)
  plan.requirement.digest = digestJson(requirement)
  const source = structuredClone(extractionFixture.chain)
  source.plan.digest = digestJson(plan)
  source.budget.maxBrowserCommands = 15
  const dataNode = source.nodes.find((node) => node.kind === "data")
  if (dataNode?.kind === "data") dataNode.arguments = { source: { source: "node", nodeId: "observe", path: [] } }
  source.validation.evidence.push({ phase: "sample", runId: randomUUID(),
    chainDigest: executableChainDigest(source), inputDigest: "a".repeat(64), outputDigest: "b".repeat(64),
    passed: false, modelCalls: 0, at: "2026-09-24T00:00:00.000Z" })
  const draft = createTaskDraft({ taskId: plan.taskId, requirement, baseRelease: null, plan, chains: [source] })
  draft.validation.records.push({ executionId: randomUUID(), revision: draft.revision, checksum: draft.checksum,
    inputDigest: "a".repeat(64), completedAt: "2026-09-24T00:00:00.000Z" })
  const updated = updateTaskDraft(draft, draft.revision, draft.checksum, source.id,
    [{ type: "set_browser_command_budget", maxBrowserCommands: 24 }], 2)
  const chain = updated.content.steps[0]!.chain
  assert.equal(updated.revision, draft.revision + 1)
  assert.notEqual(updated.checksum, draft.checksum)
  assert.equal(chain.version, 2)
  assert.equal(chain.budget.maxBrowserCommands, 24)
  assert.deepEqual(chain.validation, { status: "candidate", evidence: [] })
  assert.deepEqual(updated.validation.records, [])
  assert.throws(() => updateTaskDraft(updated, updated.revision, updated.checksum, chain.id,
    [{ type: "set_browser_command_budget", maxBrowserCommands: 41 }], 3),
  (error: unknown) => error instanceof DomainError && error.code === "chain_budget_exceeds_plan_step")
})

function completedDraftExecution(draft: ReturnType<typeof createTaskDraft>, mode: "sample" | "verification",
  destination: string): TaskExecution {
  const now = "2026-09-22T00:05:00.000Z", plan = draft.content.plan
  const input = { destination }
  return taskExecutionSchema.parse({ contractVersion: draft.contractVersion, kind: "execution", id: randomUUID(),
    taskId: draft.taskId, authorizationId: randomUUID(),
    plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, requirement: draft.requirement,
    draft: draftReference(draft), mode, input,
    inputDigest: digestJson(input), pacing: { nodeDelayMs: 0 },
    consumed: { transitions: 1, browserCommands: 1, activeMs: 1, llmCalls: 0, invocations: 1 },
    status: "completed", sequence: 1, currentStepId: null, currentRunId: null,
    steps: draft.content.steps.map((step) => ({ stepId: step.stepId,
      chain: { id: step.chain.id, version: step.chain.version, digest: executableChainDigest(step.chain) },
      invocationIds: [], runIds: [], consumed: { transitions: 1, browserCommands: 1, activeMs: 1,
        llmCalls: 0, invocations: 1 }, status: "completed", output: null, reason: null })),
    output: null, reason: "试跑完成。", cleanup: { status: "confirmed", attempt: 1, code: null,
      evidenceDigest: "a".repeat(64), updatedAt: now }, cleanupResume: null, reviews: [],
    createdAt: now, updatedAt: now })
}

function draftTaskId(taskId: string) { return taskId }
