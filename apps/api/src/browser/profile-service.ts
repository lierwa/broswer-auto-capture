import path from "node:path"
import { randomUUID } from "node:crypto"
import { jsonValueSchema } from "@browser-capture/contracts"
import { browserProfileCommandSchema, browserProfileStateSchema, browserTargetSelectionCommandSchema,
  browserTargetSelectionStateSchema, type BrowserTargetSelectionCommand } from "@browser-capture/contracts/browser-profile"
import { DomainError } from "../errors.js"
import { RunnerProcess, UpstreamProtocolError } from "../upstream-browser/service.js"

type ProfileRunner = Pick<RunnerProcess, "close" | "startProfile" | "pickProfileTarget">
type RunnerFactory = (root: string, signal: AbortSignal) => ProfileRunner
type StartSelection = Extract<BrowserTargetSelectionCommand, { type: "start" }>

export class BrowserProfileService {
  private status: "closed" | "opening" | "open" | "closing" = "closed"
  private openedAt: string | null = null
  private runner: ProfileRunner | null = null
  private controller: AbortController | null = null
  private selectionCommand: StartSelection | null = null
  private selectionWork: Promise<void> | null = null
  private selection = browserTargetSelectionStateSchema.parse({
    id: null, status: "idle", requestId: null, taskId: null, draftId: null, chainId: null, nodeId: null,
    target: null, tag: null, strategy: null, error: null, startedAt: null, updatedAt: null,
  })

  constructor(private readonly root: string, private readonly directory: string,
    private readonly createRunner: RunnerFactory = (ownerRoot, signal) => new RunnerProcess(ownerRoot, signal)) {}

  snapshot() { return browserProfileStateSchema.parse({ status: this.status, openedAt: this.openedAt }) }
  targetSelection() { return browserTargetSelectionStateSchema.parse(this.selection) }
  isBusy() { return this.status !== "closed" || ["opening", "selecting"].includes(this.selection.status) }

  async control(raw: unknown, assertAvailable: () => void) {
    const command = browserProfileCommandSchema.parse(raw)
    if (command.type === "open") await this.open(assertAvailable)
    else await this.close()
    return this.snapshot()
  }

  private async open(assertAvailable: () => void) {
    if (this.status !== "closed") {
      throw new DomainError("browser_profile_already_open", "B-A-T 专用浏览器已经打开。", 409)
    }
    this.status = "opening"
    try {
      assertAvailable()
      const controller = new AbortController(), runner = this.createRunner(this.root, controller.signal)
      this.controller = controller; this.runner = runner
      await runner.startProfile({ profilePath: this.profilePath(), headless: false })
      this.openedAt = new Date().toISOString()
      this.status = "open"
    } catch (error) {
      await this.forceClosed()
      if (error instanceof DomainError) throw error
      throw new DomainError("browser_profile_open_failed", "B-A-T 专用浏览器未能打开，请检查本地浏览器服务后重试。", 500)
    }
  }

  async targetControl(raw: unknown, context: { taskId: string; startUrl?: string }, assertAvailable: () => void) {
    const command = browserTargetSelectionCommandSchema.parse(raw)
    if (command.type === "cancel") return this.cancelTargetSelection(command.selectionId)
    if (this.selectionCommand?.requestId === command.requestId) {
      if (JSON.stringify(this.selectionCommand) !== JSON.stringify(command)) {
        throw new DomainError("target_selection_request_conflict", "目标选择请求标识已绑定到其他内容。", 409)
      }
      return this.targetSelection()
    }
    if (this.isBusy()) throw new DomainError("browser_profile_already_open", "B-A-T 专用浏览器正在使用中。", 409)
    assertAvailable()
    const now = new Date().toISOString(), selectionId = randomUUID()
    this.selectionCommand = command
    this.selection = browserTargetSelectionStateSchema.parse({ id: selectionId, status: "opening",
      requestId: command.requestId, taskId: context.taskId, draftId: command.draftId,
      chainId: command.chainId, nodeId: command.nodeId,
      target: null, tag: null, strategy: null, error: null, startedAt: now, updatedAt: now })
    this.selectionWork = this.runTargetSelection(selectionId, context.startUrl).finally(() => {
      if (this.selection.id === selectionId) this.selectionWork = null
    })
    return this.targetSelection()
  }

  private async runTargetSelection(selectionId: string, startUrl?: string) {
    this.status = "opening"
    const controller = new AbortController(), runner = this.createRunner(this.root, controller.signal)
    this.controller = controller; this.runner = runner
    try {
      await runner.startProfile({ profilePath: this.profilePath(), headless: process.env.BAT_TARGET_PICKER_HEADLESS === "1",
        ...(startUrl ? { startUrl } : {}) })
      if (this.selectionStopped(selectionId)) return
      this.status = "open"; this.openedAt = new Date().toISOString()
      this.updateSelection({ status: "selecting" })
      const result = await runner.pickProfileTarget(180_000)
      if (this.selectionStopped(selectionId)) return
      const cleanup = await runner.close()
      if (cleanup.status === "unconfirmed") {
        this.updateSelection({ status: "failed", error: "target_selection_cleanup_unconfirmed" })
        return
      }
      this.updateSelection({ status: "selected", target: jsonValueSchema.parse(result.target),
        tag: result.tag, strategy: result.strategy })
    } catch (error) {
      if (this.selection.id !== selectionId || this.selection.status === "cancelled") return
      this.updateSelection({ status: "failed", error: error instanceof UpstreamProtocolError
        && error.code === "target_selection_timeout" ? "target_selection_timeout"
        : this.status === "opening" ? "target_selection_start_failed" : "target_selection_failed" })
    } finally {
      try { await runner.close() } catch { /* Selection state already exposes the bounded failure. */ }
      if (this.selection.id === selectionId) this.reset()
    }
  }

  private async cancelTargetSelection(selectionId: string) {
    if (this.selection.id !== selectionId) {
      throw new DomainError("target_selection_changed", "目标选择已变化，请读取最新状态。", 409)
    }
    if (!["opening", "selecting"].includes(this.selection.status)) return this.targetSelection()
    this.updateSelection({ status: "cancelled", error: "target_selection_cancelled" })
    await this.forceClosed()
    return this.targetSelection()
  }

  async close() {
    if (this.status === "closed") return
    if (this.status === "opening") {
      throw new DomainError("browser_profile_opening", "B-A-T 专用浏览器正在打开，请稍后再关闭。", 409)
    }
    if (this.status === "closing") return
    this.status = "closing"
    const runner = this.runner
    try {
      const cleanup = await runner?.close()
      if (cleanup?.status === "unconfirmed") throw new Error("browser_profile_cleanup_unconfirmed")
    }
    catch { throw new DomainError("browser_profile_close_failed", "专用浏览器没有正常关闭，请重试。", 500) }
    finally { this.reset() }
  }

  async shutdown() {
    if (["opening", "selecting"].includes(this.selection.status)) {
      this.updateSelection({ status: "cancelled", error: "target_selection_cancelled" })
    }
    await this.forceClosed()
    if (this.selectionWork) await this.selectionWork
  }

  private async forceClosed() {
    const runner = this.runner
    this.controller?.abort()
    try { await runner?.close() } catch { /* Failed startup is already reported with one product error. */ }
    this.reset()
  }

  private reset() {
    this.controller?.abort()
    this.controller = null; this.runner = null; this.openedAt = null; this.status = "closed"
  }

  private profilePath() { return path.join(this.directory, "browser-profile", "default") }

  private selectionStopped(selectionId: string) {
    return this.selection.id !== selectionId || this.selection.status === "cancelled"
  }

  private updateSelection(patch: Partial<typeof this.selection>) {
    this.selection = browserTargetSelectionStateSchema.parse({ ...this.selection, ...patch, updatedAt: new Date().toISOString() })
  }
}
