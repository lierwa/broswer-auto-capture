import { randomUUID } from "node:crypto"
import type { AccountMaintenance, BrowserIdentity } from "@browser-capture/contracts/browser-account"
import type { Platform } from "@browser-capture/contracts/platform-account"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import type { AccountRepository } from "./account-repository.js"
import type { AccountIdentities } from "./account-identity.js"
import { DomainError } from "../errors.js"

/** WHY：只组合原owner/handoff，不复制浏览器驱动或按平台造生命周期。 */
export class AccountWindows {
  constructor(private repository: AccountRepository, private identities: AccountIdentities,
    private upstream: UpstreamBrowserRuntime, private assertAvailable: (kind: BrowserIdentity["kind"]) => void,
    private releasedOwners: (kind: BrowserIdentity["kind"]) => string[] = () => []) {}
  update(session: AccountMaintenance, status: AccountMaintenance["status"], reason: string | null = null) {
    return this.repository.save("maintenance", { ...session, status, reason, updatedAt: new Date().toISOString() })
  }
  assertControl(kind: BrowserIdentity["kind"]) { this.assertAvailable(kind) }
  async open(identity: BrowserIdentity, platform: Pick<Platform, "url" | "name" | "origins"> | null,
    signal: AbortSignal, navigate = true, headless = identity.kind === "dedicated" && !navigate) {
    await this.identities.assertBound(identity)
    this.assertControl(identity.kind)
    let session = this.repository.active(identity.id)
    if (session?.headless && !headless) {
      // WHY：人工登录不能复用上次自动检查遗留的隐藏窗口，须先确认原 owner 关闭。
      await this.finish(session)
      if (this.repository.get("maintenance", session.id).status !== "closed")
        throw new DomainError("account_window_unconfirmed", "原检查窗口关闭尚未确认，请重试。", 409)
      session = null
    }
    if (session?.status === "cleanup_required") {
      const inspected = await this.action("inspect", session).catch(() => null)
      if (inspected?.window.active) session = this.update(session, "open")
      else {
        // WHY：未知枚举不是已关闭。仅原生 owner 关闭确认后才允许创建下一页。
        await this.finish(session)
        if (this.repository.get("maintenance", session.id).status !== "closed")
          throw new DomainError("account_window_unconfirmed", "原检查窗口关闭尚未确认，请重试。", 409)
        session = null
      }
    }
    if (session && session.status !== "open") throw new DomainError("account_operation_busy", "该浏览器正在维护，请等待。", 409)
    if (!session) {
      this.assertAvailable(identity.kind)
      const ownerId = randomUUID()
      session = this.repository.save("maintenance", { id: randomUUID(), browserIdentityId: identity.id,
        entryId: null, ownerId, leaseId: ownerId, headless, status: "opening", createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), reason: null })
    }
    if (platform) {
      const existing = this.repository.list("entry").find(entry => !entry.deletedAt && entry.browserIdentityId === identity.id
        && new URL(entry.url).origin === new URL(platform.url).origin)
      const entry = existing ?? this.repository.save("entry", { id: randomUUID(), browserIdentityId: identity.id,
        url: platform.url, name: platform.name, revision: 0, note: "", expectedIdentity: "", methodId: null,
        deletedAt: null, createdAt: new Date().toISOString() })
      session = this.repository.save("maintenance", { ...session, entryId: entry.id })
    }
    const resume = session.status !== "opening"
    if (resume) {
      if (platform && navigate) await this.openPage(session, identity, platform, signal)
      return session
    }
    this.update(session, "opening")
    if (!this.upstream.withCapabilities) throw new Error("account_browser_unavailable")
    try {
      let handed = false
      await this.upstream.withCapabilities({ ownerId: session.ownerId, signal, sessionPurpose: "account",
        browserMode: identity.kind === "daily" ? "daily" : headless ? "dedicated-headless" : "dedicated-visible", headless,
        allowedOrigins: platform?.origins ?? ["http://127.0.0.1"],
        managedWindow: { ownerId: session.ownerId, resume, releasedOwners: this.releasedOwners(identity.kind), ...(headless ? { accountMaintenance: true } : {}) }, handoffPurpose: () => "human_wait",
        onHandoff: (_purpose, lease) => {
          if (lease.ownerId !== session!.ownerId) throw new Error("account_owner_changed")
          handed = true; this.repository.save("maintenance", { ...this.repository.get("maintenance", session!.id), leaseId: lease.leaseId })
        } }, async () => {})
      if (!handed) throw new Error("account_window_handoff_unconfirmed")
      const opened = this.update(this.repository.get("maintenance", session.id), "open")
      if (platform && navigate) await this.openPage(opened, identity, platform, signal)
      return opened
    } catch (error) {
      const status = await this.statusAfterFailure(session)
      this.update(this.repository.get("maintenance", session.id), status, "网站暂未打开，原窗口已保留，请重试。")
      throw error
    }
  }
  private async openPage(session: AccountMaintenance, identity: BrowserIdentity,
    platform: Pick<Platform, "url" | "origins">, signal: AbortSignal) {
    if (!this.upstream.accountSession) throw new Error("account_session_unavailable")
    await this.upstream.accountSession({ action: "open_page", ownerId: session.ownerId, leaseId: session.leaseId,
      kind: identity.kind, platformId: "owned-page", catalogVersion: "", evidenceSha256: "0".repeat(64),
      payload: { url: platform.url, origins: platform.origins } }, signal)
  }
  async statusAfterFailure(session: AccountMaintenance): Promise<"open" | "closed" | "cleanup_required"> {
    try { const result = await this.action("verify_closed", session)
      if (result?.report.status === "confirmed") return result.window.active ? "open" : "closed" }
    catch { /* endpoint拒绝不能证明Chrome已关闭。 */ }
    return "cleanup_required"
  }
  async action(action: "inspect" | "focus" | "page" | "end" | "verify_closed", session: AccountMaintenance) {
    const identity = this.repository.get("identity", session.browserIdentityId)
    this.assertControl(identity.kind)
    await this.identities.assertBound(identity)
    const result = await this.upstream.managedWindowAction?.({ action, ownerId: session.ownerId,
      leaseId: session.leaseId, browserMode: identity.kind === "daily" ? "daily" : "dedicated-visible" })
    if (!result || result.window.ownerId !== session.ownerId || result.window.leaseId !== session.leaseId
      || result.report.status !== "confirmed") throw new DomainError("account_window_unconfirmed", "无法确认原窗口所有权，现场已保留。", 409)
    return result
  }
  async finish(session: AccountMaintenance) {
    if (session.status === "closed") return
    if (this.repository.list("transfer").some(v => v.targetIdentityId === session.browserIdentityId && v.rollbackRef))
      throw new DomainError("account_target_recovery_pending", "登录恢复尚未确认，原窗口已保留。", 409)
    this.update(session, "closing")
    try {
      const result = await this.action("end", session).catch(() => this.action("verify_closed", session))
      if (result.window.active) throw new Error("account_window_still_active")
      this.update(this.repository.get("maintenance", session.id), "closed")
    } catch { this.update(this.repository.get("maintenance", session.id), "cleanup_required", "窗口释放未确认，请核验原窗口。") }
  }
}
