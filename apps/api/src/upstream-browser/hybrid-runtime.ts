import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { TaskChainCapabilities } from "@browser-capture/runtime"
import { RunnerProcess } from "./service.js"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { hybridBrowserStateSchema, hybridCommandSchema, hybridExecuteRequestSchema,
  hybridExecuteResultSchema, hybridObserveRequestSchema } from "./hybrid-protocol.js"
import { HybridRuntimeScopeState, RUNTIME_SCOPE_FROM, withinHybridSignal } from "./hybrid-runtime-scope.js"

const TARGET_ORDINAL_INPUT = "targetOrdinal"

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
  const { targetOrdinalInput: _marker, ...commandConfig } = config
  return { ...commandConfig, target, args: input }
}

/** WHY：只有能力配置/值进入 Python；这里没有模型、Agent、图调度或独立检查点。 */
export async function withHybridCapabilities<T>(input: { root: string; signal: AbortSignal; allowedOrigins: string[]; canRestoreByNavigation?: boolean },
  work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
  const owner = new AbortController()
  await verifyForkSource(input.root)
  const runner = new RunnerProcess(input.root, AbortSignal.any([input.signal, owner.signal]))
  let commands = 0
  const runtimeScope = new HybridRuntimeScopeState()
  try {
    await runner.startHybrid({ allowedOrigins: input.allowedOrigins,
      headless: runner.envBoolean("BAT_UPSTREAM_BROWSER_HEADLESS", false),
      ...(runner.envValue("BAT_UPSTREAM_BROWSER_EXECUTABLE") ? { executablePath: runner.envValue("BAT_UPSTREAM_BROWSER_EXECUTABLE") } : {}) })
    const observe = async () => hybridBrowserStateSchema.parse(await runner.request(
      hybridObserveRequestSchema.parse({ id: randomUUID(), type: "hybrid_observe" })))
    return await work({ browserCommandCount: () => commands,
      capability: async (invocation) => {
        try {
          return await withinHybridSignal(invocation.signal, owner, async () => {
            const config = z.record(z.string(), z.unknown()).parse(invocation.config)
            const scoped = await runtimeScope.commandConfig(invocation.node.capability.name, config, async () => {
              commands++
              return observe()
            })
            invocation.signal.throwIfAborted()
            const command = hybridCommandSchema.parse({ ...invocation.node.capability,
              ...(invocation.node.capability.name === "browser.workflow-step"
                ? materializeHybridWorkflowCommand(scoped, invocation.input) : scoped) })
            // One admitted provider command; errors after dispatch still consume the attempted action budget.
            commands++
            const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
              id: randomUUID(), type: "hybrid_execute", command })))
            invocation.signal.throwIfAborted()
            runtimeScope.succeed(invocation.node.id, result.browser)
            return { outcome: "success", output: result.output, browser: result.browser }
          })
        } catch (error) {
          runtimeScope.clear()
          throw error
        }
      },
      verifyResume: (checkpoint, signal) => withinHybridSignal(signal, owner, async () => {
        runtimeScope.clear()
        let browser = await observe()
        const sameSession = checkpoint.browser?.sessionId === browser.sessionId && checkpoint.browser.tabId === browser.tabId
        // WHY: 只有整个调用闭包都仅导航/读取时才允许重开来源页；表单、未决写入和人工等待不能这样恢复。
        const restore = !sameSession && input.canRestoreByNavigation && !checkpoint.pendingEffect && !checkpoint.resumeWhen && checkpoint.browser
        let restored = false
        if (restore && input.allowedOrigins.includes(new URL(checkpoint.browser!.url).origin)) {
          commands++
          const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
            id: randomUUID(), type: "hybrid_execute", command: { name: "browser.workflow-step", version: 2, actionName: "navigate",
              args: { url: checkpoint.browser!.url, new_tab: false }, target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] } })))
          browser = result.browser
          restored = true
        }
        const same = (sameSession || restored) && checkpoint.browser?.url === browser.url
          && checkpoint.browser.observationDigest === browser.observationDigest
        // WHY：跨 session 的导航恢复可以继续普通链，但无法证明 dependent scope 的直接浏览器前驱身份。
        if (same && sameSession) runtimeScope.restore(checkpoint, browser)
        return { ok: same, browser, ...(!same ? { reason: "hybrid_browser_session_changed" } : {}) }
      }),
    })
  } finally { await runner.close() }
}
