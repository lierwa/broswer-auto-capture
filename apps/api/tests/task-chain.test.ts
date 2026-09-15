import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { executableChainDigest } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import { projectRoot } from "./helpers.js"
import { confirmedDraft, fakeUpstreamRuntime, historyPlanCandidate, preexecutionModel, validation, waitFor } from "./task-chain-test-support.js"

test("完整需求进入 browser-use，候选链只保存显式模型 workflow artifact 引用", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-upstream-authoring-")), order: string[] = []
  const log = { tasks: [] as string[], sessions: 0, closed: 0, replays: 0 }
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel(order, true),
    upstreamBrowserRuntime: fakeUpstreamRuntime(log), browserExecutor: async () => ({ stdout: "{}", exitCode: 0 }) })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { startUrl: "https://example.com/", value: "sample" } })
    await waitFor(() => application.taskChain.snapshot(taskId).runs.some((run) => !["queued", "running"].includes(run.status)), 5_000)
    const state = application.taskChain.snapshot(taskId), job = state.jobs.find((item) => item.type === "chain")!
    assert.equal(job.status, "completed", job.reason ?? undefined)
    assert.equal(log.tasks.length, 1)
    assert.match(log.tasks[0]!, /# 通用确认任务/)
    assert.match(log.tasks[0]!, /【本次真实输入】/)
    assert.match(log.tasks[0]!, /【完成标准】/)
    assert.match(log.tasks[0]!, /遇到登录、验证码/)
    assert.doesNotMatch(log.tasks[0]!, /cssSelector|先滚动|DOM/)
    const chain = state.chains[0]!, workflow = chain.nodes.find((node) => node.kind === "llm")!
    assert.equal("delegate" in workflow && workflow.delegate?.capability.name, "browser.workflow-use")
    assert.deepEqual("delegate" in workflow ? workflow.delegate?.modelPurposes : [], ["extract", "output_conversion"])
    assert.equal(state.runs[0]?.status, "completed", JSON.stringify(state.runs[0]?.outcome))
    assert.deepEqual(state.runs[0]?.modelCalls.map((call) => call.purpose), ["extract", "output_conversion"])
    assert.equal(state.runs[0]?.consumed.llmCalls, 2)
    assert.equal(state.runs[0]?.consumed.browserCommands, 3)
    assert.equal(chain.validation.evidence[0]?.passed, true)
    assert.equal(job.authoring?.exploration && (job.authoring.exploration as { mode?: string }).mode,
      "workflow-use-authoring/v1")
    assert.equal(log.sessions, 2); assert.equal(log.closed, 2)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("样本和不同输入分别记账，通过后才授权正式复跑", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-upstream-validation-")), log = {
    tasks: [] as string[], sessions: 0, closed: 0, replays: 0,
  }
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
    upstreamBrowserRuntime: fakeUpstreamRuntime(log), browserExecutor: async () => ({ stdout: "{}", exitCode: 0 }) })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { startUrl: "https://example.com/", value: "sample" } })
    await waitFor(() => application.taskChain.snapshot(taskId).chains[0]?.validation.evidence.length === 1, 5_000)
    let state = application.taskChain.snapshot(taskId), chain = state.chains[0]!
    assert.equal(chain.validation.status, "candidate")
    const reference = { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }
    application.taskChain.dispatch(taskId, validation(reference, "verification", { startUrl: "https://example.com/", value: "different" }))
    await waitFor(() => application.taskChain.snapshot(taskId).chains[0]?.validation.status === "verified", 5_000)
    state = application.taskChain.snapshot(taskId); chain = state.chains[0]!
    assert.deepEqual(chain.validation.evidence.map((item) => item.phase), ["sample", "verification"])
    assert.notEqual(chain.validation.evidence[0]?.inputDigest, chain.validation.evidence[1]?.inputDigest)
    const plan = state.plans[0]!
    application.taskChain.dispatch(taskId, { type: "authorize_plan", requestId: randomUUID(),
      plan: { id: plan.id, version: plan.version, digest: chain.plan.digest },
      input: { startUrl: "https://example.com/", value: "replay" } })
    await waitFor(() => ["completed", "failed"].includes(application.taskChain.snapshot(taskId).executions[0]?.status ?? ""), 5_000)
    const execution = application.taskChain.snapshot(taskId).executions[0]!
    assert.equal(execution.status, "completed", execution.reason)
    assert.deepEqual(execution.output, { kind: "value", contract: { id: "history-task-output", version: 1 },
      value: { title: "replay" } })
    assert.equal(log.sessions, log.closed)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("不兼容输入在启动 Browser 前拒绝", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-upstream-input-gate-")), log = {
    tasks: [] as string[], sessions: 0, closed: 0, replays: 0,
  }
  const candidate = historyPlanCandidate()
  candidate.inputContract.schema = { type: "object", properties: { startUrl: { type: "string" }, nested: {
    type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } },
  required: ["startUrl", "nested"], additionalProperties: false }
  candidate.steps[0]!.inputContract = structuredClone(candidate.inputContract)
  const base = preexecutionModel([])
  const model = { ...base, async prepare() { return { selection: base.selection(), async generateObject(input: any) {
    return input.parse(candidate)
  } } } }
  const application = await createApplication({ root: projectRoot, directory, aiModel: model,
    upstreamBrowserRuntime: fakeUpstreamRuntime(log), browserExecutor: async () => ({ stdout: "{}", exitCode: 0 }) })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { startUrl: "https://example.com/", nested: { value: "x" } } })
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.some((job) => job.status === "failed"), 5_000)
    const job = application.taskChain.snapshot(taskId).jobs.find((item) => item.type === "chain")!
    assert.match(job.reason ?? "", /workflow_primitive_input_required:nested/)
    assert.equal(log.tasks.length, 0)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})
