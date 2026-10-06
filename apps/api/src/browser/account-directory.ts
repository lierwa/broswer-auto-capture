import { randomUUID } from "node:crypto"
import { accountDirectorySchema, type DirectoryCommand, type DirectoryOperation, type LogicalAccount } from "@browser-capture/contracts/account-directory"
import type { BrowserIdentity, AccountMaintenance } from "@browser-capture/contracts/browser-account"
import type { Platform, PlatformCheck } from "@browser-capture/contracts/platform-account"
import type { AccountRepository } from "./account-repository.js"
import type { AccountIdentities } from "./account-identity.js"
import type { AccountWindows } from "./account-windows.js"
import type { PlatformChecks } from "./platform-check.js"
import type { AccountCustom } from "./account-custom.js"
import { DomainError } from "../errors.js"
import { safeReason } from "./account-transfer.js"

const now = () => new Date().toISOString()
/** WHY：一份平台账号是长期身份事实，窗口/任务/浏览器类型不进入用户维护模型。 */
export class AccountDirectory {
  private customSessionId: string | null = null
  private customBindingId: string | null = null
  private sourceBindings: { daily: string | null; dedicated: string | null } | null = null
  constructor(readonly repository: AccountRepository, private identities: AccountIdentities, private windows: AccountWindows,
    private checks: PlatformChecks, private custom: AccountCustom, private platforms: Platform[], readonly version: string,
    private verifyAvailability?: (kind: BrowserIdentity["kind"]) => Promise<void>,
    private restoreLogin?: (account: LogicalAccount, identity: BrowserIdentity, window: AccountMaintenance, check: PlatformCheck, signal: AbortSignal) => Promise<PlatformCheck>) {
    // WHY：重开面板/服务恢复只能找原 owned 事实；不创建窗口，不扫描个人标签。
    const opened = repository.list("directoryOperation").filter(v => v.intent === "custom_open" && v.status === "completed").at(-1)
    const session = opened && repository.list("maintenance").find(v => v.ownerId === opened.ownerId && v.status !== "closed")
    this.customSessionId = session?.id ?? null
    const read = repository.list("directoryOperation").filter(v => v.intent === "custom_read" && v.status === "completed").at(-1)
    this.customBindingId = read?.platformId === "custom" || opened && read && read.startedAt < opened.startedAt ? null : read?.platformId ?? null
  }
  async refreshProfiles() {
    this.sourceBindings = { daily: (await this.identities.current("daily"))?.binding ?? null,
      dedicated: (await this.identities.current("dedicated"))?.binding ?? null }
  }
  current(platformId: string) { return this.repository.list("logicalAccount").find(v => v.platformId === platformId) ?? null }
  platform(id: string) {
    const p = this.platforms.find(v => v.id === id)
    if (!p) throw new DomainError("account_platform_not_found", "此网站不在固定目录中。", 404)
    return p
  }
  private projected(account: LogicalAccount | null) {
    if (!account || account.deletedAt) return null
    const { id, revision, identityKey, displayIdentity } = account
    const binding = this.repository.list("binding").find(b => b.id === account.platformId && !b.deletedAt)
    const version = binding ? String(binding.revision) : this.version
    const source = this.repository.list("identity").find(i => i.id === account.sourceIdentityId)
    const identity = source && source.binding === this.sourceBindings?.[source.kind] ? source : undefined
    // WHY：账号是共享长期事实，浏览器选择只决定下一次操作环境；连接失败不抹掉最后一次有效登录证明。
    const check = identity && this.repository.list("platformCheck").filter(c => c.platformId === account.platformId
      && c.browserIdentityId === identity.id && c.status === "completed" && c.result?.status !== "inconclusive").at(-1)
    const verified = check?.platformVersion === version && check.status === "completed" && check.run?.status === "completed"
      && check.run.auditComplete && check.run.consumed.llmCalls === 0
    const rollback = identity && this.repository.list("transfer").some(t => t.platformId === account.platformId
      && t.targetIdentityId === identity.id && ["rolled_back", "target_pending", "abandoned"].includes(t.status)
      && t.updatedAt >= (check?.finishedAt ?? ""))
    const result = verified && !rollback ? check.result : null
    const changed = result?.status === "authenticated" && (identityKey ? result.identityKey !== identityKey : identity?.id !== account.sourceIdentityId)
    const state = changed ? "account_changed" : result?.status === "authenticated" ? "ready"
      : result?.status === "unauthenticated" ? "expired" : "unconfirmed"
    return { id, revision, identityKey, displayIdentity, state, checkedAt: check?.finishedAt ?? null,
      reason: changed ? "网站当前是另一个账号，可在更多操作中切换账号" : state === "ready" ? null
        : result?.reason ?? "请检查当前浏览器的登录状态" }
  }
  snapshot() {
    const bindings = this.repository.list("binding").filter(b => !b.deletedAt)
    const binding = bindings.find(b => b.id === this.customBindingId)
    const marker = this.custom.markerSelection()
    const { sourceIdentityId: _identity, sourceBinding: _binding, ownerId: _owner, leaseId: _lease, ...operation } =
      this.repository.list("directoryOperation").at(-1) ?? {} as DirectoryOperation
    return accountDirectorySchema.parse({ items: [
      ...this.platforms.map(platform => { const account = this.current(platform.id)
        return { platform: { id: platform.id, name: platform.name, url: platform.url }, account: this.projected(account), revision: account?.revision ?? 0, custom: false } }),
      ...bindings.map(b => ({ platform: { id: b.id, name: b.name, url: b.url }, account: this.projected(this.current(b.id)),
        revision: this.current(b.id)?.revision ?? 0, custom: true })),
    ], operation: operation.id ? operation : null, notice: null,
      marker: marker ? { reference: marker.reference, platformId: marker.bindingId, preview: marker.preview } : null,
      customPage: binding ? { bindingId: binding.id, revision: binding.revision, name: binding.name, url: binding.url, hasChain: Boolean(binding.chain) } : null,
      customWindow: Boolean(this.customSessionId && this.repository.get("maintenance", this.customSessionId).status === "open") })
  }
  private active(operation: DirectoryOperation, signal: AbortSignal) {
    signal.throwIfAborted()
    const current = this.repository.get("directoryOperation", operation.id)
    if (current.status !== "running" || current.finishedAt) throw new Error("account_operation_finished")
    const account = this.current(operation.platformId)
    if ((account?.revision ?? 0) !== operation.logicalRevision) throw new DomainError("account_revision_changed", "账号已变化，请重试。", 409)
    return current
  }
  private patch(operation: DirectoryOperation, value: Partial<DirectoryOperation>, signal: AbortSignal) {
    return this.repository.save("directoryOperation", { ...this.active(operation, signal), ...value })
  }
  private async source(account: LogicalAccount) {
    const identity = this.repository.get("identity", account.sourceIdentityId)
    if (identity.binding !== account.sourceBinding) throw new DomainError("account_profile_changed", "原账号所在浏览器已变化，请重新添加。", 409)
    await this.identities.assertBound(identity)
    return identity
  }
  private async open(identity: BrowserIdentity, platform: Pick<Platform, "url" | "name" | "origins">, operation: DirectoryOperation, signal: AbortSignal, navigate: boolean) {
    await this.verifyAvailability?.(identity.kind)
    const window = await this.windows.open(identity, platform, signal, navigate)
    this.patch(operation, { sourceIdentityId: identity.id, sourceBinding: identity.binding, ownerId: window.ownerId, leaseId: window.leaseId }, signal)
    return window
  }
  private save(operation: DirectoryOperation, identity: BrowserIdentity, check: PlatformCheck, signal: AbortSignal) {
    this.active(operation, signal)
    const previous = this.current(operation.platformId), result = check.result
    if (!result || check.status !== "completed" || check.run?.status !== "completed" || !check.run.auditComplete || check.run.consumed.llmCalls !== 0)
      throw new DomainError("account_check_incomplete", "检查未正常结束，请重试。", 409)
    const authenticated = result.status === "authenticated"
    const changed = Boolean(previous && !previous.deletedAt && operation.intent !== "switch" && authenticated
      && (previous.identityKey ? result.identityKey !== previous.identityKey : identity.id !== previous.sourceIdentityId))
    const replacement = !previous || Boolean(previous.deletedAt) || operation.intent === "switch"
    if (replacement && !authenticated) throw new DomainError("account_identity_unconfirmed", "尚未确认网站登录，请重试。", 409)
    if (result.status === "inconclusive") throw new DomainError("account_check_incomplete", "本次未能核验登录，已保存的账号保留，请重试。", 409)
    if (!replacement && identity.id !== previous.sourceIdentityId && (!authenticated || changed))
      throw new DomainError("account_target_unconfirmed", changed
        ? "当前浏览器登录的是另一个账号，未覆盖。已保存的共享账号保留，可在更多操作中切换账号。"
        : "当前浏览器尚未完成登录复用。已保存的共享账号保留，请重试检查登录。", 409)
    // WHY：共享目录只在正向同 UID 证明后更新来源；未登录/未知不能丢失另一 Profile 的有效来源。
    const useCheckedSource = replacement || authenticated && !changed
    const record: LogicalAccount = { id: previous?.id ?? randomUUID(), platformId: operation.platformId,
      revision: replacement ? (previous?.revision ?? 0) + 1 : previous.revision,
      sourceIdentityId: useCheckedSource ? identity.id : previous.sourceIdentityId,
      sourceBinding: useCheckedSource ? identity.binding : previous.sourceBinding,
      identityKey: replacement ? result.identityKey : previous.identityKey,
      displayIdentity: replacement ? result.displayIdentity : previous.displayIdentity ?? result.displayIdentity,
      state: changed ? "account_changed" : authenticated ? "ready" : result.status === "unauthenticated" ? "expired" : "unconfirmed",
      reason: changed ? "网站当前是另一个账号，可在更多操作中切换账号" : authenticated ? null : result.reason,
      checkId: check.id, checkedAt: check.finishedAt, platformVersion: check.platformVersion,
      createdAt: previous?.createdAt ?? now(), deletedAt: null }
    this.repository.store.db.transaction(() => {
      this.repository.saveLogical(record)
      this.repository.save("directoryOperation", { ...this.repository.get("directoryOperation", operation.id), phase: "finished", status: "completed", finishedAt: now() })
    })
    return record
  }
  private async maintenanceIdentity(kind: BrowserIdentity["kind"]) {
    const identity = await this.identities.identify(kind)
    if (!identity) throw new DomainError("daily_chrome_authorization_required", "请先授权日常 Chrome。", 409)
    await this.identities.assertBound(identity)
    return identity
  }
  private async discover(platform: Platform, operation: DirectoryOperation, signal: AbortSignal, kind: BrowserIdentity["kind"]) {
    // WHY：一次操作冻结一个浏览器；连接失败不能捕获后静默改用另一 Profile。
    const identity = await this.maintenanceIdentity(kind)
    const window = await this.open(identity, platform, operation, signal, true)
    const check = await this.checks.run(platform, identity, window, operation.id, signal, "observe")
    this.active(operation, signal)
    return { identity, window, check: check.result?.status === "authenticated" && check.status === "completed" ? check : null }
  }
  async perform(command: Exclude<DirectoryCommand, { type: "cancel" }>, signal: AbortSignal, before?: () => Promise<void>) {
    const platformId = "platformId" in command ? command.platformId : "custom"
    const account = this.current(platformId), revision = account?.revision ?? 0
    const kind = this.repository.store.browserEnvironment().mode === "daily" ? "daily" : "dedicated"
    const operation = this.repository.save("directoryOperation", { id: randomUUID(), requestId: command.requestId, platformId, intent: command.type,
      logicalRevision: revision, sourceIdentityId: account?.sourceIdentityId ?? null, sourceBinding: account?.sourceBinding ?? null,
      ownerId: null, leaseId: null, startedAt: now(), deadline: new Date(Date.now() + (["add", "relogin", "switch"].includes(command.type) ? 300000 : 120000)).toISOString(),
      finishedAt: null, phase: "discovering", status: "running", reason: null })
    try {
      if ("revision" in command && !["custom_pick", "custom_attach"].includes(command.type) && command.revision !== revision)
        throw new DomainError("account_revision_changed", "账号已变化，请刷新后重试。", 409)
      await before?.()
      this.active(operation, signal)
      if (command.type.startsWith("custom_")) await this.customCommand(command, operation, signal, kind)
      else if (command.type === "remove") {
        if (!account || account.deletedAt) throw new DomainError("account_not_found", "账号已移除。", 404)
        this.repository.saveLogical({ ...account, revision: account.revision + 1, deletedAt: now() })
      } else await this.platformCommand(command, operation, account, signal, kind)
      if (this.repository.get("directoryOperation", operation.id).status === "completed") return
      signal.throwIfAborted()
      this.repository.save("directoryOperation", { ...this.repository.get("directoryOperation", operation.id), phase: "finished", status: "completed", finishedAt: now() })
    } catch (error) {
      if (this.repository.get("directoryOperation", operation.id).status === "completed") return
      this.repository.save("directoryOperation", { ...this.repository.get("directoryOperation", operation.id), phase: "finished",
        status: signal.aborted && signal.reason?.name !== "TimeoutError" ? "cancelled" : "failed", finishedAt: now(),
        reason: signal.aborted ? signal.reason?.name === "TimeoutError" ? "等待超时，可在网站完成登录后重试" : "等待已结束，原账号保留" : error instanceof DomainError ? error.message : safeReason(error) })
      throw error
    }
  }
  private async platformCommand(command: Exclude<DirectoryCommand, { type: "cancel" }>, operation: DirectoryOperation,
    account: LogicalAccount | null, signal: AbortSignal, kind: BrowserIdentity["kind"]) {
    const binding = this.repository.list("binding").find(b => b.id === operation.platformId && !b.deletedAt)
    // WHY：自定义网站已有检查方法但尚未保存登录，也需要先打开所选浏览器完成登录。
    if (command.type !== "add" && !(binding && command.type === "open") && (!account || account.deletedAt))
      throw new DomainError("account_not_found", "请先添加账号。", 404)
    if (binding && command.type === "open") {
      const identity = await this.maintenanceIdentity(kind)
      await this.open(identity, { url: binding.url, name: binding.name, origins: [new URL(binding.url).origin] }, operation, signal, true)
      return
    }
    const platform = this.platform(operation.platformId)
    if (command.type === "add" && account && !account.deletedAt) throw new DomainError("account_exists", "账号已添加，请重新检查。", 409)
    let identity: BrowserIdentity, window: AccountMaintenance, check: PlatformCheck | null = null
    if (command.type === "add") {
      const found = await this.discover(platform, operation, signal, kind); identity = found.identity; window = found.window; check = found.check
    } else {
      identity = await this.maintenanceIdentity(kind)
      this.patch(operation, { phase: "opening" }, signal)
      window = await this.open(identity, platform, operation, signal, command.type !== "check")
    }
    if (command.type === "open") return
    if (command.type === "check") {
      this.patch(operation, { phase: "checking" }, signal)
      check = await this.checks.run(platform, identity, window, operation.id, signal, "observe")
    } else if (command.type === "relogin") check = await this.checks.run(platform, identity, window, operation.id, signal, "observe")
    if (account && check?.result?.status === "unauthenticated" && ["check", "relogin"].includes(command.type))
      check = await this.restoreLogin?.(account, identity, window, check, signal) ?? check
    if (command.type !== "check" && check?.result?.status !== "authenticated") {
      this.patch(operation, { phase: "waiting" }, signal)
      const observed = await this.checks.run(platform, identity, window, operation.requestId, signal, "wait", {
        expectedIdentityKey: account?.identityKey ?? "", expectedDisplayIdentity: account?.displayIdentity ?? "", switching: command.type === "switch" })
      this.active(operation, signal)
      if (observed.run?.status !== "completed" || observed.result?.status !== "authenticated")
        throw new DomainError("account_login_timeout", "尚未检测到登录，可在网站完成后重试", 409)
      this.patch(operation, { phase: "checking" }, signal)
      check = await this.checks.run(platform, identity, window, operation.id, signal, "observe")
      if (command.type === "switch" && (check.result?.identityKey !== observed.result.identityKey
        || check.result?.displayIdentity !== observed.result.displayIdentity))
        throw new DomainError("account_identity_changed", "网站账号又发生变化，请重试。", 409)
    }
    if (command.type !== "check" && check?.result?.status !== "authenticated")
      throw new DomainError("account_login_unconfirmed", "暂未确认登录，网站窗口已保留，可继续登录后重试", 409)
    await this.windows.finish(window)
    if (this.repository.get("maintenance", window.id).status !== "closed")
      throw new DomainError("account_window_unconfirmed", "窗口释放暂未确认，请重试", 409)
    this.save(operation, identity, check!, signal)
  }
  async checkCustomSource(account: LogicalAccount, signal: AbortSignal) {
    await this.custom.run(account.platformId, randomUUID(), signal, await this.source(account))
    const check = this.repository.list("platformCheck").filter(v => v.platformId === account.platformId).at(-1)
    if (check?.result?.status !== "authenticated" || check.run?.status !== "completed" || !check.run.auditComplete
      || check.run.consumed.llmCalls !== 0 || account.displayIdentity && check.result.displayIdentity !== account.displayIdentity)
      throw new DomainError("account_source_unconfirmed", "自定义网站的原登录需要重新确认。", 409)
  }
  private async customCommand(command: Exclude<DirectoryCommand, { type: "cancel" }>, operation: DirectoryOperation, signal: AbortSignal, kind: BrowserIdentity["kind"]) {
    if (command.type === "custom_open") {
      const identity = await this.maintenanceIdentity(kind)
      const previous = this.repository.active(identity.id)
      if (previous) { await this.windows.finish(previous)
        if (this.repository.get("maintenance", previous.id).status !== "closed") throw new DomainError("account_window_unconfirmed", "原窗口未确认释放，请重试。", 409) }
      const window = await this.windows.open(identity, null, signal)
      this.customSessionId = window.id; this.customBindingId = null
      this.patch(operation, { sourceIdentityId: identity.id, sourceBinding: identity.binding, ownerId: window.ownerId, leaseId: window.leaseId }, signal)
    } else if (command.type === "custom_read") {
      if (!this.customSessionId) throw new DomainError("account_custom_window_required", "请先打开本次网站窗口。", 409)
      const binding = await this.custom.bind(this.customSessionId)
      this.patch(operation, { platformId: binding.id, logicalRevision: this.current(binding.id)?.revision ?? 0 }, signal)
      this.customBindingId = binding.id
    } else if (command.type === "custom_pick") {
      await this.custom.pick(command.platformId, command.revision, "account", signal)
    } else if (command.type === "custom_confirm") {
      const selected = this.custom.markerSelection()
      const picked = this.repository.list("directoryOperation").filter(v => v.intent === "custom_pick" && v.platformId === selected?.bindingId && v.status === "completed").at(-1)
      if (!selected || !picked || (this.current(selected.bindingId)?.revision ?? 0) !== picked.logicalRevision)
        throw new DomainError("account_revision_changed", "账号已变化，请重新选择登录标识。", 409)
      const binding = this.custom.confirmMarker(command.reference)
      const revised = this.patch(operation, { platformId: binding.id, logicalRevision: this.current(binding.id)?.revision ?? 0 }, signal)
      await this.custom.run(binding.id, command.requestId, signal)
      const check = this.repository.list("platformCheck").filter(c => c.requestId === command.requestId).at(-1)
      if (!check) throw new Error("account_check_incomplete")
      this.save(revised, this.repository.get("identity", binding.browserIdentityId), check, signal)
    }
    else if (command.type === "custom_attach") this.custom.attach(command.platformId, command.revision, command.chainId, command.chainVersion)
    else if (command.type === "custom_check" || command.type === "custom_add") {
      const binding = this.repository.get("binding", command.platformId)
      const account = this.current(binding.id)
      if (command.type === "custom_check" && (!account || account.deletedAt)) throw new DomainError("account_not_found", "请使用添加账号重新添加。", 409)
      if (command.type === "custom_add" && account && !account.deletedAt) throw new DomainError("account_exists", "账号已添加，请重新检查。", 409)
      const identity = await this.maintenanceIdentity(kind)
      await this.verifyAvailability?.(kind)
      await this.custom.run(binding.id, command.requestId, signal, identity)
      const check = this.repository.list("platformCheck").filter(c => c.requestId === command.requestId).at(-1)
      if (!check) throw new Error("account_check_incomplete")
      this.save(operation, identity, check, signal)
    }
  }
}
