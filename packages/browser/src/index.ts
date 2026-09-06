import { createHash } from "node:crypto"
import { z } from "zod"
import { BrowserError, grantSchema, sessionIdSchema, type BrowserGrant, type CommandExecutor, type Ownership } from "./contracts.js"
import { BrowserJournal } from "./journal.js"
import { BrowserSession } from "./session.js"
export { BrowserError, grantSchema, commandSchema, type BrowserGrant, type BrowserAudit, type CommandExecutor } from "./contracts.js"
export { bskExecutor } from "./transport.js"
export { BrowserSession } from "./session.js"

const startSchema = z.object({ session_id: sessionIdSchema })
const stopSchema = z.object({ stopped: z.array(sessionIdSchema), failed: z.array(z.unknown()), return_failures: z.array(z.unknown()) })

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
  async run<T>(rawGrant: unknown, work: (session: BrowserSession) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const grant = grantSchema.parse(rawGrant)
    if (this.closed) throw new BrowserError("session_closed")
    if (this.active) throw new BrowserError("busy")
    const controller = new AbortController()
    const combined = AbortSignal.any([controller.signal, AbortSignal.timeout(grant.timeoutMs), ...(signal ? [signal] : [])])
    const done = this.ownedRun(grant, work, combined)
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
      if (!owner.sessionId) throw new BrowserError("cleanup_required")
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
      } catch { await this.journal.audit({ ...event, phase: "failed" }).catch(() => {}); throw new BrowserError("cleanup_required") }
    } finally { await release() }
  }
  private async ownedRun<T>(grant: BrowserGrant, work: (session: BrowserSession) => Promise<T>, signal: AbortSignal) {
    const leaseAbort = new AbortController()
    const release = await this.journal.acquire(() => leaseAbort.abort())
    const lifetime = new AbortController()
    const combined = AbortSignal.any([signal, leaseAbort.signal, lifetime.signal])
    let owner: Ownership | null = null, session: BrowserSession | undefined, count = 0
    const invoke = async (command: string, args: string[], cleanup = false) => {
      if (!cleanup && combined.aborted) throw new BrowserError("cancelled")
      if (!cleanup && ++count > grant.maxCommands) throw new BrowserError("budget_exceeded")
      const actual = ["--json", ...args]
      const event = { at: new Date().toISOString(), taskId: grant.taskId, runId: grant.runId, requirementVersion: grant.requirementVersion,
        purpose: grant.purpose, sessionId: owner?.sessionId ?? null, command, argsHash: createHash("sha256").update(JSON.stringify(actual)).digest("hex") }
      let auditFailed = false
      try { await this.journal.audit({ ...event, phase: "intended" }) } catch (error) { if (!cleanup) throw error; auditFailed = true }
      try {
        const result = await this.execute(actual, cleanup ? undefined : combined)
        // WHY：开始成功却调用被取消/退出异常时，仍先记住已返回的所属 session，再进入 finally 回收。
        if (command === "session_start") {
          const parsed = startSchema.safeParse(JSON.parse(result.stdout))
          if (parsed.success && owner) { owner.sessionId = parsed.data.session_id; owner.state = "active"; await this.journal.save(owner) }
        }
        if (result.exitCode !== 0) throw new BrowserError(combined.aborted ? "cancelled" : "command_failed")
        const value: unknown = JSON.parse(result.stdout)
        await this.journal.audit({ ...event, phase: "completed" })
        if (auditFailed) throw new BrowserError("command_failed")
        return value
      } catch (error) {
        await this.journal.audit({ ...event, phase: "failed" }).catch(() => {})
        throw error instanceof BrowserError ? error : new BrowserError("invalid_response")
      }
    }
    try {
      const previous = await this.journal.owner()
      if (previous && previous.state !== "closed") throw new BrowserError("cleanup_required")
      if (combined.aborted) throw new BrowserError("cancelled")
      owner = { taskId: grant.taskId, runId: grant.runId, requirementVersion: grant.requirementVersion, purpose: grant.purpose, sessionId: null, state: "opening" }
      await this.journal.save(owner)
      const started = startSchema.parse(await invoke("session_start", ["session", "start"]))
      session = new BrowserSession(grant, started.session_id, invoke)
      if (combined.aborted) throw new BrowserError("cancelled")
      const result = await interruptible(() => work(session!), combined)
      if (combined.aborted) throw new BrowserError("cancelled")
      return result
    } finally {
      // WHY：回调取消或提前返回时先禁止新命令，并等待正在退出的子进程，避免 stop 与动作并发。
      lifetime.abort()
      await session?.close()
      try {
        if (owner?.sessionId) {
          const stopped = stopSchema.parse(await invoke("session_stop", ["session", "stop", owner.sessionId], true))
          if (!stopped.stopped.includes(owner.sessionId) || stopped.failed.length || stopped.return_failures.length) throw new BrowserError("cleanup_required")
          owner.state = "closed"; await this.journal.save(owner)
        } else if (owner) { owner.state = "cleanup_required"; await this.journal.save(owner) }
      } catch { if (owner) { owner.state = "cleanup_required"; await this.journal.save(owner) }; throw new BrowserError("cleanup_required") }
      finally { await release() }
    }
  }
}
