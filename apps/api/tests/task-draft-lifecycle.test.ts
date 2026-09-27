import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import Database from "better-sqlite3"
import { taskExecutionSchema, type TaskExecution } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { ProductStore } from "../src/database/store.js"
import { createTaskDraft, draftReference, recordDraftTrial } from "../src/task-chain/chain-revision.js"
import { DomainError } from "../src/errors.js"
import { createChainPresentation } from "../src/task-chain/presentation.js"
import { TaskProductService } from "../src/task-chain/product.js"
import { TaskChainService } from "../src/task-chain/service.js"

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
  assert.throws(() => product.publishDraft(draft.taskId, draft, () => {}), /代表试跑和独立复验/)
  assert.equal(releases.length, 0)
  assert.equal(deleted, false)
  assert.throws(() => product.nextTrialMode(draft, { destination: "https://example.com" }), /另一组不同的业务输入/)
  assert.equal(product.nextTrialMode(draft, { destination: "https://example.org" }), "verification")
  const verification = recordTrial("verification", "https://example.org")
  draft.validation.records.reverse()
  assert.deepEqual(product.draftReadiness(draft), { phase: "verification_needed", distinctInputRequired: true })
  assert.throws(() => product.publishDraft(draft.taskId, draft, () => {}), /代表试跑和独立复验/)
  draft.validation.records.reverse()
  assert.deepEqual(product.draftReadiness(draft), { phase: "ready", distinctInputRequired: false })
  const release = product.publishDraft(draft.taskId, draft, () => {})
  assert.equal(release.version, 1)
  assert.deepEqual(release.content, draft.content)
  assert.deepEqual(release.validation.map((item) => [item.phase, item.executionId]),
    [["sample", sample.id], ["verification", verification.id]])
  assert.notEqual(release.validation[0]?.inputDigest, release.validation[1]?.inputDigest)
  assert.equal(releases.length, 1)
  assert.equal(deleted, true)
  assert.equal(product.nextTrialMode(draft, { destination: "https://example.com" }), "sample")
})

test("正式发布入口在回执写入失败时回滚 Release 和草稿删除，重试保持幂等", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-publish-atomic-"))
  const store = await ProductStore.open(directory)
  const connection = new Database(path.join(directory, "workbench.sqlite"))
  try {
    const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
    store.mutate(taskId, (state) => {
      state.revision = 1
      state.drafts.push({ version: 1, revision: 1, title: "发布事务", markdown: "# 发布事务", brief: null })
      state.confirmedVersion = 1
      state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
        messageId: null, questionId: null, draftVersion: 1, createdAt: "2026-09-22T00:00:00.000Z" })
    })
    const browser = { setAuthorizationValidator: () => {}, owner: () => null }
    const service = new TaskChainService(store, browser as never, {} as never, {} as never)
    const requirementInput = structuredClone(extractionFixture.requirement)
    requirementInput.taskId = taskId
    requirementInput.confirmation = { confirmedAt: "2026-09-22T00:00:00.000Z", requestId: randomUUID() }
    const requirement = service.repository.saveRequirement(requirementInput)
    const plan = structuredClone(extractionFixture.plan)
    plan.taskId = taskId
    plan.requirement.digest = digestJson(requirement)
    const chain = structuredClone(extractionFixture.chain)
    chain.taskId = taskId
    chain.plan.digest = digestJson(plan)
    const draft = createTaskDraft({ taskId, requirement, baseRelease: null, plan, chains: [chain],
      presentations: [createChainPresentation(chain)] })
    for (const [mode, destination] of [["sample", "https://example.com"],
      ["verification", "https://example.org"]] as const) {
      const execution = completedDraftExecution(draft, mode, destination)
      service.repository.saveExecution(execution)
      service.repository.saveCandidate({ executionId: execution.id, taskId,
        draft: draftReference(draft), content: structuredClone(draft.content), createdAt: execution.createdAt })
      draft.validation.records.push({ executionId: execution.id, revision: draft.revision,
        checksum: draft.checksum, inputDigest: execution.inputDigest, completedAt: execution.updatedAt })
    }
    service.repository.saveDraft(draft)
    const command = { type: "publish_task_draft" as const, requestId: randomUUID(), draftId: draft.id,
      expectedRevision: draft.revision, expectedChecksum: draft.checksum }
    connection.exec("CREATE TRIGGER fail_publish_receipt BEFORE INSERT ON operations "
      + "WHEN NEW.scope = 'task-draft:publish' BEGIN SELECT RAISE(ABORT, 'receipt_write_failed'); END")
    assert.throws(() => service.dispatch(taskId, command), /receipt_write_failed/)
    assert.equal(service.repository.draft(taskId)?.id, draft.id)
    assert.deepEqual(service.repository.releases(taskId), [])
    assert.equal(store.operation("task-draft:publish", command.requestId, command), undefined)
    connection.exec("DROP TRIGGER fail_publish_receipt")
    const first = service.dispatch(taskId, command)
    assert.equal(first.release?.value.version, 1)
    assert.equal(service.repository.draft(taskId), null)
    assert.equal(service.repository.releases(taskId).length, 1)
    const releaseId = first.release!.value.id
    assert.equal(store.operation("task-draft:publish", command.requestId, command), releaseId)
    assert.equal(service.dispatch(taskId, command).release?.value.id, releaseId)
    assert.equal(service.repository.releases(taskId).length, 1)
    assert.throws(() => service.dispatch(taskId, { ...command, expectedRevision: command.expectedRevision + 1 }),
      /同一请求标识不能用于不同内容/)
    assert.equal(service.repository.releases(taskId).length, 1)
  } finally {
    connection.close()
    await store.close()
    await rm(directory, { recursive: true, force: true })
  }
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
