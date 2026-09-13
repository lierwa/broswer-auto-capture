import { createHash } from "node:crypto"
import { z } from "zod"
import { BrowserError, grantSchema, sessionIdSchema, type BrowserGrant, type BrowserHelpObserver, type CommandExecutor, type Ownership } from "./contracts.js"
import { BrowserJournal } from "./journal.js"
import { BrowserSession } from "./session.js"
import { CommandLaunchError } from "./transport.js"
export { BrowserError, grantSchema, commandSchema, browserInspectionSchema, type BrowserGrant, type BrowserAudit,
  type BrowserCommand, type BrowserFailure, type BrowserHelpObserver, type BrowserHelpState, type BrowserInspection, type CommandExecutor } from "./contracts.js"
export { bskExecutor } from "./transport.js"
export { BrowserSession } from "./session.js"
export * from "./task-chain-adapter.js"
export { pageSchema, publicUrl, type BrowserPage } from "./page.js"
export { readTargetSchema, targetReadResultSchema } from "./structured-read.js"

const startSchema = z.object({ session_id: sessionIdSchema })
const stopSchema = z.object({ stopped: z.array(sessionIdSchema), failed: z.array(z.unknown()), return_failures: z.array(z.unknown()) })
const sessionListSchema = z.array(z.object({ session_id: sessionIdSchema }).passthrough())

async function interruptible<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new BrowserError("cancelled")
  let cancel: () => void = () => {}
  const interrupted = new Promise<never>((_resolve, reject) => { cancel = () => reject(new BrowserError("cancelled")) })
  signal.addEventListener("abort", cancel, { once: true })
  try { return await Promise.race([work(), interrupted]) }
  finally { signal.removeEventListener("abort", cancel) }
}

export class BrowserHost {
  private closed = false
  private active: { controller: AbortController; done: Promise<unknown> } | null = null
  readonly journal: BrowserJournal
  constructor(directory: string, private readonly execute: CommandExecutor) { this.journal = new BrowserJournal(directory) }
  async run<T>(rawGrant: unknown, work: (session: BrowserSession, signal: AbortSignal) => Promise<T>, signal?: AbortSignal,
    onHelp?: BrowserHelpObserver): Promise<T> {
    const grant = grantSchema.parse(rawGrant)
    if (this.closed) throw new BrowserError("session_closed")
    if (this.active) throw new BrowserError("busy")
    const controller = new AbortController()
    // WHY：grant timeout 是自动化活动预算；人工协助时间由 BrowserSession 扣除，不能用绝对墙钟 signal 截断。
    const combined = AbortSignal.any([controller.signal, ...(signal ? [signal] : [])])
    const done = this.ownedRun(grant, work, combined, onHelp)
    this.active = { controller, done }
    try { return await done } finally { this.active = null }
  }
  async close() {
    this.closed = true
    const active = this.active
    active?.controller.abort()
    await active?.done.catch(() => {})
  }
  async cleanupOwned(expectedRunId: string) {
    if (this.active) throw new BrowserError("busy")
    const release = await this.journal.acquire(() => {})
    try {
      const owner = await this.journal.owner()
      if (!owner || owner.runId !== expectedRunId) throw new BrowserError("permission_denied")
      if (owner.state === "closed") return
      if (!owner.sessionId) {
        // WHY：session_start 响应丢失时无法按 ID 回收；只有官方枚举明确证明没有活动会话，才可关闭不确定 owner。
        if ((await this.activeSessionIds(owner)).size) throw new BrowserError("cleanup_required")
        owner.state = "closed"; await this.journal.save(owner)
        return
      }
      const args = ["--json", "session", "stop", owner.sessionId]
      const event = { at: new Date().toISOString(), taskId: owner.taskId, runId: owner.runId, requirementVersion: owner.requirementVersion,
        purpose: owner.purpose, sessionId: owner.sessionId, command: "session_stop", argsHash: createHash("sha256").update(JSON.stringify(args)).digest("hex") }
      await this.journal.audit({ ...event, phase: "intended" })
      try {
        const result = await this.execute(args)
        const stopped = stopSchema.parse(JSON.parse(result.stdout))
        if (result.exitCode || !stopped.stopped.includes(owner.sessionId) || stopped.failed.length || stopped.return_failures.length) throw new BrowserError("cleanup_required")
        await this.journal.audit({ ...event, phase: "completed" })
        owner.state = "closed"; await this.journal.save(owner)
      } catch {
        await this.journal.audit({ ...event, phase: "failed" }).catch(() => {})
        // WHY：取消人工等待可能先终止 CLI；官方枚举确认目标已消失后，owner 不应永久阻塞后续运行。
        if ((await this.activeSessionIds(owner)).has(owner.sessionId)) throw new BrowserError("cleanup_required")
        owner.state = "closed"; await this.journal.save(owner)
      }
    } finally { await release() }
  }
  private async activeSessionIds(owner: Pick<Ownership, "taskId" | "runId" | "requirementVersion" | "purpose"> & { sessionId?: string | null }) {
    const args = ["--json", "session", "list"]
    const event = { at: new Date().toISOString(), taskId: owner.taskId, runId: owner.runId, requirementVersion: owner.requirementVersion,
        purpose: owner.purpose, sessionId: owner.sessionId ?? null, command: "session_list", argsHash: createHash("sha256").update(JSON.stringify(args)).digest("hex") }
    await this.journal.audit({ ...event, phase: "intended" })
    try {
      const result = await this.execute(args)
      if (result.exitCode) throw new BrowserError("cleanup_required")
      const ids = new Set(sessionListSchema.parse(JSON.parse(result.stdout)).map((session) => session.session_id))
      await this.journal.audit({ ...event, phase: "completed" })
      return ids
    } catch {
      await this.journal.audit({ ...event, phase: "failed" }).catch(() => {})
      throw new BrowserError("cleanup_required")
    }
  }
  private async ownedRun<T>(grant: BrowserGrant, work: (session: BrowserSession, signal: AbortSignal) => Promise<T>, signal: AbortSignal,
    onHelp?: BrowserHelpObserver) {
    const leaseAbort = new AbortController()
    const release = await this.journal.acquire(() => leaseAbort.abort())
    const lifetime = new AbortController()
    const combined = AbortSignal.any([signal, leaseAbort.signal, lifetime.signal])
    let owner: Ownership | null = null, session: BrowserSession | undefined, count = 0
    const invoke = async (command: string, args: string[], cleanup = false, commandSignal?: AbortSignal) => {
      const effectiveSignal = cleanup ? undefined : commandSignal ? AbortSignal.any([combined, commandSignal]) : combined
      if (!cleanup && effectiveSignal!.aborted) throw new BrowserError("cancelled")
      if (!cleanup && command !== "request_help" && command !== "session_start" && ++count > grant.maxCommands) {
        throw new BrowserError("budget_exceeded")
      }
      const actual = ["--json", ...args]
      const event = { at: new Date().toISOString(), taskId: grant.taskId, runId: grant.runId, requirementVersion: grant.requirementVersion,
        purpose: grant.purpose, sessionId: owner?.sessionId ?? null, command, argsHash: createHash("sha256").update(JSON.stringify(actual)).digest("hex") }
      let auditFailed = false
      try { await this.journal.audit({ ...event, phase: "intended" }) } catch (error) { if (!cleanup) throw error; auditFailed = true }
      try {
        const result = await this.execute(actual, effectiveSignal)
        // WHY：开始成功却调用被取消/退出异常时，仍先记住已返回的所属 session，再进入 finally 回收。
        if (command === "session_start") {
          const parsed = startSchema.safeParse(JSON.parse(result.stdout))
          if (parsed.success && owner) { owner.sessionId = parsed.data.session_id; owner.state = "active"; await this.journal.save(owner) }
        }
        if (result.exitCode !== 0) throw new BrowserError(effectiveSignal?.aborted ? "cancelled" : "command_failed")
        const value: unknown = JSON.parse(result.stdout)
        await this.journal.audit({ ...event, phase: "completed" })
        if (auditFailed) throw new BrowserError("command_failed")
        return value
      } catch (error) {
        await this.journal.audit({ ...event, phase: "failed" }).catch(() => {})
        // WHY：进程创建失败能证明 session_start 从未运行；只有这个确定场景可关闭空 owner，响应丢失仍保持待清理。
        if (command === "session_start" && error instanceof CommandLaunchError && owner) {
          owner.state = "closed"; await this.journal.save(owner)
        }
        throw error instanceof BrowserError ? error : new BrowserError("invalid_response")
      }
    }
    try {
      let previous: Ownership | null
      try { previous = await this.journal.owner() }
      catch (error) {
        if (!(error instanceof BrowserError) || error.code !== "cleanup_required") throw error
        // WHY：断电可能撕裂 owner 文件；未知 session 不能猜测回收，只有官方枚举为空才能安全解除占用。
        if ((await this.activeSessionIds(grant)).size) throw error
        await this.journal.discardCorruptOwner()
        previous = null
      }
      if (previous && previous.state !== "closed") throw new BrowserError("cleanup_required")
      if (combined.aborted) throw new BrowserError("cancelled")
      owner = { taskId: grant.taskId, runId: grant.runId, requirementVersion: grant.requirementVersion, purpose: grant.purpose, sessionId: null, state: "opening" }
      await this.journal.save(owner)
      // WHY：自动阶段不应反复抢占用户前台；BrowserSkill 在真正 request-help 时会再聚焦同一 Agent Window。
      const started = startSchema.parse(await invoke("session_start", ["session", "start", "--no-focus",
        ...(grant.browserInstanceId ? ["--browser", grant.browserInstanceId] : [])]))
      session = new BrowserSession(grant, started.session_id, invoke, onHelp)
      if (combined.aborted) throw new BrowserError("cancelled")
      const result = await interruptible(() => work(session!, combined), combined)
      if (combined.aborted) throw new BrowserError("cancelled")
      return result
    } finally {
      // WHY：回调取消或提前返回时先禁止新命令，并等待正在退出的子进程，避免 stop 与动作并发。
      lifetime.abort()
      const actionTabCleanupFailed = await session?.close() ?? false
      try {
        if (owner?.sessionId) {
          const stopped = stopSchema.parse(await invoke("session_stop", ["session", "stop", owner.sessionId], true))
          if (!stopped.stopped.includes(owner.sessionId) || stopped.failed.length || stopped.return_failures.length) throw new BrowserError("cleanup_required")
          owner.state = "closed"; await this.journal.save(owner)
          if (actionTabCleanupFailed) throw new BrowserError("cleanup_required")
        } else if (owner && owner.state !== "closed") { owner.state = "cleanup_required"; await this.journal.save(owner) }
      } catch { if (owner) { owner.state = "cleanup_required"; await this.journal.save(owner) }; throw new BrowserError("cleanup_required") }
      finally { await release() }
    }
  }
}
