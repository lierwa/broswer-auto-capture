import { z } from "zod"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { BrowserError, commandSchema, type BrowserGrant, type BrowserCommand, type BrowserHelpObserver, type BrowserHelpState, type BrowserInspection, type HumanWaitReason } from "./contracts.js"
import { PAGE_LINKS_EXPRESSION, evaluatedPageSchema, pageSchema, publicUrl } from "./page.js"
import { extractTarget, htmlResultSchema } from "./structured-read.js"
import { domActivationExpression, domActivationTabId, helpPrompt, sameNavigationLocation } from "./session-support.js"
export type Invoke = (command: string, args: string[], cleanup?: boolean, signal?: AbortSignal) => Promise<unknown>
const tabsSchema = z.object({ tabs: z.array(z.object({ tab_id: z.number().int(), active: z.boolean(), scope: z.literal("agent"), url: z.string() })) })
const observationSchema = z.object({ text: z.string(), tab_id: z.number().int(), truncated: z.boolean() })
type Observation = z.infer<typeof observationSchema>
const ACTION_NAVIGATION_COMMIT_BUDGET_MS = 10_000
const ACTION_NETWORK_IDLE_BUDGET_MS = 5_000
const SEMANTIC_TARGET_WAIT_BUDGET_MS = 24_000
const SEMANTIC_TARGET_MAX_OBSERVATIONS = 6
const SEMANTIC_TARGET_STATIC_OBSERVATIONS = 2
const SEMANTIC_TARGET_OBSERVE_MAX_TOKENS = 50_000
const SEMANTIC_TARGET_REVEAL_STEPS = 2
type CommandTarget = Extract<BrowserCommand, { type: "click" }>["target"]
const actionResultSchema = z.object({ tab_id: z.number().int() }).passthrough()
const optionalTabResultSchema = z.object({ tab_id: z.number().int().optional() }).passthrough()
const helpResultSchema = z.object({ outcome: z.enum(["continued", "completed", "cancelled", "timed_out", "disabled", "navigated"]) }).passthrough()
const networkResultSchema = z.object({
  tab_id: z.number().int(), next_since: z.number().int().nonnegative().optional(),
  entries: z.array(z.object({ sequence: z.number().int().nonnegative().optional(),
    kind: z.enum(["response", "failure"]), url: z.string().optional(),
    status: z.number().int().optional(), resource_type: z.string().optional() }).passthrough()).default([]),
}).passthrough()
export class BrowserSession {
  private scope: { maxCommands: number; timeoutMs: number; startedAt: number; waitedAtStart: number; count: number; signal: AbortSignal; onCommand: () => void } | null = null
  private discovered = new Set<string>()
  private evidencedOrigins = new Set<string>()
  private observedUrl = "about:blank"
  private active = true
  private pending: Promise<string | null> | null = null
  private manual = false
  private readonly startedAt = Date.now()
  private waitedMs = 0
  private waitingSince: number | null = null
  private lastInspection: BrowserInspection | null = null
  private commandSignal: AbortSignal | undefined
  private networkSince = 0
  private pendingActionNavigation: { tabId: number; fromUrl: string } | null = null
  private actionSpawnedTabs = new Set<number>()
  constructor(private readonly grant: BrowserGrant, private readonly sessionId: string, private readonly rawInvoke: Invoke,
    private readonly onHelp: BrowserHelpObserver = () => {}) {}
  beginStep(maxCommands: number, timeoutMs: number, signal: AbortSignal, onCommand: () => void) {
    if (this.pending || !Number.isInteger(maxCommands) || maxCommands < 1 || maxCommands > this.grant.maxCommands || timeoutMs < 1 || timeoutMs > this.grant.timeoutMs) throw new BrowserError("permission_denied")
    this.scope = { maxCommands, timeoutMs, startedAt: Date.now(), waitedAtStart: this.totalWaitedMs(), count: 0, signal, onCommand }
  }
  activeElapsedMs() { return Math.max(0, Date.now() - this.startedAt - this.totalWaitedMs()) }
  stepElapsedMs() {
    const scope = this.scope
    return scope ? Math.max(0, Date.now() - scope.startedAt - (this.totalWaitedMs() - scope.waitedAtStart)) : 0
  }
  private totalWaitedMs() { return this.waitedMs + (this.waitingSince === null ? 0 : Date.now() - this.waitingSince) }
  private assertActiveTime() {
    const scope = this.scope
    if (scope?.signal.aborted || this.commandSignal?.aborted) throw new BrowserError("cancelled")
    if (this.activeElapsedMs() >= this.grant.timeoutMs || scope && this.stepElapsedMs() >= scope.timeoutMs) throw new BrowserError("budget_exceeded")
  }
  private assertBudget() {
    const scope = this.scope
    this.assertActiveTime()
    if (scope && scope.count >= scope.maxCommands) throw new BrowserError("budget_exceeded")
  }
  private async invoke(command: string, args: string[], charged = true) {
    const scope = this.scope
    if (charged) {
      this.assertBudget()
      if (scope) {
      // WHY：语义动作包含重新观察等多条底层命令，每条发出前计费，失败也不能退还预算。
        scope.count++; scope.onCommand()
      }
    }
    const result = await this.rawInvoke(command, args, false, this.commandSignal)
    if (charged) this.assertActiveTime()
    return result
  }
  async close() {
    this.active = false
    await this.pending?.catch(() => {})
    if (!this.actionSpawnedTabs.size) return false
    let live: Set<number>
    try {
      const tabs = tabsSchema.parse(await this.rawInvoke("tab_list",
        ["tab", "list", "--scope", "agent", "--session", this.sessionId], true))
      live = new Set(tabs.tabs.map((tab) => tab.tab_id))
    } catch { return true }
    let failed = false
    for (const tabId of this.actionSpawnedTabs) {
      if (!live.has(tabId)) continue
      try {
        await this.rawInvoke("tab_close", ["tab", "close", String(tabId), "--session", this.sessionId], true)
      } catch { failed = true }
    }
    return failed
  }
  state() { return this.lastInspection ? structuredClone(this.lastInspection) : null }
  async command(raw: unknown, signal?: AbortSignal): Promise<string | null> {
    const command = commandSchema.parse(raw)
    if (!this.active) throw new BrowserError("session_closed")
    if (this.manual) throw new BrowserError("manual_required")
    if (this.pending) throw new BrowserError("busy")
    if (!this.grant.actions.includes(command.type)) throw new BrowserError("permission_denied")
    if (signal?.aborted) throw new BrowserError("cancelled")
    if (this.pendingActionNavigation && !["observe", "page", "read", "request_help"].includes(command.type)) {
      this.pendingActionNavigation = null
    }
    // WHY：只有紧邻的 observe/page 结果可供 page 补充 href；任何其他命令都可能改变页面，必须使缓存失效。
    if (command.type !== "observe" && command.type !== "page") this.lastInspection = null
    this.commandSignal = signal
    const pending = this.execute(command)
    this.pending = pending
    try { return await pending } finally {
      this.pending = null; this.commandSignal = undefined
      // WHY：语义定位会临时观察旧页面；动作结束后该缓存已过期，后续 page 必须重新读取实际状态。
      if (command.type !== "observe" && command.type !== "page") this.lastInspection = null
      if (["observe", "page", "read", "request_help"].includes(command.type)) this.pendingActionNavigation = null
    }
  }
  private allow(url: string) {
    if (url === "about:blank") return
    let value: URL
    try { value = new URL(url) } catch { throw new BrowserError("origin_denied") }
    if (value.username || value.password || !["http:", "https:"].includes(value.protocol)
      || !(this.grant.allowedOrigins.includes(value.origin) || this.evidencedOrigins.has(value.origin))) {
      const observedOrigin = ["http:", "https:"].includes(value.protocol) ? value.origin : null
      throw new BrowserError("origin_denied", observedOrigin ? { observedOrigin } : {})
    }
  }
  private async currentTabState() {
    const result = tabsSchema.parse(await this.invoke("tab_list", ["tab", "list", "--scope", "agent", "--session", this.sessionId]))
    const active = result.tabs.filter((tab) => tab.active)
    if (active.length !== 1) throw new BrowserError("invalid_response")
    this.observedUrl = active[0]!.url
    return { id: active[0]!.tab_id, url: active[0]!.url }
  }
  private async currentTab() {
    const current = await this.allowedCurrentTabState()
    return current.id
  }
  private async allowedCurrentTabState() {
    const current = await this.settlePendingAction(await this.currentTabState())
    await this.allowCurrentState(current)
    return current
  }
  private async settlePendingAction(current: { id: number; url: string }, awaitInitialTransition = false) {
    const pending = this.pendingActionNavigation
    let transitioned = pending && (pending.tabId !== current.id || pending.fromUrl !== current.url)
    if (!pending || !awaitInitialTransition && (!transitioned || publicUrl(current.url))) return current
    const scopeRemaining = this.scope ? this.scope.timeoutMs - this.stepElapsedMs() : this.grant.timeoutMs - this.activeElapsedMs()
    if (scopeRemaining <= 0) throw new BrowserError("budget_exceeded")
    const timeoutMs = Math.max(1, Math.min(ACTION_NAVIGATION_COMMIT_BUDGET_MS, Math.floor(scopeRemaining)))
    if (awaitInitialTransition && !transitioned) {
      // WHY：click 返回时同标签导航可能尚未开始；先等一次 commit，不能用固定 sleep 或重复点击碰运气。
      await this.waitForNavigation(current.id, "commit", timeoutMs)
      current = await this.currentTabState()
      transitioned = pending.tabId !== current.id || pending.fromUrl !== current.url
    }
    if (!transitioned && publicUrl(current.url)) return current
    // WHY：URL/标签变化只证明导航已提交；读取业务页面前还要等主文档 load，已完成页面由 BrowserSkill readyState probe 立即返回。
    await this.waitForNavigation(current.id, "load", timeoutMs)
    // TRADE-OFF：动态内容通常在 load 后进入页面；networkidle 只等待真实生命周期，超时后继续并由后续业务证据决定成败。
    await this.waitForNavigation(current.id, "networkidle", Math.min(timeoutMs, ACTION_NETWORK_IDLE_BUDGET_MS))
    return this.currentTabState()
  }
  private async waitForNavigation(tabId: number, waitUntil: "commit" | "load" | "networkidle", timeoutMs: number) {
    try {
      await this.invoke("wait_for_navigation", ["wait-for-navigation", "--session", this.sessionId, "--tab-id", String(tabId),
        "--wait-until", waitUntil, "--timeout", `${timeoutMs}ms`])
    } catch (error) {
      if (error instanceof BrowserError && ["cancelled", "budget_exceeded"].includes(error.code)) throw error
    }
  }
  private async allowCurrentState(current: { id: number; url: string }) {
    const pending = this.pendingActionNavigation
    if (pending && (pending.tabId !== current.id || pending.fromUrl !== current.url)) {
      try {
        const interruption = await this.navigationInterruption(pending.fromUrl, current.url)
        if (interruption) throw interruption
        this.allowActionLanding(current.url)
        // WHY：动作落点仍可能在加载中继续重定向；保留到紧邻观察结束，并逐跳绑定实际状态。
        pending.tabId = current.id; pending.fromUrl = current.url
      } catch (error) {
        this.pendingActionNavigation = null
        throw error
      }
      return
    }
    this.allow(current.url)
  }
  private async observe(maxTokens = 12_000): Promise<Observation> {
    const actionPending = Boolean(this.pendingActionNavigation)
    const current = await this.allowedCurrentTabState()
    let result = observationSchema.parse(await this.invoke("observe", ["observe", "--session", this.sessionId, "--tab-id", String(current.id), "--max-tokens", String(maxTokens)]))
    if (result.tab_id !== current.id) throw new BrowserError("invalid_response")
    let settled = await this.allowedCurrentTabState()
    if (settled.id !== current.id || settled.url !== current.url) {
      if (!actionPending) throw new BrowserError("invalid_response")
      // WHY：动作与紧邻观察竞速时，旧页观察不能冒充新落点证据；只在已登记动作转场后重读一次实际页。
      result = observationSchema.parse(await this.invoke("observe", ["observe", "--session", this.sessionId,
        "--tab-id", String(settled.id), "--max-tokens", String(maxTokens)]))
      if (result.tab_id !== settled.id) throw new BrowserError("invalid_response")
      const confirmed = await this.allowedCurrentTabState()
      if (confirmed.id !== settled.id || confirmed.url !== settled.url) throw new BrowserError("invalid_response")
      settled = confirmed
    }
    this.lastInspection = { sessionId: this.sessionId, tabId: settled.id, url: settled.url,
      text: result.text, truncated: result.truncated, observedAt: new Date().toISOString() }
    return result
  }
  private async requestHelp(tabId: number, reason: HumanWaitReason, origin: string | null,
    prompt = helpPrompt(reason), timeoutMs = 1_800_000): Promise<BrowserHelpState> {
    const waitpoint: BrowserHelpState = { id: randomUUID(), reason, status: "waiting", prompt, origin,
      requestedAt: new Date().toISOString(), resolvedAt: null }
    this.manual = true; this.waitingSince = Date.now()
    await this.onHelp(waitpoint)
    try {
      const result = helpResultSchema.parse(await this.invoke("request_help", ["request-help", "--session", this.sessionId, "--tab-id", String(tabId),
        "--prompt", waitpoint.prompt, "--title", "需要人工处理", "--timeout", `${timeoutMs}ms`], false))
      const status = result.outcome === "continued" || result.outcome === "completed" ? "completed"
        : result.outcome === "navigated" ? "failed" : result.outcome
      const resolved = { ...waitpoint, status, resolvedAt: new Date().toISOString() } satisfies BrowserHelpState
      await this.onHelp(resolved)
      if (status === "completed") { this.manual = false; return resolved }
      throw new BrowserError(status === "cancelled" ? "cancelled" : "manual_required")
    } catch (error) {
      if (error instanceof BrowserError && error.code === "cancelled") {
        await Promise.resolve(this.onHelp({ ...waitpoint, status: "cancelled", resolvedAt: new Date().toISOString() })).catch(() => {})
        throw error
      }
      if (error instanceof BrowserError && error.code === "manual_required") throw error
      await Promise.resolve(this.onHelp({ ...waitpoint, status: "failed", resolvedAt: new Date().toISOString() })).catch(() => {})
      throw new BrowserError("manual_required")
    } finally {
      if (this.waitingSince !== null) this.waitedMs += Date.now() - this.waitingSince
      this.waitingSince = null
    }
  }
  private async page() {
    const cached = this.lastInspection
    const observed = cached ? { tab_id: cached.tabId, text: cached.text, truncated: cached.truncated } : await this.observe()
    const beforeUrl = cached?.url ?? this.observedUrl
    const result = evaluatedPageSchema.parse(await this.invoke("page_links", ["evaluate", PAGE_LINKS_EXPRESSION, "--session", this.sessionId, "--tab-id", String(observed.tab_id)]))
    if (result.tab_id !== observed.tab_id || await this.currentTab() !== observed.tab_id) throw new BrowserError("invalid_response")
    this.allow(result.value.url)
    if (result.value.url !== beforeUrl || result.value.url !== this.observedUrl) throw new BrowserError("invalid_response")
    const url = publicUrl(result.value.url)
    if (!url) throw new BrowserError("permission_denied")
    const links = result.value.links.flatMap((link) => { const value = publicUrl(link.url); return value ? [{ url: value, title: link.title }] : [] })
    for (const link of links) this.discovered.add(link.url)
    return JSON.stringify(pageSchema.parse({ url, title: result.value.title, links, headings: result.value.headings,
      paragraphs: result.value.paragraphs, text: observed.text, truncated: observed.truncated }))
  }
  private async execute(command: BrowserCommand) {
    if (command.type === "read") return this.readTarget(command)
    if (command.type === "request_help") {
      // WHY：验证/登录中转页可能不在原 grant；人工等待必须先落下，不能被 origin 门禁挡在外面。
      const current = await this.currentTabState()
      const currentUrl = publicUrl(current.url)
      await this.requestHelp(current.id, command.reason, currentUrl ? new URL(currentUrl).origin : null,
        command.prompt, command.timeoutMs)
      // WHY：人工返回只交还控制权；是否登录成功必须由上层 fresh page 观察核验，不能由按钮点击生成认证事实。
      return null
    }
    if (command.type === "page") return this.page()
    if (command.type === "follow") {
      // WHY：探索只可沿本会话真实页面链接扩展；验证和复跑仍只能使用授权时已绑定的 origin。
      if (this.grant.purpose !== "exploration" || !this.discovered.has(command.url)) throw new BrowserError("permission_denied")
      this.evidencedOrigins.add(new URL(command.url).origin)
      command = { type: "navigate", url: command.url, captureNetworkEvidence: false }
    }
    if (command.type === "navigate") {
      this.allow(command.url)
      if (command.reuseOpenTab && await this.activateOpenTab(command.url)) return null
      let result: z.infer<typeof actionResultSchema> | null = null
      let commandError: unknown = null
      try {
        result = actionResultSchema.parse(await this.invoke("navigate", ["navigate", command.url, "--session", this.sessionId]))
      } catch (error) {
        if (error instanceof BrowserError && ["cancelled", "budget_exceeded"].includes(error.code)) throw error
        commandError = error
      }
      // WHY：命令回包失败不证明页面未落地；先读取实际标签和可用网络事实，避免立即重发同一导航。
      const current = await this.currentTabState()
      const changedTarget = !sameNavigationLocation(command.url, current.url)
      if (command.captureNetworkEvidence || commandError || changedTarget) {
        const interruption = await this.navigationInterruption(command.url, current.url)
        if (interruption) throw interruption
      }
      try { this.allow(current.url) }
      catch (error) {
        if (error instanceof BrowserError && error.code === "origin_denied") {
          throw new BrowserError("origin_denied", { origin: new URL(command.url).origin,
            ...(error.evidence.observedOrigin ? { observedOrigin: error.evidence.observedOrigin } : {}) })
        }
        throw error
      }
      if (commandError) {
        if (sameNavigationLocation(command.url, current.url)) return null
        throw commandError
      }
      if (!result || current.id !== result.tab_id) throw new BrowserError("invalid_response")
      return null
    }
    if (command.type === "observe") return this.observeUntil(command.until)
    if (command.type === "tabs") return JSON.stringify(await this.listTabs())
    if (command.type === "tab_open" || command.type === "tab_select" || command.type === "tab_close") return this.tabAction(command)
    return this.targetAction(command)
  }
  private async navigationInterruption(targetUrl: string, currentUrl: string) {
    try {
      const result = networkResultSchema.parse(await this.invoke("network", ["network", "--session", this.sessionId,
        "--since", String(this.networkSince), "--limit", "200"]))
      this.networkSince = result.next_since ?? Math.max(this.networkSince,
        ...result.entries.map((entry) => entry.sequence ?? 0))
      const origins = new Set([new URL(targetUrl).origin, new URL(currentUrl).origin])
      const responses = result.entries.filter((entry) => entry.kind === "response" && entry.status
        && (!entry.resource_type || entry.resource_type.toLowerCase() === "document") && entry.url && origins.has(new URL(entry.url).origin))
      const entry = responses.findLast((item) => [401, 403, 429].includes(item.status!) || item.status! >= 500)
      if (!entry?.status) return null
      const evidence = { origin: new URL(targetUrl).origin, observedOrigin: new URL(currentUrl).origin, httpStatus: entry.status }
      if (entry.status === 401) return new BrowserError("authentication_required", evidence)
      if (entry.status === 403) return new BrowserError("access_denied", evidence)
      if (entry.status === 429) return new BrowserError("rate_limited", evidence)
      return new BrowserError("transient_failure", evidence)
    } catch (error) {
      // TRADE-OFF：旧 BrowserSkill 或旧链路预算可能没有网络诊断能力；保留原导航事实，不把诊断失败改写成页面失败。
      if (error instanceof BrowserError && error.code === "cancelled") throw error
      return null
    }
  }
  private async readTarget(command: Extract<BrowserCommand, { type: "read" }>) {
    const before = await this.allowedCurrentTabState()
    const result = htmlResultSchema.parse(await this.invoke("get_html", ["get-html", "--session", this.sessionId,
      "--tab-id", String(before.id), "--max-bytes", "4000000"]))
    const after = await this.currentTabState()
    if (before.id !== result.tab_id || after.id !== before.id || after.url !== before.url) throw new BrowserError("invalid_response")
    const { type: _, ...target } = command
    return JSON.stringify(extractTarget(result.html, before.url, target, new Date().toISOString(), result.truncated))
  }
  private async listTabs() {
    const result = tabsSchema.parse(await this.invoke("tab_list", ["tab", "list", "--scope", "agent", "--session", this.sessionId]))
    for (const tab of result.tabs) this.allow(tab.url)
    return result.tabs.map((tab) => ({ tabId: tab.tab_id, url: tab.url, active: tab.active }))
  }
  private async activateOpenTab(url: string) {
    const tabs = await this.listTabs()
    const matches = tabs.filter((tab) => sameNavigationLocation(url, tab.url))
    if (!matches.length) return false
    const selected = matches.find((tab) => tab.active) ?? matches[0]!
    if (!selected.active) {
      await this.invoke("tab_select", ["tab", "select", String(selected.tabId), "--session", this.sessionId])
      const after = await this.listTabs()
      if (!after.some((tab) => tab.tabId === selected.tabId && tab.active)) throw new BrowserError("invalid_response")
    }
    this.observedUrl = selected.url
    return true
  }
  private async resolveActionTarget(target?: CommandTarget) {
    if (!target || "selector" in target) {
      const current = await this.allowedCurrentTabState()
      return { tabId: current.id, url: current.url,
        args: target ? ["--selector", target.selector] : [] as string[] }
    }
    const deadline = Date.now() + SEMANTIC_TARGET_WAIT_BUDGET_MS
    for (let attempt = 0; attempt < SEMANTIC_TARGET_MAX_OBSERVATIONS; attempt++) {
      // TRADE-OFF：语义定位可读取更大的本地语义树，避免长列表后部目标被普通页面读取上限截掉；内容不写日志也不交给模型。
      const observed = await this.observe(SEMANTIC_TARGET_OBSERVE_MAX_TOKENS)
      // WHY：语义动作只重新观察同一目标是否就绪；临时 @eN 只在最终一次命令内使用，绝不重复业务动作。
      const candidates = [...observed.text.matchAll(/^([ \t]*)(@e\d+)\s+(\w+)\s+"((?:\\.|[^"\\])*)"/gm)]
        .filter((match) => match[3] === target.role)
        .map((match) => ({ ref: match[2]!, depth: match[1]!.length, name: JSON.parse(`"${match[4]}"`) as string }))
      const exact = candidates.filter((candidate) => candidate.name === target.name)
      // WHY：首次轨迹已证明 fallbackName 是完整名称的一部分；仅在精确名称消失时做唯一包含匹配，促销文案变化不能触发猜选。
      const matches = exact.length || !target.fallbackName ? exact
        : candidates.filter((candidate) => candidate.name.includes(target.fallbackName!))
      const shallowest = matches.length ? Math.min(...matches.map((match) => match.depth)) : -1
      const refs = matches.filter((match) => match.depth === shallowest).map((match) => match.ref)
      if (target.occurrence === undefined && refs.length > 1) throw new BrowserError("target_ambiguous")
      const ref = refs[target.occurrence ?? 0]
      if (ref) {
        const url = this.lastInspection?.url
        if (!url) throw new BrowserError("invalid_response")
        return { tabId: observed.tab_id, url, args: [ref] }
      }
      if (observed.truncated) throw new BrowserError("invalid_response")
      if (attempt === SEMANTIC_TARGET_MAX_OBSERVATIONS - 1 || Date.now() >= deadline) throw new BrowserError("target_missing")
      if (attempt >= SEMANTIC_TARGET_STATIC_OBSERVATIONS - 1) {
        // WHY：列表页首屏之外的目标只有滚动后才进入语义树；翻页是有界定位动作，业务 click/fill 仍只执行一次。
        await this.revealSemanticTarget(observed.tab_id, this.lastInspection?.url)
      }
      await delay(Math.min(100, deadline - Date.now()))
    }
    throw new BrowserError("target_missing")
  }
  private async revealSemanticTarget(tabId: number, expectedUrl: string | undefined) {
    if (!expectedUrl) throw new BrowserError("invalid_response")
    let result: z.infer<typeof optionalTabResultSchema> = {}
    // TRADE-OFF：成对翻页后再做一次昂贵语义观察，使 30 秒节点预算能覆盖至多八屏懒加载内容。
    for (let index = 0; index < SEMANTIC_TARGET_REVEAL_STEPS; index++) {
      result = optionalTabResultSchema.parse(await this.invoke("press", ["press", "PageDown", "--session", this.sessionId,
        "--tab-id", String(tabId)]))
    }
    const current = await this.currentTabState()
    if (result.tab_id !== undefined && result.tab_id !== tabId || current.id !== tabId || current.url !== expectedUrl) {
      throw new BrowserError("invalid_response")
    }
  }
  private allowActionLanding(url: string) {
    try { this.allow(url); return } catch (error) {
      if (!(error instanceof BrowserError) || error.code !== "origin_denied") throw error
    }
    const value = publicUrl(url)
    if (!value) throw new BrowserError("origin_denied")
    // TRADE-OFF：只扩展已授权页面上的成功用户动作实际落点；动作前 direct navigate 和其他未访问 origin 仍被拒绝。
    this.evidencedOrigins.add(new URL(value).origin)
  }
  private async targetAction(command: Exclude<BrowserCommand, { type: "read" | "page" | "follow" | "navigate" | "observe" | "tabs"
    | "tab_open" | "tab_select" | "tab_close" | "request_help" }>) {
    const target = "target" in command ? command.target : undefined
    const located = await this.resolveActionTarget(target)
    const domTarget = command.type === "click" && command.dispatch === "dom" ? command.target : undefined
    // WHY：press 的目标引用必须通过 --ref，其他动作才接受位置参数；不能把成功定位误报为键盘执行失败。
    const keyTarget = located.args[0]?.startsWith("@") ? ["--ref", ...located.args] : located.args
    const args = domTarget ? ["evaluate", domActivationExpression(domTarget)]
      : command.type === "click" || command.type === "hover" ? [command.type, ...located.args]
      : command.type === "fill" ? ["fill", ...located.args, "--value", command.value]
        : command.type === "press" ? ["press", command.key, ...keyTarget]
          : command.type === "select" ? ["select", ...located.args, ...command.values.flatMap((value) => ["--value", value])]
            : command.type === "upload" ? ["upload", ...located.args,
              ...command.files.flatMap((file) => ["--file", file]), "--mode", command.mode]
              : ["download", ...located.args, "--out", command.out, ...(command.overwrite ? ["--overwrite"] : [])]
    const raw = await this.invoke(domTarget ? "evaluate" : command.type,
      [...args, "--session", this.sessionId, "--tab-id", String(located.tabId)])
    const result = domTarget ? { tab_id: domActivationTabId(raw) } : optionalTabResultSchema.parse(raw)
    let current = await this.currentTabState()
    const canNavigate = ["click", "press"].includes(command.type)
    if (canNavigate) {
      this.pendingActionNavigation = { tabId: located.tabId, fromUrl: located.url }
      current = await this.settlePendingAction(current, true)
    }
    if (result.tab_id !== undefined && result.tab_id !== located.tabId
      && (!canNavigate || result.tab_id !== current.id)) throw new BrowserError("invalid_response")
    if (!canNavigate && current.id !== located.tabId) throw new BrowserError("invalid_response")
    if (!canNavigate) this.allow(current.url)
    else {
      await this.allowCurrentState(current)
      if (current.id !== located.tabId) await this.retainActionTabPair(located.tabId, current.id)
    }
    return null
  }
  private async retainActionTabPair(sourceTabId: number, currentTabId: number) {
    this.actionSpawnedTabs.add(currentTabId)
    const tabs = await this.listTabs()
    const extras = tabs.filter((tab) => this.actionSpawnedTabs.has(tab.tabId)
      && tab.tabId !== sourceTabId && tab.tabId !== currentTabId)
    // WHY：页面可以把普通点击强制打到新标签；只关闭本任务动作直接产生的旧落点，不能把人工接管时用户新开的标签当成任务资产。
    for (const tab of extras) {
      await this.invoke("tab_close", ["tab", "close", String(tab.tabId), "--session", this.sessionId])
      this.actionSpawnedTabs.delete(tab.tabId)
    }
    if (!extras.length) return
    const remaining = await this.listTabs()
    if (!remaining.some((tab) => tab.tabId === sourceTabId)
      || !remaining.some((tab) => tab.tabId === currentTabId && tab.active)) throw new BrowserError("invalid_response")
  }
  private async tabAction(command: Extract<BrowserCommand, { type: "tab_open" | "tab_select" | "tab_close" }>) {
    if (command.type === "tab_open") {
      this.allow(command.url)
      const result = actionResultSchema.parse(await this.invoke("tab_create", ["tab", "create", "--session", this.sessionId,
        "--url", command.url, ...(command.background ? ["--no-active"] : [])]))
      const tabs = await this.listTabs(), created = tabs.find((tab) => tab.tabId === result.tab_id)
      if (!created || (!command.background && !created.active)) throw new BrowserError("invalid_response")
      return JSON.stringify(created)
    }
    const tabs = await this.listTabs()
    if (!tabs.some((tab) => tab.tabId === command.tabId)) throw new BrowserError("permission_denied")
    await this.invoke(command.type, ["tab", command.type === "tab_select" ? "select" : "close",
      String(command.tabId), "--session", this.sessionId])
    const after = await this.listTabs()
    if (command.type === "tab_select" && !after.some((tab) => tab.tabId === command.tabId && tab.active)) throw new BrowserError("invalid_response")
    if (command.type === "tab_close" && after.some((tab) => tab.tabId === command.tabId)) throw new BrowserError("invalid_response")
    if (command.type === "tab_close") this.actionSpawnedTabs.delete(command.tabId)
    return null
  }
  private async observeUntil(until?: { text: string; timeoutMs: number }) {
    const deadline = Date.now() + (until?.timeoutMs ?? 0)
    // WHY：点击完成不代表异步页面已经更新；等待业务可见文本，有时间和命令双重上限，不重复点击。
    do {
      const observed = await this.observe()
      if (!until || observed.text.includes(until.text)) return observed.text
      if (Date.now() >= deadline) throw new BrowserError("readiness_timeout")
      await delay(Math.min(100, deadline - Date.now()))
    } while (true)
  }
}
