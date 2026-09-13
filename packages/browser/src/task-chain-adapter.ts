import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"
import type {
  ChainNode, JsonValue, NodeCapabilityResult, ResumeVerificationResult, TaskChain, TaskCheckpoint,
} from "@browser-capture/contracts"
import { BrowserError, type BrowserCommand, type BrowserGrant, type BrowserInspection } from "./contracts.js"
import { pageSchema } from "./page.js"

export interface TaskChainBrowserPort {
  command(command: unknown, signal?: AbortSignal): Promise<string | null>
  state(): BrowserInspection | null
}
export interface BrowserAdapterInvocation {
  node: Extract<ChainNode, { kind: "browser" }>
  arguments: Record<string, JsonValue>
  target?: { kind: "semantic"; role: JsonValue; name: JsonValue; fallbackName?: JsonValue; occurrence?: JsonValue }
    | { kind: "locator"; strategy: string; value: JsonValue }
  signal: AbortSignal
}
export interface ObserveAdapterInvocation {
  node: Extract<ChainNode, { kind: "observe" }>
  target?: BrowserAdapterInvocation["target"]
  signal: AbortSignal
}
export interface HumanAdapterInvocation {
  node: Extract<ChainNode, { kind: "human" }>
  checkpoint: TaskCheckpoint
  resuming: boolean
  resumeCondition: { operator: "exists"; path: (string | number)[] }
    | { operator: "equals"; path: (string | number)[]; expected: JsonValue }
  signal: AbortSignal
}

const keySchema = z.enum(["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight",
  "PageDown", "PageUp", "Home", "End"])
const tabIdSchema = z.number().int().nonnegative()
const durationSchema = z.number().int().nonnegative().max(1_440_000)
const pathSchema = z.string().trim().min(1).max(32_767)
const targetRoles = new Set(["link", "button", "textbox", "combobox"])

export class TaskChainBrowserAdapter {
  constructor(private readonly session: TaskChainBrowserPort) {}

  browser = async (invocation: BrowserAdapterInvocation): Promise<NodeCapabilityResult> => {
    const timeout = AbortSignal.timeout(invocation.node.timeoutMs)
    try {
      const output = await this.executeBrowser({ ...invocation, signal: AbortSignal.any([invocation.signal, timeout]) })
      return { outcome: "success", output }
    } catch (error) { return deadlineFailure(error, invocation.signal, timeout, invocationOrigin(invocation, this.session.state())) }
  }

  observe = async (invocation: ObserveAdapterInvocation): Promise<NodeCapabilityResult> => {
    const timeout = AbortSignal.timeout(invocation.node.timeoutMs)
    const signal = AbortSignal.any([invocation.signal, timeout])
    try {
      if (invocation.node.scope === "downloads") return unsupported("observe_downloads_unsupported")
      if (invocation.node.scope === "target") {
        const target = invocation.target ? lowLevelTarget(invocation.target) : undefined
        if (!target || !("selector" in target)) throw new BrowserError("capability_unsupported")
        const raw = await this.session.command({ type: "read", selector: target.selector,
          ...(invocation.node.maxItems === undefined ? {} : { maxItems: invocation.node.maxItems }) }, signal)
        const output = parseCommandOutput(raw)
        return { outcome: "success", output }
      }
      if (invocation.node.scope === "tabs") {
        const raw = await this.session.command({ type: "tabs" }, signal)
        return { outcome: "success", output: parseCommandOutput(raw) }
      }
      const raw = await this.session.command({ type: "page" }, signal)
      const inspection = this.session.state()
      if (!inspection) throw new BrowserError("invalid_response")
      const page = pageSchema.parse(parseCommandOutput(raw))
      // WHY：采集时间属于同次受控观察事实；不能交给显式 LLM 根据墙钟猜测或留空。
      return { outcome: "success", output: { ...page, observedAt: inspection.observedAt }, browser: browserSummary(inspection) }
    } catch (error) { return deadlineFailure(error, invocation.signal, timeout, inspectionOrigin(this.session.state())) }
  }

  human = async (invocation: HumanAdapterInvocation): Promise<NodeCapabilityResult> => {
    try {
      const current = await this.freshObservation(invocation.signal)
      if (current.outcome !== "success") return current
      if (matches(invocation.resumeCondition, current.output ?? null)) return current
      if (invocation.resuming) return { ...current, outcome: "blocked", reason: "human_resume_condition_not_met" }
      await this.session.command({ type: "request_help", reason: helpReason(invocation.node.reason),
        prompt: invocation.node.prompt, timeoutMs: invocation.node.timeoutMs }, invocation.signal)
      const resumed = await this.freshObservation(invocation.signal)
      return resumed.outcome === "success" && matches(invocation.resumeCondition, resumed.output ?? null)
        ? resumed : { ...resumed, outcome: "blocked", reason: "human_resume_condition_not_met" }
    } catch (error) {
      const failure = browserFailure(error, inspectionOrigin(this.session.state()))
      if (failure.outcome !== "human_required") return failure
      const inspection = this.session.state()
      return { ...failure, ...(inspection ? { browser: browserSummary(inspection) } : {}) }
    }
  }

  verifyResume = async (checkpoint: TaskCheckpoint, _signal: AbortSignal): Promise<ResumeVerificationResult> => {
    try {
      const observed = await this.freshObservation(_signal)
      if (observed.outcome !== "success" || !observed.browser) {
        return { ok: false, reason: observed.reason ?? `resume_observe_${observed.outcome}` }
      }
      const unchanged = checkpoint.browser?.observationDigest === observed.browser.observationDigest
      return { ok: checkpoint.resumeWhen !== null || unchanged, browser: observed.browser,
        ...(observed.output === undefined ? {} : { observation: observed.output }),
        ...(!checkpoint.resumeWhen && !unchanged ? { reason: "browser_observation_changed" } : {}) }
    } catch (error) {
      return { ok: false, reason: error instanceof BrowserError ? error.code : "resume_observe_failed" }
    }
  }

  private async freshObservation(signal?: AbortSignal): Promise<NodeCapabilityResult> {
    await this.session.command({ type: "observe" }, signal)
    const inspection = this.session.state()
    if (!inspection) throw new BrowserError("invalid_response")
    return { outcome: "success", output: observationValue(inspection), browser: browserSummary(inspection) }
  }

  private async executeBrowser({ node, arguments: args, target, signal }: BrowserAdapterInvocation): Promise<JsonValue> {
    signal.throwIfAborted()
    const commandTarget = target ? lowLevelTarget(target) : undefined
    if (node.operation === "navigate") {
      const reuseOpenTab = z.boolean().optional().parse(args.reuseOpenTab)
      return this.command({ type: "navigate", url: z.string().url().parse(args.url),
        captureNetworkEvidence: z.boolean().default(false).parse(args.captureNetworkEvidence),
        ...(reuseOpenTab === undefined ? {} : { reuseOpenTab }) }, signal)
    }
    if (node.operation === "click") {
      const dispatch = z.literal("dom").optional().parse(args.dispatch)
      return this.command({ type: "click", target: requiredTarget(commandTarget), ...(dispatch ? { dispatch } : {}) }, signal)
    }
    if (node.operation === "hover") return this.command({ type: "hover", target: requiredTarget(commandTarget) }, signal)
    if (node.operation === "fill") return this.command({ type: "fill", target: requiredTarget(commandTarget), value: z.string().parse(args.value) }, signal)
    if (node.operation === "press") return this.command({ type: "press", ...(commandTarget ? { target: commandTarget } : {}), key: keySchema.parse(args.key) }, signal)
    if (node.operation === "select") return this.command({ type: "select", target: requiredTarget(commandTarget), values: selectValues(args) }, signal)
    if (node.operation === "scroll") return this.scroll(args, signal)
    if (node.operation === "drag") throw new BrowserError("capability_unsupported")
    if (node.operation === "tab_open") return this.command({ type: "tab_open", url: z.string().url().parse(args.url),
      background: z.boolean().default(false).parse(args.background) }, signal)
    if (node.operation === "tab_select" || node.operation === "tab_close") {
      return this.command({ type: node.operation, tabId: tabIdSchema.parse(args.tabId) }, signal)
    }
    if (node.operation === "upload") return this.command({ type: "upload", target: requiredTarget(commandTarget),
      files: z.array(pathSchema).min(1).max(20).parse(args.files), mode: z.enum(["input", "drop"]).default("input").parse(args.mode) }, signal)
    if (node.operation === "download") return this.command({ type: "download", ...(commandTarget ? { target: commandTarget } : {}),
      out: pathSchema.parse(args.out), overwrite: z.boolean().default(false).parse(args.overwrite) }, signal)
    const durationMs = durationSchema.parse(args.durationMs)
    if (durationMs > node.timeoutMs) throw new BrowserError("budget_exceeded")
    await delay(durationMs, undefined, { signal })
    return null
  }

  private async command(command: BrowserCommand, signal: AbortSignal) {
    return parseCommandOutput(await this.session.command(command, signal))
  }

  private async scroll(args: Record<string, JsonValue>, signal: AbortSignal) {
    const direction = z.enum(["up", "down"]).parse(args.direction), steps = z.number().int().min(1).max(20).default(1).parse(args.steps)
    for (let index = 0; index < steps; index++) {
      signal.throwIfAborted()
      await this.session.command({ type: "press", key: direction === "down" ? "PageDown" : "PageUp" }, signal)
    }
    return null
  }
}

function lowLevelTarget(target: NonNullable<BrowserAdapterInvocation["target"]>): Extract<BrowserCommand, { type: "click" }>["target"] {
  if (target.kind === "semantic") {
    if (typeof target.role !== "string" || !targetRoles.has(target.role) || typeof target.name !== "string") throw new BrowserError("capability_unsupported")
    const occurrence = target.occurrence === undefined ? undefined : z.number().int().nonnegative().max(99).parse(target.occurrence)
    const fallbackName = target.fallbackName === undefined ? undefined : z.string().min(4).max(300).parse(target.fallbackName)
    return { role: target.role as "link" | "button" | "textbox" | "combobox", name: target.name,
      ...(fallbackName === undefined ? {} : { fallbackName }),
      ...(occurrence === undefined ? {} : { occurrence }) }
  }
  if (target.strategy !== "css" || typeof target.value !== "string") throw new BrowserError("capability_unsupported")
  return { selector: target.value }
}

function requiredTarget(target: ReturnType<typeof lowLevelTarget> | undefined) {
  if (!target) throw new BrowserError("invalid_response")
  return target
}

function selectValues(args: Record<string, JsonValue>) {
  if (typeof args.value === "string") return [args.value]
  return z.array(z.string().max(10_000)).min(1).max(100).parse(args.values)
}

function parseCommandOutput(raw: string | null): JsonValue {
  if (raw === null) return null
  try { return z.json().parse(JSON.parse(raw)) }
  catch { return raw }
}

function observationValue(inspection: BrowserInspection): JsonValue {
  return { url: inspection.url, text: inspection.text, truncated: inspection.truncated, tabId: String(inspection.tabId) }
}

function browserSummary(inspection: BrowserInspection) {
  const observationDigest = createHash("sha256").update(JSON.stringify({ url: inspection.url,
    text: inspection.text, truncated: inspection.truncated })).digest("hex")
  return { sessionId: inspection.sessionId, tabId: String(inspection.tabId), url: inspection.url,
    observationDigest, observedAt: inspection.observedAt }
}

function matches(condition: HumanAdapterInvocation["resumeCondition"], observation: JsonValue) {
  let value: JsonValue = observation
  try {
    for (const segment of condition.path) {
      if (typeof segment === "number") {
        if (!Array.isArray(value) || segment >= value.length) return false
        value = value[segment]!
      } else {
        if (!value || typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, segment)) return false
        value = value[segment]!
      }
    }
  } catch { return false }
  return condition.operator === "exists" ? value !== null : JSON.stringify(value) === JSON.stringify(condition.expected)
}

function browserFailure(error: unknown, origin: string | null = null): NodeCapabilityResult {
  if (!(error instanceof BrowserError)) throw error
  if (error.code === "target_missing") return { outcome: "missing", reason: error.code }
  if (error.code === "budget_exceeded") return { outcome: "timeout", reason: error.code }
  if (error.code === "readiness_timeout") return failureResult("timeout", error, "transient", origin)
  if (error.code === "authentication_required") return failureResult("human_required", error, "authentication", origin)
  if (error.code === "verification_required") return failureResult("human_required", error, "verification", origin)
  if (error.code === "rate_limited") return failureResult("blocked", error, "rate_limited", origin)
  if (error.code === "access_denied" || error.code === "origin_denied") return failureResult(
    error.code === "origin_denied" ? "human_required" : "blocked", error, "access_denied", origin)
  if (error.code === "transient_failure" || error.code === "command_failed" || error.code === "invalid_response") {
    return failureResult("failed", error, "transient", origin)
  }
  if (error.code === "manual_required") return { outcome: "human_required", reason: error.code }
  if (error.code === "cancelled") return { outcome: "cancelled", reason: error.code }
  if (error.code === "permission_denied" || error.code === "cleanup_required" || error.code === "capability_unsupported") {
    return { outcome: "blocked", reason: error.code }
  }
  return { outcome: "failed", reason: error.code }
}

function deadlineFailure(error: unknown, parent: AbortSignal, timeout: AbortSignal, origin: string | null): NodeCapabilityResult {
  if (timeout.aborted && !parent.aborted) return { outcome: "timeout", reason: "node_timeout",
    externalFailure: { category: "transient", code: "node_timeout", origin, observedOrigin: null, httpStatus: null, retryAt: null } }
  return browserFailure(error, origin)
}

function failureResult(outcome: "timeout" | "blocked" | "human_required" | "failed", error: BrowserError,
  category: "authentication" | "verification" | "rate_limited" | "access_denied" | "transient", fallbackOrigin: string | null): NodeCapabilityResult {
  return { outcome, reason: error.code, externalFailure: { category, code: error.code,
    origin: error.evidence.origin ?? fallbackOrigin, observedOrigin: error.evidence.observedOrigin ?? null,
    httpStatus: error.evidence.httpStatus ?? null, retryAt: null } }
}

function invocationOrigin(invocation: BrowserAdapterInvocation, inspection: BrowserInspection | null) {
  const value = invocation.arguments.url
  if ((invocation.node.operation === "navigate" || invocation.node.operation === "tab_open") && typeof value === "string") {
    try { return new URL(value).origin } catch { /* Zod reports the invalid URL separately. */ }
  }
  return inspectionOrigin(inspection)
}

function inspectionOrigin(inspection: BrowserInspection | null) {
  if (!inspection) return null
  try { return new URL(inspection.url).origin } catch { return null }
}

function unsupported(reason: string): NodeCapabilityResult { return { outcome: "blocked", reason } }


function helpReason(reason: Extract<ChainNode, { kind: "human" }>["reason"]): Extract<BrowserCommand, { type: "request_help" }>["reason"] {
  if (reason === "login") return "login"
  if (reason === "captcha") return "captcha"
  if (reason === "access_restriction" || reason === "permission") return "access"
  return "confirmation"
}

export function taskChainBrowserActions(chain: TaskChain): BrowserGrant["actions"] {
  const actions = new Set<BrowserGrant["actions"][number]>()
  for (const node of chain.nodes) {
    if (node.kind === "observe") {
      actions.add(node.scope === "tabs" ? "tabs" : node.scope === "page" ? "page" : node.scope === "target" ? "read" : "observe")
    }
    if (node.kind === "human") { actions.add("observe"); actions.add("request_help") }
    if (node.kind !== "browser") continue
    const mapped = node.operation === "scroll" ? "press" : node.operation === "wait" || node.operation === "drag" ? null : node.operation
    if (mapped) actions.add(mapped)
  }
  return [...actions]
}
