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

export async function withHybridCapabilities<T>(input: { root: string; directory: string; ownerId: string;
  signal: AbortSignal; allowedOrigins: string[]; canRestoreByNavigation?: boolean; headless?: boolean;
  onCleanup?: (report: Awaited<ReturnType<HybridRunner["close"]>>) => void;
  createRunner?: (root: string, signal: AbortSignal) => HybridRunner },
  work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
  const owner = new AbortController()
  await verifyForkSource(input.root)
  const runnerSignal = AbortSignal.any([input.signal, owner.signal])
  const runner = input.createRunner?.(input.root, runnerSignal) ?? new RunnerProcess(input.root, runnerSignal)
  let commands = 0
  const runtimeScope = new HybridRuntimeScopeState()
  let primary: RuntimePrimaryOutcome<T>
  try {
    await runner.startHybrid({ allowedOrigins: input.allowedOrigins,
      profilePath: path.join(input.directory, "browser-profile", "default"),
      headless: input.headless ?? runner.envBoolean("BAT_UPSTREAM_BROWSER_HEADLESS", false) })
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
            const config = z.record(z.string(), z.unknown()).parse(invocation.config)
            missingTargetOutcome = config.missingTargetOutcome === true
            const scoped = await runtimeScope.commandConfig(invocation.node.capability.name, config, () => observe(this))
            invocation.signal.throwIfAborted()
            const command = hybridCommandSchema.parse({ ...invocation.node.capability,
              ...(invocation.node.capability.name === "browser.workflow-step"
                ? materializeHybridWorkflowCommand(scoped, invocation.input)
                : invocation.node.capability.name === "browser.target-readiness"
                  ? materializeTargetReadinessCommand(scoped) : scoped) })
            // One admitted provider command; errors after dispatch still consume the attempted action budget.
            admit(this)
            const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
              id: randomUUID(), type: "hybrid_execute", command })))
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
      verifyResume(this: TaskChainCapabilities, checkpoint, signal) { return withinHybridSignal(signal, owner, async () => {
        runtimeScope.clear()
        let browser = await observe(this)
        const sameSession = checkpoint.browser?.sessionId === browser.sessionId && checkpoint.browser.tabId === browser.tabId
        const humanNavigationResume = checkpoint.resumeWhen?.operator === "exists"
          && checkpoint.resumeWhen.path.length === 1 && checkpoint.resumeWhen.path[0] === "url"
        // WHY: 只有整个调用闭包都仅导航/读取时才允许重开来源页；表单或未决写入仍不能借导航伪造恢复。
        const restore = !sameSession && input.canRestoreByNavigation && !checkpoint.pendingEffect
          && (!checkpoint.resumeWhen || humanNavigationResume) && checkpoint.browser
        let restored = false
        if (restore && isWithinBrowserSites(checkpoint.browser!.url, input.allowedOrigins)) {
          admit(this)
          const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
            id: randomUUID(), type: "hybrid_execute", command: { name: "browser.workflow-step", version: 2, actionName: "navigate",
              args: { url: checkpoint.browser!.url, new_tab: false }, target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] } })))
          browser = result.browser
          restored = true
        }
        const same = (sameSession || restored) && checkpoint.browser?.url === browser.url
          && (humanNavigationResume || checkpoint.browser.observationDigest === browser.observationDigest)
        // WHY：跨 session 的导航恢复可以继续普通链，但无法证明 dependent scope 的直接浏览器前驱身份。
        if (same && sameSession) runtimeScope.restore(checkpoint, browser)
        return { ok: same, browser, ...(checkpoint.resumeWhen ? { observation: jsonValueSchema.parse(browser) } : {}),
          ...(!same ? { reason: "hybrid_browser_session_changed" } : {}) }
      }) },
    })
    primary = { status: "completed", value }
  } catch (error) { primary = { status: "failed", error } }
  const cleanup = await runner.close()
  input.onCleanup?.(cleanup)
  if (cleanup.status === "unconfirmed") {
    throw new RuntimeCleanupRequiredError(input.ownerId, cleanup, primary)
  }
  if (primary.status === "failed") throw primary.error
  return primary.value
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
