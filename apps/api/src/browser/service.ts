import path from "node:path"
import { desc, eq, sql } from "drizzle-orm"
import { BrowserHost, BrowserError, commandSchema, grantSchema, type BrowserCommand, type BrowserGrant, type BrowserHelpObserver, type BrowserHelpState, type BrowserSession, type CommandExecutor } from "@browser-capture/browser"
import { browserControlSchema, browserRecordSchema, browserStatusSchema, type BrowserRecord } from "@browser-capture/contracts/browser"
import { taskIdSchema } from "@browser-capture/contracts/task"
import { ProductStore } from "../database/store.js"
import { browserRuns } from "../database/schema.js"
import { conflict } from "../errors.js"
import { OriginAccessBlockedError, type OriginAccessGate } from "./origin-access-gate.js"

type ManagedBrowserSession = Pick<BrowserSession, "state" | "beginStep" | "activeElapsedMs" | "stepElapsedMs"> & {
  command(command: BrowserCommand, signal?: AbortSignal): Promise<string | null>
  commandWithTimeout(command: BrowserCommand, signal: AbortSignal, timeoutMs: number): Promise<string | null>
}

export class BrowserService {
  private host: BrowserHost
  private active: { taskId: string; runId: string; controller: AbortController; done: Promise<void> } | null = null
  private authorize: (grant: BrowserGrant) => void = () => { throw new BrowserError("permission_denied") }
  setAuthorizationValidator(validate: (grant: BrowserGrant) => void) { this.authorize = validate }
  owner() { return this.active ? { taskId: this.active.taskId, runId: this.active.runId } : null }
  constructor(private store: ProductStore, directory: string, execute: CommandExecutor,
    private readonly accessGate?: OriginAccessGate) {
    this.host = new BrowserHost(path.join(directory, "browser"), execute)
    // WHY：进程重启不能把未提交的浏览器结果标成成功；所属 session 由独立命令日志负责核验和回收。
    for (const row of store.db.select().from(browserRuns).all()) {
      const record = browserRecordSchema.parse(row.body)
      if (["running", "waiting_human"].includes(record.status)) this.save({ ...record, status: "interrupted", reason: "service_interrupted" })
    }
  }
  isActive(taskId: string) { return this.active?.taskId === taskId }
  private save(record: BrowserRecord) {
    const body = browserRecordSchema.parse({ ...record, updatedAt: new Date().toISOString() })
    this.store.db.insert(browserRuns).values({ runId: body.runId, taskId: body.taskId, createdAt: body.createdAt, body })
      .onConflictDoUpdate({ target: browserRuns.runId, set: { body } }).run()
    return body
  }
  async snapshot(rawId: string) {
    const taskId = taskIdSchema.parse(rawId); this.store.task(taskId)
    const row = this.store.db.select().from(browserRuns).where(eq(browserRuns.taskId, taskId)).orderBy(desc(sql`rowid`)).get()
    const owner = await this.host.journal.owner()
    return browserStatusSchema.parse({ taskId, record: row?.body ?? null, busy: Boolean(this.active),
      cleanupRequired: Boolean(owner && owner.state !== "closed" && !this.active),
      cleanupRunId: owner?.taskId === taskId && owner.state !== "closed" && !this.active ? owner.runId : null })
  }
  async control(taskId: string, raw: unknown) {
    const command = browserControlSchema.parse(raw), state = await this.snapshot(taskId)
    if (command.type === "cancel") {
      if (state.record?.runId !== command.runId) conflict("浏览器运行已更新，请刷新后重试。")
      if (this.active?.taskId !== taskId || this.active.runId !== command.runId) conflict("这次浏览器运行已结束。")
      this.active.controller.abort()
    } else {
      if (state.cleanupRunId !== command.runId) conflict("请在所属任务中读取最新清理状态。")
      await this.host.cleanupOwned(command.runId)
      const previous = this.store.db.select().from(browserRuns).where(eq(browserRuns.runId, command.runId)).get()
      if (previous?.body.status === "cleanup_required") this.save({ ...previous.body, status: "interrupted", reason: "session_cleaned" })
    }
    return this.snapshot(taskId)
  }
  // 只供服务内的来源/探索/执行编排调用；HTTP 不接收任意页面、命令或授权对象。
  async run<T>(input: unknown, work: (session: ManagedBrowserSession,
    signal: AbortSignal) => Promise<T>, signal?: AbortSignal, onHelp?: BrowserHelpObserver) {
    const grant = grantSchema.parse(input); taskIdSchema.parse(grant.taskId)
    const validate = () => {
      const task = this.store.task(grant.taskId), state = this.store.snapshot(grant.taskId)
      if (task.archived || state.active || state.confirmedVersion !== grant.requirementVersion) throw new BrowserError("permission_denied")
      this.authorize(grant)
    }
    validate()
    if (this.active) throw new BrowserError("busy")
    if (this.store.db.select().from(browserRuns).where(eq(browserRuns.runId, grant.runId)).get()) conflict("该浏览器运行已有记录，请使用新的运行。")
    let record: BrowserRecord = { runId: grant.runId, taskId: grant.taskId, ownerId: grant.ownerId ?? grant.runId, requirementVersion: grant.requirementVersion,
      purpose: grant.purpose, status: "running", waitpoint: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reason: null }
    record = this.save(record)
    let finish!: () => void
    const done = new Promise<void>((resolve) => { finish = resolve })
    const active = { taskId: grant.taskId, runId: grant.runId, controller: new AbortController(), done }; this.active = active
    try {
      const result = await this.host.run(grant, (session, lifetime) => work({
        command: (command, commandSignal) => {
          validate()
          const parent = AbortSignal.any([lifetime, ...(commandSignal ? [commandSignal] : [])])
          return this.executeCommand(session, grant, command, parent, () => ({ signal: parent }))
        },
        commandWithTimeout: (command, commandSignal, timeoutMs) => {
          validate()
          const parent = AbortSignal.any([lifetime, commandSignal])
          return this.executeCommand(session, grant, command, parent, () => {
            const timeout = AbortSignal.timeout(timeoutMs)
            return { signal: AbortSignal.any([parent, timeout]), timeout }
          })
        },
        state: () => session.state(),
        beginStep: (...args) => { validate(); session.beginStep(...args) }, activeElapsedMs: () => session.activeElapsedMs(),
        stepElapsedMs: () => session.stepElapsedMs() }, lifetime),
        AbortSignal.any([active.controller.signal, ...(signal ? [signal] : [])]),
        async (help) => {
          if (help.status === "completed" && help.origin && humanChallenge(help.reason)) {
            this.accessGate?.deferAfterHumanChallenge(help.origin, grant.runId, help.reason)
          }
          record = this.save({ ...record, status: browserStatusForHelp(help), waitpoint: publicWaitpoint(grant, help), reason: helpReason(help) })
          await onHelp?.(help)
        })
      validate(); record = this.save({ ...record, status: "succeeded" }); return result
    } catch (error) {
      const reason = error instanceof BrowserError ? error.code : "command_failed"
      const status = reason === "manual_required" || reason === "cancelled" || reason === "cleanup_required" ? reason : "failed"
      record = this.save({ ...record, status, reason }); throw error
    } finally { this.active = null; finish() }
  }
  async close() { const active = this.active; active?.controller.abort(); await this.host.close(); await active?.done }

  private async executeCommand(session: BrowserSession, grant: BrowserGrant, raw: BrowserCommand,
    accessSignal: AbortSignal, commandSignal: () => { signal: AbortSignal; timeout?: AbortSignal }) {
    const parsed = commandSchema.parse(raw), origin = accessOrigin(parsed, session.state())
    if (origin && accessAction(parsed.type)) {
      try {
        if (this.accessGate) await session.waitOutsideBudget(() =>
          this.accessGate!.acquire(origin, grant.runId, parsed.type, accessSignal))
      } catch (error) {
        if (error instanceof OriginAccessBlockedError) {
          throw new BrowserError("rate_limited", { origin, observedOrigin: origin, retryAt: error.retryAt })
        }
        throw error
      }
    }
    const execution = commandSignal()
    try { return await session.command(parsed, execution.signal) }
    catch (error) {
      if (execution.timeout?.aborted && !accessSignal.aborted) {
        throw new BrowserError("readiness_timeout", origin ? { origin } : {})
      }
      if (origin && error instanceof BrowserError && externalAccessFailure(error.code)) {
        const blockedUntil = this.accessGate?.block(origin, grant.runId, error.code, error.evidence.retryAt)
        if (blockedUntil !== undefined) throw new BrowserError(error.code, { ...error.evidence, retryAt: blockedUntil })
      }
      throw error
    }
  }
}

function accessAction(action: string) {
  return ["navigate", "follow", "tab_open", "click", "press"].includes(action)
}

function accessOrigin(command: BrowserCommand, state: ReturnType<BrowserSession["state"]>) {
  const value = command.type === "navigate" || command.type === "follow" || command.type === "tab_open"
    ? command.url : state?.url
  if (!value) return null
  try { return new URL(value).origin } catch { return null }
}

function externalAccessFailure(code: string) {
  // WHY：origin_denied 是本地 grant 边界，不能伪造成站点拒绝并污染持久冷却。
  return ["authentication_required", "verification_required", "rate_limited", "access_denied"].includes(code)
}

function humanChallenge(reason: BrowserHelpState["reason"]) { return reason === "captcha" || reason === "access" }

function publicWaitpoint(grant: BrowserGrant, help: BrowserHelpState): BrowserRecord["waitpoint"] {
  return { ...help, owner: grant.purpose === "exploration" ? "authoring_job" : "execution_step",
    ownerId: grant.ownerId ?? grant.runId, stepId: null }
}

function browserStatusForHelp(help: BrowserHelpState): BrowserRecord["status"] {
  if (help.status === "waiting") return "waiting_human"
  if (help.status === "completed") return "running"
  if (help.status === "cancelled") return "cancelled"
  return "manual_required"
}

function helpReason(help: BrowserHelpState) {
  if (help.status === "waiting") return "waiting_human"
  if (help.status === "completed") return "human_help_completed"
  return `human_help_${help.status}`
}
