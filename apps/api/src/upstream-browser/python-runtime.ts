import path from "node:path"
import { existsSync } from "node:fs"
import { z } from "zod"
import type { AI } from "@agent-platform/ai-connect/server"
import type { TaskChainCapabilities } from "@browser-capture/runtime"
import { RunnerProcess, type UpstreamBrowserRuntime, type UpstreamBrowserSession } from "./service.js"
import { withHybridCapabilities } from "./hybrid-runtime.js"
import { withHybridAuthoring, recompileHybridSource, type HybridAuthorSession } from "./hybrid-exploration.js"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { retireWorkflowV1 } from "./retirement.js"
import { TaskConnection } from "./task-connection.js"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"
import { accountSessionRequestSchema, executionStorageSchema } from "./hybrid-protocol.js"
import { randomUUID } from "node:crypto"
import type { AccountStartup } from "../browser/account-reuse.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "./cleanup.js"
import { dailyWindowTransport } from "./daily-window-transport.js"
import { AccountRunner } from "./account-runner.js"

type AuthoringInput = Parameters<NonNullable<UpstreamBrowserRuntime["withAuthoring"]>>[0]
type CapabilitiesInput = Parameters<NonNullable<UpstreamBrowserRuntime["withCapabilities"]>>[0]

/** WHY：每次执行复用一个原生 runner/SDK；历史任务连接不能成为所有任务共用的串行锁。 */
export class PythonUpstreamBrowserRuntime implements UpstreamBrowserRuntime {
  private prepareAccounts: ((input: AccountStartup) => Promise<unknown>) | null = null
  private accountPreparation: Promise<unknown> = Promise.resolve()
  private runners = new Set<RunnerProcess>()
  private accountRunner = new AccountRunner(signal => {
    const runner = new RunnerProcess(this.options.root, signal)
    this.runners.add(runner); return runner
  }, async runner => {
    const report = await runner.close()
    if (report.status === "confirmed") this.runners.delete(runner)
    return report
  })
  withAccountOperation<T>(work: () => Promise<T>) { return this.accountRunner.run(work) }
  private verifyLegacyDailyOwner: ((ownerId: string) => Promise<boolean>) | undefined
  private releasedAccountOwners: ((kind: "daily" | "dedicated") => Promise<string[]>) | undefined
  setAccountPreparation(handler: (input: AccountStartup) => Promise<unknown>) { this.prepareAccounts = handler }
  setDailyOwnerVerification(handler: (ownerId: string) => Promise<boolean>) { this.verifyLegacyDailyOwner = handler }
  setReleasedAccountOwners(handler: (kind: "daily" | "dedicated") => Promise<string[]>) { this.releasedAccountOwners = handler }
  constructor(private readonly options: { root: string; directory: string; subject: ReturnType<AI["forSubject"]>;
    browserMode?: () => BrowserMode; dailyChromeEndpoint?: (ownerId?: string) => Promise<string | undefined>;
    dailyChromeInspectionEndpoint?: (ownerId: string) => Promise<string | undefined> },
    private readonly connection?: TaskConnection) {}

  sourceDigest() { return verifyForkSource(this.options.root) }
  async close() {
    const reports = await Promise.all([...this.runners].map(runner => runner.close()))
    if (this.connection) reports.push(await this.connection.close())
    return cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage,
      status: reports.some(report => report.status === "unconfirmed") ? "unconfirmed" : "confirmed",
      code: reports.find(report => report.code)?.code ?? null })), reports.some(report => report.activeResources !== false) ? null : false)
  }
  async accountSession(input: Parameters<NonNullable<UpstreamBrowserRuntime["accountSession"]>>[0], signal: AbortSignal) {
    try {
      const transport = input.kind === "daily" ? await this.dailyTransport(input.ownerId) : {}
      return await this.accountRunner.use(signal, runner => runner.request(accountSessionRequestSchema.parse({ ...input, ...transport,
        id: randomUUID(), type: "hybrid_account_session", profilePath: path.join(this.options.directory, "browser-profile", "default") })))
    } finally {
      // WHY：取消可能先终止原runner；用新短时借用退出原生选取，仍只操作原owner页面。
      if (input.action === "pick_marker" && signal.aborted) {
        try { await this.accountSession({ ...input, action: "clear_marker", payload: null }, AbortSignal.timeout(15000)) }
        catch { throw new Error("account_marker_cleanup_unconfirmed") }
      }
    }
  }
  recompile(input: Omit<Parameters<typeof recompileHybridSource>[0], "root" | "directory" | "subject">) {
    return recompileHybridSource({ ...input, ...this.options })
  }

  async withAuthoring<T>(input: AuthoringInput, work: (session: HybridAuthorSession) => Promise<T>): Promise<T> {
    const mode = input.browserMode ?? this.options.browserMode?.() ?? "daily"
    const storage = await this.prepare({ ...input, browserMode: mode, resume: Boolean(input.managedWindow?.resume) })
    const managedWindow = await this.releasedWindowConfig(input.managedWindow, mode)
    return withHybridAuthoring({ ...input, ...this.options, ...(managedWindow ? { managedWindow } : {}),
      profilePath: this.profilePath(mode, input.ownerId, false, Boolean(input.managedWindow?.resume)), headless: mode === "dedicated-headless" }, work,
      { createRunner: (_root, signal, diagnostic) => this.runner(mode, input.ownerId, signal, diagnostic, storage) })
  }

  async withCapabilities<T>(input: CapabilitiesInput, work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
    const mode = input.browserMode ?? (input.headless ? "dedicated-headless" : this.options.browserMode?.() ?? "daily")
    let managedWindow = input.managedWindow
    let storage: unknown
    try {
      if (input.sessionPurpose !== "account") storage = await this.prepare({ ...input, browserMode: mode, resume: Boolean(input.managedWindow?.resume) })
      managedWindow = await this.releasedWindowConfig(input.managedWindow, mode)
    } catch (error) {
      if (!input.managedWindow?.resume) {
        // WHY：前置账号操作拥有自己的资源；此时本 execution 的 runner 尚未创建，不能挂一个虚构清理锁。
        input.onCleanup?.(cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "not_required", code: null })), false))
      }
      throw error
    }
    return withHybridCapabilities({ ...input, ...(managedWindow ? { managedWindow } : {}), root: this.options.root, directory: this.options.directory,
      profilePath: this.profilePath(mode, input.ownerId, input.sessionPurpose === "account", Boolean(input.managedWindow?.resume)),
      createRunner: (_root, signal, diagnostic) => this.runner(mode, input.ownerId, signal, diagnostic, storage),
      canRestoreByNavigation: input.canRestoreByNavigation ?? false }, work)
  }

  async managedWindowAction(input: Parameters<NonNullable<UpstreamBrowserRuntime["managedWindowAction"]>>[0]) {
    const runner = new RunnerProcess(this.options.root, new AbortController().signal)
    const transport = input.browserMode === "daily" ? await this.dailyTransport(input.ownerId, input.action === "end") : {}
    const result = await runner.managedWindowAction({ ...input, ...transport,
      profilePath: this.profilePath(input.browserMode ?? "daily", input.ownerId, false, true) })
    if (input.action === "verify_closed" && result.report.status === "confirmed" && !result.window.active
      && result.window.ownerId === input.ownerId && result.window.leaseId === input.leaseId) {
      this.connection?.acceptClosedWindow(input.ownerId)
    }
    return result
  }
  private dailyTransport(ownerId: string, connect = false) {
    // WHY：显式关闭需沿既有授权入口刷新重启后的 relay；只读核验不能唤醒浏览器。
    const endpoint = connect ? this.options.dailyChromeEndpoint : this.options.dailyChromeInspectionEndpoint ?? this.options.dailyChromeEndpoint
    return dailyWindowTransport(this.options.directory, ownerId, endpoint ? () => endpoint(ownerId) : undefined, this.verifyLegacyDailyOwner)
  }
  private async releasedWindowConfig(window: CapabilitiesInput["managedWindow"], mode: BrowserMode) {
    if (!window || window.resume || !this.releasedAccountOwners) return window
    const accounts = await this.releasedAccountOwners(mode === "daily" ? "daily" : "dedicated")
    return { ...window, releasedOwners: [...new Set([...(window.releasedOwners ?? []), ...accounts])] }
  }
  private prepare(input: AccountStartup) {
    if (input.resume || !this.prepareAccounts) return Promise.resolve(undefined)
    // WHY：账号目录短暂维护仍串行；其结束后各任务使用独立会话并行，不持有全局执行锁。
    const work = this.accountPreparation.catch(() => undefined).then(() => { input.signal.throwIfAborted(); return this.prepareAccounts!(input) })
    this.accountPreparation = work; return work
  }
  private profilePath(mode: BrowserMode, owner: string, account = false, legacy = false) {
    const base = path.join(this.options.directory, "browser-profile"), id = z.uuid().parse(owner)
    const owned = path.join(base, "runs", id, "default")
    return mode === "daily" || account || legacy && !existsSync(path.dirname(owned)) ? path.join(base, "default") : owned
  }
  private runner(mode: BrowserMode, owner: string, signal: AbortSignal, diagnostic?: (line: string) => void, storage?: unknown) {
    const runner = new RunnerProcess(this.options.root, signal, diagnostic, { browserMode: mode,
      ...(this.options.dailyChromeEndpoint ? { resolveExtensionEndpoint: () => this.options.dailyChromeEndpoint!(owner) } : {}) })
    const start = runner.startHybrid.bind(runner), close = runner.close.bind(runner), handoff = runner.handoff.bind(runner)
    runner.startHybrid = config => start({ ...config, ...(mode !== "daily" && storage ? { storageState: executionStorageSchema.parse(storage) } : {}) })
    runner.close = async () => {
      const report = await close()
      if (report.status === "confirmed") this.runners.delete(runner)
      else this.runners.add(runner)
      return report
    }
    runner.handoff = async () => { try { return await handoff() } finally { this.runners.delete(runner) } }
    this.runners.add(runner); return runner
  }

  async withSession<T>(_input: Parameters<UpstreamBrowserRuntime["withSession"]>[0],
    _work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T> {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
}
