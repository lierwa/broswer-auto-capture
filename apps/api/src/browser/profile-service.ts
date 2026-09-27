import { mkdir, rm, stat } from "node:fs/promises"
import { statSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { browserProfileCommandSchema, browserProfileStateSchema } from "@browser-capture/contracts/browser-profile"
import { DomainError } from "../errors.js"
import { RunnerProcess, removeRunnerTemporaryDirectory } from "../upstream-browser/service.js"
import { ownedRunnerDirectory } from "../upstream-browser/runner-ownership.js"
import { readProfileOwner, saveProfileOwner, type ProfileOwner } from "./profile-owner.js"

type ProfileRunner = Pick<RunnerProcess, "close" | "startProfile" | "handoff" | "recoverProfile">
type RunnerFactory = (root: string, signal: AbortSignal) => ProfileRunner

export class BrowserProfileService {
  private status: "closed" | "opening" | "open" | "closing" | "cleanup_required" = "closed"
  private openedAt: string | null = null
  private runner: ProfileRunner | null = null
  private controller: AbortController | null = null

  constructor(private readonly root: string, private readonly directory: string,
    private readonly createRunner: RunnerFactory = (ownerRoot, signal) => new RunnerProcess(ownerRoot, signal)) {
    if (this.markerExistsSync()) this.status = "cleanup_required"
  }

  snapshot() { return browserProfileStateSchema.parse({ status: this.status, openedAt: this.openedAt }) }
  isBusy() { return this.status !== "closed" }

  async control(raw: unknown, assertAvailable: () => void) {
    const command = browserProfileCommandSchema.parse(raw)
    if (command.type === "open") await this.open(assertAvailable)
    else if (command.type === "recover") await this.recover()
    else await this.close()
    return this.snapshot()
  }

  private async open(assertAvailable: () => void) {
    if (this.status !== "closed") throw new DomainError("browser_profile_already_open", "专用浏览器已被占用。", 409)
    this.status = "opening"
    let owner: ProfileOwner | null = null
    try {
      assertAvailable()
      await mkdir(path.dirname(this.markerPath()), { recursive: true })
      const reserved: ProfileOwner = { schemaVersion: "bat-profile-owner/v1", ownerId: randomUUID(),
        profilePath: this.profilePath(), createdAt: new Date().toISOString(), runner: null, cleanup: null }
      await saveProfileOwner(this.markerPath(), reserved, true)
      owner = reserved
      const controller = new AbortController(), runner = this.createRunner(this.root, controller.signal)
      this.controller = controller; this.runner = runner
      await runner.startProfile({ profilePath: owner.profilePath, headless: false, ownerId: owner.ownerId },
        async (identity) => { owner!.runner = identity; await saveProfileOwner(this.markerPath(), owner!) })
      const handoff = await runner.handoff()
      owner.cleanup = handoff.report
      await saveProfileOwner(this.markerPath(), owner)
      if (handoff.lease.ownerId !== owner.ownerId || handoff.lease.leaseId !== owner.ownerId
        || handoff.report.status !== "confirmed") throw new Error("browser_profile_handoff_unconfirmed")
      // WHY：登录窗口已由持久租约持有，控制 runner 已退出；open 表示窗口交付成功，不占着未知子进程。
      this.runner = null; this.controller = null
      this.openedAt = owner.createdAt; this.status = "open"
    } catch (error) {
      if (owner) {
        try {
          const report = await this.runner?.close()
          if (report) { owner.cleanup = report; await saveProfileOwner(this.markerPath(), owner) }
          if (!owner.runner && report?.status === "confirmed") await rm(this.markerPath(), { force: true })
        } catch { /* 未确认的 owner 原样保留，交独立恢复核验。 */ }
      }
      this.status = this.markerExistsSync() ? "cleanup_required" : "closed"
      if (this.status === "closed") this.reset()
      if (error instanceof DomainError) throw error
      throw new DomainError(this.status === "closed" ? "browser_profile_open_failed" : "browser_profile_cleanup_required",
        this.status === "closed" ? "专用浏览器未能打开，请重试。" : "专用浏览器交付未确认，请核验并关闭本次窗口。", 500)
    }
  }

  async close() {
    if (this.status === "closed") return
    if (this.status === "opening") throw new DomainError("browser_profile_opening", "专用浏览器正在打开。", 409)
    if (this.status === "closing") return
    if (this.status === "cleanup_required") throw new DomainError("browser_profile_cleanup_required", "请先核验并关闭本次窗口。", 503)
    await this.recover()
  }

  private async recover() {
    if (this.status === "closed") return
    if (this.status === "opening" || this.status === "closing") {
      throw new DomainError("browser_profile_processing", "专用浏览器正在处理，请稍后再试。", 409)
    }
    this.status = "closing"
    let verifier: ProfileRunner | null = null
    try {
      const owner = await readProfileOwner(this.markerPath())
      if (!owner.runner || path.resolve(owner.profilePath) !== path.resolve(this.profilePath())) throw new Error("browser_profile_owner_unknown")
      verifier = this.createRunner(this.root, new AbortController().signal)
      const result = await verifier.recoverProfile({ profilePath: owner.profilePath, ownerId: owner.ownerId,
        leaseId: owner.ownerId, runner: owner.runner })
      if (result.report.status !== "confirmed" || result.window.active || result.window.ownerId !== owner.ownerId
        || result.window.leaseId !== owner.ownerId) throw new Error("browser_profile_cleanup_unconfirmed")
      const temporary = await ownedRunnerDirectory(owner.runner)
      if (temporary) await removeRunnerTemporaryDirectory(temporary)
      if (JSON.stringify(await readProfileOwner(this.markerPath())) !== JSON.stringify(owner)) {
        throw new Error("browser_profile_owner_changed")
      }
      // WHY：仅删本次私有标记；共享 Profile、登录态和其他 owner 的租约不在清理范围内。
      await rm(this.markerPath(), { force: true })
      if (await this.markerExists()) throw new Error("browser_profile_marker_retained")
      this.reset()
    } catch (error) {
      this.status = "cleanup_required"
      const legacy = error instanceof Error && error.message === "browser_profile_legacy_owner_unknown"
      throw new DomainError(legacy ? "browser_profile_legacy_owner_unknown" : "browser_profile_cleanup_required",
        legacy ? "历史占用记录缺少资源身份，无法自动核验；记录已保留。" : "本次资源尚未确认释放，请关闭原窗口后重新核验。", 503)
    } finally {
      if (verifier) await verifier.close().catch(() => {})
    }
  }

  async shutdown() {
    if (this.status === "closed" || this.status === "cleanup_required") return
    try { await this.close() } catch { /* 私有标记和 cleanup_required 保留。 */ }
  }

  private reset() {
    this.controller?.abort()
    this.controller = null; this.runner = null; this.openedAt = null; this.status = "closed"
  }
  private profilePath() { return path.resolve(this.directory, "browser-profile", "default") }
  private markerPath() { return path.join(this.directory, "browser-profile", "owner.pending") }
  private markerExistsSync() {
    try { statSync(this.markerPath()); return true }
    catch (error) { return (error as NodeJS.ErrnoException).code !== "ENOENT" }
  }
  private async markerExists() {
    try { await stat(this.markerPath()); return true }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error }
  }
}
