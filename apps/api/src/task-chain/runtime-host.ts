import { assertExecutionBrowserSupported, assertWorkflowRuntimeSupported, usesHybridBrowserRuntime } from "../upstream-browser/retirement.js"
import { z } from "zod"
import { BrowserError, TaskChainBrowserAdapter, taskChainBrowserActions } from "@browser-capture/browser"
import { persistContentArtifacts } from "./content-artifacts.js"
import {
  CONTRACT_VERSION, parseTaskValue, taskRunSchema, type JsonValue, type TaskChain, type TaskRun,
  type TaskBudget, type TaskConsumption, type TaskExecution, type TaskRunMode, type TaskRunRequest,
  type ValueSchema, type VersionReference,
} from "@browser-capture/contracts"
import {
  TaskChainRuntime, digestJson, executableChainDigest, stableUuid,
  RuntimeBudgetExceededError, type InvokeChainInvocation, type RuntimeControl,
  type RuntimeNodePacing, type TaskChainCapabilities,
} from "@browser-capture/runtime"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import type { RunnerCleanupReport } from "../upstream-browser/cleanup.js"
import { hybridWindowLeaseSchema } from "../upstream-browser/hybrid-protocol.js"
import type { TaskContractRepository } from "./repository.js"
import { TaskBudgetLedger, type BudgetSnapshot } from "./budget-ledger.js"
import { collectOrigins, valueJsonSchema } from "./task-value-utils.js"

export type RuntimeCapabilityFactory = (input: Readonly<{
  taskId: string; authorizationId: string; purpose: "sample" | "verification" | "replay";
}>) => TaskChainCapabilities | Promise<TaskChainCapabilities>

type RuntimeGroup = Readonly<{
  taskId: string; authorizationId: string; browserRunId: string; requirementVersion: number;
  purpose: "sample" | "verification" | "replay"; chains: TaskChain[]; input: JsonValue; signal: AbortSignal;
  budget: TaskBudget; consumed: TaskConsumption; scopeConsumption: Readonly<Record<string, TaskConsumption>>;
  scopeBudgets?: Readonly<Record<string, TaskBudget>>;
  onConsumption?: (scopeId: string, snapshot: BudgetSnapshot) => void;
  onCleanup?: (report: RunnerCleanupReport) => void;
  managedWindow?: { ownerId: string; resume: boolean; releasedOwners?: string[] };
  handoffPurpose?: () => "delivery" | "human_wait" | null;
  onHandoff?: (purpose: "delivery" | "human_wait", lease: z.infer<typeof hybridWindowLeaseSchema>) => void;
  onHandoffFailure?: (purpose: "delivery" | "human_wait", reason: string) => void;
  pacing?: RuntimeNodePacing;
  browser?: TaskExecution["browser"];
}>

export class TaskRuntimeHost {
  private readonly upstream: UpstreamBrowserRuntime
  constructor(private readonly repository: TaskContractRepository,
    private readonly ai: AIModelProvider, private readonly factory?: RuntimeCapabilityFactory,
    upstream?: UpstreamBrowserRuntime) {
    this.upstream = upstream ?? {}

  }

  async group<T>(input: RuntimeGroup, work: (execute: (chain: TaskChain, request: TaskRunRequest,
    control?: RuntimeControl) => Promise<TaskRun>) => Promise<T>): Promise<T> {
    const scopes = new Map(input.chains.map((chain) => [chain.stepId, { budget: input.scopeBudgets?.[chain.stepId] ?? chain.budget,
      consumed: input.scopeConsumption[chain.stepId] ?? zeroConsumption() }]))
    const ledger = new TaskBudgetLedger(input.budget, input.consumed, scopes, input.onConsumption)
    const closure = this.assertExecutable(input.taskId, input.chains)
    assertExecutionBrowserSupported(closure, input.browser?.headless ?? false)
    const injected = await this.factory?.({ taskId: input.taskId, authorizationId: input.authorizationId, purpose: input.purpose })
    if (injected) return work(this.executor(injected, input.purpose, input.signal, ledger, 0, input.pacing))
    if (closure.some(chain => chain.nodes.some(node => node.kind === "browser" || node.kind === "capability" && node.capability.name === "browser.perform"))
      && !closure.some(chain => taskChainBrowserActions(chain).length || chain.nodes.some(node =>
        node.kind === "capability" && node.capability.name.startsWith("browser.") && node.capability.name !== "browser.perform"))) {
      const local = new TaskChainBrowserAdapter({ state: () => null,
        command: async () => { throw new BrowserError("capability_unsupported") } })
      return work(this.executor({ browser: local.browser, capability: local.capability }, input.purpose, input.signal, ledger, 0, input.pacing))
    }
    const hybrid = usesHybridBrowserRuntime(closure)
    if (hybrid) {
      if (!this.upstream.withCapabilities) throw new Error("hybrid_runtime_unavailable")
      const canRestoreByNavigation = closure.every((chain) => chain.nodes.every((node) => node.kind === "browser"
        ? node.operation === "navigate" : node.kind !== "human" && (node.kind !== "capability"
          || !node.capability.name.startsWith("browser.") || node.capability.name === "browser.read-fields"
          || node.capability.name === "browser.workflow-step"
            && z.object({ actionName: z.literal("navigate") }).passthrough().safeParse(node.config).success)))
      return this.upstream.withCapabilities<T>({ signal: input.signal, ownerId: input.browserRunId,
        // WHY：混合新旧节点时按实际检查点选择旧观察投影，不覆盖新版作用域恢复合同。
        legacyNodeIds: Object.fromEntries(closure.map(chain => [chain.id, chain.nodes.filter(node =>
          ["browser", "observe", "human"].includes(node.kind)
          || node.kind === "capability" && node.capability.name === "browser.perform").map(node => node.id)])),
        // WHY：正式运行只释放本 operation；同任务父连接由已有取消、交付和服务退出边界关闭。
        connectionOwnerId: input.taskId,
        allowedOrigins: collectOrigins([input.input, ...closure]), canRestoreByNavigation,
        // WHY：由已核验的不可变 invoke 闭包证明只读；请求/自然语言不能声明免身份检查。
        publicRead: closure.every(chain => chain.nodes.every(node => node.kind === "capability"
          ? node.capability.name === "browser.workflow-step"
            ? z.object({ actionName: z.literal("navigate") }).passthrough().safeParse(node.config).success
            : node.effect === "read" && ["browser.read-fields", "browser.target-readiness"].includes(node.capability.name)
          : !["llm", "browser", "human"].includes(node.kind))),
        ...(input.browser ? { headless: input.browser.headless,
          browserMode: input.browser.mode ?? (input.browser.headless ? "dedicated-headless" : "daily") } : {}),
        ...(input.managedWindow ? { managedWindow: input.managedWindow } : {}),
        ...(input.handoffPurpose ? { handoffPurpose: input.handoffPurpose } : {}),
        ...(input.onHandoff ? { onHandoff: input.onHandoff } : {}),
        ...(input.onHandoffFailure ? { onHandoffFailure: input.onHandoffFailure } : {}),
        ...(input.onCleanup ? { onCleanup: input.onCleanup } : {}) }, (capabilities) =>
        work(this.executor(capabilities, input.purpose, input.signal, ledger, 0, input.pacing)))
    }
    return work(this.executor({}, input.purpose, input.signal, ledger, 0, input.pacing))
  }

  private executor(base: TaskChainCapabilities, mode: TaskRunMode, signal: AbortSignal, ledger: TaskBudgetLedger,
    depth: number, pacing?: RuntimeNodePacing, parentScope?: string, prepare?: (scopeId: string) => void) {
    return async (chain: TaskChain, request: TaskRunRequest, control?: RuntimeControl): Promise<TaskRun> => {
      const scopeId = parentScope ?? chain.stepId
      if (depth >= Math.min(chain.budget.maxDepth, ledger.depthLimit(scopeId))) throw new Error("chain_depth_exceeded")
      if (depth === 0) {
        if (!control?.checkpoint) ledger.account(scopeId, { invocations: 1 })
        prepare?.(scopeId)
      }
      const capabilities: TaskChainCapabilities = { ...base,
        ...(base.capability ? { capability: async (invocation) => {
          const result = await base.capability!.call(capabilities, invocation)
          return persistContentArtifacts(this.repository, chain.taskId, request.binding.runId, invocation.config, result)
        } } : {}),
        ...(prepare ? { browserCommandCount: () => ledger.scopeConsumption(scopeId).browserCommands } : {}),
        accountConsumption: (delta, accountingMode) => {
          const { activeMs: _childActiveMs, ...withoutActiveMs } = delta
          const adjusted = depth === 0 ? delta : withoutActiveMs
          ledger.account(scopeId, adjusted, accountingMode)
          base.accountConsumption?.(delta, accountingMode)
        },
        llm: base.llm ?? ((invocation) => this.llm(invocation.node.model,
          "systemPrompt" in invocation.node ? invocation.node.systemPrompt : invocation.node.instruction,
          invocation.input, invocation.node.outputContract.schema,
          AbortSignal.any([invocation.signal, AbortSignal.timeout(invocation.node.timeoutMs)]))),
        persist: (run) => { this.repository.saveRun(run) },
        invoke: base.invoke ?? ((invocation) => this.invokeChild(base, mode, signal, ledger, depth, pacing, scopeId, invocation)),
      }
      const inheritedPacing = control?.pacing ?? pacing
      return new TaskChainRuntime().execute({ chain, request, capabilities,
        control: { ...control, ...(inheritedPacing ? { pacing: inheritedPacing } : {}),
          signal: control?.signal ? AbortSignal.any([signal, control.signal]) : signal } })
    }
  }

  private async invokeChild(base: TaskChainCapabilities, mode: TaskRunMode, signal: AbortSignal,
    ledger: TaskBudgetLedger, depth: number, pacing: RuntimeNodePacing | undefined,
    scopeId: string, invocation: InvokeChainInvocation) {
    const child = this.repository.chain(invocation.parent.taskId, invocation.chain.id,
      invocation.chain.version, invocation.chain.digest)
    const request = requestForChild(invocation.parent, child, invocation.input, invocation.invocationId, mode)
    const existing = this.repository.runs(invocation.parent.taskId)
      .find((run) => run.binding.runId === request.binding.runId)
    if (existing && !["paused", "waiting_for_human"].includes(existing.status)) return invokedResult(child, existing)
    const control = existing?.checkpoint ? childResumeControl(existing) : undefined
    const run = await this.executor(base, mode, signal, ledger, depth + 1, pacing, scopeId)(child, request, control)
    return invokedResult(child, run)
  }

  assertExecutable(taskId: string, roots: TaskChain[]) {
    const closure = this.chainClosure(taskId, roots)
    assertWorkflowRuntimeSupported(closure)
    const invoked = new Set(closure.flatMap((chain) => chain.nodes.flatMap((node) =>
      node.kind === "invoke" ? [`${node.chain.id}:${node.chain.version}`] : [])))
    if (closure.some((chain) => invoked.has(`${chain.id}:${chain.version}`) && chain.validation.status !== "verified")) {
      throw new Error("invoked_chain_not_verified")
    }
    return closure
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
        queue.push(child)
      }
    }
    return result
  }

  private async llm(modelId: string, systemPrompt: string, input: JsonValue, output: ValueSchema, signal: AbortSignal) {
    const selection = this.ai.selection(), prepared: PreparedAIModel = await this.ai.prepare({ ...selection, modelId }, signal)
    const envelope = runtimeOutputEnvelope(output)
    try {
      if (!prepared.generateRuntimeObject) throw new Error("explicit_llm_structured_messages_unavailable")
      const value = await prepared.generateRuntimeObject({ systemPrompt, userInput: input,
        jsonSchema: envelope.jsonSchema, parse: envelope.parse, signal, onEvent: () => {} })
      return { outcome: "success" as const, output: value, reportedInvocations: 1 }
    } catch (error) {
      const code = error instanceof Error ? error.message : "provider_protocol_error"
      if (["llm_output_shape_invalid", "llm_result_invalid"].includes(code)) {
        return { outcome: "failed" as const, output: null, reason: code, reportedInvocations: 1 }
      }
      throw error
    }
  }


}

/** WHY：供应商结构化结果严格只有 result；额外解释字段不能被静默丢弃。 */
export function runtimeOutputEnvelope(schema: ValueSchema) {
  return { jsonSchema: valueJsonSchema({ type: "object", properties: { result: schema }, required: ["result"], additionalProperties: false }),
    parse: (raw: unknown) => {
      const envelope = z.object({ result: z.json() }).strict().safeParse(raw)
      if (!envelope.success) throw new Error("llm_output_shape_invalid")
      try { return parseTaskValue({ id: "llm-output", version: 1, dialect: "bat-value-schema/v1", schema }, envelope.data.result) }
      catch { throw new Error("llm_result_invalid") }
    } }
}

function zeroConsumption(): TaskConsumption {
  return { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
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
