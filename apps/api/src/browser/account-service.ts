import { randomUUID } from "node:crypto"
import { accountSnapshotSchema, type AccountSnapshot, type BrowserIdentity } from "@browser-capture/contracts/browser-account"
import { platformSnapshotSchema, type PlatformSnapshot } from "@browser-capture/contracts/platform-account"
import type { loadPlatformCatalog } from "./platform-catalog.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import type { AccountRepository } from "./account-repository.js"
import type { AccountIdentities } from "./account-identity.js"
import { AccountWindows } from "./account-windows.js"
import { PlatformChecks } from "./platform-check.js"
import { AccountTransfers, safeReason } from "./account-transfer.js"
import { AccountCustom } from "./account-custom.js"
import { DomainError } from "../errors.js"
import { accountDirectoryCommandSchema } from "@browser-capture/contracts/account-directory"
import { AccountDirectory } from "./account-directory.js"
import { AccountReuse, type AccountStartup } from "./account-reuse.js"

type Catalog = Awaited<ReturnType<typeof loadPlatformCatalog>>
export class BrowserAccountService {
  private operation: PlatformSnapshot["operation"] = null
  private controller: AbortController | null = null
  private work: Promise<void> | null = null
  private currentIdentityIds: PlatformSnapshot["currentIdentityIds"] = { daily: null, dedicated: null }
  private windows: AccountWindows
  private checks: PlatformChecks
  private transfers: AccountTransfers
  readonly custom: AccountCustom
  readonly directory: AccountDirectory
  private readonly reuse: AccountReuse
  constructor(readonly repository: AccountRepository, private identities: AccountIdentities,
    private upstream: UpstreamBrowserRuntime, assertAvailable: (kind: BrowserIdentity["kind"]) => void,
    private catalog: Catalog,
    private access?: { snapshot(): AccountSnapshot["availability"]; verify(kind: BrowserIdentity["kind"]): Promise<void>;
      releasedOwners?(kind: BrowserIdentity["kind"]): string[] }) {
    repository.recover()
    this.windows = new AccountWindows(repository, identities, upstream, assertAvailable, kind => this.access?.releasedOwners?.(kind) ?? [])
    this.checks = new PlatformChecks(repository, upstream, catalog.version, catalog.evidenceSha256)
    this.transfers = new AccountTransfers(repository, identities, this.windows, this.checks, upstream, catalog.version, catalog.evidenceSha256)
    this.custom = new AccountCustom(repository, identities, this.windows, upstream)
    this.directory = new AccountDirectory(repository, identities, this.windows, this.checks, this.custom,
      catalog.platforms, catalog.version, kind => this.access?.verify(kind) ?? Promise.resolve(),
      (account, identity, window, check, signal) => this.reuse.tryRestoreLogin(account, identity, window, check, signal))
    this.reuse = new AccountReuse(this.directory, identities, this.windows, this.checks, this.transfers, kind => this.access?.verify(kind) ?? Promise.resolve())
  }
  isBusy() { return Boolean(this.operation) }
  async releasedWindowOwners(kind: BrowserIdentity["kind"]) {
    const identity = await this.identities.current(kind)
    if (!identity || this.isBusy() || this.repository.list("transfer").some(value =>
      value.targetIdentityId === identity.id && value.rollbackRef)) return []
    // WHY：兼容旧 inspect 只保存宿主 closed 的收据；归档许可只来自当前同 Profile 的确定维护 owner。
    return this.repository.list("maintenance").filter(window => window.status === "closed"
      && window.browserIdentityId === identity.id && window.ownerId === window.leaseId).map(window => window.ownerId)
  }
  async directoryCommand(raw: unknown) {
    const command = accountDirectoryCommandSchema.parse(raw)
    if (command.type === "cancel") {
      if (this.operation?.requestId === command.requestId) this.controller?.abort()
    } else this.exclusive(command.requestId, command.type, signal => this.directory.perform(command, signal, async () => {
      // WHY：恢复是后台安全重试，不恢复已退休的窗口/同步 UI；原 owner 不明时仍拒绝写入。
      if (!["remove", "custom_attach"].includes(command.type)) await this.reuse.recoverPending(signal)
    }), ["add", "relogin", "switch"].includes(command.type) ? 300000 : 120000)
    await Promise.resolve()
    await this.directory.refreshProfiles()
    return this.directory.snapshot()
  }
  async prepareStartup(input: AccountStartup) {
    if (input.resume) return
    if (this.isBusy()) throw new DomainError("account_operation_busy", "账号正在登录，请完成或取消后运行。", 409)
    let failure: unknown, storage: Awaited<ReturnType<AccountReuse["prepare"]>>
    this.exclusive(randomUUID(), "自动准备已添加账号", async signal => {
      try { storage = await this.reuse.prepare({ ...input, signal: AbortSignal.any([input.signal, signal]) }) }
      catch (error) { failure = error; throw error }
    })
    await this.settled()
    if (failure) throw failure
    return storage
  }
  async refreshIdentityProjection() {
    this.currentIdentityIds = { daily: (await this.identities.current("daily"))?.id ?? null,
      dedicated: (await this.identities.current("dedicated"))?.id ?? null }
  }
  snapshot() {
    return accountSnapshotSchema.parse({ identities: this.repository.list("identity"), entries: this.repository.list("entry").filter(v => !v.deletedAt),
      checks: this.repository.list("check"), maintenance: this.repository.active(), availability: this.access?.snapshot(),
      methods: this.repository.list("method").map(({ chain: _chain, ...v }) => ({ ...v, usable: this.repository.usable(v.id) })) })
  }
  platformSnapshot() {
    this.transfers.expireConfirmations()
    return platformSnapshotSchema.parse({ catalog: this.catalog.platforms, catalogVersion: this.catalog.version,
      identities: this.repository.list("identity"), checks: this.repository.list("platformCheck"),
      currentIdentityIds: this.currentIdentityIds,
      bindings: this.repository.list("binding").filter(v => !v.deletedAt), transfers: this.repository.list("transfer"),
      windows: this.repository.list("maintenance").filter(v => v.status !== "closed"),
      availability: this.access?.snapshot() ?? { daily: null, dedicated: null }, operation: this.operation,
      notice: this.repository.list("platformOperation").at(-1)?.reason ?? null,
      markerSelection: this.custom.markerSelection(),
      history: { entries: this.repository.list("entry"), checks: this.repository.list("check"), methods: this.repository.list("method").map(({ chain: _chain, ...v }) => v) } })
  }
  private assertIdle() { if (this.operation) throw new DomainError("account_operation_busy", "请等待当前操作结束或取消。", 409) }
  private exclusive(requestId: string, label: string, work: (signal: AbortSignal) => Promise<unknown>, timeoutMs = 120000) {
    if (this.repository.list("platformOperation").some(v => v.id === requestId)) return
    this.assertIdle()
    const controller = new AbortController(); this.controller = controller
    this.operation = { requestId, label, startedAt: new Date().toISOString() }
    const record = this.repository.save("platformOperation", { id: requestId, label, startedAt: this.operation.startedAt, finishedAt: null, status: "running", reason: null })
    this.work = Promise.resolve().then(() => {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])
      return this.upstream.withAccountOperation ? this.upstream.withAccountOperation(() => work(signal)) : work(signal)
    })
      .then(() => { this.repository.save("platformOperation", { ...record, status: "completed", finishedAt: new Date().toISOString() }) })
      .catch(error => {
        const reason = error instanceof Error && error.message === "account_marker_cleanup_unconfirmed" ? safeReason(error)
          : controller.signal.aborted ? "操作已取消，登录窗口仍保留。" : error instanceof DomainError ? error.message : safeReason(error)
        this.repository.save("platformOperation", { ...record, status: controller.signal.aborted ? "cancelled" : "failed", reason, finishedAt: new Date().toISOString() })
        // WHY：不把上游异常响应/凭据写日志；只投影固定展示原因，不改写历史检查。
        for (const window of this.repository.list("maintenance").filter(v => v.status === "open"))
          this.windows.update(window, "open", reason)
      }).finally(() => { this.operation = null; this.controller = null; this.work = null })
  }
  async close() { this.controller?.abort(); await this.work }
  async settled() { await this.work; await this.directory.refreshProfiles() }
}
