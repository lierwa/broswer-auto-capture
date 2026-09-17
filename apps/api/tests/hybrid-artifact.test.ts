import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { digestJson, type ModelCallReport } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createHybridArtifact, createHybridSourceArtifact, readHybridArtifact } from "../src/upstream-browser/hybrid-artifact.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { hybridBranchChoices, hybridStepAuthority } from "../src/upstream-browser/hybrid-authority.js"

function input(kind = "navigation") {
  const raw = hybridFixture(kind), plan = hybridPlan(raw), requirement = structuredClone(extractionFixture.requirement)
  requirement.confirmation = { confirmedAt: "2026-09-16T00:00:00.000Z", requestId: randomUUID() }
  requirement.inputContract = plan.inputContract; requirement.outputContract = plan.outputContract
  requirement.definition.body += '\n```bat-compilation/v1\n' + JSON.stringify({ version: 1, steps: { perform: {
    clauses: raw.request.requirement.clauses, control: raw.request.control, acceptedAnnotations: raw.request.acceptedAnnotations,
  } } }) + '\n```\n'
  plan.requirement.digest = digestJson(requirement)
  // Synthetic audit rows only exercise the writer boundary; this test makes no real model calls.
  const modelCalls: ModelCallReport[] = ["agent", "judge"].map((purpose) => ({ callId: randomUUID(), purpose: purpose as "agent" | "judge",
    model: "fixture", intendedAt: "2026-09-16T00:00:00.000Z", status: "completed", reportedInvocations: 1 }))
  return { requirement, plan, step: plan.steps[0]!, stepInput: { url: "https://fixture.invalid/next" },
    request: raw.request, response: raw.response, forkSourceDigest: "a".repeat(64), modelCalls, version: 1, model: "fixture",
    source: { history: { localRef: raw.request.trace.source.historyRef, digest: raw.request.trace.digest }, sourceSuccess: true as const,
      sourceValidated: true as const, closed: true as const } }
}

test("v2 writer 只产生 candidate 并绑定完整确认版本、编译摘要和探索审计", () => {
  const request = input(), { artifact, chain } = createHybridArtifact(request)
  assert.equal(artifact.status, "candidate")
  assert.equal(chain.validation.status, "candidate")
  assert.equal(artifact.task.requirementDigest, digestJson(request.requirement))
  assert.equal(artifact.task.planDigest, digestJson(request.plan))
  assert.deepEqual(readHybridArtifact(artifact), artifact)
  const corrupted = structuredClone(artifact)
  ;(corrupted.compilationRequest as Record<string, unknown>).acceptedAnnotations = [{ kind: "injected" }]
  assert.throws(() => readHybridArtifact(corrupted), /hybrid_source_mismatch/)
})

test("未确认来源、不同样本输入和未结束审计不能写候选", () => {
  const request = input()
  assert.throws(() => createHybridArtifact({ ...request, stepInput: { url: "https://fixture.invalid/other" } }), /hybrid_sample_input_mismatch/)
  assert.throws(() => createHybridArtifact({ ...request, requirement: { ...request.requirement, confirmation: null } }), /hybrid_confirmed_source_required/)
  assert.throws(() => createHybridArtifact({ ...request, modelCalls: [] }), /hybrid_source_model_audit_missing/)
  assert.throws(() => createHybridArtifact({ ...request, modelCalls: [...request.modelCalls,
    { ...request.modelCalls[0]!, callId: randomUUID(), status: "intended", reportedInvocations: null }] }), /hybrid_source_model_audit_incomplete/)
})

test("编译 gap 保留独立来源产物，仍不能产生 candidate", () => {
  const request = input("missing-binding")
  const artifact = createHybridSourceArtifact(request.requirement, request.plan, request.step.id, request.stepInput, {
    output: null, request: request.request, response: request.response, history: request.source.history,
    modelCalls: request.modelCalls, sourceSuccess: true, sourceValidated: true, browserCommands: 1, forkSourceDigest: request.forkSourceDigest,
  })
  assert.equal(artifact.status, "explored")
  assert.equal(artifact.closed, true)
  assert.ok(artifact.result.response.compilation.gaps.length)
  assert.throws(() => createHybridArtifact(request), /hybrid_compilation_gaps/)
})

test("纯输入分支证据由现有谓词求值，候选必须与真实样本一致", () => {
  const request = input("branch"), authority = hybridStepAuthority(request.requirement, request.step.id)
  assert.equal(hybridBranchChoices(authority, { ...request.stepInput, enabled: false })[0]?.outcome, "false")
  assert.equal(createHybridArtifact({ ...request, stepInput: { ...request.stepInput, enabled: true } }).chain.entry, "branch-enabled")
  assert.throws(() => createHybridArtifact({ ...request, stepInput: { ...request.stepInput, enabled: false } }), /hybrid_source_branch_evidence_mismatch/)
  authority.control.branches[0]!.predicate = { operator: "exists", value: { source: "node", nodeId: "hidden", path: [] } }
  assert.throws(() => hybridBranchChoices(authority, { enabled: true }), /hybrid_source_branch_requires_pure_input/)
})
