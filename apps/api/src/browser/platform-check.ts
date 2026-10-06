import { randomUUID } from "node:crypto"
import type { BrowserIdentity, AccountMaintenance } from "@browser-capture/contracts/browser-account"
import { platformResultSchema, type Platform, type PlatformCheck } from "@browser-capture/contracts/platform-account"
import { TaskChainRuntime, executableChainDigest } from "@browser-capture/runtime"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import type { AccountRepository } from "./account-repository.js"
import { platformChain } from "./platform-chain.js"
import { accountRequest, displayAccountIdentity } from "./account-runtime.js"
import { accountWaitChain } from "./account-wait-chain.js"
import { setTimeout as delay } from "node:timers/promises"

export class PlatformChecks {
  constructor(private repository: AccountRepository, private upstream: UpstreamBrowserRuntime,
    private version: string, private sourceDigest: string) {}
  private method(platform: Platform, action: "check" | "observe" | "wait") {
    const candidate = action === "wait" ? accountWaitChain(platform, this.version, this.sourceDigest) : platformChain(platform, this.version, this.sourceDigest, action)
    const history = this.repository.list("platformMethod").filter(value => value.platformId === platform.id && value.chain.stepId === candidate.stepId)
    const previous = history.at(-1)
    if (previous?.platformVersion === this.version && previous.sourceDigest === this.sourceDigest
      && executableChainDigest(previous.chain) === executableChainDigest({ ...candidate, id: previous.chain.id,
        taskId: previous.chain.taskId, plan: previous.chain.plan, version: previous.chain.version })) return previous
    const chain = previous ? { ...candidate, id: previous.chain.id, version: previous.chain.version + 1 } : candidate
    return this.repository.save("platformMethod", { schemaVersion: 1, id: randomUUID(), platformId: platform.id,
      platformVersion: this.version, sourceDigest: this.sourceDigest, chain, createdAt: new Date().toISOString() })
  }
  async run(platform: Platform, identity: BrowserIdentity, window: AccountMaintenance, requestId: string, signal: AbortSignal,
    action: "check" | "observe" | "wait" = "check", intent = { expectedIdentityKey: "", expectedDisplayIdentity: "", switching: false }) {
    const chain = this.method(platform, action).chain
    const initial = this.repository.save("platformCheck", { schemaVersion: 1, id: randomUUID(), requestId,
      browserIdentityId: identity.id, platformId: platform.id, platformVersion: this.version, chain,
      startedAt: new Date().toISOString(), finishedAt: null, status: "running", result: null, run: null })
    let result: PlatformCheck["result"] = null
    let observedSignedOut = false
    const persist = (run: NonNullable<PlatformCheck["run"]>) => {
      const current = this.repository.get("platformCheck", initial.id)
      // WHY：取消已结束的运行不可被迟到回执改写；历史结果和独立run仍保留。
      if (current.finishedAt) return
      this.repository.save("platformCheck", { ...current, run, result,
        finishedAt: run.status === "running" ? null : new Date().toISOString(),
        status: run.status === "running" ? "running" : signal.aborted ? "cancelled" : run.status === "completed" ? "completed" : "interrupted" })
    }
    try {
      await new TaskChainRuntime().execute({ chain, request: accountRequest(chain, randomUUID(), window.ownerId, action === "wait" ? intent : null),
        control: { signal }, capabilities: { persist, capability: async invocation => {
          if (invocation.node.capability.name === "account.wait") {
            await delay(3000, undefined, { signal: invocation.signal }); return { outcome: "success", output: null }
          }
          if (invocation.node.capability.name !== "browser.imported-read" || !this.upstream.accountSession) throw new Error("account_imported_read_unavailable")
          const probeSignal = AbortSignal.any([invocation.signal, AbortSignal.timeout(action === "wait" ? 8000 : action === "observe" ? 20000 : 60000)])
          const raw = await this.upstream.accountSession({ action: action === "check" ? "check" : "observe", ownerId: window.ownerId, leaseId: window.leaseId,
            kind: identity.kind, platformId: platform.id, catalogVersion: this.version, evidenceSha256: this.sourceDigest, payload: null },
          probeSignal).catch(error => {
            if (action !== "wait" || invocation.signal.aborted || !probeSignal.aborted) throw error
            // WHY：单次网络观察超时不是人工登录超时；继续原 LangGraph 等待，不关闭正在扫码的页面。
            return { status: "inconclusive", reason: "network_timeout", identityKey: null, displayIdentity: null,
              identityConfirmed: false, evidence: [], sources: [], modelCalls: 0, globalInitSuppressed: false }
          })
          invocation.signal.throwIfAborted()
          const parsed = platformResultSchema.parse(raw)
          result = { ...parsed, displayIdentity: parsed.displayIdentity ? displayAccountIdentity(parsed.displayIdentity) : null }
          observedSignedOut ||= result.status === "unauthenticated"
          const same = intent.expectedIdentityKey ? !result.identityKey || result.identityKey === intent.expectedIdentityKey
            : !intent.expectedDisplayIdentity || !result.displayIdentity || result.displayIdentity === intent.expectedDisplayIdentity
          // WHY：现有可移植ValueSchema不支持nullable；空字符串仅用于链路传输，目录事实保存原nullable合同。
          return { outcome: "success", output: { ...result, identityKey: result.identityKey ?? "", displayIdentity: result.displayIdentity ?? "",
            ...(action === "wait" ? { pending: result.status !== "authenticated" || intent.switching && same && !observedSignedOut } : {}) } }
        } } })
    } finally {
      const current = this.repository.get("platformCheck", initial.id)
      if (!current.finishedAt || !current.result) this.repository.save("platformCheck", { ...current, finishedAt: current.finishedAt ?? new Date().toISOString(),
        status: signal.aborted ? "cancelled" : "interrupted", result: { status: "inconclusive", reason: signal.aborted ? "cancelled" : "runtime_failed",
          identityKey: null, displayIdentity: null, identityConfirmed: false, evidence: [], sources: [], modelCalls: 0, globalInitSuppressed: false } })
    }
    return this.repository.get("platformCheck", initial.id)
  }
}
