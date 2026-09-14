import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { taskExecutionSchema, type JsonValue } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import type { AIModelProvider } from "../src/ai/model.js"
import { projectRoot } from "./helpers.js"
import { confirmedDraft, pageBrowserExecutor, taskQueuedModel, waitFor } from "./task-chain-test-support.js"

// WHY：保护产品计划组合与恢复，替身只模拟能力结果；不作为真实网站验收证据。
async function fixture(failure?: "human" | "external" | "local" | "repair" | "verification") {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-plan-validation-"))
  const groups: string[] = [], detailInputs: JsonValue[] = []
  let discoveries = 0, explorationStarts = 0, resumed = false
  const page = { title: "Confirmed", url: "https://example.com/", text: "Confirmed", truncated: false,
    observedAt: "2026-09-14T00:00:00.000Z", links: [], headings: [], paragraphs: ["Confirmed"] }
  const browser = { sessionId: "fixture", tabId: "1", url: page.url, observationDigest: "a".repeat(64), observedAt: page.observedAt }
  const application = await createApplication({ root: projectRoot, directory, aiModel: taskQueuedModel(false, true),
    browserExecutor: async (args) => {
      if (args[1] === "session" && args[2] === "start") explorationStarts++
      return pageBrowserExecutor(args)
    }, taskChainCapabilities: ({ purpose }) => {
      groups.push(purpose)
      return { verifyResume: async () => { resumed = true; return { ok: true, observation: page, browser } },
        llm: async () => { discoveries++; return { outcome: "success", reportedInvocations: 1,
          output: [1, 2].map((item) => ({ key: `fresh-${discoveries}-${item}`, label: `本轮-${item}` })) } },
        capability: async ({ binding }) => {
          const run = application.taskChain.repository.run(binding.taskId, binding.runId)
          const chain = application.taskChain.repository.chain(binding.taskId, binding.chain.id, binding.chain.version)
          if (chain.stepId !== "detail") return { outcome: "success", output: page, browser }
          detailInputs.push(run.input)
          if (failure === "human" && detailInputs.length === 2) return { outcome: "human_required", reason: "等待确认", browser }
          if (failure === "external") return { outcome: "blocked", reason: "rate_limited", externalFailure: {
            category: "rate_limited", code: "rate_limited", origin: "https://example.com", observedOrigin: "https://example.com",
            httpStatus: 429, retryAt: null } }
          if (failure === "local" || failure === "repair" && detailInputs.length === 1
            || failure === "verification" && purpose === "verification" && groups.length === 2) {
            return { outcome: "missing", reason: "target_missing" }
          }
          return { outcome: "success", output: page, browser }
        } }
    } })
  const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
  confirmedDraft(application.store, taskId)
  application.taskChain.dispatch(taskId, { type: "generate_plan", requestId: randomUUID(), requirementVersion: 1 })
  await waitFor(() => application.taskChain.snapshot(taskId).plans.length === 1)
  const plan = application.taskChain.snapshot(taskId).plans[0]!
  const planRef = { id: plan.id, version: plan.version, digest: digestJson(plan) }
  const snapshot = () => application.taskChain.snapshot(taskId)
  return { application, taskId, planRef, snapshot, groups, detailInputs, discoveries: () => discoveries,
    resumed: () => resumed, explorationStarts: () => explorationStarts,
    async author() {
      application.taskChain.dispatch(taskId, { type: "generate_task_chains", requestId: randomUUID(), plan: planRef,
        input: { value: "explore" } })
      await waitFor(() => snapshot().executions.some((record) => !["queued", "running"].includes(record.status)))
    },
    validate(mode: "sample" | "verification", value: string) {
      const command = { type: "validate_plan" as const, requestId: randomUUID(), plan: planRef, mode, input: { value } }
      application.taskChain.dispatch(taskId, command); return command
    },
    async close() { await application.app.close(); await removeFixture(directory) } }
}

test("多步骤自动样本与换输入共享单次能力会话，下游使用本轮真实输出并保留用途审计", async () => {
  const f = await fixture()
  try {
    await f.author()
    let state = f.snapshot(), sample = state.executions[0]!
    assert.equal(sample.status, "completed", sample.reason)
    assert.equal(sample.mode, "sample")
    assert.deepEqual(f.groups, ["sample"])
    assert.equal(f.explorationStarts(), 1)
    assert.deepEqual(f.detailInputs, [{ key: "fresh-1-1", label: "本轮-1" }, { key: "fresh-1-2", label: "本轮-2" }])
    assert.deepEqual(sample.output?.kind === "value" && sample.output.value, ["Confirmed", "Confirmed"])
    assert.equal(sample.consumed.llmCalls, 1)
    assert.equal(state.runs.length, 3)
    assert.ok(state.runs.every((run) => run.mode === "sample"))
    assert.equal(state.chains.find((chain) => chain.stepId === "detail")!.validation.evidence.length, 2)
    assert.ok(state.chains.every((chain) => chain.validation.status === "candidate"))
    assert.throws(() => f.validate("verification", "explore"), /输入必须不同/)
    const chain = state.chains[0]!
    assert.throws(() => f.application.taskChain.dispatch(f.taskId, { type: "validate_chain", requestId: randomUUID(),
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, mode: "sample", input: {} }), /同一浏览器会话/)
    const command = f.validate("verification", "different")
    f.application.taskChain.dispatch(f.taskId, command)
    await waitFor(() => f.snapshot().executions.some((record) => record.mode === "verification" && record.status === "completed"))
    state = f.snapshot()
    assert.equal(state.executions.length, 2)
    assert.ok(state.chains.every((item) => item.validation.status === "verified"))
    assert.deepEqual(f.groups, ["sample", "verification"])
    f.application.taskChain.dispatch(f.taskId, { type: "authorize_plan", requestId: randomUUID(), plan: f.planRef, input: { value: "run" } })
    await waitFor(() => f.snapshot().executions.some((record) => !record.mode && record.status === "completed"))
    assert.deepEqual(f.groups, ["sample", "verification", "replay"])
    assert.ok(f.snapshot().runs.slice(-3).every((run) => run.mode === "replay"))
    const historical = { ...sample }; delete historical.mode
    assert.equal(taskExecutionSchema.parse(historical).mode, undefined)
  } finally { await f.close() }
})

test("计划验证人工等待恢复原 run，保留已完成上游与输入，不允许单链脱离计划恢复", async () => {
  const f = await fixture("human")
  try {
    await f.author()
    const before = f.snapshot().executions[0]!
    assert.equal(before.status, "waiting_for_human", before.reason)
    assert.ok(f.snapshot().chains.every((chain) => chain.validation.evidence.length === 0))
    const run = f.snapshot().runs.find((item) => item.binding.runId === before.currentRunId)!
    assert.throws(() => f.application.taskChain.dispatch(f.taskId, { type: "resume_validation", requestId: randomUUID(),
      runId: run.binding.runId, expectedSequence: run.sequence }), /恢复原计划/)
    f.application.taskChain.dispatch(f.taskId, { type: "resume_execution", requestId: randomUUID(), executionId: before.id,
      expectedSequence: before.sequence })
    await waitFor(() => f.snapshot().executions[0]?.status === "completed")
    const after = f.snapshot().executions[0]!
    assert.equal(after.id, before.id)
    assert.deepEqual(after.steps.map((step) => step.runIds), before.steps.map((step) => step.runIds))
    assert.equal(f.discoveries(), 1)
    assert.equal(f.resumed(), true)
    assert.equal(f.snapshot().runs.length, 3)
    assert.deepEqual(f.detailInputs[2], f.detailInputs[1])
  } finally { await f.close() }
})

test("完整计划遇到外部阻断停止剩余输入，不修复，不发布单链成功证据", async () => {
  const f = await fixture("external")
  try {
    await f.author()
    const state = f.snapshot()
    assert.equal(state.executions[0]!.status, "blocked", state.executions[0]!.reason)
    assert.equal(f.detailInputs.length, 1)
    assert.ok(state.chains.every((chain) => chain.validation.evidence.every((item) => !item.passed)))
    assert.equal(state.jobs.some((job) => job.key.startsWith("repair:")), false)
    assert.throws(() => f.validate("verification", "different"), /先通过计划样本/)
  } finally { await f.close() }
})

for (const failure of ["repair", "local"] as const) test(`多步骤本地失败从计划入口修复验证且最多一轮：${failure}`, async () => {
  const f = await fixture(failure)
  try {
    await f.author()
    await waitFor(() => f.snapshot().executions.length === 2
      && !["queued", "running"].includes(f.snapshot().executions[1]!.status))
    const state = f.snapshot(), [original, repaired] = state.executions
    assert.equal(original!.status, "failed")
    assert.equal(repaired!.status, failure === "repair" ? "completed" : "failed", repaired!.reason)
    assert.equal(repaired!.validationRecovery?.parentExecutionId, original!.id)
    assert.equal(repaired!.validationRecovery?.attempt, 1)
    assert.equal(state.chains.filter((chain) => chain.stepId === "detail").length, 2)
    assert.deepEqual(f.groups, ["sample", "sample"])
    assert.equal(f.discoveries(), 2)
    assert.equal(f.explorationStarts(), 1)
    const jobs = state.jobs.filter((job) => job.key.startsWith("repair:"))
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0]!.status, "completed", jobs[0]!.reason ?? undefined)
    assert.equal(jobs[0]!.authoring?.consumption.explorationSessions, 0)
    assert.ok(state.chains.find((chain) => chain.stepId === "detail" && chain.version === 1)!
      .validation.evidence.every((item) => !item.passed))
  } finally { await f.close() }
})

test("换输入修复先重新验证整计划样本，再验证原失败输入", async () => {
  const f = await fixture("verification")
  try {
    await f.author()
    f.validate("verification", "different")
    await waitFor(() => f.snapshot().executions.length === 4 && f.snapshot().executions[3]!.status === "completed")
    const executions = f.snapshot().executions
    assert.deepEqual(executions.map((record) => [record.mode, record.status, record.input]), [
      ["sample", "completed", { value: "explore" }], ["verification", "failed", { value: "different" }],
      ["sample", "completed", { value: "explore" }], ["verification", "completed", { value: "different" }],
    ])
    assert.deepEqual(f.groups, ["sample", "verification", "sample", "verification"])
    assert.equal(f.explorationStarts(), 1)
  } finally { await f.close() }
})

test("链路版本改变后旧计划样本不能授权新版本的换输入验证", async () => {
  const f = await fixture()
  try {
    await f.author()
    const chain = f.snapshot().chains[0]!
    f.application.taskChain.repository.saveChain({ ...chain, version: chain.version + 1,
      validation: { status: "candidate", evidence: [] } })
    assert.throws(() => f.validate("verification", "different"), /当前全部链路版本/)
    assert.equal(f.snapshot().executions.length, 1)
  } finally { await f.close() }
})

test("多步骤样本通过 BrowserService 只创建和关闭一个控制会话", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-plan-browser-session-")), base = taskQueuedModel(false)
  const model: AIModelProvider = { ...base, async prepare(...args) {
    const prepared = await base.prepare(...args)
    return { ...prepared, async generateObject(input) {
      if ((input.jsonSchema.properties as Record<string, unknown> | undefined)?.value) {
        return input.parse({ value: [{ key: "one", label: "第一项" }, { key: "two", label: "第二项" }] })
      }
      return prepared.generateObject({ ...input, parse(raw) {
        const value = raw as { reuseBoundary?: { description: string } }
        return input.parse(value.reuseBoundary ? { ...value,
          reuseBoundary: { ...value.reuseBoundary, description: "授权页面 https://example.com/" } } : raw)
      } })
    } }
  } }
  let starts = 0, stops = 0
  const commands: string[] = []
  const application = await createApplication({ root: projectRoot, directory, aiModel: model,
    browserExecutor: async (args) => {
      commands.push(args[1] === "evaluate" ? "evaluate" : args.slice(1, 4).join(" "))
      if (args[1] === "session" && args[2] === "start") starts++
      if (args[1] === "session" && args[2] === "stop") stops++
      return pageBrowserExecutor(args)
    } })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).executions.some((record) =>
      !["queued", "running"].includes(record.status)) && application.browser.owner() === null)
    const state = application.taskChain.snapshot(taskId)
    assert.equal(state.executions[0]!.status, "completed", JSON.stringify({ commands,
      nodes: state.chains.map((chain) => chain.nodes[0]), runs: state.runs.map((run) =>
        ({ outcome: run.outcome, events: run.events, modelCalls: run.modelCalls })) }))
    assert.equal(starts, 2) // 一次探索 + 一次完整计划样本，三个样本 run 共用第二个会话。
    assert.equal(stops, 2)
    assert.equal(state.runs.length, 3)
    assert.equal((await application.browser.snapshot(taskId)).cleanupRequired, false)
  } finally { await application.app.close(); await removeFixture(directory) }
})

async function removeFixture(directory: string) {
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
  assert.ok(path.basename(directory).startsWith("bat-plan-"))
  await rm(directory, { recursive: true, force: true })
}
