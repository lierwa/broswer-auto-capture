import { randomUUID } from "node:crypto"
import { z } from "zod"
import { jsonValueSchema } from "@browser-capture/contracts"
import type { TaskChainCapabilities } from "@browser-capture/runtime"
import { BrowserError, commandSchema, TaskChainBrowserAdapter, pageSchema, publicUrl, extractTarget,
  type BrowserInspection, type BrowserCommand } from "@browser-capture/browser"
import { hybridBrowserStateSchema } from "./hybrid-protocol.js"

export const legacyRequestSchema = z.object({ id: z.uuid(), type: z.literal("hybrid_legacy"),
  command: commandSchema }).strict()
const resultSchema = z.object({ output: jsonValueSchema, browser: hybridBrowserStateSchema,
  tabId: z.number().int().nonnegative(), text: z.string(), truncated: z.boolean() }).strict()
type Context = { request(command: BrowserCommand, signal: AbortSignal,
  capabilities: TaskChainCapabilities): Promise<unknown>;
  inspect?(capabilities: TaskChainCapabilities): Promise<z.infer<typeof hybridBrowserStateSchema>> }

/** WHY：只映射已发布 IR/输出；控制、取消和窗口归属始终由同一个受管 runner 持有。 */
export function legacyCapabilities(context: Context): TaskChainCapabilities {
  let state: BrowserInspection | null = null
  let summary: z.infer<typeof hybridBrowserStateSchema> | null = null
  const adapter = (capabilities: TaskChainCapabilities, signal: AbortSignal) => new TaskChainBrowserAdapter({
    state: () => state, summary: () => summary,
    async command(raw, localSignal) {
      const command = commandSchema.parse(raw)
      // WHY：旧人工节点交还现有 execution 检查点，不再向另一个 daemon 请求阻塞弹窗。
      if (command.type === "request_help") throw new BrowserError("manual_required")
      let result: z.infer<typeof resultSchema>
      try { result = resultSchema.parse(await context.request(command, localSignal ?? signal, capabilities)) }
      catch (error) {
        // WHY：失败动作可能已导航，不能把动作前摘要拼入新的人工检查点。
        state = null
        summary = await context.inspect?.(capabilities).catch(() => null) ?? null
        throw (localSignal ?? signal).aborted ? new BrowserError("cancelled") : legacyCommandError(error, summary)
      }
      summary = result.browser
      state = { sessionId: summary.sessionId, tabId: result.tabId, url: summary.url,
        text: result.text, truncated: result.truncated, observedAt: summary.observedAt }
      if (command.type === "read") {
        const html = z.object({ html: z.string().max(4_000_000), truncated: z.boolean() }).strict().parse(result.output)
        return JSON.stringify(extractTarget(html.html, summary.url, { selector: command.selector,
          maxItems: command.maxItems }, summary.observedAt, html.truncated))
      }
      if (command.type === "page") {
        const page = pageSchema.parse(result.output), url = publicUrl(page.url)
        if (!url) throw new BrowserError("permission_denied")
        return JSON.stringify({ ...page, url, links: page.links.flatMap(link => {
          const safe = publicUrl(link.url); return safe ? [{ ...link, url: safe }] : []
        }) })
      }
      return result.output === null ? null : JSON.stringify(result.output)
    },
  })
  const complete = <T extends object>(value: T) => ({ ...value, ...(summary ? { browser: summary } : {}) })
  return {
    async browser(invocation) { return complete(await adapter(this, invocation.signal).browser(invocation)) },
    async observe(invocation) { return complete(await adapter(this, invocation.signal).observe(invocation)) },
    async human(invocation) { return complete(await adapter(this, invocation.signal).human(invocation)) },
    async capability(invocation) { return complete(await adapter(this, invocation.signal).capability(invocation)) },
    async verifyResume(checkpoint, signal) {
      const result = await adapter(this, signal).verifyResume(checkpoint, signal)
      const same = checkpoint.browser?.sessionId === summary?.sessionId && checkpoint.browser?.tabId === summary?.tabId
      return { ...result, ok: result.ok && same, ...(!same ? { reason: "browser_session_changed" } : {}) }
    },
  }
}

export function legacyRequest(command: BrowserCommand) {
  return legacyRequestSchema.parse({ id: randomUUID(), type: "hybrid_legacy", command })
}

export function legacyCommandError(error: unknown, browser: z.infer<typeof hybridBrowserStateSchema> | null = null) {
  if (error instanceof BrowserError) return error
  const code = error instanceof Error ? error.message.split(":").at(-1) : undefined
  const native = { ordinary_target_missing: "target_missing", missing_stable_target: "target_missing",
    ambiguous_stable_target: "target_ambiguous", ambiguous_or_inconsistent_stable_target: "target_ambiguous",
    hybrid_origin_denied: "origin_denied", ordinary_action_failed: "command_failed" } as const
  if (code && Object.hasOwn(native, code)) return new BrowserError(native[code as keyof typeof native])
  const legacy = code?.replace(/^hybrid_legacy_/, "")
  if (legacy && ["target_missing", "target_ambiguous", "origin_denied", "permission_denied",
    "capability_unsupported", "invalid_response"].includes(legacy)) return new BrowserError(legacy as "target_missing")
  const external = code?.match(/^capture_(authentication_required|access_denied|rate_limited|verification_required_([1-5]\d{2})|server_error_(5\d{2}))$/)
  if (!external) return error
  const failure = external[2] ? "verification_required" : external[3] ? "transient_failure"
    : external[1] as "authentication_required" | "access_denied" | "rate_limited"
  return new BrowserError(failure, { ...(browser ? { origin: new URL(browser.url).origin } : {}),
    httpStatus: Number(external[2] ?? external[3] ?? (failure === "authentication_required" ? 401 : failure === "access_denied" ? 403 : 429)) })
}
