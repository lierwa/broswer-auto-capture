import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, taskRunSchema, taskExecutionCandidateSchema } from "@browser-capture/contracts"
import { digestJson, stableUuid } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createTaskDraft, draftReference } from "../src/task-chain/chain-revision.js"
import { queuedDraftExecution } from "../src/task-chain/queued-runs.js"
import { TaskChainService } from "../src/task-chain/service.js"
import { DomainError } from "../src/errors.js"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { SourceLifecycleDiagnostics } from "../src/upstream-browser/source-lifecycle-diagnostics.js"

test("released startup failure remains readable after its browser handoff owner has been cleared", () => {
  const f = fixture(), directory = mkdtempSync(path.join(tmpdir(), "bat-failure-detail-"))
  f.execution.release = f.execution.plan; delete f.execution.draft
  const diagnostic = new SourceLifecycleDiagnostics(directory, stableUuid(f.execution.id, "managed-window"))
  try {
    diagnostic.acceptPythonLine(JSON.stringify({ phase: "attached_startup", stage: "task_target_prepare", status: "failed",
      causes: [{ errorKind: "connection_error", code: "external_error", locations: [] }] }))
    const service = Object.assign(Object.create(TaskChainService.prototype),
      { repository: f.repository, diagnosticsDirectory: directory }) as TaskChainService
    assert.equal(f.execution.browserHandoff.ownerId, null)
    const detail = service.executionDetail(f.execution.taskId, f.execution.id, false)
    assert.equal(detail.startupFailure?.stage, "task_target_prepare")
    assert.equal(detail.startupFailure?.errorKind, "connection_error")
    assert.equal(detail.execution.id, f.execution.id)
  } finally { diagnostic.close(); rmSync(directory, { recursive: true, force: true }) }
})

function fixture() {
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.confirmation = { confirmedAt: new Date().toISOString(), requestId: randomUUID() }
  const plan = structuredClone(extractionFixture.plan)
  plan.requirement.digest = digestJson(requirement)
  const chain = structuredClone(extractionFixture.chain); chain.plan.digest = digestJson(plan)
  const draft = createTaskDraft({ taskId: plan.taskId, requirement, plan, chains: [chain], baseRelease: null })
  const execution = queuedDraftExecution(plan.taskId, randomUUID(), draft, null, { nodeDelayMs: 0 })
  const step = execution.steps[0]!, runId = randomUUID(), invocationId = randomUUID()
  step.runIds = [runId]; step.invocationIds = [invocationId]
  const run = taskRunSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "run", mode: "sample",
    binding: { taskId: execution.taskId, authorizationId: execution.authorizationId, runId, invocationId,
      plan: execution.plan, chain: step.chain, inputDigest: digestJson(false) }, input: false, budget: chain.budget, sequence: 0, status: "completed",
    outputs: {}, checkpoint: null, consumed: execution.consumed, events: [], modelCalls: [], auditComplete: true,
    outcome: { status: "completed", reason: "完成", evidence: [], completionEvidence: ["completed"] } })
  const candidate = taskExecutionCandidateSchema.parse({ executionId: execution.id, taskId: execution.taskId,
    draft: draftReference(draft), content: draft.content, createdAt: new Date().toISOString() })
  const repository = { execution: () => execution, candidate: () => candidate, findRequirement: () => requirement, run: () => run }
  const service = Object.assign(Object.create(TaskChainService.prototype) as TaskChainService, { repository })
  return { execution, run, candidate, repository, service }
}

test("详情从冻结候选和精确需求绑定同call实参，布尔false不丢失", () => {
  const f = fixture(), detail = f.service.executionDetail(f.execution.taskId, f.execution.id)
  assert.equal(detail.requirement?.version, f.execution.requirement.version)
  assert.equal(detail.content?.plan.id, f.execution.plan.id)
  assert.equal(detail.calls[0]?.run.input, false)
  assert.equal(detail.calls[0]?.run.binding.runId, f.run.binding.runId)
})

test("实际调用归属不符拒绝；尚未persist只显示待绑定不伪造数据", () => {
  const f = fixture()
  f.run.binding.authorizationId = randomUUID()
  assert.throws(() => f.service.executionDetail(f.execution.taskId, f.execution.id), /授权或版本不一致/)
  f.repository.run = () => { throw new DomainError("run_not_found", "尚未保存", 404) }
  assert.deepEqual(f.service.executionDetail(f.execution.taskId, f.execution.id).calls, [])
})

test("旧需求或冻结候选不匹配时不套用最新版正文与合同", () => {
  const f = fixture(), requirement = f.repository.findRequirement()
  f.repository.findRequirement = () => ({ ...requirement, version: requirement.version + 1 })
  assert.equal(f.service.executionDetail(f.execution.taskId, f.execution.id).requirement, null)
  f.candidate.draft.checksum = "b".repeat(64)
  assert.equal(f.service.executionDetail(f.execution.taskId, f.execution.id).content, null)
})
