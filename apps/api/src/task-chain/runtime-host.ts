import { z } from "zod"
import {
  CONTRACT_VERSION, parseTaskValue, taskRunSchema, type JsonValue, type TaskChain, type TaskRun,
  type TaskDataContract, type TaskBudget, type TaskConsumption, type TaskRunMode, type TaskRunRequest, type ValueSchema, type VersionReference,
} from "@browser-capture/contracts"
import type { AIEvent } from "@browser-capture/contracts/ai"
import { BrowserError, TaskChainBrowserAdapter, taskChainBrowserActions,
  type BrowserCommand, type BrowserFailure, type BrowserGrant, type BrowserHelpState } from "@browser-capture/browser"
import {
  TaskChainRuntime, digestJson, executableChainDigest, stableUuid,
  RuntimeBudgetExceededError, type InvokeChainInvocation, type RuntimeControl, type TaskChainCapabilities,
} from "@browser-capture/runtime"
import type { AIModelProvider, PreparedAIModel, PreparedMainAIModel } from "../ai/model.js"
import type { BrowserService } from "../browser/service.js"
import type { TaskContractRepository } from "./repository.js"
import { explorationStepSubmissionSchema, traceEvent, validateExplorationResult,
  type ExplorationStepResult, type ExplorationTrace } from "./exploration-trace.js"
import { runExplorationAgent } from "./exploration-agent.js"
import { TaskBudgetLedger, type BudgetSnapshot } from "./budget-ledger.js"

export type RuntimeCapabilityFactory = (input: Readonly<{
  taskId: string; authorizationId: string; purpose: "sample" | "verification" | "replay";
}>) => TaskChainCapabilities | Promise<TaskChainCapabilities>

type RuntimeGroup = Readonly<{
  taskId: string; authorizationId: string; browserRunId: string; requirementVersion: number;
  purpose: "sample" | "verification" | "replay"; chains: TaskChain[]; input: JsonValue; signal: AbortSignal;
  budget: TaskBudget; consumed: TaskConsumption; scopeConsumption: Readonly<Record<string, TaskConsumption>>;
  scopeBudgets?: Readonly<Record<string, TaskBudget>>;
  onConsumption?: (scopeId: string, snapshot: BudgetSnapshot) => void;
}>

const explorationCapabilities: BrowserGrant["actions"] = ["navigate", "observe", "click", "hover", "fill", "press", "select",
  "tabs", "tab_open", "tab_select", "tab_close", "page", "read", "follow", "request_help"]
const explorationWallTimeoutMs = 180_000

export class TaskRuntimeHost {
  private readonly activeGrants = new Map<string, string>()
  constructor(private readonly repository: TaskContractRepository, private readonly browser: BrowserService,
    private readonly ai: AIModelProvider, private readonly factory?: RuntimeCapabilityFactory) {
    browser.setAuthorizationValidator((grant) => {
      if (this.activeGrants.get(grant.runId) !== grantSignature(grant)) throw new Error("task_chain_grant_not_active")
    })
  }

  async explore(input: Readonly<{ taskId: string; authorizationId: string; browserRunId: string;
    requirementVersion: number; outputContract: TaskDataContract; budget: TaskBudget; representativeInput: JsonValue; context: JsonValue; signal: AbortSignal;
    stepContracts?: ReadonlyArray<{ id: string; inputContract: TaskDataContract; outputContract: TaskDataContract;
      invocation: { mode: "once" } | { mode: "each" | "batch"; maxItems: number } }>;
    acceptStepResult?(result: ExplorationStepResult): ExplorationStepResult;
    onModelEscalation?(selection: PreparedMainAIModel["selection"], reason: string): void;
    onTrace?(trace: ExplorationTrace): void; onHumanWait?(waitpoint: BrowserHelpState): void }>, model: PreparedMainAIModel,
    onEvent: (event: AIEvent) => void): Promise<ExplorationTrace> {
    let sessionStarted = false
    const trace: ExplorationTrace = { jobId: input.authorizationId, browserRunId: input.browserRunId, input: input.representativeInput,
      events: [], result: null, calls: 0, conclusion: "", closed: false,
      ...(input.stepContracts ? { stepResults: [] } : {}) }
    try {
    if (input.budget.maxBrowserCommands === 0) throw new Error("exploration_browser_budget_required")
    if (input.budget.maxActiveMs < 1000) throw new Error("exploration_active_budget_too_small")
    // WHY：代表输入中已有 URL 时，本次探索只授权该输入；固定站点任务没有 URL 输入时才回退到已确认上下文。
    const representativeUrls = collectUrls([input.representativeInput])
    const navigableUrls = new Set(representativeUrls.length ? representativeUrls : collectUrls([input.context]))
    const representativeOrigins = [...new Set(representativeUrls.map((value) => new URL(value).origin))]
    const allowedOrigins = representativeOrigins.length ? representativeOrigins : collectOrigins([input.context])
    if (!allowedOrigins.length) throw new Error("exploration_origin_required")
    const grant: BrowserGrant = { taskId: input.taskId, runId: input.browserRunId, ownerId: input.authorizationId,
      ...(process.env.BROWSER_SKILL_BROWSER ? { browserInstanceId: process.env.BROWSER_SKILL_BROWSER } : {}),
      requirementVersion: input.requirementVersion, purpose: "exploration", allowedOrigins, actions: explorationCapabilities,
      maxCommands: Math.min(3850, input.budget.maxBrowserCommands),
      timeoutMs: Math.min(1_440_000, Math.max(explorationWallTimeoutMs, input.budget.maxActiveMs)) }
    this.activeGrants.set(grant.runId, grantSignature(grant))
    try {
      return await this.browser.run(grant, async (session, lifetime) => {
        const signal = AbortSignal.any([input.signal, lifetime])
        let browserActiveMs = 0
        let accessCircuit: BrowserError | null = null
        const command = async (value: BrowserCommand) => {
          // WHY：探索可以修正选择器，但认证、限流或传输中断后继续发浏览器命令只会放大外部压力。
          // 新的显式 authoring 请求才重新开放访问；这里不猜测站点冷却时间，也不隐藏重试。
          if (accessCircuit && value.type !== "request_help") throw accessCircuit
          // WHY：局部参数、定位或授权错误属于模型可修正错误，不能直接升级成人工验证。
          // 模型必须先重新观察页面；只有真实页面事实或已打开的访问熔断才能请求用户处理。
          if (value.type === "request_help" && !accessCircuit && trace.events.at(-1)?.status === "failed") {
            throw new BrowserError("permission_denied")
          }
          // WHY：模型不能凭站点知识构造隐藏入口；navigate 只接受任务已有 URL，后续跨页面必须沿 page 证据使用 follow。
          if (value.type === "navigate" && !navigableUrls.has(new URL(value.url).href)) throw new BrowserError("permission_denied")
          const remainingMs = input.budget.maxActiveMs - browserActiveMs
          if (remainingMs <= 0) throw new RuntimeBudgetExceededError("探索活动时间预算已用尽。")
          // WHY：步骤 activeMs 约束真实浏览器动作；模型等待由探索会话墙钟单独兜底，不能挤占未来固定链路的动作预算。
          session.beginStep(grant.maxCommands, Math.min(grant.timeoutMs, remainingMs), signal, () => {})
          const startedAt = Date.now()
          try {
            const result = await session.command(value)
            if (value.type === "request_help") accessCircuit = null
            return result
          }
          catch (error) {
            if (error instanceof BrowserError && opensAccessCircuit(error.code, value.type)) accessCircuit = error
            throw error
          }
          finally { browserActiveMs += Math.max(0, Date.now() - startedAt) }
        }
        try {
          await command({ type: "observe" })
          trace.events.push(traceEvent("initial", { type: "observe" }, null, session.state()))
        } catch (error) {
          // WHY：新会话可能先暴露用户原有且未授权的活动标签；它不是本任务页面，忽略后让首个显式导航创建任务标签。
          if (!(error instanceof BrowserError) || error.code !== "origin_denied") throw error
          trace.events.push(traceEvent("initial", { type: "observe" }, null, null, "origin_denied"))
        }
        let calls = 0
        sessionStarted = true
        const agentInput: Parameters<typeof runExplorationAgent>[1] = {
          jobId: input.authorizationId, context: input.context, signal, onEvent: (event) => {
            if (event.type === "generation.completed") { calls++; trace.calls = calls }
            onEvent(event)
          },
          execute: async (value, callId, toolSignal) => {
            toolSignal.throwIfAborted()
            try {
              const raw = await command(value)
              if (needsFreshObservation(value)) await command({ type: "observe" })
              const inspection = session.state()
              const parsed = traceOutput(raw)
              const output = value.type === "observe" && inspection ? traceObservation(inspection)
                : parsed === null && inspection && needsFreshObservation(value) ? traceObservation(inspection) : parsed
              // WHY：后续步骤只能回到本会话已经真实到达的精确页面；不能授权模型提交或拼接出来的 URL。
              for (const url of collectUrls([inspection?.url])) navigableUrls.add(url)
              const entry = traceEvent(callId, value, output, inspection)
              trace.events.push(entry)
              input.onTrace?.(trace)
              return z.json().parse(entry)
            } catch (error) {
              // WHY：持久轨迹只记录受控错误类别；底层 stderr 可能含页面数据，且不能让浏览器阻断被误写成模型漏交结果。
              const reason = error instanceof BrowserError ? error.code : "tool_failed"
              trace.events.push(traceEvent(callId, value, null, session.state(), reason))
              input.onTrace?.(trace)
              throw error
            }
          },
          ...(input.stepContracts ? { completeStep: (raw: unknown) => {
            const submission = explorationStepSubmissionSchema.parse(raw)
            const step = input.stepContracts!.find((item) => item.id === submission.stepId)
            if (!step) throw new Error("exploration_step_not_found")
            if (trace.stepResults!.some((item) => item.stepId === step.id)) throw new Error("exploration_step_duplicate")
            const representativeInput = parseTaskValue(step.inputContract, submission.representativeInput)
            const result = validateExplorationResult({ result: submission.result, provenance: submission.provenance },
              step.outputContract, trace.events)
            assertTraceUrls(result.result, trace)
            if (step.invocation.mode !== "each" && submission.aggregate) throw new Error("exploration_step_aggregate_unexpected")
            if (step.invocation.mode === "each" && !submission.aggregate) throw new Error("exploration_step_aggregate_required")
            const runtimeResult = step.invocation.mode !== "each" ? result : validateExplorationResult(submission.aggregate,
              { ...step.outputContract, schema: { type: "array", items: step.outputContract.schema, maxItems: step.invocation.maxItems } }, trace.events)
            assertTraceUrls(runtimeResult.result, trace)
            const proposed = { stepId: step.id, input: representativeInput, result, runtimeResult }
            const accepted = input.acceptStepResult
              ? input.acceptStepResult(proposed) : proposed
            trace.stepResults!.push(accepted)
            input.onTrace?.(trace)
            return { accepted: true }
          } } : {}),
          complete: (raw) => {
            const completed = validateExplorationResult(raw, input.outputContract, trace.events)
            assertTraceUrls(completed.result, trace)
            trace.result = completed
            input.onTrace?.(trace)
            return { accepted: true }
          },
          completionStatus: () => trace.result || input.stepContracts !== undefined
            && trace.stepResults?.length === input.stepContracts.length ? null
              : input.stepContracts === undefined ? "没有调用 complete 提交业务结果。"
                : `还有 ${input.stepContracts.length - (trace.stepResults?.length ?? 0)} 个步骤没有调用 complete_step。`,
        }
        let result = await runExplorationAgent(model, agentInput)
        const allStepsSubmitted = () => input.stepContracts !== undefined
          && trace.stepResults?.length === input.stepContracts.length
        if (!trace.result && !allStepsSubmitted() && this.ai.strongerSelection) {
          const selection = await this.ai.strongerSelection(model.selection, signal)
          if (selection && (selection.modelId !== model.selection.modelId
            || selection.reasoningEffort !== model.selection.reasoningEffort)) {
            input.onModelEscalation?.(selection, "exploration_business_result_missing")
            result = await runExplorationAgent(await this.ai.prepareMain(selection, "exploration"), agentInput)
          }
        }
        if (!trace.result && !allStepsSubmitted()) throw incompleteExplorationError(trace)
        trace.calls = calls; trace.conclusion = result.outputText
        return trace
      }, input.signal, input.onHumanWait)
    } finally { this.activeGrants.delete(grant.runId) }
    } finally {
      if (!sessionStarted) await model.close()
      const browser = await this.browser.snapshot(input.taskId).catch(() => null)
      trace.closed = browser !== null && !browser.cleanupRequired && browser.record?.status !== "cleanup_required"
      input.onTrace?.(trace)
    }
  }

  async group<T>(input: RuntimeGroup, work: (execute: (chain: TaskChain, request: TaskRunRequest,
    control?: RuntimeControl) => Promise<TaskRun>) => Promise<T>) {
    const scopes = new Map(input.chains.map((chain) => [chain.stepId, { budget: input.scopeBudgets?.[chain.stepId] ?? chain.budget,
      consumed: input.scopeConsumption[chain.stepId] ?? zeroConsumption() }]))
    const ledger = new TaskBudgetLedger(input.budget, input.consumed, scopes, input.onConsumption)
    const closure = this.chainClosure(input.taskId, input.chains)
    const injected = await this.factory?.({ taskId: input.taskId, authorizationId: input.authorizationId, purpose: input.purpose })
    if (injected) return work(this.executor(injected, input.purpose, input.signal, ledger, 0))
    const actions = [...new Set(closure.flatMap(taskChainBrowserActions))]
    if (!actions.length) {
      const hasLocalBrowserNode = closure.some((chain) => chain.nodes.some((node) => node.kind === "browser"
        || node.kind === "capability" && node.capability.name.startsWith("browser.")))
      if (!hasLocalBrowserNode) return work(this.executor({}, input.purpose, input.signal, ledger, 0))
      const local = new TaskChainBrowserAdapter({ command: async () => { throw new BrowserError("capability_unsupported") }, state: () => null })
      return work(this.executor({ browser: local.browser, capability: local.capability }, input.purpose, input.signal, ledger, 0))
    }
    const grant = browserGrant(input, closure, actions)
    const browserScopes = new Set(input.chains.filter((chain) =>
      this.chainClosure(input.taskId, [chain]).some((item) => taskChainBrowserActions(item).length)).map((chain) => chain.stepId))
    this.activeGrants.set(grant.runId, grantSignature(grant))
    try {
      return await this.browser.run(grant, async (session, lifetime) => {
        const adapter = new TaskChainBrowserAdapter(session)
        const prepare = (scopeId: string) => {
          if (!browserScopes.has(scopeId)) return
          const remaining = ledger.remaining(scopeId)
          if (remaining.maxBrowserCommands < 1 || remaining.maxActiveMs < 1) throw new RuntimeBudgetExceededError("浏览器预算已用尽。")
          session.beginStep(Math.min(remaining.maxBrowserCommands, grant.maxCommands),
            Math.min(remaining.maxActiveMs, grant.timeoutMs), lifetime,
            () => ledger.account(scopeId, { browserCommands: 1 }))
        }
        return work(this.executor({ capability: adapter.capability, browser: adapter.browser, observe: adapter.observe, human: adapter.human,
          verifyResume: adapter.verifyResume, activeElapsedMs: session.activeElapsedMs.bind(session) },
        input.purpose, AbortSignal.any([input.signal, lifetime]), ledger, 0, undefined, prepare))
      }, input.signal)
    } finally { this.activeGrants.delete(grant.runId) }
  }

  private executor(base: TaskChainCapabilities, mode: TaskRunMode, signal: AbortSignal, ledger: TaskBudgetLedger,
    depth: number, parentScope?: string, prepare?: (scopeId: string) => void) {
    return async (chain: TaskChain, request: TaskRunRequest, control?: RuntimeControl): Promise<TaskRun> => {
      const scopeId = parentScope ?? chain.stepId
      if (depth >= Math.min(chain.budget.maxDepth, ledger.depthLimit(scopeId))) throw new Error("chain_depth_exceeded")
      if (depth === 0) {
        if (!control?.checkpoint) ledger.account(scopeId, { invocations: 1 })
        prepare?.(scopeId)
      }
      const capabilities: TaskChainCapabilities = { ...base,
        ...(prepare ? { browserCommandCount: () => ledger.scopeConsumption(scopeId).browserCommands } : {}),
        accountConsumption: (delta, accountingMode) => {
          const { activeMs: _childActiveMs, ...withoutActiveMs } = delta
          const adjusted = depth === 0 ? delta : withoutActiveMs
          ledger.account(scopeId, adjusted, accountingMode)
          base.accountConsumption?.(delta, accountingMode)
        },
        llm: base.llm ?? ((invocation) => this.llm(invocation.node.model, invocation.node.instruction,
          invocation.input, invocation.node.outputContract.schema,
          AbortSignal.any([invocation.signal, AbortSignal.timeout(invocation.node.timeoutMs)]))),
        persist: (run) => { this.repository.saveRun(run) },
        invoke: base.invoke ?? ((invocation) => this.invokeChild(base, mode, signal, ledger, depth, scopeId, invocation)),
      }
      return new TaskChainRuntime().execute({ chain, request, capabilities,
        control: { ...control, signal: control?.signal ? AbortSignal.any([signal, control.signal]) : signal } })
    }
  }

  private async invokeChild(base: TaskChainCapabilities, mode: TaskRunMode, signal: AbortSignal,
    ledger: TaskBudgetLedger, depth: number, scopeId: string, invocation: InvokeChainInvocation) {
    const child = this.repository.chain(invocation.parent.taskId, invocation.chain.id,
      invocation.chain.version, invocation.chain.digest)
    const request = requestForChild(invocation.parent, child, invocation.input, invocation.invocationId, mode)
    const existing = this.repository.runs(invocation.parent.taskId)
      .find((run) => run.binding.runId === request.binding.runId)
    if (existing && !["paused", "waiting_for_human"].includes(existing.status)) return invokedResult(child, existing)
    const control = existing?.checkpoint ? childResumeControl(existing) : undefined
    const run = await this.executor(base, mode, signal, ledger, depth + 1, scopeId)(child, request, control)
    return invokedResult(child, run)
  }

  private chainClosure(taskId: string, roots: TaskChain[]) {
    const result: TaskChain[] = [], queue = [...roots], seen = new Set<string>()
    while (queue.length) {
      const chain = queue.shift()!, key = `${chain.id}:${chain.version}:${executableChainDigest(chain)}`
      if (seen.has(key)) continue
      seen.add(key); result.push(chain)
      for (const node of chain.nodes) {
        if (node.kind !== "invoke") continue
        const child = this.repository.chain(taskId, node.chain.id, node.chain.version, node.chain.digest)
        if (child.validation.status !== "verified") throw new Error("invoked_chain_not_verified")
        queue.push(child)
      }
    }
    return result
  }

  private async llm(modelId: string, instruction: string, input: JsonValue, output: ValueSchema, signal: AbortSignal) {
    const selection = this.ai.selection(), prepared: PreparedAIModel = await this.ai.prepare({ ...selection, modelId }, signal)
    const envelope = runtimeOutputEnvelope(output)
    const value = await prepared.generateObject({ prompt: `${instruction}\n\n输入：${JSON.stringify(input)}`,
      jsonSchema: envelope.jsonSchema, parse: envelope.parse, signal, onEvent: () => {} })
    return { outcome: "success" as const, output: value, reportedInvocations: 1 }
  }
}

class ExplorationBrowserError extends BrowserError {
  constructor(code: BrowserFailure) { super(code); this.message = `exploration_browser_failed:${code}` }
}

export function opensAccessCircuit(code: BrowserFailure, command: BrowserCommand["type"]) {
  // WHY：定位歧义、局部读取和动作命令错误可由探索模型在原会话内修正；只有外部访问事实或不确定导航才停止后续访问。
  if ((code === "command_failed" || code === "invalid_response") && (command === "navigate" || command === "follow")) return true
  if (code === "origin_denied") return false
  return ["authentication_required", "verification_required", "rate_limited", "access_denied",
    "transient_failure", "readiness_timeout", "manual_required",
    "cleanup_required", "session_closed"].includes(code)
}

function incompleteExplorationError(trace: ExplorationTrace) {
  const failure = trace.events.findLast((event) => event.status === "failed" && event.error
    && opensAccessCircuit(event.error as BrowserFailure, event.command.type))
  // WHY：同一受控码既要进入 BrowserRun，也要保留 authoring 可定位的探索阶段前缀；未知异常仍不得伪装成浏览器码。
  if (failure?.error && failure.error !== "tool_failed") return new ExplorationBrowserError(failure.error as BrowserFailure)
  return new Error("exploration_business_result_missing")
}

/** WHY：供应商结构化结果使用对象根；TaskChain 的标量/数组仍按原动态合同校验和返回。 */
export function runtimeOutputEnvelope(schema: ValueSchema) {
  return { jsonSchema: valueJsonSchema({ type: "object", properties: { value: schema }, required: ["value"], additionalProperties: false }),
    parse: (raw: unknown) => parseTaskValue({ id: "llm-output", version: 1, dialect: "bat-value-schema/v1", schema },
      z.object({ value: z.json() }).strict().parse(raw).value) }
}

function browserGrant(input: RuntimeGroup, chains: TaskChain[], actions: BrowserGrant["actions"]): BrowserGrant {
  const maxCommands = Math.min(3850, input.budget.maxBrowserCommands - input.consumed.browserCommands)
  const timeoutMs = Math.min(1_440_000, input.budget.maxActiveMs - input.consumed.activeMs)
  if (maxCommands < 1 || timeoutMs < 1000) throw new RuntimeBudgetExceededError("浏览器预算已用尽。")
  return { taskId: input.taskId, runId: input.browserRunId, ownerId: input.authorizationId,
    ...(process.env.BROWSER_SKILL_BROWSER ? { browserInstanceId: process.env.BROWSER_SKILL_BROWSER } : {}),
    requirementVersion: input.requirementVersion, purpose: input.purpose === "replay" ? "replay" : "verification",
    allowedOrigins: collectOrigins([input.input, ...chains]),
    actions, maxCommands, timeoutMs }
}

function zeroConsumption(): TaskConsumption {
  return { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
}

function grantSignature(grant: BrowserGrant) {
  return digestJson({ taskId: grant.taskId, runId: grant.runId, requirementVersion: grant.requirementVersion,
    ownerId: grant.ownerId ?? null, purpose: grant.purpose, allowedOrigins: grant.allowedOrigins,
    actions: grant.actions, maxCommands: grant.maxCommands, timeoutMs: grant.timeoutMs })
}

function collectOrigins(values: unknown[]) {
  return [...new Set(collectUrls(values).map((value) => new URL(value).origin))]
}

function collectUrls(values: unknown[]) {
  const urls = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const candidates = [value, ...value.matchAll(/https?:\/\/[^\s\])\]}>"']+/gi)].map((item) => typeof item === "string" ? item : item[0])
      for (const candidate of candidates) {
        try { const url = new URL(candidate); if (["http:", "https:"].includes(url.protocol)) urls.add(url.href) }
        catch { /* 普通任务文本不是 URL。 */ }
      }
      return
    }
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value && typeof value === "object") for (const item of Object.values(value)) visit(item)
  }
  for (const value of values) visit(value)
  return [...urls].slice(0, 64)
}

function assertTraceUrls(value: JsonValue, trace: ExplorationTrace) {
  const evidenced = new Set([
    ...collectUrls([trace.input]),
    ...trace.events.flatMap((event) => event.status === "completed"
      ? collectUrls([event.output, event.observation?.url]) : []),
    ...(trace.stepResults ?? []).flatMap((step) => collectUrls([step.input, step.result.result, step.runtimeResult.result])),
  ])
  if (collectUrls([value]).some((url) => !evidenced.has(url))) throw new Error("exploration_url_not_observed")
}

function requestForChild(parent: TaskRun["binding"], chain: TaskChain, input: JsonValue,
  invocationId: string, mode: TaskRunMode): TaskRunRequest {
  return {
    contractVersion: CONTRACT_VERSION, requestId: stableUuid(invocationId, "request"), mode, input,
    binding: { runId: stableUuid(parent.runId, "child", invocationId), invocationId, taskId: parent.taskId,
      authorizationId: parent.authorizationId, plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) },
  }
}

function childResumeControl(run: TaskRun): RuntimeControl {
  const checkpoint = run.checkpoint
  if (!checkpoint) throw new Error("invoked_chain_checkpoint_missing")
  return { checkpoint, resumeRequest: { contractVersion: CONTRACT_VERSION,
    requestId: stableUuid(run.binding.runId, "resume", String(checkpoint.sequence)), binding: run.binding,
    checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } }
}

function invokedResult(chain: TaskChain, run: TaskRun) {
  if (!run.outcome) throw new Error("invoked_chain_not_settled")
  return { outcome: run.outcome, output: outputFor(chain, run), ...(run.checkpoint ? { checkpointId: run.checkpoint.id } : {}),
    ...(run.externalFailure ? { externalFailure: run.externalFailure } : {}) }
}

function outputFor(chain: TaskChain, run: TaskRun) {
  return Object.values(run.outputs).find((output) => output.contract.id === chain.outputContract.id
    && output.contract.version === chain.outputContract.version) ?? null
}

function valueJsonSchema(schema: ValueSchema): Record<string, unknown> {
  if (schema.type === "null") return { type: "null" }
  if (schema.type === "boolean") return { type: "boolean" }
  if (schema.type === "string") return { type: "string", ...(schema.enum ? { enum: schema.enum } : {}),
    ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }), ...(schema.maxLength === undefined ? {} : { maxLength: schema.maxLength }) }
  if (schema.type === "number" || schema.type === "integer") return { type: schema.type,
    ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }), ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }) }
  if (schema.type === "array") return { type: "array", items: valueJsonSchema(schema.items),
    ...(schema.minItems === undefined ? {} : { minItems: schema.minItems }), ...(schema.maxItems === undefined ? {} : { maxItems: schema.maxItems }) }
  if (schema.type !== "object") throw new Error("unsupported_value_schema")
  return { type: "object", properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, valueJsonSchema(value)])),
    required: schema.required, additionalProperties: schema.additionalProperties }
}

function needsFreshObservation(command: BrowserCommand) {
  return command.type !== "observe" && command.type !== "page" && command.type !== "tabs"
}

function traceObservation(inspection: { url: string; text: string; truncated: boolean }): JsonValue {
  const text = inspection.text.slice(0, 6000)
  return {
    url: inspection.url,
    text,
    truncated: inspection.truncated || text.length < inspection.text.length,
  }
}

function traceOutput(raw: string | null): JsonValue {
  if (raw === null) return null
  const limited = raw.slice(0, 200000)
  try { return z.json().parse(JSON.parse(limited)) }
  catch { return limited }
}
