import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"
import type {
  ChainNode, JsonValue, NodeCapabilityResult, ResumeVerificationResult, TaskChain, TaskCheckpoint,
} from "@browser-capture/contracts"
import { browserOperationSchema, requiredLegacyNodeOutcomes } from "@browser-capture/contracts"
import { BrowserError, browserGrantLimits, type BrowserCommand, type BrowserGrant, type BrowserInspection } from "./contracts.js"
import { pageSchema } from "./page.js"

export interface TaskChainBrowserPort {
  command(command: unknown, signal?: AbortSignal): Promise<string | null>
  commandWithTimeout?(command: unknown, signal: AbortSignal, timeoutMs: number): Promise<string | null>
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
export interface CapabilityAdapterInvocation {
  node: Extract<ChainNode, { kind: "capability" }>
  input: Record<string, JsonValue>
  config: JsonValue
  resumeCondition?: HumanAdapterInvocation["resumeCondition"]
  signal: AbortSignal
}

const keySchema = z.enum(["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight",
  "PageDown", "PageUp", "Home", "End"])
const tabIdSchema = z.number().int().nonnegative()
const durationSchema = z.number().int().nonnegative().max(browserGrantLimits.timeoutMs)
const pathSchema = z.string().trim().min(1).max(32_767)
const targetRoles = new Set(["link", "button", "textbox", "combobox"])
const inputNameSchema = z.string().regex(/^[a-z][A-Za-z0-9_-]{0,63}$/)
const capabilityTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("semantic"), role: inputNameSchema, name: inputNameSchema,
    fallbackName: inputNameSchema.optional(), occurrence: inputNameSchema.optional() }).strict(),
  z.object({ kind: z.literal("locator"), strategy: z.enum(["css", "label", "text", "test_id"]),
    value: inputNameSchema }).strict(),
])
const captureSchema = z.object({ scope: z.enum(["page", "target", "tabs", "downloads"]),
  target: capabilityTargetSchema.optional(), maxItems: z.number().int().min(1).max(300).optional() }).strict()
export const browserCapabilityConfigSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("perform"), operation: browserOperationSchema.nullable(),
    arguments: z.record(inputNameSchema, inputNameSchema), target: capabilityTargetSchema.optional(),
    capture: captureSchema.optional() }).strict().refine((value) => value.operation !== null || value.capture !== undefined,
      "browser_capability_empty"),
  z.object({ mode: z.literal("human") }).strict(),
])

export class TaskChainBrowserAdapter {
  constructor(private readonly session: TaskChainBrowserPort) {}

  capability = async (invocation: CapabilityAdapterInvocation): Promise<NodeCapabilityResult> => {
    if (invocation.node.capability.name !== "browser.perform" || invocation.node.capability.version !== 1) {
      return unsupported("capability_unsupported")
    }
    const config = browserCapabilityConfigSchema.parse(invocation.config)
    if (config.mode === "human") return this.requestHuman(invocation)
    let action: NodeCapabilityResult = { outcome: "success", output: null }
    if (config.operation !== null) {
      const node: Extract<ChainNode, { kind: "browser" }> = { id: invocation.node.id, label: invocation.node.label,
        kind: "browser", operation: config.operation, arguments: {}, timeoutMs: invocation.node.timeoutMs,
        outcomes: [...requiredLegacyNodeOutcomes.browser], outputContract: invocation.node.outputContract, writes: [] }
      action = await this.browser({ node, arguments: selectInputs(invocation.input, config.arguments),
        ...(config.target ? { target: targetFromInputs(config.target, invocation.input) } : {}), signal: invocation.signal })
      if (action.outcome !== "success" || !config.capture) return action
    }
    if (!config.capture) return action
    const node: Extract<ChainNode, { kind: "observe" }> = { id: invocation.node.id, label: invocation.node.label,
      kind: "observe", scope: config.capture.scope,
      ...(config.capture.target ? { target: legacyTarget(config.capture.target, invocation.input) } : {}),
      ...(config.capture.maxItems === undefined ? {} : { maxItems: config.capture.maxItems }),
      stableWhen: { operator: "exists", path: [] }, timeoutMs: invocation.node.timeoutMs,
      outcomes: [...requiredLegacyNodeOutcomes.observe], outputContract: invocation.node.outputContract, writes: [] }
    return this.observe({ node, ...(config.capture.target
      ? { target: targetFromInputs(config.capture.target, invocation.input) } : {}), signal: invocation.signal })
  }

  browser = async (invocation: BrowserAdapterInvocation): Promise<NodeCapabilityResult> => {
    const managed = Boolean(this.session.commandWithTimeout) && invocation.node.operation !== "wait"
    const timeout = managed ? null : AbortSignal.timeout(invocation.node.timeoutMs)
    try {
      const output = await this.executeBrowser({ ...invocation,
        signal: timeout ? AbortSignal.any([invocation.signal, timeout]) : invocation.signal })
      return { outcome: "success", output }
    } catch (error) { return timeout ? deadlineFailure(error, invocation.signal, timeout,
      invocationOrigin(invocation, this.session.state())) : browserFailure(error, invocationOrigin(invocation, this.session.state())) }
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
        const inspection = this.session.state()
        return { outcome: "success", output, ...(inspection ? { browser: browserSummary(inspection) } : {}) }
      }
      if (invocation.node.scope === "tabs") {
        const raw = await this.session.command({ type: "tabs" }, signal)
        const inspection = this.session.state()
        return { outcome: "success", output: parseCommandOutput(raw),
          ...(inspection ? { browser: browserSummary(inspection) } : {}) }
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

  private async requestHuman(invocation: CapabilityAdapterInvocation): Promise<NodeCapabilityResult> {
    const human = invocation.node.human
    if (!human || !invocation.resumeCondition) return unsupported("capability_human_contract_required")
    try {
      const current = await this.freshObservation(invocation.signal)
      if (current.outcome !== "success" || matches(invocation.resumeCondition, current.output ?? null)) return current
      await this.session.command({ type: "request_help", reason: helpReason(human.reason),
        prompt: human.prompt, timeoutMs: invocation.node.timeoutMs }, invocation.signal)
      const resumed = await this.freshObservation(invocation.signal)
      return resumed.outcome === "success" && matches(invocation.resumeCondition, resumed.output ?? null)
        ? resumed : { ...resumed, outcome: "blocked", reason: "human_resume_condition_not_met" }
    } catch (error) {
      const failure = browserFailure(error, inspectionOrigin(this.session.state()))
      const inspection = this.session.state()
      return failure.outcome === "human_required" && inspection ? { ...failure, browser: browserSummary(inspection) } : failure
    }
  }

  private async executeBrowser({ node, arguments: args, target, signal }: BrowserAdapterInvocation): Promise<JsonValue> {
    signal.throwIfAborted()
    const commandTarget = target ? lowLevelTarget(target) : undefined
    if (node.operation === "navigate") {
      const reuseOpenTab = z.boolean().optional().parse(args.reuseOpenTab)
      return this.command({ type: "navigate", url: z.string().url().parse(args.url),
        captureNetworkEvidence: z.boolean().default(false).parse(args.captureNetworkEvidence),
        ...(reuseOpenTab === undefined ? {} : { reuseOpenTab }) }, signal, node.timeoutMs)
    }
    if (node.operation === "click") {
      const dispatch = z.literal("dom").optional().parse(args.dispatch)
      return this.command({ type: "click", target: requiredTarget(commandTarget), ...(dispatch ? { dispatch } : {}) }, signal, node.timeoutMs)
    }
    if (node.operation === "hover") return this.command({ type: "hover", target: requiredTarget(commandTarget) }, signal, node.timeoutMs)
    if (node.operation === "fill") return this.command({ type: "fill", target: requiredTarget(commandTarget), value: z.string().parse(args.value) }, signal, node.timeoutMs)
    if (node.operation === "press") return this.command({ type: "press", ...(commandTarget ? { target: commandTarget } : {}), key: keySchema.parse(args.key) }, signal, node.timeoutMs)
    if (node.operation === "select") return this.command({ type: "select", target: requiredTarget(commandTarget), values: selectValues(args) }, signal, node.timeoutMs)
    if (node.operation === "scroll") return this.scroll(args, signal, node.timeoutMs)
    if (node.operation === "drag") throw new BrowserError("capability_unsupported")
    if (node.operation === "tab_open") return this.command({ type: "tab_open", url: z.string().url().parse(args.url),
      background: z.boolean().default(false).parse(args.background) }, signal, node.timeoutMs)
    if (node.operation === "tab_select" || node.operation === "tab_close") {
      return this.command({ type: node.operation, tabId: tabIdSchema.parse(args.tabId) }, signal, node.timeoutMs)
    }
    if (node.operation === "upload") return this.command({ type: "upload", target: requiredTarget(commandTarget),
      files: z.array(pathSchema).min(1).max(20).parse(args.files), mode: z.enum(["input", "drop"]).default("input").parse(args.mode) }, signal, node.timeoutMs)
    if (node.operation === "download") return this.command({ type: "download", ...(commandTarget ? { target: commandTarget } : {}),
      out: pathSchema.parse(args.out), overwrite: z.boolean().default(false).parse(args.overwrite) }, signal, node.timeoutMs)
    const durationMs = durationSchema.parse(args.durationMs)
    if (durationMs > node.timeoutMs) throw new BrowserError("budget_exceeded")
    await delay(durationMs, undefined, { signal })
    return null
  }

  private async command(command: BrowserCommand, signal: AbortSignal, timeoutMs: number) {
    return parseCommandOutput(await (this.session.commandWithTimeout
      ? this.session.commandWithTimeout(command, signal, timeoutMs) : this.session.command(command, signal)))
  }

  private async scroll(args: Record<string, JsonValue>, signal: AbortSignal, timeoutMs: number) {
    const direction = z.enum(["up", "down"]).parse(args.direction), steps = z.number().int().min(1).max(20).default(1).parse(args.steps)
    for (let index = 0; index < steps; index++) {
      signal.throwIfAborted()
      await (this.session.commandWithTimeout
        ? this.session.commandWithTimeout({ type: "press", key: direction === "down" ? "PageDown" : "PageUp" }, signal, timeoutMs)
        : this.session.command({ type: "press", key: direction === "down" ? "PageDown" : "PageUp" }, signal))
    }
    return null
  }
}

function selectInputs(input: Record<string, JsonValue>, mapping: Record<string, string>) {
  return Object.fromEntries(Object.entries(mapping).map(([name, source]) => {
    if (!Object.hasOwn(input, source)) throw new BrowserError("invalid_response")
    return [name, input[source]!]
  }))
}

function targetFromInputs(config: z.infer<typeof capabilityTargetSchema>, input: Record<string, JsonValue>): NonNullable<BrowserAdapterInvocation["target"]> {
  const value = (name: string) => {
    if (!Object.hasOwn(input, name)) throw new BrowserError("invalid_response")
    return input[name]!
  }
  return config.kind === "semantic" ? { kind: "semantic", role: value(config.role), name: value(config.name),
    ...(config.fallbackName ? { fallbackName: value(config.fallbackName) } : {}),
    ...(config.occurrence ? { occurrence: value(config.occurrence) } : {}) }
    : { kind: "locator", strategy: config.strategy, value: value(config.value) }
}

function legacyTarget(config: z.infer<typeof capabilityTargetSchema>, input: Record<string, JsonValue>): Extract<ChainNode, { kind: "observe" }>["target"] {
  const target = targetFromInputs(config, input)
  const constant = (value: JsonValue) => ({ source: "constant" as const, value })
  return target.kind === "semantic" ? { kind: "semantic", role: typeof target.role === "string" ? target.role : constant(target.role),
    name: constant(target.name), ...(target.fallbackName === undefined ? {} : { fallbackName: constant(target.fallbackName) }),
    ...(target.occurrence === undefined ? {} : { occurrence: constant(target.occurrence) }) }
    : { kind: "locator", strategy: target.strategy as "css" | "label" | "text" | "test_id", value: constant(target.value) }
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
  if (error.code === "access_denied") return failureResult("blocked", error, "access_denied", origin)
  if (error.code === "origin_denied") return { outcome: "failed", reason: error.code }
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
    httpStatus: error.evidence.httpStatus ?? null,
    retryAt: error.evidence.retryAt === undefined ? null : new Date(error.evidence.retryAt).toISOString() } }
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
    if (node.kind === "capability" && node.capability.name === "browser.perform") {
      const parsed = browserCapabilityConfigSchema.safeParse(node.config)
      if (!parsed.success) continue
      if (parsed.data.mode === "human") { actions.add("observe"); actions.add("request_help"); continue }
      const operation = parsed.data.operation
      const mapped = operation === "scroll" ? "press" : operation === "wait" || operation === "drag" ? null : operation
      if (mapped) actions.add(mapped)
      if (parsed.data.capture) actions.add(parsed.data.capture.scope === "tabs" ? "tabs"
        : parsed.data.capture.scope === "page" ? "page" : parsed.data.capture.scope === "target" ? "read" : "observe")
      continue
    }
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
