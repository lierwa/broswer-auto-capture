import { randomUUID } from "node:crypto"
import path from "node:path"
import { z } from "zod"
import { jsonValueSchema, type JsonValue, type TaskDataContract } from "@browser-capture/contracts"
import type { NodeCapabilityResult, TaskChainCapabilities } from "@browser-capture/runtime"
import { RunnerProcess } from "./service.js"
import { RuntimeCleanupRequiredError, type RuntimePrimaryOutcome } from "./cleanup.js"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { hybridBrowserStateSchema, hybridCommandSchema, hybridExecuteRequestSchema,
  hybridExecuteResultSchema, hybridObserveRequestSchema } from "./hybrid-protocol.js"
import { HybridRuntimeScopeState, RUNTIME_SCOPE_FROM, withinHybridSignal } from "./hybrid-runtime-scope.js"
import { isWithinBrowserSites } from "./site-scope.js"
import { SourceLifecycleDiagnostics } from "./source-lifecycle-diagnostics.js"

const TARGET_ORDINAL_INPUT = "targetOrdinal"

/** WHY：Browser-Use 动作回执是供应商诊断，不得冒充声明为 unit 的链路节点业务输出。 */
export function hybridCapabilityOutput(contract: TaskDataContract, output: JsonValue): JsonValue {
  return contract.schema.type === "null" ? null : output
}

export function materializeHybridWorkflowCommand(config: Record<string, unknown>, rawInput: Record<string, unknown>) {
  if (Object.hasOwn(config, RUNTIME_SCOPE_FROM)) throw new Error("hybrid_runtime_scope_unresolved")
  const input = { ...rawInput }
  const marker = config.targetOrdinalInput
  const rawTarget = config.target
  const target: Record<string, unknown> | unknown = rawTarget && typeof rawTarget === "object" && !Array.isArray(rawTarget)
    ? { ...rawTarget as Record<string, unknown> } : rawTarget
  const hasReserved = Object.hasOwn(input, TARGET_ORDINAL_INPUT)
  if (target && typeof target === "object" && Object.hasOwn(target, "ordinalBinding")) {
    throw new Error("hybrid_unmaterialized_target_binding")
  }
  if (marker === TARGET_ORDINAL_INPUT) {
    if (!hasReserved || !target || typeof target !== "object"
      || (target as Record<string, unknown>).strategy !== "structure") {
      throw new Error("hybrid_target_ordinal_binding_unconsumable")
    }
    const ordinal = input[TARGET_ORDINAL_INPUT]
    if (!Number.isInteger(ordinal) || Number(ordinal) < 1) throw new Error("hybrid_target_ordinal_invalid")
    ;(target as Record<string, unknown>).ordinal = ordinal
    delete input[TARGET_ORDINAL_INPUT]
  } else if (marker !== undefined || hasReserved) {
    throw new Error("hybrid_reserved_target_input")
  }
  const { targetOrdinalInput: _marker, missingTargetOutcome: _missingTargetOutcome, ...commandConfig } = config
  return { ...commandConfig, target, args: input }
}

/** WHY：只有能力配置/值进入 Python；这里没有模型、Agent、图调度或独立检查点。 */
type HybridRunner = Pick<RunnerProcess, "close" | "envBoolean" | "request" | "startHybrid">
  & Partial<Pick<RunnerProcess, "handoff">>

type HybridCapabilitiesInput = { root: string; directory: string; ownerId: string;
  signal: AbortSignal; allowedOrigins: string[]; canRestoreByNavigation?: boolean; headless?: boolean;
  managedWindow?: { ownerId: string; resume: boolean };
  handoffPurpose?: () => "delivery" | "human_wait" | null;
  onHandoff?: (purpose: "delivery" | "human_wait", lease: Awaited<ReturnType<RunnerProcess["handoff"]>>["lease"]) => void;
  onHandoffFailure?: (purpose: "delivery" | "human_wait", reason: string) => void;
  onCleanup?: (report: Awaited<ReturnType<HybridRunner["close"]>>) => void;
  createRunner?: (root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) => HybridRunner }

export async function withHybridCapabilities<T>(input: HybridCapabilitiesInput,
  work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
  const owner = new AbortController()
  await verifyForkSource(input.root)
  const runnerSignal = AbortSignal.any([input.signal, owner.signal])
  const diagnostics = SourceLifecycleDiagnostics.open(input.directory, input.ownerId)
  const onDiagnostic = diagnostics ? (line: string) => diagnostics.acceptPythonLine(line) : undefined
  const runner = input.createRunner?.(input.root, runnerSignal, onDiagnostic)
    ?? new RunnerProcess(input.root, runnerSignal, onDiagnostic)
  let commands = 0
  const runtimeScope = new HybridRuntimeScopeState()
  let primary: RuntimePrimaryOutcome<T>
  try {
    await runner.startHybrid({ allowedOrigins: input.allowedOrigins,
      profilePath: path.join(input.directory, "browser-profile", "default"),
      headless: input.headless ?? runner.envBoolean("BAT_UPSTREAM_BROWSER_HEADLESS", false),
      ...(input.managedWindow ? { managedWindow: input.managedWindow } : {}) })
    const admit = (capabilities: TaskChainCapabilities) => {
      // WHY：先从宿主总账授权，再计入实际派发；失败也保留消耗，预算拒绝不算已派发命令。
      capabilities.accountConsumption?.({ browserCommands: 1 })
      commands++
    }
    const observe = async (capabilities: TaskChainCapabilities) => {
      admit(capabilities)
      return hybridBrowserStateSchema.parse(await runner.request(
        hybridObserveRequestSchema.parse({ id: randomUUID(), type: "hybrid_observe" })))
    }
    const value = await work({ browserCommandCount: () => commands,
      async capability(this: TaskChainCapabilities, invocation) {
        let missingTargetOutcome = false
        try {
          return await withinHybridSignal(invocation.signal, owner, async () => {
            if (invocation.node.capability.name === "browser.wait-for-human") {
              if (invocation.node.capability.version !== 1 || !invocation.node.human
                || invocation.node.effect !== "read") throw new Error("hybrid_human_wait_contract_invalid")
              z.object({}).strict().parse(invocation.config)
              z.object({}).strict().parse(invocation.input)
              // WHY：显式人工请求只交还原现场；用户操作和恢复仍归现有检查点，不另建等待器。
              return { outcome: "human_required" as const, reason: invocation.node.human.prompt,
                browser: await observe(this) }
            }
            const config = z.record(z.string(), z.unknown()).parse(invocation.config)
            missingTargetOutcome = config.missingTargetOutcome === true
            const scoped = await runtimeScope.commandConfig(invocation.node.capability.name, config, () => observe(this), invocation.node.id)
            invocation.signal.throwIfAborted()
            const command = hybridCommandSchema.parse({ ...invocation.node.capability,
              ...(invocation.node.capability.name === "browser.workflow-step"
                ? materializeHybridWorkflowCommand(scoped, invocation.input)
                : invocation.node.capability.name === "browser.target-readiness"
                  ? materializeTargetReadinessCommand(scoped) : scoped) })
            // One admitted provider command; errors after dispatch still consume the attempted action budget.
            admit(this)
            const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
              id: randomUUID(), type: "hybrid_execute", actionRef: invocation.node.id, command })))
            invocation.signal.throwIfAborted()
            runtimeScope.succeed(invocation.node.id, result.browser)
            return { outcome: "success", output: hybridCapabilityOutput(invocation.node.outputContract, result.output),
              browser: result.browser }
          })
        } catch (error) {
          runtimeScope.clear()
          const browser = await observe(this).catch(() => null)
          const external = hybridExternalFailure(error, browser)
          if (external) return external
          if (missingTargetOutcome && error instanceof Error
            && error.message === "hybrid_runner_failed:RuntimeError:ordinary_target_missing") {
            return { outcome: "missing", output: null, reason: "ordinary_target_missing" }
          }
          throw error
        }
      },
      verifyResume(this: TaskChainCapabilities, checkpoint, signal) {
        return withinHybridSignal(signal, owner, () => verifyHybridResume(checkpoint,
          { input, runner, runtimeScope, capabilities: this, observe, admit }))
      },
    })
    primary = { status: "completed", value }
  } catch (error) { primary = { status: "failed", error } }
  const purpose = primary.status === "completed" ? input.handoffPurpose?.() : null
  let cleanup: Awaited<ReturnType<HybridRunner["close"]>>
  if (purpose && input.managedWindow && runner.handoff) {
    try {
      const handed = await runner.handoff()
      cleanup = handed.report
      input.onHandoff?.(purpose, handed.lease)
    } catch (error) {
      input.onHandoffFailure?.(purpose, error instanceof Error ? error.message : "browser_handoff_failed")
      cleanup = await runner.close()
    }
  } else {
    if (purpose) input.onHandoffFailure?.(purpose, "browser_handoff_unavailable")
    cleanup = await runner.close()
  }
  input.onCleanup?.(cleanup)
  diagnostics?.recordRuntimeOutcome(primary, cleanup)
  diagnostics?.close()
  if (cleanup.status === "unconfirmed") {
    throw new RuntimeCleanupRequiredError(input.ownerId, cleanup, primary)
  }
  if (primary.status === "failed") throw primary.error
  return primary.value
}

async function verifyHybridResume(
  checkpoint: Parameters<NonNullable<TaskChainCapabilities["verifyResume"]>>[0],
  context: { input: Pick<HybridCapabilitiesInput, "canRestoreByNavigation" | "allowedOrigins">;
    runner: HybridRunner; runtimeScope: HybridRuntimeScopeState; capabilities: TaskChainCapabilities;
    observe: (capabilities: TaskChainCapabilities) => Promise<z.infer<typeof hybridBrowserStateSchema>>;
    admit: (capabilities: TaskChainCapabilities) => void }) {
  const { input, runner, runtimeScope, capabilities, observe, admit } = context
  runtimeScope.clear()
  let browser = await observe(capabilities)
  const sameSession = checkpoint.browser?.sessionId === browser.sessionId && checkpoint.browser.tabId === browser.tabId
  const humanNavigationResume = checkpoint.resumeWhen !== null
    && checkpoint.resumeWhen.path.length === 1 && checkpoint.resumeWhen.path[0] === "url"
  // WHY: 只有整个调用闭包都仅导航/读取时才允许重开来源页；表单或未决写入仍不能借导航伪造恢复。
  const restore = !sameSession && input.canRestoreByNavigation && !checkpoint.pendingEffect
    && !checkpoint.resumeWhen && checkpoint.browser
  let restored = false
  if (restore && isWithinBrowserSites(checkpoint.browser!.url, input.allowedOrigins)) {
    admit(capabilities)
    const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
      id: randomUUID(), type: "hybrid_execute", actionRef: checkpoint.cursor,
      command: { name: "browser.workflow-step", version: 2, actionName: "navigate",
        args: { url: checkpoint.browser!.url, new_tab: false }, target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] } })))
    browser = result.browser
    restored = true
  }
  // WHY：人工处理只接受同一受控 tab 在授权来源内跳转；重开相同 URL 不能替代用户处理的原现场。
  const sameUrl = checkpoint.browser?.url === browser.url || (sameSession && humanNavigationResume
    && isWithinBrowserSites(browser.url, input.allowedOrigins))
  const same = (sameSession || restored) && sameUrl
    && (humanNavigationResume || checkpoint.browser?.observationDigest === browser.observationDigest)
  // WHY：跨 session 的导航恢复可以继续普通链，但无法证明 dependent scope 的直接浏览器前驱身份。
  const scoped = same && sameSession && runtimeScope.restore(checkpoint, browser)
  if (same && sameSession && checkpoint.resumeWhen && !checkpoint.pendingEffect) {
    runtimeScope.resumeHuman(checkpoint.cursor, browser)
  }
  const associationFailed = checkpoint.browserNodeId !== undefined && !checkpoint.resumeWhen && !scoped
  return { ok: same && !associationFailed, browser,
    ...(checkpoint.resumeWhen ? { observation: jsonValueSchema.parse(browser) } : {}),
    ...(!same ? { reason: "hybrid_browser_session_changed" }
      : associationFailed ? { reason: "hybrid_browser_checkpoint_association_invalid" } : {}) }
}

function materializeTargetReadinessCommand(config: Record<string, unknown>) {
  const { consumerSegmentId: _consumerSegmentId, ...command } = config
  return command
}

export function hybridExternalFailure(error: unknown,
  browser: ReturnType<typeof hybridBrowserStateSchema.parse> | null): NodeCapabilityResult | null {
  if (!(error instanceof Error)) return null
  const match = error.message.match(/capture_(authentication_required|access_denied|rate_limited)$/)
  if (!match) return null
  const code = match[1] as "authentication_required" | "access_denied" | "rate_limited"
  let origin: string | null = null
  try { origin = browser ? new URL(browser.url).origin : null } catch { /* Invalid runner URL stays untrusted. */ }
  const category = code === "authentication_required" ? "authentication" : code
  return { outcome: code === "authentication_required" ? "human_required" : "blocked", reason: code,
    ...(browser ? { browser } : {}), externalFailure: { category, code, origin, observedOrigin: origin,
      httpStatus: code === "authentication_required" ? 401 : code === "access_denied" ? 403 : 429, retryAt: null } }
}
