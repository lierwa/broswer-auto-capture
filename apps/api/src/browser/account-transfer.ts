import { createHmac, randomBytes, randomUUID } from "node:crypto"
import { z } from "zod"
import type { JsonValue } from "@browser-capture/contracts"
import type { AccountMaintenance, BrowserIdentity } from "@browser-capture/contracts/browser-account"
import type { AccountTransfer, Platform } from "@browser-capture/contracts/platform-account"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import type { AccountRepository } from "./account-repository.js"
import type { AccountIdentities } from "./account-identity.js"
import type { AccountWindows } from "./account-windows.js"
import type { PlatformChecks } from "./platform-check.js"
import { DomainError } from "../errors.js"

const stateSchema = z.object({ cookies: z.array(z.record(z.string(), z.json())).max(100),
  storage: z.record(z.string(), z.record(z.string(), z.string().nullable())) }).strict()
type Pending = { source: string; target: string; sourceBinding: string; targetBinding: string; sourceWindow: string; targetWindow: string }
const terminal = ["completed", "rolled_back", "cancelled", "expired", "abandoned"]

/** WHY：转移只拥有确认和目录事实；Cookie操作、原窗口和加密回滚分别复用CDP/原owner/Windows DPAPI。 */
export class AccountTransfers {
  private secret = randomBytes(32)
  private confirmations = new Map<string, Pending>()
  constructor(private repository: AccountRepository, private identities: AccountIdentities,
    private windows: AccountWindows, private checks: PlatformChecks, private upstream: UpstreamBrowserRuntime,
    private version: string, private sourceDigest: string) {}
  private update(record: AccountTransfer, patch: Partial<AccountTransfer>) {
    return this.repository.save("transfer", { ...this.repository.get("transfer", record.id), ...patch, updatedAt: new Date().toISOString() })
  }
  private hash(value: unknown): string {
    // WHY：只在本次服务内保存带随机密钥的摘要；不是可枚举的账号Cookie哈希。
    const stable = (item: unknown): unknown => Array.isArray(item) ? item.map(stable)
      : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : item
    return createHmac("sha256", this.secret).update(JSON.stringify(stable(value))).digest("hex")
  }
  private async call(action: "auth_read" | "auth_prepare" | "auth_write" | "auth_restore" | "auth_abandon",
    platform: Pick<Platform, "id">, window: AccountMaintenance, signal: AbortSignal, payload: JsonValue = null) {
    const identity = this.repository.get("identity", window.browserIdentityId)
    const offline = action === "auth_restore" && payload !== null && typeof payload === "object" && !Array.isArray(payload) && payload.offline === true
    if (action !== "auth_abandon" && !offline) await this.identities.assertBound(identity)
    if (!this.upstream.accountSession) throw new Error("account_session_unavailable")
    return this.upstream.accountSession({ action, ownerId: window.ownerId, leaseId: window.leaseId,
      kind: identity.kind, platformId: platform.id, catalogVersion: this.version, evidenceSha256: this.sourceDigest, payload }, signal)
  }
  private async read(platform: Platform, window: AccountMaintenance, signal: AbortSignal) {
    const state = stateSchema.parse(await this.call("auth_read", platform, window, signal))
    state.cookies.sort((a, b) => JSON.stringify([a.domain, a.path, a.name, a.partitionKey]).localeCompare(JSON.stringify([b.domain, b.path, b.name, b.partitionKey])))
    return state
  }
  async executionStorage(platform: Platform, window: AccountMaintenance, signal: AbortSignal) {
    if (!platform.transferReady) throw new DomainError("account_scope_unverified", "此网站登录范围尚未核验。", 409)
    const state = await this.read(platform, window, signal)
    if (state.cookies.some(cookie => cookie.partitionKey)) throw new DomainError("account_scope_unverified", "此登录包含尚不支持的分区凭据。", 409)
    return { cookies: state.cookies.map(cookie => ({ name: String(cookie.name), value: String(cookie.value),
      domain: String(cookie.domain), path: String(cookie.path), expires: Number(cookie.expires ?? -1),
      httpOnly: Boolean(cookie.httpOnly), secure: Boolean(cookie.secure), sameSite: String(cookie.sameSite ?? "Lax") })),
      origins: Object.entries(state.storage).map(([origin, values]) => ({ origin,
        localStorage: Object.entries(values).filter(([, value]) => value !== null).map(([name, value]) => ({ name, value: value! })) })) }
  }
  expireConfirmations() {
    for (const record of this.repository.list("transfer")) if (record.status === "confirmation" && record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) {
      if (record.confirmationRef) this.confirmations.delete(record.confirmationRef)
      this.update(record, { status: "expired", confirmationRef: null, reason: "共享确认已过期，请重新检查。" })
    }
  }
  async prepare(platform: Platform, source: BrowserIdentity, target: BrowserIdentity, requestId: string, signal: AbortSignal) {
    this.expireConfirmations()
    if (!platform.transferReady || !platform.cookieNames.length) throw new DomainError("account_scope_unverified", platform.transferReason ?? "认证范围未核验。", 409)
    if (this.repository.list("transfer").some(value => !terminal.includes(value.status))) throw new DomainError("account_transfer_pending", "请先处理已有共享确认或待恢复会话。", 409)
    const record = this.repository.save("transfer", { schemaVersion: 1, id: randomUUID(), requestId, platformId: platform.id,
      platformVersion: this.version, sourceIdentityId: source.id, targetIdentityId: target.id, status: "preparing",
      sourceResult: null, targetResult: null, scope: platform.cookieDomains, sharedServices: platform.sharedServices,
      confirmationRef: null, expiresAt: null, confirmedAt: null, rollbackRef: null, reason: null,
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    try {
      const sw = await this.windows.open(source, platform, signal, false)
      const sourceCheck = await this.checks.run(platform, source, sw, requestId, signal)
      this.update(record, { sourceResult: sourceCheck.result })
      if (sourceCheck.result?.status !== "authenticated" || !sourceCheck.result.identityConfirmed) throw new Error("account_transfer_source_identity_unconfirmed")
      const sourceState = await this.read(platform, sw, signal)
      if (!sourceState.cookies.length) throw new Error("account_transfer_source_credentials_missing")
      const tw = await this.windows.open(target, platform, signal, false)
      this.update(record, { sourceWindowId: sw.id, targetWindowId: tw.id })
      const targetCheck = await this.checks.run(platform, target, tw, requestId, signal)
      if (!targetCheck.result || targetCheck.result.status === "inconclusive") throw new Error("account_transfer_target_unconfirmed")
      const targetState = await this.read(platform, tw, signal)
      const ref = randomUUID()
      this.confirmations.set(ref, { source: this.hash(sourceState), target: this.hash(targetState),
        sourceBinding: source.binding, targetBinding: target.binding, sourceWindow: sw.id, targetWindow: tw.id })
      return this.update(record, { status: "confirmation", targetResult: targetCheck.result, confirmationRef: ref,
        expiresAt: new Date(Date.now() + 120000).toISOString(), reason: "确认后将替换目标浏览器在所列服务中的登录状态。" })
    } catch (error) { this.update(record, { status: signal.aborted ? "cancelled" : "expired", reason: safeReason(error) }); throw error }
  }
  async confirm(platform: Platform, id: string, reference: string, signal: AbortSignal, automaticGuard?: () => Promise<void>) {
    const record = this.repository.get("transfer", id), pending = this.confirmations.get(reference)
    this.confirmations.delete(reference)
    if (record.status !== "confirmation" || record.confirmationRef !== reference || !pending
      || !record.expiresAt || Date.parse(record.expiresAt) <= Date.now() || record.platformVersion !== this.version) {
      if (record.status === "confirmation") this.update(record, { status: "expired", confirmationRef: null, reason: "共享确认已过期，请重新检查。" })
      throw new DomainError("account_confirmation_expired", "共享确认已过期或已使用，请重新检查。", 409)
    }
    this.update(record, { status: "verifying", confirmationRef: null, confirmedAt: new Date().toISOString() })
    let targetWindow: AccountMaintenance | null = null
    try {
      const source = this.repository.get("identity", record.sourceIdentityId), target = this.repository.get("identity", record.targetIdentityId)
      if (source.binding !== pending.sourceBinding || target.binding !== pending.targetBinding) throw new Error("account_profile_changed")
      const sw = this.repository.get("maintenance", pending.sourceWindow)
      targetWindow = this.repository.get("maintenance", pending.targetWindow)
      if (sw.status !== "open" || targetWindow.status !== "open") throw new Error("account_window_changed")
      const sourceCheck = await this.checks.run(platform, source, sw, record.requestId, signal)
      if (sourceCheck.result?.identityKey !== record.sourceResult?.identityKey || !sourceCheck.result?.identityConfirmed) throw new Error("account_transfer_source_changed")
      const sourceState = await this.read(platform, sw, signal)
      const targetState = await this.read(platform, targetWindow, signal)
      if (this.hash(sourceState) !== pending.source || this.hash(targetState) !== pending.target) throw new Error("account_transfer_state_changed")
      const rollbackRef = randomUUID()
      await automaticGuard?.()
      // WHY：先持久恢复引用，崩溃后仍能找到备份；native保存时原子地核验已确认目标。
      this.update(record, { status: "rollback_ready", rollbackRef })
      await this.call("auth_prepare", platform, targetWindow, signal, { rollbackRef, expected: targetState })
      signal.throwIfAborted()
      await automaticGuard?.()
      this.update(record, { status: "write_started" })
      await this.call("auth_write", platform, targetWindow, signal, { rollbackRef, state: sourceState })
      this.update(record, { status: "checking_target" })
      const checked = await this.checks.run(platform, target, targetWindow, record.requestId, signal)
      this.update(record, { targetResult: checked.result })
      if (checked.result?.status !== "authenticated" || !checked.result.identityConfirmed
        || checked.result.identityKey !== sourceCheck.result.identityKey) throw new Error("account_transfer_identity_not_matched")
      await this.call("auth_abandon", platform, targetWindow, signal, { rollbackRef })
      return this.update(record, { status: "completed", rollbackRef: null, reason: "目标浏览器已独立检查，账号与来源一致。" })
    } catch (error) {
      const current = this.repository.get("transfer", id)
      if (current.rollbackRef && targetWindow) {
        try { await this.restore(platform, id, AbortSignal.timeout(30000)); this.update(record, { reason: `${safeReason(error)}；目标原会话已恢复。` }) }
        catch { this.update(record, { status: "target_pending", reason: `${safeReason(error)}；自动恢复未确认，请核验目标会话。` }) }
      } else this.update(record, { status: signal.aborted ? "cancelled" : "expired", reason: safeReason(error) })
      throw error
    }
  }
  async restore(platform: Pick<Platform, "id">, id: string, signal: AbortSignal) {
    const record = this.repository.get("transfer", id)
    if (!record.rollbackRef) throw new Error("account_rollback_snapshot_missing")
    const target = this.repository.get("identity", record.targetIdentityId)
    const window = record.targetWindowId ? this.repository.get("maintenance", record.targetWindowId) : this.repository.active(target.id)
    if (!window) throw new Error("account_rollback_window_missing")
    this.update(record, { status: "rolling_back" })
    try {
      // WHY：先消费加密写前日志；原页失联不能阻止无写入撤销。有写入才进入原生 owner/digest 核验。
      const probe = z.object({ phase: z.enum(["rolled_back", "browser_required"]) }).parse(
        await this.call("auth_restore", platform, window, signal, { rollbackRef: record.rollbackRef, offline: true }))
      if (probe.phase === "browser_required") {
        this.windows.assertControl(target.kind)
        await this.call("auth_restore", platform, window, signal, { rollbackRef: record.rollbackRef })
      }
      return this.update(record, { status: "rolled_back", rollbackRef: null, reason: "已核验并恢复目标原会话。" })
    } catch (error) { this.update(record, { status: "target_pending", reason: safeReason(error) }); throw error }
  }
  async abandon(platform: Platform, id: string, signal: AbortSignal) {
    const record = this.repository.get("transfer", id)
    if (record.status === "confirmation") {
      if (record.confirmationRef) this.confirmations.delete(record.confirmationRef)
      return this.update(record, { status: "cancelled", confirmationRef: null, reason: "已取消共享，没有写入目标。" })
    }
    if (!record.rollbackRef) throw new Error("account_rollback_snapshot_missing")
    const window = record.targetWindowId ? this.repository.get("maintenance", record.targetWindowId)
      : this.repository.list("maintenance").filter(v => v.browserIdentityId === record.targetIdentityId).at(-1)
    if (!window) throw new Error("account_rollback_owner_missing")
    await this.call("auth_abandon", platform, window, signal, { rollbackRef: record.rollbackRef })
    return this.update(record, { status: "abandoned", rollbackRef: null, reason: "已放弃恢复并删除加密备份；目标当前会话保留。" })
  }
}

export function safeReason(error: unknown) {
  const candidate = error instanceof Error ? error.message.split(":").at(-1)?.trim() : undefined
  const code = candidate && /^account_[a-z_]+$/.test(candidate) ? candidate : "account_operation_failed"
  const labels: Record<string, string> = {
    account_transfer_source_identity_unconfirmed: "来源登录账号无法确认，请先登录并检查。",
    account_transfer_target_unconfirmed: "目标当前登录状态无法确认，本次共享未写入。",
    account_transfer_source_credentials_missing: "未取得已核验范围的认证凭据。",
    account_transfer_source_changed: "来源账号已变化，请重新准备共享。",
    account_transfer_state_changed: "来源或目标会话已变化，请重新检查并确认。",
    account_transfer_identity_not_matched: "目标未确认是来源账号。",
    account_rollback_target_changed: "目标会话已被改变，拒绝覆盖；请人工核验。",
    account_transfer_target_changed: "目标会话已变化，拒绝覆盖；请重新检查并确认。",
    account_marker_stable_locator_missing: "此标识缺少稳定 id/testid，无法保存可靠定位；请选择其他标识或绑定已有检查链。",
    account_marker_not_unique_or_visible: "所选标识不唯一或已不可见，请选择另一个标识。",
    account_marker_page_changed: "页面已变化，请回到已绑定的账号页重新选取。",
    account_marker_cancelled: "页面选取已取消，原检查绑定保留。",
    account_marker_cleanup_unconfirmed: "选取模式退出未确认；原窗口保留，请按Esc退出并核验。",
  }
  return labels[code] ?? "操作未完成，网站窗口已保留，请重试。"
}
