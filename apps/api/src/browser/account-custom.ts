import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { taskChainSchema, runnableTaskReleaseSchema, type TaskChain, type TaskRun } from "@browser-capture/contracts"
import { z } from "zod"
import { platformResultSchema, type PlatformSnapshot } from "@browser-capture/contracts/platform-account"
import type { BrowserIdentity } from "@browser-capture/contracts/browser-account"
import { taskContracts, taskReleases } from "../database/schema.js"
import type { AccountRepository } from "./account-repository.js"
import type { AccountIdentities } from "./account-identity.js"
import type { AccountWindows } from "./account-windows.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { admitAccountChain, executeAccount, accountResult, displayAccountIdentity } from "./account-runtime.js"
import { markerChain } from "./account-marker-chain.js"
import { executableChainDigest } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"

export function privateRun(run: TaskRun): TaskRun {
  const events = run.events.map(event => ({ ...event, execution: event.execution ? {
    input: { status: "redacted" as const, reason: "sensitive_fields" as const }, output: event.status === "finished"
      ? { status: "redacted" as const, reason: "sensitive_fields" as const } : undefined } : undefined }))
  const outcome = run.outcome ? { ...run.outcome, reason: "account_private_run", evidence: [],
    ...("code" in run.outcome ? { code: "account_private_run_failed" } : {}),
    ...("remaining" in run.outcome ? { remaining: ["account_private_run_incomplete"] } : {}) } : null
  return { ...run, outputs: {}, input: null, events, externalFailure: undefined, outcome,
    checkpoint: run.checkpoint ? { ...run.checkpoint, nodeOutputs: {}, variables: {}, outputs: {}, input: null, events,
      artifacts: [], browser: null, externalFailure: undefined,
      invocations: run.checkpoint.invocations.map(v => ({ ...v, output: null, reason: v.reason ? "account_private_run" : null })) } : null }
}

function boundResult(run: TaskRun) {
  const legacy = accountResult(run), output = Object.values(run.outputs)[0]
  const value = output?.kind === "value" ? output.value : null
  const parsed = platformResultSchema.safeParse(value && typeof value === "object" && !Array.isArray(value)
    ? { ...value, identityKey: value.identityKey || null, displayIdentity: value.displayIdentity || null } : value)
  const common = { identityKey: null, identityConfirmed: false, sources: [], evidence: ["bound_read_only_chain"], modelCalls: 0 as const, globalInitSuppressed: false }
  if (run.status === "completed" && run.consumed.llmCalls === 0 && run.auditComplete && parsed.success)
    return { ...parsed.data, ...common, displayIdentity: parsed.data.displayIdentity ? displayAccountIdentity(parsed.data.displayIdentity) : null }
  return { ...common, status: legacy.outcome === "verified" ? "authenticated" as const
    : legacy.outcome === "unauthenticated" ? "unauthenticated" as const : "inconclusive" as const,
    reason: legacy.reason, displayIdentity: legacy.displayIdentity }
}

export class AccountCustom {
  private selection: { public: NonNullable<PlatformSnapshot["markerSelection"]>; selector: string } | null = null
  constructor(private repository: AccountRepository, private identities: AccountIdentities,
    private windows: AccountWindows, private upstream: UpstreamBrowserRuntime) {}
  markerSelection() {
    if (this.selection && Date.parse(this.selection.public.expiresAt) <= Date.now()) this.selection = null
    return this.selection?.public ?? null
  }
  discardMarker() { this.selection = null }
  async pick(id: string, revision: number, meaning: "account" | "login", signal: AbortSignal) {
    const binding = this.current(id, revision), identity = this.repository.get("identity", binding.browserIdentityId)
    this.windows.assertControl(identity.kind)
    await this.identities.assertBound(identity)
    const window = this.repository.active(identity.id)
    if (!window || window.status !== "open") throw new DomainError("account_marker_window_required", "请先打开本站窗口并进入已绑定账号页。", 409)
    if (!this.upstream.accountSession) throw new Error("account_session_unavailable")
    this.selection = null
    const result = z.object({ selector: z.string().max(180), preview: z.string().max(120), url: z.url() }).strict().parse(
      await this.upstream.accountSession({ action: "pick_marker", ownerId: window.ownerId, leaseId: window.leaseId,
        kind: identity.kind, platformId: binding.id, catalogVersion: "", evidenceSha256: "0".repeat(64), payload: { url: binding.url } }, signal))
    signal.throwIfAborted(); this.current(id, revision)
    if (result.url !== binding.url) throw new Error("account_marker_page_changed")
    this.selection = { selector: result.selector, public: { reference: randomUUID(), bindingId: id, revision, meaning,
      preview: displayAccountIdentity(result.preview), expiresAt: new Date(Date.now() + 120000).toISOString() } }
  }
  confirmMarker(reference: string) {
    const publicSelection = this.markerSelection(), selection = this.selection
    if (!selection || publicSelection?.reference !== reference) throw new DomainError("account_marker_expired", "页面选取已失效，请重新选择。", 409)
    const binding = this.current(publicSelection.bindingId, publicSelection.revision)
    const chain = markerChain(binding.url, selection.selector, publicSelection.meaning, binding.chain)
    admitAccountChain(chain, binding.url)
    this.repository.save("platformMethod", { schemaVersion: 1, id: randomUUID(), platformId: binding.id,
      platformVersion: String(binding.revision + 1), sourceDigest: executableChainDigest(chain), chain, createdAt: new Date().toISOString() })
    this.selection = null
    return this.repository.save("binding", { ...binding, revision: binding.revision + 1, chain })
  }
  choices(url?: string) {
    const contracts = this.repository.store.db.select().from(taskContracts).where(eq(taskContracts.kind, "chain")).all()
      .flatMap(row => { const parsed = taskChainSchema.safeParse(row.body); return parsed.success ? [parsed.data] : [] })
    const published = this.repository.store.db.select().from(taskReleases).all().flatMap(row =>
      runnableTaskReleaseSchema.parse(row.body).content.steps.map(step => step.chain))
    const retained = this.repository.list("platformMethod").map(value => value.chain)
    const chains = [...new Map([...contracts, ...published, ...retained].map(chain => [`${chain.id}:${chain.version}`, chain])).values()]
    return chains.filter(chain => {
      const node = chain.nodes.find(value => value.id === chain.entry)
      const entry = node?.kind === "capability" && node.input.url?.source === "constant" ? node.input.url.value : null
      try { if (typeof entry !== "string" || url && new URL(entry).href !== new URL(url).href) return false
        admitAccountChain(chain, entry); return true } catch { return false }
    }).map(chain => ({ id: chain.id, version: chain.version, name: chain.name, chain }))
  }
  async bind(sessionId: string) {
    const session = this.repository.get("maintenance", sessionId)
    const result = await this.windows.action("page", session)
    const url = new URL(result.window.page?.url ?? "about:blank")
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new DomainError("account_current_page_unsuitable", "请先在网站完成登录，回到普通页面后再读取。", 409)
    const existing = this.repository.list("binding").find(value => !value.deletedAt && value.browserIdentityId === session.browserIdentityId && value.url === url.href)
    return existing ?? this.repository.save("binding", { schemaVersion: 1, id: randomUUID(), browserIdentityId: session.browserIdentityId,
      url: url.href, name: url.hostname, revision: 0, chain: null, createdAt: new Date().toISOString(), deletedAt: null })
  }
  attach(id: string, revision: number, chainId: string, version: number) {
    const binding = this.current(id, revision)
    const choice = this.choices(binding.url).find(value => value.id === chainId && value.version === version)
    if (!choice) throw new DomainError("account_chain_not_admitted", "所选链必须是本站已有的只读、零模型检查链。", 409)
    return this.repository.save("binding", { ...binding, revision: revision + 1, chain: choice.chain })
  }
  current(id: string, revision: number) {
    const binding = this.repository.get("binding", id)
    if (binding.deletedAt || binding.revision !== revision) throw new DomainError("account_binding_changed", "绑定已变化，请刷新。", 409)
    return binding
  }
  async run(id: string, requestId: string, signal: AbortSignal, selectedIdentity?: BrowserIdentity) {
    const binding = this.repository.get("binding", id)
    if (binding.deletedAt || !binding.chain) throw new DomainError("account_chain_required", "请先绑定本站已有的只读检查链。", 409)
    // WHY：维护使用本次所选浏览器，源码绑定不变；后台来源核验仍显式传原账号身份。
    const identity = selectedIdentity ?? this.repository.get("identity", binding.browserIdentityId)
    await this.identities.assertBound(identity)
    admitAccountChain(binding.chain, binding.url)
    const window = await this.windows.open(identity, { url: binding.url, name: binding.name, origins: [new URL(binding.url).origin] }, signal, false)
    if (!this.upstream.withCapabilities) throw new Error("account_browser_unavailable")
    const check = this.repository.save("platformCheck", { schemaVersion: 1, id: randomUUID(), requestId,
      browserIdentityId: identity.id, platformId: binding.id, platformVersion: String(binding.revision), chain: binding.chain,
      startedAt: new Date().toISOString(), finishedAt: null, status: "running", result: null, run: null })
    try {
      let final: TaskRun | null = null
      await this.upstream.withCapabilities({ signal, ownerId: window.ownerId, sessionPurpose: "account", allowedOrigins: [new URL(binding.url).origin],
        browserMode: identity.kind === "daily" ? "daily" : "dedicated-visible", managedWindow: { ownerId: window.ownerId, resume: true },
        handoffPurpose: () => "human_wait" }, async caps => {
        await executeAccount(binding.chain as TaskChain, randomUUID(), window.ownerId, binding.url, caps, signal, run => { final = run })
      })
      const run = final as TaskRun | null
      this.repository.save("platformCheck", { ...check, status: run?.status === "completed" ? "completed" : "interrupted",
        finishedAt: new Date().toISOString(), result: run ? boundResult(run) : null,
        // WHY：自定义链可能读取私密文本；目录仅保存脱敏结论及真实运行审计，不保存中间页面输出。
        run: run ? privateRun(run) : null })
    } finally {
      const current = this.repository.get("platformCheck", check.id)
      if (!current.finishedAt) this.repository.save("platformCheck", { ...current, status: signal.aborted ? "cancelled" : "interrupted", finishedAt: new Date().toISOString(),
        result: { status: "inconclusive", reason: signal.aborted ? "cancelled" : "runtime_failed", identityKey: null, displayIdentity: null,
          identityConfirmed: false, sources: [], evidence: [], modelCalls: 0, globalInitSuppressed: false } })
    }
  }
}
