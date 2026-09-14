import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { taskPlanExecutionIssues, type JsonValue } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import { reusableExploration } from "../src/task-chain/service.js"
import { compactTraceForModel } from "../src/task-chain/authoring.js"
import type { ExplorationTrace } from "../src/task-chain/exploration-trace.js"
import { projectRoot } from "./helpers.js"
import { annotations, confirmedDraft, escalationModel, fakeBrowserExecutor, pageBrowserExecutor, planCandidate,
  preexecutionModel, queuedModel, repairLoopModel, successfulObservation, taskQueuedModel, validation, waitFor }
  from "./task-chain-test-support.js"

test("主流程先拆计划，再用一个会话探索每个步骤的一条代表路径", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-guidance-preexecution-")), order: string[] = []
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel(order),
    browserExecutor: pageBrowserExecutor, taskChainCapabilities: () => successfulObservation() })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.some((job) => job.type === "chain"
      && !["queued", "running", "waiting_for_human"].includes(job.status)))
    const state = application.taskChain.snapshot(taskId), job = state.jobs.find((item) => item.type === "chain")!
    assert.equal(job.status, "completed", job.reason ?? undefined)
    assert.deepEqual(order, ["plan", "explore", "compile-chain"])
    assert.equal(state.plans.length, 1); assert.equal(state.chains.length, 1)
    assert.equal(state.plans[0]?.inputContract.id, "task-value")
    assert.equal(state.plans[0]?.outputContract.id, "task-output")
    assert.deepEqual(taskPlanExecutionIssues(state.plans[0]!), [])
    assert.equal(job.authoring?.consumption.explorationSessions, 1)
    assert.equal(job.authoring?.level, "E2")
    const context = job.authoring?.exploration as ExplorationTrace
    assert.deepEqual(context.input, { value: "explore" })
    assert.deepEqual(context.stepResults?.map((item) => item.stepId), ["perform"])

    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).chains.length === 2
      && application.taskChain.snapshot(taskId).jobs.filter((item) => item.type === "chain").at(-1)?.status === "completed")
    const rebuilt = application.taskChain.snapshot(taskId)
    assert.deepEqual(order, ["plan", "explore", "compile-chain"])
    assert.equal(rebuilt.jobs.filter((item) => item.type === "chain").at(-1)?.authoring?.consumption.explorationSessions, 0)
    assert.equal(rebuilt.jobs.filter((item) => item.type === "chain").at(-1)?.authoring?.consumption.compilationCalls, 0)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("预执行连续漏交结果时升级可用模型并复用同一浏览器会话", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-preexecution-escalation-"))
  let sessionStarts = 0
  const application = await createApplication({ root: projectRoot, directory, aiModel: escalationModel(),
    browserExecutor: async (args) => { if (args[1] === "session" && args[2] === "start") sessionStarts++
      return pageBrowserExecutor(args) }, taskChainCapabilities: () => successfulObservation() })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.some((job) => job.type === "chain"
      && !["queued", "running", "waiting_for_human"].includes(job.status)))
    const job = application.taskChain.snapshot(taskId).jobs.find((item) => item.type === "chain")!
    assert.equal(job.status, "completed", job.reason ?? undefined)
    assert.equal(sessionStarts, 1)
    assert.deepEqual(job.audit?.escalations, [{ model: "strong-model", effort: "high",
      reason: "exploration_business_result_missing" }])
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("样本复跑的本地失败会复用预执行证据修复新版本并再次验证", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-repair-validation-")), order: string[] = []
  let validationCalls = 0, sessionStarts = 0
  const application = await createApplication({ root: projectRoot, directory, aiModel: repairLoopModel(order),
    browserExecutor: async (args) => { if (args[1] === "session" && args[2] === "start") sessionStarts++
      return pageBrowserExecutor(args) }, taskChainCapabilities: ({ purpose }) => purpose === "sample" ? {
        capability: async () => ++validationCalls === 1 ? { outcome: "missing", reason: "target_missing" } : {
          outcome: "success", output: { title: "Confirmed", url: "https://example.com/", text: "Confirmed",
            truncated: false, observedAt: "2026-09-14T00:00:00.000Z", links: [], headings: [], paragraphs: [] },
        },
      } : {} })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).chains.length === 2
      && application.taskChain.snapshot(taskId).runs.filter((run) => run.mode === "sample").length === 2)
    await waitFor(() => application.taskChain.snapshot(taskId).runs.filter((run) => run.mode === "sample")
      .every((run) => !["queued", "running"].includes(run.status)))
    const state = application.taskChain.snapshot(taskId)
    const chains = state.chains.toSorted((left, right) => left.version - right.version)
    assert.equal(chains[0]!.validation.evidence[0]?.passed, false)
    assert.equal(chains[1]!.validation.evidence[0]?.passed, true, JSON.stringify(state.runs.map((run) => ({
      status: run.status, outcome: run.outcome, outputs: run.outputs,
    }))))
    assert.equal(sessionStarts, 1)
    const repair = state.jobs.find((job) => job.key.startsWith("repair:"))!
    assert.equal(repair.status, "completed", repair.reason ?? undefined)
    assert.equal(repair.authoring?.consumption.explorationSessions, 0)
    assert.deepEqual(order, ["plan", "explore", "compile-chain", "repair-chain"])
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("样本复跑遇到外部频控时暂停修复循环", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-validation-rate-limit-")), order: string[] = []
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel(order),
    browserExecutor: pageBrowserExecutor, taskChainCapabilities: () => ({ capability: async () => ({ outcome: "blocked",
      reason: "rate_limited", externalFailure: { category: "rate_limited", code: "rate_limited",
        origin: "https://example.com", observedOrigin: "https://example.com", httpStatus: 429,
        retryAt: "2026-09-14T01:00:00.000Z" } }) }) })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
      input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).runs.some((run) => !["queued", "running"].includes(run.status)))
    const state = application.taskChain.snapshot(taskId)
    assert.equal(state.runs[0]?.externalFailure?.category, "rate_limited")
    assert.equal(state.chains.length, 1)
    assert.equal(state.jobs.some((job) => job.key.startsWith("repair:")), false)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("确认需求、计划与链路生成、双输入验证、排队及人工恢复共用新协议事实源", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-service-")), model = queuedModel([
    planCandidate(), (({ outputMappings: _, ...value }) => value)(annotations()), planCandidate(),
  ])
  let releaseAuthoringHelp!: () => void
  const authoringHelp = new Promise<void>((resolve) => { releaseAuthoringHelp = resolve })
  let taskChain: Awaited<ReturnType<typeof createApplication>>["taskChain"] | undefined
  let replayGroups = 0
  const application = await createApplication({ root: projectRoot, directory, aiModel: model,
    browserExecutor: async (args) => {
      if (args[1] === "request-help") await authoringHelp
      return fakeBrowserExecutor(args)
    },
    taskChainCapabilities: ({ purpose }) => {
      if (purpose === "replay") replayGroups++
      const page = { title: "Confirmed", url: "https://example.com/", text: "Confirmed", truncated: false,
        observedAt: "2026-09-14T00:00:00.000Z", links: [], headings: [], paragraphs: [] }
      const browser = { sessionId: "fixture", tabId: "1", url: page.url, observationDigest: "a".repeat(64), observedAt: page.observedAt }
      return { verifyResume: async () => ({ ok: true, observation: page, browser }), capability: async (invocation) => {
        if (invocation.node.human) {
          if (purpose === "replay" && replayGroups === 1) return { outcome: "human_required" as const, reason: "fixture_wait", browser }
          const artifact = taskChain!.repository.saveArtifact(invocation.binding.taskId, invocation.binding.runId,
            "application/json", { resumed: true, purpose })
          return { outcome: "success" as const, output: page, artifacts: [artifact], browser }
        }
        return { outcome: "success" as const, output: page, browser }
      } }
    } })
  taskChain = application.taskChain
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    const initial = taskChain.snapshot(taskId)
    assert.equal(initial.requirement?.definition.body, "# 通用确认任务\n\n目标页面：https://example.com/\n\n需要人工确认后返回结构化结果。")
    assert.equal(initial.requirement?.confirmation?.confirmedAt, "2026-09-12T01:00:00.000Z")

    taskChain.dispatch(taskId, { type: "generate_plan", requestId: randomUUID(), requirementVersion: 1 })
    await waitFor(() => taskChain!.snapshot(taskId).jobs.some((job) => job.type === "plan" && job.status === "completed"))
    let state = taskChain.snapshot(taskId), plan = state.plans[0]!
    assert.equal(plan.steps[0]!.chain.version, 1)
    assert.equal(plan.budget.maxInvocations, 1)
    assert.equal(state.jobs.find((job) => job.type === "plan")?.audit?.reportedInvocations, 1)
    const planRef = { id: plan.id, version: plan.version, digest: digestJson(plan) }

    taskChain.dispatch(taskId, { type: "generate_chain", requestId: randomUUID(), plan: planRef,
      stepId: "perform", input: { value: "explore" } })
    await waitFor(() => taskChain!.snapshot(taskId).jobs.some((job) => job.type === "chain"
      && job.status === "waiting_for_human"))
    const waitingJob = taskChain.snapshot(taskId).jobs.find((job) => job.type === "chain")!
    assert.equal(waitingJob.waitpoint?.owner, "authoring_job")
    assert.equal(waitingJob.waitpoint?.ownerId, waitingJob.id)
    assert.equal(waitingJob.waitpoint?.status, "waiting")
    const waitingBrowser = (await application.browser.snapshot(taskId)).record
    assert.equal(waitingBrowser?.runId, waitingJob.browserRunId)
    assert.equal(waitingBrowser?.status, "waiting_human")
    releaseAuthoringHelp()
    await waitFor(() => taskChain!.snapshot(taskId).jobs.some((job) => job.type === "chain"
      && !["queued", "running", "waiting_for_human"].includes(job.status)))
    state = taskChain.snapshot(taskId)
    const chainJob = state.jobs.find((job) => job.type === "chain")!
    assert.equal(chainJob.status, "completed", chainJob.reason ?? undefined)
    let chain = state.chains[0]!, chainRef = { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }
    assert.equal(chain.validation.status, "candidate")
    assert.equal(state.jobs.find((job) => job.type === "chain")?.audit?.reportedInvocations, null)
    assert.equal((await application.browser.snapshot(taskId)).record?.runId, chainJob.browserRunId)

    taskChain.dispatch(taskId, validation(chainRef, "sample", { value: "one" }))
    await waitFor(() => taskChain!.snapshot(taskId).chains[0]!.validation.evidence.length === 1)
    state = taskChain.snapshot(taskId)
    assert.equal(state.runs.at(-1)?.status, "completed", JSON.stringify(state.runs.at(-1)?.outcome))
    chain = state.chains[0]!; chainRef = { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }
    assert.equal(chain.validation.evidence[0]!.passed, true)
    taskChain.dispatch(taskId, validation(chainRef, "verification", { value: "two" }))
    await waitFor(() => taskChain!.snapshot(taskId).chains[0]!.validation.status === "verified")

    taskChain.dispatch(taskId, { type: "authorize_plan", requestId: randomUUID(), plan: planRef, input: { value: "run" } })
    await waitFor(() => taskChain!.snapshot(taskId).executions[0]?.status === "waiting_for_human")
    let execution = taskChain.snapshot(taskId).executions[0]!
    taskChain.dispatch(taskId, { type: "resume_execution", requestId: randomUUID(), executionId: execution.id,
      expectedSequence: execution.sequence })
    await waitFor(() => ["completed", "failed", "paused"].includes(taskChain!.snapshot(taskId).executions[0]?.status ?? ""))
    state = taskChain.snapshot(taskId); execution = state.executions[0]!
    assert.equal(execution.status, "completed", JSON.stringify({ reason: execution.reason, steps: execution.steps }))
    assert.deepEqual(execution.output, { kind: "value", contract: { id: "task-output", version: 1 }, value: { title: "Confirmed" } })
    assert.ok(execution.consumed.transitions > 0)
    assert.equal(execution.consumed.invocations, 1)
    assert.deepEqual(execution.steps[0]!.consumed, execution.consumed)
    const replayRun = state.runs.find((run) => run.binding.authorizationId === execution.authorizationId)!
    assert.equal(replayRun.outcome?.status, "completed")
    assert.equal(state.staleIds.length, 0)
    application.store.mutate(taskId, (interview) => {
      interview.revision = 2; interview.drafts.push({ version: 2, revision: 2, title: "更新后的任务",
        markdown: "# 更新后的任务\n\n使用新范围。", brief: null }); interview.confirmedVersion = 2
      interview.decisions.push({ id: randomUUID(), revision: 2, kind: "draft_confirmation", text: "确认需求草稿 v2",
        messageId: null, questionId: null, draftVersion: 2, createdAt: "2026-09-12T02:00:00.000Z" })
    })
    let staleState = taskChain.snapshot(taskId)
    assert.ok(staleState.staleVersions.some((item) => item.kind === "plan" && item.id === plan.id && item.version === 1))
    assert.ok(staleState.staleVersions.some((item) => item.kind === "chain" && item.id === chain.id && item.version === 1))
    assert.ok(staleState.staleIds.includes(execution.id))
    taskChain.dispatch(taskId, { type: "generate_plan", requestId: randomUUID(), requirementVersion: 2 })
    await waitFor(() => taskChain!.snapshot(taskId).plans.some((item) => item.version === 2))
    staleState = taskChain.snapshot(taskId)
    const currentPlan = staleState.plans.find((item) => item.version === 2)!
    assert.equal(staleState.staleIds.includes(currentPlan.id), false)
    assert.equal(staleState.staleVersions.some((item) => item.kind === "plan" && item.id === currentPlan.id
      && item.version === currentPlan.version), false)
    const olderId = "ffffffff-ffff-4fff-8fff-fffffffffff1", newerId = "00000000-0000-4000-8000-000000000002"
    taskChain.repository.saveExecution({ ...execution, id: newerId, createdAt: "2026-09-12T04:00:00.000Z",
      updatedAt: "2026-09-12T04:00:00.000Z" })
    taskChain.repository.saveExecution({ ...execution, id: olderId, createdAt: "2026-09-12T03:00:00.000Z",
      updatedAt: "2026-09-12T03:00:00.000Z" })
    assert.deepEqual(taskChain.repository.executions(taskId).filter((item) => [olderId, newerId].includes(item.id))
      .map((item) => item.id), [olderId, newerId])
  } finally { releaseAuthoringHelp(); await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("跨步骤代表探索可由末步骤确定收敛并在重编译时复用 E1", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-whole-authoring-"))
  const model = taskQueuedModel(false)
  let sessionStarts = 0
  const application = await createApplication({ root: projectRoot, directory, aiModel: model,
    taskChainCapabilities: () => ({ ...successfulObservation(), llm: async () => ({ outcome: "success",
      reportedInvocations: 1, output: [{ key: "confirmed", label: "本轮输入" }] }) }),
    browserExecutor: async (args) => {
      if (args[1] === "session" && args[2] === "start") sessionStarts++
      if (args[1] === "evaluate") return { stdout: JSON.stringify({ ok: true, tab_id: 1,
        value: { url: "https://example.com/", title: "Confirmed", links: [], headings: [], paragraphs: ["Confirmed"] } }), exitCode: 0 }
      return fakeBrowserExecutor(args)
    } })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "generate_plan", requestId: randomUUID(), requirementVersion: 1 })
    await waitFor(() => application.taskChain.snapshot(taskId).plans.length === 1)
    const plan = application.taskChain.snapshot(taskId).plans[0]!, planRef = {
      id: plan.id, version: plan.version, digest: digestJson(plan),
    }
    assert.equal(plan.steps.length, 2)
    assert.throws(() => application.taskChain.dispatch(taskId, { type: "generate_chain", requestId: randomUUID(),
      plan: planRef, stepId: "discover", input: { value: "explore" } }), /多步骤计划必须由一次跨步骤代表探索/)

    application.taskChain.dispatch(taskId, { type: "generate_task_chains", requestId: randomUUID(),
      plan: planRef, input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.some((job) => job.type === "chain"
      && !["queued", "running", "waiting_for_human"].includes(job.status)))
    const state = application.taskChain.snapshot(taskId), job = state.jobs.find((item) => item.type === "chain")!
    assert.equal(job.status, "completed", job.reason ?? undefined)
    assert.equal(sessionStarts, 1)
    assert.equal(job.authoring?.consumption.explorationSessions, 1)
    assert.equal(job.authoring?.compiledChains?.length, 2)
    assert.deepEqual(state.chains.map((chain) => chain.stepId).toSorted(), ["detail", "discover"])
    assert.ok(state.chains.every((chain) => chain.validation.status === "candidate"))
    const trace = job.authoring?.exploration as ExplorationTrace
    assert.deepEqual(trace.stepResults?.map((item) => ({ stepId: item.stepId, input: item.input,
      runtime: item.runtimeResult.result })), [
      { stepId: "discover", input: { value: "explore" }, runtime: [
        { key: "confirmed", label: "计划原始说明" }, { key: "second", label: "第二项说明" }] },
      { stepId: "detail", input: { key: "confirmed", label: "计划原始说明" }, runtime: ["Confirmed"] },
    ])
    assert.deepEqual(trace.result?.result, ["Confirmed"])
    application.taskChain.dispatch(taskId, { type: "generate_task_chains", requestId: randomUUID(),
      plan: planRef, input: { value: "explore" } })
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.filter((item) => item.type === "chain").length === 2
      && application.taskChain.snapshot(taskId).jobs.filter((item) => item.type === "chain").at(-1)?.status === "completed")
    const reusedState = application.taskChain.snapshot(taskId)
    const reused = reusedState.jobs.filter((item) => item.type === "chain").at(-1)!
    assert.equal(reused.browserRunId, job.browserRunId)
    assert.equal(reused.authoring?.consumption.explorationSessions, 0)
    assert.equal(reused.authoring?.consumption.compilationCalls, 0)
    assert.equal(sessionStarts, 1)
    assert.equal(reusedState.chains.length, 4)
    const browser = await application.browser.snapshot(taskId)
    assert.equal(browser.busy, false)
    assert.equal(browser.cleanupRequired, false)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("编译元数据失败后的新请求复用已持久化 E1，不重复启动浏览器", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-recompile-"))
  const { outputMappings: _ignored, ...good } = annotations()
  const bad = { ...good, completion: [{ eventId: "page", resultPath: ["missing"], description: "错误路径" }] }
  const model = queuedModel([planCandidate(), bad, good, good])
  let sessionStarts = 0
  const application = await createApplication({ root: projectRoot, directory, aiModel: model,
    browserExecutor: async (args) => {
      if (args[1] === "session" && args[2] === "start") sessionStarts++
      return fakeBrowserExecutor(args)
    } })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.taskChain.dispatch(taskId, { type: "generate_plan", requestId: randomUUID(), requirementVersion: 1 })
    await waitFor(() => application.taskChain.snapshot(taskId).plans.length === 1)
    const plan = application.taskChain.snapshot(taskId).plans[0]!
    const planRef = { id: plan.id, version: plan.version, digest: digestJson(plan) }
    const generate = () => application.taskChain.dispatch(taskId, { type: "generate_chain" as const,
      requestId: randomUUID(), plan: planRef, stepId: "perform", input: { value: "explore" } })
    generate()
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.filter((job) => job.type === "chain").length === 1
      && application.taskChain.snapshot(taskId).jobs.find((job) => job.type === "chain")?.status === "failed")
    const first = application.taskChain.snapshot(taskId).jobs.find((job) => job.type === "chain")!
    assert.match(first.reason ?? "", /binding_path_missing/)
    assert.equal(first.authoring?.level, "E1")
    assert.equal(first.authoring?.exploration && (first.authoring.exploration as { closed?: boolean }).closed, true)
    assert.equal(sessionStarts, 1)

    generate()
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.filter((job) => job.type === "chain").length === 2
      && application.taskChain.snapshot(taskId).jobs.filter((job) => job.type === "chain").at(-1)?.status === "completed")
    const state = application.taskChain.snapshot(taskId), second = state.jobs.filter((job) => job.type === "chain").at(-1)!
    assert.equal(second.browserRunId, first.browserRunId)
    assert.equal(second.authoring?.consumption.explorationSessions, 0)
    assert.equal(second.authoring?.consumption.explorationToolCalls, 0)
    assert.equal(sessionStarts, 1)
    assert.equal(state.chains.length, 1)

    generate()
    await waitFor(() => application.taskChain.snapshot(taskId).jobs.filter((job) => job.type === "chain").length === 3
      && application.taskChain.snapshot(taskId).jobs.filter((job) => job.type === "chain").at(-1)?.status === "completed")
    const thirdState = application.taskChain.snapshot(taskId), third = thirdState.jobs.filter((job) => job.type === "chain").at(-1)!
    assert.equal(third.browserRunId, first.browserRunId)
    assert.equal(third.authoring?.consumption.explorationSessions, 0)
    assert.equal(third.authoring?.consumption.explorationToolCalls, 0)
    assert.equal(sessionStarts, 1)
    assert.equal(thirdState.chains.length, 2)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("访问熔断轨迹不复用，局部可修正失败仍保留 E1", () => {
  const key = "plan:1:step", representativeInput = { url: "https://example.com/" }
  const baseTrace: ExplorationTrace = {
    jobId: randomUUID(), browserRunId: randomUUID(), input: representativeInput, calls: 2, conclusion: "done", closed: true,
    events: [{ id: "page", callId: "page", at: new Date().toISOString(), command: { type: "page" as const },
      output: { title: "Example" }, observation: null, status: "completed" as const, error: null }],
    result: { result: { title: "Example" }, provenance: [{ source: "tool" as const, outputPath: ["title"],
      eventId: "page", resultPath: ["title"] }] },
  }
  const job = (exploration: typeof baseTrace) => ({ type: "chain", key, status: "failed",
    authoring: { exploration } }) as unknown as Parameters<typeof reusableExploration>[0][number]
  const cleanupRecovered = { ...baseTrace, closed: false }
  assert.equal(reusableExploration([job(cleanupRecovered)], key, representativeInput), undefined)
  assert.equal(reusableExploration([job(cleanupRecovered)], key, representativeInput, () => true)?.closed, true)
  const localFailure = { ...baseTrace, events: [...baseTrace.events, { id: "probe", callId: "probe",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "可选" } },
    output: null, observation: null, status: "failed" as const, error: "target_missing" }] }
  assert.equal(reusableExploration([job(localFailure)], key, representativeInput)?.browserRunId, baseTrace.browserRunId)
  const accessFailure = { ...baseTrace, events: [...baseTrace.events, { id: "blocked", callId: "blocked",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "搜索" } },
    output: null, observation: null, status: "failed" as const, error: "origin_denied" }] }
  assert.equal(reusableExploration([job(accessFailure)], key, representativeInput)?.browserRunId, baseTrace.browserRunId)
  const uncertainState = { ...baseTrace, events: [...baseTrace.events, { id: "uncertain", callId: "uncertain",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "打开" } },
    output: null, observation: null, status: "failed" as const, error: "invalid_response" }] }
  assert.equal(reusableExploration([job(uncertainState)], key, representativeInput), undefined)
  const ambiguousAction = { ...baseTrace, events: [...baseTrace.events, { id: "ambiguous", callId: "ambiguous",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "同名入口" } },
    output: null, observation: null, status: "failed" as const, error: "target_ambiguous" }] }
  assert.equal(reusableExploration([job(ambiguousAction)], key, representativeInput), undefined)
  const compact = compactTraceForModel({ ...baseTrace, events: [{ ...baseTrace.events[0]!,
    output: { text: "敏感页面正文".repeat(10_000), url: "https://example.com/" } }] })
  assert.doesNotMatch(JSON.stringify(compact), /敏感页面正文/)
  assert.deepEqual((compact as { events: Array<{ outputPaths: JsonValue }> }).events[0]?.outputPaths,
    [["text"], ["url"]])
})
