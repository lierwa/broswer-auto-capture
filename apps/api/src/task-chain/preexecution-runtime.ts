import { BrowserError, browserGrantLimits, type BrowserCommand, type BrowserFailure, type BrowserGrant,
  type BrowserHelpState, type BrowserSession } from "@browser-capture/browser"
import type { AIEvent } from "@browser-capture/contracts/ai"
import { jsonValueSchema, type JsonValue, type TaskBudget, type TaskDataContract } from "@browser-capture/contracts"
import { digestJson, RuntimeBudgetExceededError, stableUuid } from "@browser-capture/runtime"
import type { PreparedMainAIModel } from "../ai/model.js"
import type { BrowserService } from "../browser/service.js"
import { runBusinessPreexecutionAgent, type BusinessPreexecutionAgentInput } from "./exploration-agent.js"
import { collectUrls, explorationCapabilities, needsFreshObservation, opensAccessCircuit,
  traceObservation, traceOutput } from "./exploration-browser-support.js"
import { traceEvent } from "./exploration-trace.js"
import { PreexecutionOutputAccumulator, recordExample, type OutputFailure } from "./preexecution-output.js"
import { clonePreexecutionArtifact, type PreexecutionArtifact, type PreexecutionFeedback,
  type PreexecutionModelRun } from "./preexecution-trace.js"

type ManagedSession = Pick<BrowserSession, "state" | "beginStep"> & {
  command(command: BrowserCommand, signal?: AbortSignal): Promise<string | null>
}

export type BusinessPreexecutionRequest = Readonly<{
  taskId: string
  authorizationId: string
  browserRunId: string
  requirementVersion: number
  goal: string
  startUrl: string
  context?: JsonValue
  outputContract: TaskDataContract
  budget: TaskBudget
  signal: AbortSignal
  onArtifact?(artifact: PreexecutionArtifact): void
  onHumanWait?(waitpoint: BrowserHelpState): void
}>

export type PlannedPreexecutionStep = Readonly<{
  id: string
  goal: string
  outputContract: TaskDataContract
  budget: TaskBudget
  resolve(): { input: JsonValue; startUrl: string; context?: JsonValue }
}>

export type PlannedPreexecutionRequest = Readonly<{
  taskId: string
  authorizationId: string
  browserRunId: string
  requirementVersion: number
  startUrl: string
  budget: TaskBudget
  signal: AbortSignal
  steps: readonly PlannedPreexecutionStep[]
  onArtifact?(stepId: string, artifact: PreexecutionArtifact): void
  onStepCompleted(stepId: string, input: JsonValue, artifact: PreexecutionArtifact): void
  onHumanWait?(waitpoint: BrowserHelpState): void
}>

type Dependencies = Readonly<{
  browser: BrowserService
  model: PreparedMainAIModel
  onEvent(event: AIEvent): void
  registerGrant(grant: BrowserGrant): void
  releaseGrant(grant: BrowserGrant): void
}>

type PlannedDependencies = Omit<Dependencies, "model"> & Readonly<{
  modelForStep(stepId: string): Promise<PreparedMainAIModel>
}>

const wallTimeoutMs = 180_000
const repairableFailureLimit = 5

export async function runBusinessPreexecution(input: BusinessPreexecutionRequest,
  dependencies: Dependencies): Promise<PreexecutionArtifact> {
  const startUrl = new URL(input.startUrl).href
  const artifact = newArtifact(input, input.authorizationId, startUrl)
  const journal = new PreexecutionJournal(artifact, input.outputContract, input.onArtifact)
  try {
    assertBudget(input.budget)
    const grant = preexecutionGrant(input, startUrl)
    dependencies.registerGrant(grant)
    try {
      await dependencies.browser.run(grant, async (session, lifetime) => {
        const signal = AbortSignal.any([input.signal, lifetime])
        await runInSession(input, session, signal, dependencies.model, journal, dependencies.onEvent)
      }, input.signal, (state) => { journal.humanWait(state); input.onHumanWait?.(state) })
    } finally { dependencies.releaseGrant(grant) }
  } catch (error) {
    if (journal.state().status === "running") journal.terminal(terminalFailure(error), "agent", null, null)
  } finally {
    await settleBrowserCleanup(input, dependencies.browser, journal)
  }
  return clonePreexecutionArtifact(artifact)
}

export async function runPlannedPreexecution(input: PlannedPreexecutionRequest,
  dependencies: PlannedDependencies): Promise<Array<{ stepId: string; input: JsonValue; artifact: PreexecutionArtifact }>> {
  if (!input.steps.length) throw new Error("preexecution_plan_step_required")
  assertBudget(input.budget)
  const grantInput: BusinessPreexecutionRequest = { taskId: input.taskId, authorizationId: input.authorizationId,
    browserRunId: input.browserRunId, requirementVersion: input.requirementVersion, goal: "计划预执行",
    startUrl: input.startUrl, outputContract: input.steps[0]!.outputContract, budget: input.budget, signal: input.signal }
  const grant = preexecutionGrant(grantInput, new URL(input.startUrl).href)
  const completed: Array<{ stepId: string; input: JsonValue; artifact: PreexecutionArtifact }> = []
  const journals: PreexecutionJournal[] = []
  dependencies.registerGrant(grant)
  try {
    await dependencies.browser.run(grant, async (session, lifetime) => {
      const signal = AbortSignal.any([input.signal, lifetime])
      for (const step of input.steps) {
        signal.throwIfAborted()
        const resolved = step.resolve(), startUrl = new URL(resolved.startUrl).href
        const request: BusinessPreexecutionRequest = { taskId: input.taskId,
          authorizationId: stableUuid(input.authorizationId, step.id), browserRunId: input.browserRunId,
          requirementVersion: input.requirementVersion, goal: step.goal, startUrl,
          context: resolved.context ?? resolved.input, outputContract: step.outputContract, budget: step.budget, signal }
        const artifact = newArtifact(request, request.authorizationId, startUrl)
        const journal = new PreexecutionJournal(artifact, step.outputContract,
          (value) => input.onArtifact?.(step.id, value))
        journals.push(journal)
        const model = await dependencies.modelForStep(step.id)
        try { await runInSession(request, session, signal, model, journal, dependencies.onEvent) }
        catch (error) {
          if (journal.state().status === "running") journal.terminal(terminalFailure(error), "agent", null, null)
          throw error
        }
        if (artifact.status !== "completed" || !artifact.finishAccepted) break
        completed.push({ stepId: step.id, input: resolved.input, artifact })
        input.onStepCompleted(step.id, resolved.input, clonePreexecutionArtifact(artifact))
      }
    }, input.signal, (state) => { journals.at(-1)?.humanWait(state); input.onHumanWait?.(state) })
  } catch (error) {
    const current = journals.at(-1)
    if (current?.state().status === "running") current.terminal(terminalFailure(error), "agent", null, null)
  } finally {
    dependencies.releaseGrant(grant)
    const closed = await browserClosed(input.taskId, dependencies.browser)
    for (const journal of journals) {
      journal.markClosed(closed)
      if (!closed) journal.cleanupFailed()
    }
  }
  return completed.map((item) => ({ ...item, artifact: clonePreexecutionArtifact(item.artifact) }))
}

async function runInSession(input: BusinessPreexecutionRequest, session: ManagedSession, signal: AbortSignal,
  model: PreparedMainAIModel, journal: PreexecutionJournal, onEvent: (event: AIEvent) => void) {
  let agentStarted = false
  try {
    const browser = browserExecution(session, signal, input.budget, input.startUrl, input.context, journal)
    await browser.initialObservation()
    agentStarted = true
    await runBusinessPreexecutionAgent(model, agentInput(input, signal, browser.execute, journal, onEvent))
  } finally {
    if (!agentStarted) await model.close().catch((error) => {
      journal.terminal(terminalFailure(error, "model_cleanup_failed"), "agent", null, null)
    })
  }
}

function newArtifact(input: BusinessPreexecutionRequest, runId: string, startUrl: string): PreexecutionArtifact {
  const artifactInput = input.context ?? { goal: input.goal, startUrl, outputContract: input.outputContract }
  return { runId, status: "running", input: jsonValueSchema.parse(JSON.parse(JSON.stringify(artifactInput))),
    browserEvents: [], outputWrites: [], feedback: [], finishAccepted: false, modelRuns: [],
    browserRunId: input.browserRunId, closed: false }
}

class PreexecutionJournal {
  private readonly output: PreexecutionOutputAccumulator
  private consecutiveFailures = 0
  private eventCursor = 0
  private readonly reportedToolFailures = new Set<string>()

  constructor(private readonly artifact: PreexecutionArtifact, contract: TaskDataContract,
    private readonly onArtifact?: (artifact: PreexecutionArtifact) => void) {
    this.output = new PreexecutionOutputAccumulator(contract)
  }

  state() {
    const last = this.artifact.feedback.at(-1)
    return { status: this.artifact.status, finishAccepted: this.artifact.finishAccepted,
      lastFeedback: last ? feedbackPayload(last) : null }
  }

  success() {
    this.consecutiveFailures = 0
    if (this.artifact.status === "waiting_for_human") this.artifact.status = "running"
    this.emit()
  }

  browserEvent(event: PreexecutionArtifact["browserEvents"][number]) {
    this.artifact.browserEvents.push(event); this.emit()
  }

  recordOutput(raw: unknown, callId: string, modelRunId: string, currentUrl: string | null): JsonValue {
    this.assertRunning()
    const attempt = this.output.record(raw, `write_${this.artifact.outputWrites.length + 1}`)
    if (!attempt.operation || attempt.value === undefined || !attempt.response.ok) {
      return this.repairable(attempt.response as OutputFailure, "record_output", callId, modelRunId)
    }
    const browserEventIds = this.artifact.browserEvents.slice(this.eventCursor).map((event) => event.id)
    this.eventCursor = this.artifact.browserEvents.length
    this.artifact.outputWrites.push({ id: attempt.response.writeId, at: new Date().toISOString(), callId, modelRunId,
      operation: attempt.operation, browserEventIds, currentUrl })
    this.success()
    return attempt.response
  }

  finish(raw: unknown, callId: string, modelRunId: string): JsonValue {
    this.assertRunning()
    const attempt = this.output.finish(raw)
    if (!attempt.response.ok || attempt.value === undefined) {
      return this.repairable(attempt.response as OutputFailure, "finish", callId, modelRunId)
    }
    this.artifact.output = attempt.value; this.artifact.outputDigest = digestJson(attempt.value)
    this.artifact.finishAccepted = true; this.artifact.status = "completed"; this.success()
    return attempt.response
  }

  repairable(failure: OutputFailure, tool: string, callId: string | null, modelRunId: string | null) {
    this.assertRunning()
    const normalized = { ...failure,
      pendingPaths: failure.pendingPaths.length ? failure.pendingPaths : this.output.pendingPaths() }
    this.append(normalized, "repairable", tool, callId, modelRunId)
    this.consecutiveFailures++
    if (this.consecutiveFailures >= repairableFailureLimit) {
      this.artifact.status = "failed"
      this.append({ ...normalized, code: "repairable_failure_limit", retryable: false,
        issues: [{ path: [], expected: "最多 5 次连续可修复失败", received: String(this.consecutiveFailures),
          message: "连续可修复失败已达到上限" }] }, "terminal", tool, callId, modelRunId)
    }
    return normalized
  }

  external(failure: OutputFailure, tool: string, callId: string, modelRunId: string) {
    const waiting = ["authentication_required", "verification_required", "manual_required"].includes(failure.code)
    this.artifact.status = waiting ? "waiting_for_human" : "failed"
    this.append({ ...failure, retryable: false }, "external", tool, callId, modelRunId)
    return { ...failure, retryable: false }
  }

  terminal(failure: OutputFailure, tool: string, callId: string | null, modelRunId: string | null) {
    if (this.artifact.status === "completed") return
    this.artifact.status = "failed"
    this.append({ ...failure, retryable: false }, "terminal", tool, callId, modelRunId)
  }

  runtimeToolFailure(failure: RuntimeFailureEvent, modelRunId: string) {
    if (this.reportedToolFailures.has(failure.callId) || this.artifact.status !== "running") return
    this.reportedToolFailures.add(failure.callId)
    const payload: OutputFailure = { ok: false, code: "tool_execution_failed", retryable: true,
      issues: [{ path: [], expected: `合法的 ${failure.toolName} 工具参数`, received: failure.error.code,
        message: failure.error.message.slice(0, 500) }], pendingPaths: this.output.pendingPaths(),
      example: failure.toolName === "finish" ? {} : failure.toolName === "browser"
        ? { command: { type: "observe" } } : recordExample(this.output.contract) }
    return this.repairable(payload, failure.toolName, failure.callId, modelRunId)
  }

  completionFeedback(modelRunId: string) {
    this.assertRunning()
    const attempt = this.output.finish({})
    const failure = !attempt.response.ok ? attempt.response : <OutputFailure>{ ok: false, code: "finish_required", retryable: true,
      issues: [{ path: [], expected: "finish({})", received: "model turn ended", message: "业务输出已完整，但模型尚未调用 finish" }],
      pendingPaths: [], example: {} }
    return this.repairable(failure, "finish", null, modelRunId)
  }

  continuationLimit(modelRunId: string) {
    this.terminal({ ok: false, code: "continuation_limit_exceeded", retryable: false,
      issues: [{ path: [], expected: "2 次 continuation 内 finish 被宿主接受", received: "unfinished",
        message: "同会话 continuation 次数已达到上限" }], pendingPaths: this.output.pendingPaths(), example: {} },
    "finish", null, modelRunId)
  }

  modelRun(run: PreexecutionModelRun) {
    const index = this.artifact.modelRuns.findIndex((item) => item.runId === run.runId)
    if (index === -1) this.artifact.modelRuns.push(structuredClone(run))
    else this.artifact.modelRuns[index] = structuredClone(run)
    this.emit()
  }

  humanWait(state: BrowserHelpState) {
    this.artifact.status = state.status === "waiting" ? "waiting_for_human" : "running"
    if (state.status === "completed") this.consecutiveFailures = 0
    this.emit()
  }

  markClosed(closed: boolean) { this.artifact.closed = closed; this.emit() }

  currentUrl() { return this.artifact.browserEvents.at(-1)?.observation?.url ?? null }

  cleanupFailed() {
    this.artifact.status = "failed"
    this.append(terminalFailure(new Error("cleanup_failed"), "cleanup_failed"), "terminal", "browser", null, null)
  }

  private assertRunning() {
    if (this.artifact.status !== "running") throw new Error(`preexecution_not_running:${this.artifact.status}`)
  }

  private append(failure: OutputFailure, category: PreexecutionFeedback["category"], tool: string,
    callId: string | null, modelRunId: string | null) {
    const { ok: _, ...payload } = failure
    this.artifact.feedback.push({ ...payload, at: new Date().toISOString(), category, tool, callId, modelRunId })
    this.emit()
  }

  private emit() { this.onArtifact?.(clonePreexecutionArtifact(this.artifact)) }
}

type RuntimeFailureEvent = Parameters<BusinessPreexecutionAgentInput["runtimeToolFailure"]>[0]

function agentInput(input: BusinessPreexecutionRequest, signal: AbortSignal,
  execute: BusinessPreexecutionAgentInput["execute"], journal: PreexecutionJournal,
  onEvent: (event: AIEvent) => void): BusinessPreexecutionAgentInput {
  return { jobId: input.authorizationId, goal: input.goal, startUrl: input.startUrl,
    ...(input.context === undefined ? {} : { context: input.context }),
    outputContract: input.outputContract, signal, onEvent, execute,
    recordOutput: (raw, callId, modelRunId) => journal.recordOutput(raw, callId, modelRunId, journal.currentUrl()),
    finish: (raw, callId, modelRunId) => journal.finish(raw, callId, modelRunId),
    repairable: (failure, tool, callId, modelRunId) => journal.repairable(failure, tool, callId, modelRunId),
    runtimeToolFailure: (failure, modelRunId) => journal.runtimeToolFailure(failure, modelRunId),
    completionFeedback: (modelRunId) => journal.completionFeedback(modelRunId),
    continuationLimit: (modelRunId) => journal.continuationLimit(modelRunId),
    state: () => journal.state(), onModelRun: (run) => journal.modelRun(run) }
}

function browserExecution(session: ManagedSession, signal: AbortSignal, budget: TaskBudget, startUrl: string,
  context: JsonValue | undefined, journal: PreexecutionJournal) {
  let browserActiveMs = 0, accessCircuit: BrowserError | null = null
  let executionQueue: Promise<void> = Promise.resolve()
  const allowedNavigate = new Set(collectUrls([startUrl, context]))
  const command = async (value: BrowserCommand, commandSignal = signal) => {
    if (journal.state().status === "failed" || journal.state().status === "completed") throw new Error("preexecution_stopped")
    if (journal.state().status === "waiting_for_human" && value.type !== "request_help") throw new Error("preexecution_waiting_for_human")
    if (accessCircuit && value.type !== "request_help") throw accessCircuit
    if (value.type === "navigate" && !allowedNavigate.has(new URL(value.url).href)) throw new BrowserError("permission_denied")
    const remainingMs = budget.maxActiveMs - browserActiveMs
    if (remainingMs <= 0) throw new RuntimeBudgetExceededError("预执行浏览器活动时间预算已用尽。")
    session.beginStep(Math.min(browserGrantLimits.maxCommands, budget.maxBrowserCommands),
      Math.min(wallTimeoutMs, remainingMs), commandSignal, () => {})
    const startedAt = Date.now()
    try {
      const result = await session.command(value, commandSignal)
      if (value.type === "request_help") accessCircuit = null
      journal.success()
      return result
    } catch (error) {
      if (error instanceof BrowserError && opensAccessCircuit(error.code, value.type)) accessCircuit = error
      throw error
    } finally { browserActiveMs += Math.max(0, Date.now() - startedAt) }
  }
  const executeNow: BusinessPreexecutionAgentInput["execute"] = async (value, callId, toolSignal, modelRunId) => {
    try {
      const raw = await command(value, toolSignal)
      if (needsFreshObservation(value)) await command({ type: "observe" }, toolSignal)
      const inspection = session.state(), parsed = traceOutput(raw)
      const output = value.type === "observe" && inspection ? traceObservation(inspection)
        : parsed === null && inspection && needsFreshObservation(value) ? traceObservation(inspection) : parsed
      for (const url of collectUrls([inspection?.url])) allowedNavigate.add(url)
      const entry = traceEvent(callId, value, output, inspection)
      journal.browserEvent(entry)
      return jsonValueSchema.parse(entry)
    } catch (error) {
      const reason = error instanceof BrowserError ? error.code : terminalCode(error)
      journal.browserEvent(traceEvent(callId, value, null, session.state(), reason))
      return browserFailure(error, value, callId, modelRunId, journal)
    }
  }
  const execute: BusinessPreexecutionAgentInput["execute"] = (value, callId, toolSignal, modelRunId) => {
    // WHY：Pi 可以在一次 assistant turn 中并行发出多个工具调用；一个产品运行只有一个 BrowserSession。
    // 每个语义动作和它的 fresh observation 必须作为整体串行，否则后到调用会被 BrowserSession 当成越权并破坏证据顺序。
    const pending = executionQueue.then(() => executeNow(value, callId, toolSignal, modelRunId))
    executionQueue = pending.then(() => undefined, () => undefined)
    return pending
  }
  const initialObservation = async () => {
    try {
      await command({ type: "observe" })
      journal.browserEvent(traceEvent("initial", { type: "observe" }, null, session.state()))
    } catch (error) {
      if (!(error instanceof BrowserError) || error.code !== "origin_denied") throw error
      journal.browserEvent(traceEvent("initial", { type: "observe" }, null, null, "origin_denied"))
    }
  }
  return { execute, initialObservation }
}

function browserFailure(error: unknown, command: BrowserCommand, callId: string, modelRunId: string,
  journal: PreexecutionJournal): JsonValue {
  if (!(error instanceof BrowserError)) {
    const failure = terminalFailure(error)
    journal.terminal(failure, "browser", callId, modelRunId)
    throw error
  }
  const failure: OutputFailure = { ok: false, code: error.code, retryable: true,
    issues: [{ path: [], expected: "当前授权页面上的可执行浏览器动作", received: error.code,
      message: `浏览器命令 ${command.type} 未完成：${error.code}` }], pendingPaths: [],
    example: { command: { type: "observe" } } }
  if (externalFailure(error.code)) return journal.external(failure, "browser", callId, modelRunId)
  if (terminalBrowserFailure(error.code)) {
    journal.terminal(failure, "browser", callId, modelRunId); throw error
  }
  return journal.repairable(failure, "browser", callId, modelRunId)
}

function externalFailure(code: BrowserFailure) {
  return ["authentication_required", "verification_required", "manual_required", "rate_limited", "access_denied",
    "origin_denied", "transient_failure", "readiness_timeout"].includes(code)
}

function terminalBrowserFailure(code: BrowserFailure) {
  return ["busy", "cleanup_required", "cancelled", "budget_exceeded", "session_closed"].includes(code)
}

function terminalFailure(error: unknown, code = terminalCode(error)): OutputFailure {
  return { ok: false, code, retryable: false, issues: [{ path: [], expected: "可继续的预执行运行",
    received: code, message: safeTerminalMessage(error, code) }], pendingPaths: [], example: {} }
}

function terminalCode(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "cancelled"
  if (error instanceof RuntimeBudgetExceededError) return "budget_exceeded"
  if (error instanceof BrowserError) return error.code
  if (error instanceof Error && /model_account/i.test(error.message)) return "model_account_failed"
  if (error instanceof Error && /pi_agent_session/i.test(error.message)) return "pi_agent_session_failed"
  return "preexecution_failed"
}

function safeTerminalMessage(error: unknown, code: string) {
  if (error instanceof DOMException && error.name === "AbortError") return "预执行已取消"
  if (error instanceof RuntimeBudgetExceededError) return error.message
  if (error instanceof BrowserError) return `浏览器运行终止：${error.code}`
  return `预执行终止：${code}`
}

function preexecutionGrant(input: BusinessPreexecutionRequest, startUrl: string): BrowserGrant {
  return { taskId: input.taskId, runId: input.browserRunId, ownerId: input.authorizationId,
    ...(process.env.BROWSER_SKILL_BROWSER ? { browserInstanceId: process.env.BROWSER_SKILL_BROWSER } : {}),
    requirementVersion: input.requirementVersion, purpose: "exploration", allowedOrigins: [new URL(startUrl).origin],
    actions: explorationCapabilities, maxCommands: Math.min(browserGrantLimits.maxCommands, input.budget.maxBrowserCommands),
    timeoutMs: Math.min(browserGrantLimits.timeoutMs, Math.max(wallTimeoutMs, input.budget.maxActiveMs)) }
}

function assertBudget(budget: TaskBudget) {
  if (budget.maxBrowserCommands < 1) throw new RuntimeBudgetExceededError("预执行需要浏览器命令预算。")
  if (budget.maxActiveMs < 1000) throw new RuntimeBudgetExceededError("预执行活动时间预算过小。")
}

async function settleBrowserCleanup(input: BusinessPreexecutionRequest, browser: BrowserService,
  journal: PreexecutionJournal) {
  const closed = await browserClosed(input.taskId, browser)
  journal.markClosed(closed)
  if (!closed) journal.cleanupFailed()
}

async function browserClosed(taskId: string, browser: BrowserService) {
  const state = await browser.snapshot(taskId).catch(() => null)
  return state !== null && !state.cleanupRequired && state.record?.status !== "cleanup_required"
}

function feedbackPayload(feedback: PreexecutionFeedback): OutputFailure {
  return { ok: false, code: feedback.code, retryable: feedback.retryable,
    issues: structuredClone(feedback.issues), pendingPaths: [...feedback.pendingPaths], example: structuredClone(feedback.example) }
}
