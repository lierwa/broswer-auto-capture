import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import Database from "better-sqlite3"
import {
  CONTRACT_VERSION, requiredNodeOutcomes, type JsonValue, type TaskChainCommand, type TaskDataContract,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import type { AIModelProvider } from "../src/ai/model.js"
import { createApplication } from "../src/app.js"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { reusableExploration } from "../src/task-chain/service.js"
import type { ExplorationTrace } from "../src/task-chain/exploration-trace.js"
import { projectRoot } from "./helpers.js"

const budget = { maxTransitions: 30, maxBrowserCommands: 10, maxActiveMs: 30_000,
  maxLlmCalls: 0, maxInvocations: 5, maxDepth: 3 }
const openContract: TaskDataContract = { id: "task-value", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: {}, required: [], additionalProperties: true } }
const input = { source: "input" as const, path: [] }
const node = (id: string, kind: keyof typeof requiredNodeOutcomes, outputContract: TaskDataContract = unitContract) => ({
  id, label: id, outcomes: [...requiredNodeOutcomes[kind]], outputContract, writes: [],
})
const unitContract: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }

test("v10 新表保留旧 JSON 原字节并只读分类", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-contract-")), taskId = randomUUID()
  let store = await ProductStore.open(directory)
  store.taskAction({ type: "create", requestId: taskId })
  const created = store.list()[0]!.id
  await store.close()
  const file = path.join(directory, "workbench.sqlite"), legacyBody = ' { "legacy": true, "rows": [1, 2] }\n'
  const raw = new Database(file)
  try {
    raw.exec("DROP TABLE taskArtifacts; DROP TABLE taskExecutions; DROP TABLE taskAuthoringJobs; DROP TABLE taskContracts; PRAGMA user_version=9")
    raw.prepare("INSERT INTO plans(id,taskId,body) VALUES(?,?,?)").run("legacy-plan", created, legacyBody)
  } finally { raw.close() }
  store = await ProductStore.open(directory)
  try {
    const repository = new TaskContractRepository(store)
    assert.equal(repository.legacyOriginal(created, "plans", "legacy-plan"), legacyBody)
    assert.deepEqual(repository.legacy(created), [{ source: "plans", id: "legacy-plan", status: "legacy_read_only",
      reason: "缺少新协议版本，仅可读取或导出。" }])
    const migrated = new Database(file, { readonly: true })
    try { assert.equal(migrated.pragma("user_version", { simple: true }), 10) } finally { migrated.close() }
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("服务重启把未持久排队器的工作收敛为可解释终态", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-task-recovery-"))
  let store = await ProductStore.open(directory)
  const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
  const repository = new TaskContractRepository(store), now = new Date().toISOString()
  const planId = randomUUID(), requirementId = randomUUID(), authorizationId = randomUUID(), digest = "a".repeat(64)
  repository.saveJob({ id: randomUUID(), taskId, type: "plan", key: "queued-plan", status: "queued", sequence: 0,
    reason: null, resultId: null, audit: null, createdAt: now, updatedAt: now })
  repository.saveRun({ contractVersion: CONTRACT_VERSION, kind: "run", binding: { runId: randomUUID(),
    invocationId: randomUUID(), taskId, authorizationId, plan: { id: planId, version: 1, digest },
    chain: { id: randomUUID(), version: 1, digest }, inputDigest: digestJson({}) }, mode: "sample", input: {}, budget,
    sequence: 0, status: "queued", outputs: {}, checkpoint: null, consumed: { transitions: 0, browserCommands: 0,
      activeMs: 0, llmCalls: 0, invocations: 0 }, outcome: null, events: [], modelCalls: [], auditComplete: true })
  repository.saveExecution({ contractVersion: CONTRACT_VERSION, kind: "execution", id: randomUUID(), taskId,
    authorizationId, plan: { id: planId, version: 1, digest }, requirement: { id: requirementId, version: 1,
      revision: 1, digest }, input: {}, inputDigest: digestJson({}), status: "queued", sequence: 0,
    currentStepId: null, currentRunId: null, steps: [], output: null, reason: "等待执行。", createdAt: now, updatedAt: now })
  await store.close()
  store = await ProductStore.open(directory)
  try {
    const recovered = new TaskContractRepository(store)
    assert.equal(recovered.jobs(taskId)[0]?.status, "interrupted")
    assert.equal(recovered.runs(taskId)[0]?.status, "failed")
    assert.equal(recovered.runs(taskId)[0]?.outcome?.status, "failed")
    assert.equal(recovered.executions(taskId)[0]?.status, "paused")
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
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
      return { observe: async () => ({ outcome: "success", output: { title: "Confirmed", url: "https://example.com/", text: "Confirmed", truncated: false, links: [], headings: [], paragraphs: [] } }), human: async (invocation) => {
        if (purpose === "replay" && replayGroups === 1) return { outcome: "human_required", reason: "fixture_wait" }
        const artifact = taskChain!.repository.saveArtifact(invocation.binding.taskId, invocation.binding.runId,
          "application/json", { resumed: true, purpose })
        return { outcome: "success", output: { resumed: true, url: "https://example.com/" }, artifacts: [artifact] }
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
    await waitFor(() => taskChain!.snapshot(taskId).executions[0]?.status === "completed")
    state = taskChain.snapshot(taskId); execution = state.executions[0]!
    assert.deepEqual(execution.output, { kind: "value", contract: { id: "task-output", version: 1 }, value: { title: "Confirmed" } })
    assert.ok(execution.consumed.transitions > 0)
    assert.equal(execution.consumed.invocations, 1)
    assert.deepEqual(execution.steps[0]!.consumed, execution.consumed)
    const replayRun = state.runs.find((run) => run.binding.authorizationId === execution.authorizationId)!
    assert.equal(replayRun.outcome?.status, "completed")
    const artifact = replayRun.outcome!.evidence[0]!
    assert.deepEqual(taskChain.repository.artifact(taskId, artifact.artifactId).body, { resumed: true, purpose: "replay" })
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
  const localFailure = { ...baseTrace, events: [...baseTrace.events, { id: "probe", callId: "probe",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "可选" } },
    output: null, observation: null, status: "failed" as const, error: "target_missing" }] }
  assert.equal(reusableExploration([job(localFailure)], key, representativeInput)?.browserRunId, baseTrace.browserRunId)
  const accessFailure = { ...baseTrace, events: [...baseTrace.events, { id: "blocked", callId: "blocked",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "搜索" } },
    output: null, observation: null, status: "failed" as const, error: "origin_denied" }] }
  assert.equal(reusableExploration([job(accessFailure)], key, representativeInput), undefined)
  const uncertainState = { ...baseTrace, events: [...baseTrace.events, { id: "uncertain", callId: "uncertain",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "打开" } },
    output: null, observation: null, status: "failed" as const, error: "invalid_response" }] }
  assert.equal(reusableExploration([job(uncertainState)], key, representativeInput), undefined)
  const ambiguousAction = { ...baseTrace, events: [...baseTrace.events, { id: "ambiguous", callId: "ambiguous",
    at: new Date().toISOString(), command: { type: "click" as const, target: { role: "button" as const, name: "同名入口" } },
    output: null, observation: null, status: "failed" as const, error: "target_ambiguous" }] }
  assert.equal(reusableExploration([job(ambiguousAction)], key, representativeInput), undefined)
})

function confirmedDraft(store: ProductStore, taskId: string) {
  store.mutate(taskId, (state) => {
    state.revision = 1
    state.drafts.push({ version: 1, revision: 1, title: "通用确认任务",
      markdown: "# 通用确认任务\n\n目标页面：https://example.com/\n\n需要人工确认后返回结构化结果。", brief: null })
    state.confirmedVersion = 1
    state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
      messageId: null, questionId: null, draftVersion: 1, createdAt: "2026-09-12T01:00:00.000Z" })
  })
}

function planCandidate() {
  const completion = { id: "done", description: "步骤输出已保存", predicate: { operator: "exists" as const,
    value: { source: "node" as const, nodeId: "perform", path: [] } } }
  return { summary: "执行一个可复用确认步骤", inputContract: openContract,
    outputContract: { ...openContract, id: "task-output" }, steps: [{ id: "perform", title: "完成确认", goal: "返回可观察结果",
    dependsOn: [], inputContract: openContract, outputContract: { ...openContract, id: "task-output" }, input,
    invocation: { mode: "once" as const }, completion: [completion], risks: ["需要人工确认"] }],
    output: completion.predicate.value, completion: [completion], authorizationScope: "仅限本次已确认任务" }
}

function annotations() {
  return { inputBindings: [], repeatRegions: [], outputMappings: [{ source: "tool", outputPath: ["title"], eventId: "page", resultPath: ["title"] }],
    completion: [{ eventId: "page", resultPath: ["title"], description: "结果已显示" }],
    reuseBoundary: { description: "相同确认任务", assumptions: [], invalidationConditions: [] } }
}

function taskQueuedModel(completeTask = true): AIModelProvider {
  const selection = { connectionId: randomUUID(), modelId: "fixture-model", reasoningEffort: "high" as const }
  const responses = [twoStepPlanCandidate(), taskAnnotations("page-one", ["paragraphs"]),
    taskAnnotations("page-two", ["title"]), taskAnnotations("page-one", ["paragraphs"]),
    taskAnnotations("page-two", ["title"])]
  return { selection: () => selection, async prepare() { return { selection, async generateObject(input) {
    const value = responses.shift(); if (!value) throw new Error("fixture_response_missing"); return input.parse(value)
  } } }, async prepareMain() { return { selection, async close() {}, async run(input) {
    const browser = input.tools!.find((tool) => tool.name === "browser")!
    const completeStep = input.tools!.find((tool) => tool.name === "complete_step")!
    const complete = input.tools!.find((tool) => tool.name === "complete")!
    await browser.execute("page-one", { command: { type: "page" } }, input.signal)
    const candidate = { key: "confirmed", label: "计划原始说明" }, second = { key: "second", label: "第二项说明" }
    await completeStep.execute("discover-result", { stepId: "discover", representativeInput: { value: "explore" },
      result: [candidate, second], provenance: [{ source: "inference", outputPath: [], eventIds: ["page-one"],
        instruction: "根据当前页面的确认内容形成带稳定键的候选。" }] }, input.signal)
    await browser.execute("page-two", { command: { type: "page" } }, input.signal)
    const representative = { stepId: "detail",
      representativeInput: { key: "confirmed", label: "模型改写的说明" },
      result: "Confirmed", provenance: [toolProvenance("page-two", ["title"])],
      aggregate: { result: ["Confirmed"], provenance: [toolProvenance("page-two", ["paragraphs"])] } }
    await assert.rejects(completeStep.execute("detail-batch", { ...representative, aggregate: {
      result: ["Confirmed", "Confirmed-2"], provenance: [{ source: "inference", outputPath: [], eventIds: ["page-two"],
        instruction: "把多个输入结果拼成数组。" }] } }, input.signal), /representative_aggregate_invalid/)
    await completeStep.execute("detail-result", representative, input.signal)
    if (completeTask) await complete.execute("task-result", representative.aggregate, input.signal)
    return { outputText: "Confirmed" }
  } } } }
}

function twoStepPlanCandidate() {
  const collectionContract: TaskDataContract = { id: "discovered-values", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "array", items: { type: "object", properties: { key: { type: "string" }, label: { type: "string" } },
      required: ["key", "label"], additionalProperties: false }, maxItems: 2 } }
  const itemContract: TaskDataContract = { id: "detail-input", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "object", properties: { key: { type: "string" }, label: { type: "string" } },
      required: ["key", "label"], additionalProperties: false } }
  const detailContract: TaskDataContract = { id: "detail-output", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "string" } }
  const taskOutputContract: TaskDataContract = { id: "task-output", version: 1, dialect: "bat-value-schema/v1",
    schema: { type: "array", items: { type: "string" }, maxItems: 2 } }
  const discoverDone = { id: "discover-done", description: "候选集合已得到", predicate: { operator: "exists" as const,
    value: { source: "node" as const, nodeId: "discover", path: [] } } }
  const detailDone = { id: "detail-done", description: "所有详情已得到", predicate: { operator: "exists" as const,
    value: { source: "node" as const, nodeId: "detail", path: [] } } }
  return { summary: "发现集合后逐项读取", inputContract: openContract,
    outputContract: taskOutputContract, steps: [
      { id: "discover", title: "发现输入", goal: "得到待处理集合", dependsOn: [], inputContract: openContract,
        outputContract: collectionContract, input, invocation: { mode: "once" as const }, completion: [discoverDone], risks: [] },
      { id: "detail", title: "逐项处理", goal: "处理集合中的每一项", dependsOn: ["discover"], inputContract: itemContract,
        outputContract: detailContract, input: { source: "variable" as const, name: "item", path: [] },
    invocation: { mode: "each" as const, collection: { source: "node" as const, nodeId: "discover", path: [] },
          itemVariable: "item", stableKeyPath: ["key"], maxItems: 2, onItemFailure: "stop" as const }, completion: [detailDone], risks: [] },
    ], output: { source: "node" as const, nodeId: "detail", path: [] }, completion: [detailDone],
    authorizationScope: "仅限本次已确认任务" }
}

function taskAnnotations(eventId: string, resultPath: (string | number)[]) {
  return { replayEventIds: [eventId], continueOnMissingEventIds: [], inputBindings: [], repeatRegions: [],
    completion: [{ eventId, resultPath, description: "结果已显示" }],
    reuseBoundary: { description: "相同结构页面", assumptions: [], invalidationConditions: [] } }
}

function toolProvenance(eventId: string, resultPath: (string | number)[]) {
  return { source: "tool" as const, outputPath: [], eventId, resultPath }
}
function validation(chain: { id: string; version: number; digest: string }, mode: "sample" | "verification", value: JsonValue): TaskChainCommand {
  return { type: "validate_chain", requestId: randomUUID(), chain, mode, input: value }
}

function queuedModel(responses: unknown[]): AIModelProvider {
  const selection = { connectionId: randomUUID(), modelId: "fixture-model", reasoningEffort: "high" as const }
  return { selection: () => selection, async prepare() { return { selection, async generateObject(input) {
    const value = responses.shift(); if (!value) throw new Error("fixture_response_missing"); return input.parse(value)
  } } }, async prepareMain() { return { selection, async close() {}, async run(input) {
    await input.tools![0]!.execute("help", { command: { type: "request_help", reason: "confirmation", prompt: "确认当前任务" } }, input.signal)
    await input.tools![0]!.execute("page", { command: { type: "page" } }, input.signal)
    await input.tools![1]!.execute("complete", { result: { title: "Confirmed" }, provenance: annotations().outputMappings }, input.signal)
    return { outputText: "Confirmed" }
  } } } }
}

async function waitFor(condition: () => boolean, timeoutMs = 3000) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error("fixture_timeout")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function fakeBrowserExecutor(args: readonly string[]) {
  const value = args[1] === "session" ? args[2] === "start" ? { session_id: "abcd" }
    : { stopped: ["abcd"], failed: [], return_failures: [] }
    : args[1] === "tab" ? { tabs: [{ tab_id: 1, url: "https://example.com/", active: true, scope: "agent" }] }
      : args[1] === "request-help" ? { outcome: "continued" } : args[1] === "evaluate" ? { ok: true, tab_id: 1, value: { url: "https://example.com/", title: "Confirmed", links: [], headings: [], paragraphs: [] } } : args[1] === "observe" ? { tab_id: 1, text: '@e1 button "确认"', truncated: false }
        : { tab_id: 1 }
  return { stdout: JSON.stringify(value), exitCode: 0 }
}
