import { randomUUID } from "node:crypto"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"
import type { LogicalAccount } from "@browser-capture/contracts/account-directory"
import type { AccountMaintenance, BrowserIdentity } from "@browser-capture/contracts/browser-account"
import type { PlatformCheck } from "@browser-capture/contracts/platform-account"
import type { AccountDirectory } from "./account-directory.js"
import type { AccountIdentities } from "./account-identity.js"
import type { AccountWindows } from "./account-windows.js"
import type { PlatformChecks } from "./platform-check.js"
import type { AccountTransfers } from "./account-transfer.js"
import { DomainError } from "../errors.js"

export type AccountStartup = { ownerId: string; connectionOwnerId?: string; browserMode: BrowserMode;
  allowedOrigins: string[]; signal: AbortSignal; resume: boolean; publicRead?: boolean }
const optionalLogin = new Set(["account_source_unconfirmed", "account_identity_unconfirmed", "account_target_unconfirmed",
  "account_scope_unverified", "account_source_required", "account_profile_changed"])
/** WHY：自动复用只是原 transfer 的 admission；不复制驱动、Cookie vault、事务或检查器。 */
export class AccountReuse {
  constructor(private directory: AccountDirectory, private identities: AccountIdentities, private windows: AccountWindows,
    private checks: PlatformChecks, private transfers: AccountTransfers, private verify?: (kind: "daily" | "dedicated") => Promise<void>) {}
  private async assertFrozen(account: LogicalAccount, verifySource = true) {
    const current = this.directory.current(account.platformId)
    if (!current || current.deletedAt || current.revision !== account.revision || current.identityKey !== account.identityKey
      || current.sourceIdentityId !== account.sourceIdentityId || current.sourceBinding !== account.sourceBinding)
      throw new DomainError("account_revision_changed", "账号已变化，本次启动未写入登录。", 409)
    const source = this.directory.repository.get("identity", account.sourceIdentityId)
    if (source.binding !== account.sourceBinding) throw new DomainError("account_profile_changed", "来源浏览器已变化。", 409)
    if (verifySource) await this.identities.assertBound(source)
    return source
  }
  async prepare(input: AccountStartup) {
    if (input.resume) return // WHY：恢复接管原 runner，不先动它正在保留的现场。
    const accounts = this.directory.repository.list("logicalAccount").filter(a => !a.deletedAt)
    const platforms = accounts.filter(a => {
      try { return this.directory.platform(a.platformId).origins.some(origin => input.allowedOrigins.includes(origin)) }
      catch { const b = this.directory.repository.list("binding").find(v => v.id === a.platformId && !v.deletedAt)
        return Boolean(b && input.allowedOrigins.includes(new URL(b.url).origin)) }
    })
    // 被动账号页不是任务锁；启动前沿原 owner 安全结束，未知事实仍阻止抢占。
    await this.recoverPending(input.signal)
    await this.release()
    const storage = { cookies: [] as Awaited<ReturnType<AccountTransfers["executionStorage"]>>["cookies"],
      origins: [] as Awaited<ReturnType<AccountTransfers["executionStorage"]>>["origins"] }
    for (const account of platforms) {
      input.signal.throwIfAborted()
      try {
        await this.prepareAccount(account, input)
        if (input.browserMode !== "daily" && this.directory.repository.list("binding").some(b => b.id === account.platformId && !b.deletedAt))
          throw new DomainError("account_source_required", "此自定义账号仅在原浏览器可复用；请在独立任务窗口登录。", 409)
        // WHY：并行专属 Profile 只接收原目录明确核验的认证范围；不复制整个浏览器 Profile。
        if (input.browserMode !== "daily" && !this.directory.repository.list("binding").some(b => b.id === account.platformId && !b.deletedAt)) {
          const target = await this.identities.identify("dedicated"), window = this.directory.repository.active(target.id)
          if (!window) throw new DomainError("account_target_unconfirmed", "账号来源窗口未确认。", 409)
          const seed = await this.transfers.executionStorage(this.directory.platform(account.platformId), window, input.signal)
          storage.cookies.push(...seed.cookies); storage.origins.push(...seed.origins)
        }
      }
      catch (error) {
        if (!input.publicRead || !(error instanceof DomainError) || !optionalLogin.has(error.code)) throw error
        const stamp = new Date().toISOString()
        this.directory.repository.save("platformOperation", { id: randomUUID(), label: "只读任务账号准备限制", status: "completed",
          startedAt: stamp, finishedAt: stamp, reason: error.message })
      } finally { await this.release() }
    }
    return storage
  }
  async recoverPending(signal: AbortSignal) {
    for (const transfer of this.directory.repository.list("transfer").filter(v => v.rollbackRef)) {
      // WHY：恢复消费 DPAPI 固定旧 scope；当前目录升级/移除平台不能堵住原 owner 的安全回滚。
      await this.transfers.restore({ id: transfer.platformId }, transfer.id, signal)
    }
  }
  private async prepareAccount(account: LogicalAccount, input: AccountStartup) {
    const source = await this.assertFrozen(account, false), targetKind = input.browserMode === "daily" ? "daily" : "dedicated"
    const target = await this.identities.identify(targetKind)
    await this.identities.assertBound(target)
    const binding = this.directory.repository.list("binding").find(b => b.id === account.platformId && !b.deletedAt)
    if (binding) {
      if (target.id !== source.id) throw new DomainError("account_source_required", "此自定义网站的账号仅在原浏览器可用。", 409)
      await this.verify?.(source.kind)
      await this.directory.checkCustomSource(account, input.signal)
      return // 自定义方法仍由原版本化任务链读取，不将 Cookie 存在当登录。
    }
    const platform = this.directory.platform(account.platformId)
    await this.verify?.(target.kind)
    const targetWindow = await this.windows.open(target, platform, input.signal, false)
    const targetCheck = await this.checks.run(platform, target, targetWindow, randomUUID(), input.signal)
    // WHY：检查器中断不是账号不同，也不能降级为可忽略的未登录；保留系统失败层。
    if (targetCheck.status !== "completed" || targetCheck.run?.status !== "completed" || !targetCheck.run.auditComplete
      || targetCheck.run.consumed.llmCalls !== 0)
      throw new DomainError("account_check_incomplete", "账号检查未能完成，准备尚未开始。已保存的账号保留。", 409)
    // WHY：启动只先验证实际使用的 Profile；已登录同账号时不打开另一浏览器作重复证明。
    if (targetCheck.result?.status === "authenticated" && (account.identityKey
      ? targetCheck.result.identityKey === account.identityKey : source.id === target.id)) return
    if (targetCheck.result?.status !== "unauthenticated")
      throw new DomainError("account_target_unconfirmed", `${platform.name}的目标登录不同或无法确认，未覆盖。`, 409)
    await this.restoreLogin(account, target, targetWindow, targetCheck, input.signal)
  }
  async tryRestoreLogin(account: LogicalAccount, target: BrowserIdentity, window: AccountMaintenance, check: PlatformCheck, signal: AbortSignal) {
    try { return await this.restoreLogin(account, target, window, check, signal) }
    catch (error) {
      // WHY：源已过期/身份或范围无证据时仍允许正常人工登录；未知目标、写入和恢复异常不能吞掉。
      if (error instanceof DomainError && optionalLogin.has(error.code) && error.code !== "account_target_unconfirmed") return check
      throw error
    }
  }
  private async reuseSource(account: LogicalAccount, target: BrowserIdentity) {
    const source = await this.assertFrozen(account)
    if (source.id !== target.id) return source
    // WHY：同UID检查会更新目录来源，但复用凭据可能先失效；保留另一当前Profile的已验证来源。
    // 历史检查只选择候选，写入仍由原transfer重新核验实时UID、目标未登录和完整回滚条件。
    const other = await this.identities.current(target.kind === "daily" ? "dedicated" : "daily")
    const check = other && this.directory.repository.list("platformCheck")
      .filter(v => v.browserIdentityId === other.id && v.platformId === account.platformId).at(-1)
    if (!other || !account.identityKey || check?.platformVersion !== this.directory.version
      || check.status !== "completed" || check.run?.status !== "completed" || !check.run.auditComplete
      || check.result?.status !== "authenticated" || check.result.identityKey !== account.identityKey)
      throw new DomainError("account_source_unconfirmed", `${this.directory.platform(account.platformId).name}的登录需要重新确认。`, 409)
    return other
  }
  async restoreLogin(account: LogicalAccount, target: BrowserIdentity, targetWindow: AccountMaintenance, targetCheck: PlatformCheck, signal: AbortSignal) {
    if (targetCheck.result?.status !== "unauthenticated") return targetCheck
    const source = await this.reuseSource(account, target), platform = this.directory.platform(account.platformId), requestId = randomUUID()
    if (!account.identityKey) throw new DomainError("account_identity_unconfirmed", `${platform.name}未提供可复用的稳定身份。`, 409)
    if (!platform.transferReady || !platform.cookieNames.length)
      throw new DomainError("account_scope_unverified", `${platform.name}尚未核验跨浏览器登录范围，请使用原浏览器。`, 409)
    let preparedId: string | null = null
    try {
      await this.verify?.(source.kind)
      const transfer = await this.transfers.prepare(platform, source, target, requestId, signal)
      preparedId = transfer.id
      if (transfer.sourceResult?.identityKey !== account.identityKey)
        throw new DomainError("account_source_unconfirmed", "来源账号已变化，未复用登录。", 409)
      if (transfer.targetResult?.status !== "unauthenticated" || !transfer.confirmationRef)
        throw new DomainError("account_target_unconfirmed", "目标登录已变化，未覆盖。", 409)
      await this.transfers.confirm(platform, transfer.id, transfer.confirmationRef, signal, async () => {
        await this.assertFrozen(account); await this.identities.assertBound(target)
      })
      const checked = this.directory.repository.list("platformCheck").filter(v => v.requestId === requestId && v.browserIdentityId === target.id).at(-1)
      if (!checked || checked.result?.identityKey !== account.identityKey) throw new DomainError("account_target_unconfirmed", "登录复用未确认。", 409)
      return checked
    } catch (error) {
      if (error instanceof Error && ["account_transfer_source_identity_unconfirmed", "account_transfer_source_credentials_missing"].includes(error.message))
        throw new DomainError("account_source_unconfirmed", "原登录已不可复用，请在网站完成登录。", 409)
      throw error
    } finally {
      // WHY：自动 admission 的拒绝也必须结束未写入确认，不能残留一个阻塞后续登录的 pending。
      if (preparedId && this.directory.repository.get("transfer", preparedId).status === "confirmation")
        await this.transfers.abandon(platform, preparedId, signal)
      const window = this.directory.repository.active(source.id)
      if (window && window.id !== targetWindow.id) {
        await this.windows.finish(window)
        if (this.directory.repository.get("maintenance", window.id).status !== "closed")
          throw new DomainError("account_window_unconfirmed", "来源窗口释放未确认，请核验原窗口。", 409)
      }
    }
  }
  private async release() {
    if (this.directory.repository.list("transfer").some(v => v.rollbackRef))
      throw new DomainError("account_target_recovery_pending", "登录恢复尚未确认，原窗口已保留。", 409)
    for (const window of this.directory.repository.list("maintenance").filter(v => v.status !== "closed")) {
      // WHY：空 relay 枚举无法证明物理页已关，但也不能堵住原生精确 owner 的幂等关闭核验。
      await this.windows.finish(window)
      if (this.directory.repository.get("maintenance", window.id).status !== "closed")
        throw new DomainError("account_window_unconfirmed", "账号窗口释放未确认，请重试。", 409)
    }
  }
}
