import { queuedPlanValidation } from "../src/task-chain/plan-validation.js"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import childProcess from "node:child_process"
import { syncBuiltinESMExports } from "node:module"
import { executableChainDigest, digestJson } from "@browser-capture/runtime"
import { taskPlanSchema, type TaskChain, type TaskChainCommand } from "@browser-capture/contracts"
import { createApplication } from "../src/app.js"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { createWorkflowArtifact, compileWorkflowChain, workflowArtifactSchema } from "../src/upstream-browser/workflow-artifact.js"
import { LegacyWorkflowRetiredError, legacyWorkflowMediaType } from "../src/upstream-browser/retirement.js"
import { queuedValidationRun } from "../src/task-chain/queued-runs.js"
import { retiredFixture } from "./fixtures/retired-workflow.js"
import { projectRoot } from "./helpers.js"
import { preexecutionModel, confirmedDraft } from "./task-chain-test-support.js"

const signal = () => new AbortController().signal
const zero = () => ({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 })
const retired = (error: unknown) => error instanceof LegacyWorkflowRetiredError && error.code === "legacy_workflow_use_v1_retired"

// 不变量：显式 v1 provider/artifact 仍在副作用前退休。
test("v1 writer / compiler / Python provider 仍退休", async (t) => {
  const spawn = t.mock.method(childProcess, "spawn", () => { throw new Error("unexpected_spawn") })
  syncBuiltinESMExports()
  try {
    const calls: string[] = [], fail = () => { calls.push("external"); throw new Error("unexpected_external") }
    const runtime = new PythonUpstreamBrowserRuntime({ root: projectRoot, directory: "/unused", subject: { models: fail } as never })
    await assert.rejects(runtime.withSession({ selection: {} as never, signal: signal(), ownerId: "unused" }, fail), retired)
    assert.throws(() => createWorkflowArtifact({} as never), retired)
    assert.throws(() => compileWorkflowChain({} as never, {} as never, 1, "fixture", {} as never, { artifactId: randomUUID() } as never), retired)
    assert.deepEqual(calls, [])
    assert.equal(spawn.mock.callCount(), 0)
  } finally { spawn.mock.restore(); syncBuiltinESMExports() }
})

// 不变量：检查包含所有 invoke 子链；注入 capability factory 也不能绕过退休门。
test("replay / resume / invoke 与 mixed 在 factory、Browser 和模型前拒绝", async () => {
  const { chain } = retiredFixture(), calls: string[] = []
  const fail = () => { calls.push("external"); throw new Error("unexpected_external") }
  const host = new TaskRuntimeHost({ chain: () => chain } as never, { setAuthorizationValidator() {}, run: fail } as never,
    { selection: fail, prepare: fail } as never, fail, { withSession: fail })
  const group = (chains: TaskChain[]) => host.group({ taskId: chain.taskId, authorizationId: randomUUID(), browserRunId: randomUUID(),
    requirementVersion: 1, purpose: "replay", chains, input: null, signal: signal(), budget: chain.budget,
    consumed: zero(), scopeConsumption: {} }, fail)
  await assert.rejects(group([chain]), retired)
  // 恢复沿用 group，非零消费不能影响版本门。
  await assert.rejects(host.group({ taskId: chain.taskId, authorizationId: randomUUID(), browserRunId: randomUUID(),
    requirementVersion: 1, purpose: "sample", chains: [chain], input: null, signal: signal(), budget: chain.budget,
    consumed: { ...zero(), transitions: 1 }, scopeConsumption: {} }, fail), retired)
  const parent = { ...chain, id: randomUUID(), nodes: [{ kind: "invoke", chain: { id: chain.id, version: 1, digest: executableChainDigest(chain) } }] } as TaskChain
  await assert.rejects(group([parent]), retired)
  const mixed = { ...parent, nodes: [...parent.nodes, { kind: "capability", capability: { name: "browser.perform", version: 1 } }] } as TaskChain
  await assert.rejects(group([mixed]), /mixed_browser_runtime_unsupported/)
  const candidate = { ...parent, validation: { status: "candidate" as const, evidence: [] } }
  candidate.nodes = [{ kind: "invoke", chain: { id: candidate.id, version: 1, digest: "a".repeat(64) } }] as TaskChain["nodes"]
  const recursive = new TaskRuntimeHost({ chain: () => candidate } as never,
    { setAuthorizationValidator() {}, run: fail } as never, {} as never, fail)
  assert.throws(() => recursive.assertExecutable(candidate.taskId, [candidate]), /invoked_chain_not_verified/)
  assert.deepEqual(calls, [])
})

// 不变量：既有 v1 执行退休，排队恢复和只读导出不变。
test("既有 v1 queue、执行入口与只读导出保持退休", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-retirement-")), calls: string[] = []
  const fail = () => { calls.push("external"); throw new Error("unexpected_external") }
  const base = preexecutionModel([])
  const application = await createApplication({ root: projectRoot, directory, aiModel: { ...base, prepare: fail, prepareMain: fail },
    upstreamBrowserRuntime: { withSession: fail }, browserExecutor: fail, taskChainCapabilities: fail } as Parameters<typeof createApplication>[0])
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    const repo = application.taskChain.repository, { plan, chain, artifact } = retiredFixture(taskId)
    const requirement = application.taskChain.snapshot(taskId).requirement!
    plan.requirement = { id: requirement.id, version: requirement.version, revision: requirement.revision, digest: digestJson(requirement) }
    Object.assign(plan, taskPlanSchema.parse(plan))
    chain.plan.digest = digestJson(plan)
    repo.savePlan(plan); repo.saveChain(chain)
    const ref = { id: chain.id, version: 1, digest: executableChainDigest(chain) }
    const planRef = { id: plan.id, version: 1, digest: digestJson(plan) }
    const run = queuedValidationRun(taskId, randomUUID(), chain, { destination: "https://example.com" }, "sample")
    repo.saveRun(run)
    const record = queuedPlanValidation(taskId, randomUUID(), plan, [chain], { destination: "https://example.com" }, "sample")
    repo.saveExecution(record)
    const commands: TaskChainCommand[] = [
      { type: "validate_chain", requestId: randomUUID(), chain: ref, mode: "sample", input: null },
      { type: "validate_plan", requestId: randomUUID(), plan: planRef, mode: "sample", input: null },
      { type: "authorize_plan", requestId: randomUUID(), plan: planRef, input: null },
      { type: "resume_validation", requestId: randomUUID(), runId: run.binding.runId, expectedSequence: 0 },
      { type: "resume_execution", requestId: randomUUID(), executionId: record.id, expectedSequence: 0 },
    ]
    for (const command of commands) {
      const response = await application.app.inject({ method: "POST", url: `/api/task-chain?taskId=${taskId}`, headers: { host: "localhost:3001", "sec-fetch-site": "same-origin" }, payload: command })
      assert.equal(response.statusCode, 409, response.body)
      assert.equal(response.json().code, "legacy_workflow_use_v1_retired")
    }
    // 模拟切换前已排队的 validation；走产品 drain 而不是仅测辅助判断函数。
    const service = application.taskChain as unknown as { queue: unknown[]; drain(): Promise<void> }
    service.queue.push({ type: "validation", taskId, runId: run.binding.runId })
    service.queue.push({ type: "execution", taskId, id: record.id, resume: true })
    await service.drain()
    const failed = repo.run(taskId, run.binding.runId)
    assert.equal(failed.status, "failed")
    assert.equal(failed.outcome?.status === "failed" && failed.outcome.code, "legacy_workflow_use_v1_retired")
    assert.equal(repo.execution(taskId, record.id).status, "failed")
    assert.match(repo.execution(taskId, record.id).reason ?? "", /legacy_workflow_use_v1_retired/)
    const stored = repo.saveArtifact(taskId, randomUUID(), legacyWorkflowMediaType, artifact)
    const response = await application.app.inject({ method: "GET", url: `/api/task-chain/artifact?taskId=${taskId}&artifactId=${stored.artifactId}`, headers: { host: "localhost:3001" } })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(workflowArtifactSchema.parse(response.json().body), artifact)
    assert.equal(JSON.stringify(repo.chain(taskId, chain.id, 1)), JSON.stringify(chain))
    assert.deepEqual(calls, [])
    assert.equal(repo.jobs(taskId).length, 0)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})
