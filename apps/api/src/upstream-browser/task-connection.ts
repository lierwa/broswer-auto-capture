import { RunnerProcess } from "./service.js"
import { randomUUID } from "node:crypto"
import { hybridReleaseRequestSchema, hybridReleaseResultSchema } from "./hybrid-protocol.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES,
  type RunnerCleanupReport } from "./cleanup.js"

type TaskRunner = Pick<RunnerProcess, "startHybrid" | "request" | "close" | "envBoolean">
  & Partial<Pick<RunnerProcess, "handoff" | "managedWindowOwner">>
type RunnerFactory = (root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) => TaskRunner
type Borrow = { connectionOwnerId: string; signal: AbortSignal; onDiagnostic?: (line: string) => void;
  closeAfterOperation?: boolean }
type Parent = { ownerId: string; runner: TaskRunner; abort: AbortController; blocked?: RunnerCleanupReport }

class TaskConnectionBlockedError extends Error {
  constructor(readonly ownerId: string, readonly report: RunnerCleanupReport) {
    super("hybrid_task_connection_cleanup_required")
  }
}

const emptyReport = () => cleanupReport(RUNNER_CLEANUP_STAGES.map(stage =>
  ({ stage, status: "not_required", code: null })), false)

/** WHY：父任务拥有 SDK 连接/进程；每次运行只借用连接并拥有自己的页，不能把仍保留的父资源伪报退出。 */
export class TaskConnection {
  private parent: Parent | undefined
  private active: symbol | undefined
  private diagnostic: ((line: string) => void) | undefined
  constructor(private readonly root: string, private readonly createRunner: RunnerFactory =
    (root, signal, diagnostic) => new RunnerProcess(root, signal, diagnostic)) {}

  borrow(input: Borrow): TaskRunner {
    const token = Symbol("task-connection-operation")
    let parent: Parent | undefined, started = false, handoffAttempted = false, result: Promise<RunnerCleanupReport> | undefined
    const abort = () => parent?.abort.abort(input.signal.reason)
    const finish = async (final: boolean): Promise<RunnerCleanupReport> => {
      if (!parent) return emptyReport()
      try { return await this.release(parent, final || !started || handoffAttempted || input.signal.aborted) }
      finally {
        input.signal.removeEventListener("abort", abort)
        if (this.active === token) { this.active = undefined; this.diagnostic = undefined }
      }
    }
    const current = () => {
      input.signal.throwIfAborted()
      if (this.active !== token || !parent || result) throw new Error("hybrid_task_connection_not_borrowed")
      return parent.runner
    }
    return {
      envBoolean: (name, fallback) => { const value = process.env[name]?.trim()
        return value === undefined || value === "" ? fallback : value === "true" || value === "1" },
      startHybrid: async config => {
        input.signal.throwIfAborted()
        if (result || parent) throw new Error("hybrid_task_connection_operation_already_started")
        if (this.active) throw new Error("hybrid_task_connection_busy")
        this.active = token
        try {
          parent = await this.acquire(input.connectionOwnerId)
          this.diagnostic = input.onDiagnostic
          input.signal.addEventListener("abort", abort, { once: true })
          input.signal.throwIfAborted()
          await parent.runner.startHybrid({ ...config, connectionOwnerId: input.connectionOwnerId })
          started = true
        } catch (error) {
          if (!parent && this.active === token) this.active = undefined
          throw error
        }
      },
      request: (...args) => current().request(...args),
      close: () => result ??= finish(Boolean(input.closeAfterOperation)),
      handoff: async () => {
        const runner = current()
        if (!runner.handoff) throw new Error("browser_handoff_unavailable")
        handoffAttempted = true
        try {
          const handed = await runner.handoff()
          this.recordFinal(parent!, handed.report)
          result = Promise.resolve(handed.report)
          return handed
        } finally {
          input.signal.removeEventListener("abort", abort)
          if (this.active === token) { this.active = undefined; this.diagnostic = undefined }
        }
      },
    }
  }

  private async acquire(ownerId: string): Promise<Parent> {
    // WHY：旧父资源阻断新借用，但不能把旧 cleanup_required 错挂到尚未创建资源的新 execution。
    if (this.parent?.blocked) throw new TaskConnectionBlockedError(this.parent.ownerId, this.parent.blocked)
    if (this.parent && this.parent.ownerId !== ownerId) {
      const previous = this.parent
      const report = await previous.runner.close()
      this.recordFinal(previous, report)
      if (report.status !== "confirmed") throw new TaskConnectionBlockedError(previous.ownerId, report)
    }
    if (!this.parent) {
      const abort = new AbortController()
      this.parent = { ownerId, abort, runner: this.createRunner(this.root, abort.signal,
        line => this.diagnostic?.(line)) }
    }
    return this.parent
  }

  private async release(parent: Parent, final: boolean): Promise<RunnerCleanupReport> {
    if (!final) {
      try {
        const released = hybridReleaseResultSchema.parse(await parent.runner.request(hybridReleaseRequestSchema.parse({
          id: randomUUID(), type: "hybrid_release", connectionOwnerId: parent.ownerId })))
        if (released.closed && released.retainedConnectionOwnerId === parent.ownerId) {
          return cleanupReport([...released.stages, { stage: "close_protocol", status: "confirmed", code: null },
            ...(["child_exit", "process_tree", "temporary_directory"] as const).map(stage =>
              ({ stage, status: "not_required" as const, code: null }))], false, { ownerId: parent.ownerId, scope: "task" })
        }
      } catch { /* WHY：释放失败不借给下一次；用既有最终 close 核验，不重连、不覆盖业务错误。 */ }
    }
    const report = await parent.runner.close()
    this.recordFinal(parent, report)
    return report
  }

  private recordFinal(parent: Parent, report: RunnerCleanupReport) {
    if (report.status !== "confirmed") parent.blocked = report
    else if (this.parent === parent) this.parent = undefined
  }

  acceptClosedWindow(ownerId: string) {
    const parent = this.parent, report = parent?.blocked
    // WHY：仅在原 verify_closed 已确认同一窗口后释放死 worker 引用；不停止进程、不重连或继续旧运行。
    if (!parent || !report || this.active || parent.runner.managedWindowOwner?.() !== ownerId
      || !report.stages.some(stage => stage.stage === "child_exit" && stage.status === "confirmed")
      || report.stages.some(stage => stage.stage !== "browser_close" && stage.status === "unconfirmed")) return false
    this.parent = undefined
    return true
  }

  async close(): Promise<RunnerCleanupReport> {
    if (!this.parent) return emptyReport()
    const parent = this.parent
    const report = await parent.runner.close()
    this.recordFinal(parent, report)
    return report
  }
}
