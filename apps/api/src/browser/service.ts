import path from "node:path"
import { desc, eq, sql } from "drizzle-orm"
import { BrowserHost, BrowserError, grantSchema, type BrowserGrant, type BrowserSession, type CommandExecutor } from "@browser-capture/browser"
import { browserControlSchema, browserRecordSchema, browserStatusSchema, type BrowserRecord } from "@browser-capture/contracts/browser"
import { taskIdSchema } from "@browser-capture/contracts/task"
import { ProductStore } from "../database/store.js"
import { browserRuns } from "../database/schema.js"
import { conflict } from "../errors.js"

export class BrowserService {
  private host: BrowserHost
  private active: { taskId: string; runId: string; controller: AbortController; done: Promise<void> } | null = null
  private authorize: (grant: BrowserGrant) => void = () => { throw new BrowserError("permission_denied") }
  setAuthorizationValidator(validate: (grant: BrowserGrant) => void) { this.authorize = validate }
  owner() { return this.active ? { taskId: this.active.taskId, runId: this.active.runId } : null }
  constructor(private store: ProductStore, directory: string, execute: CommandExecutor) {
    this.host = new BrowserHost(path.join(directory, "browser"), execute)
    // WHY：进程重启不能把未提交的浏览器结果标成成功；所属 session 由独立命令日志负责核验和回收。
    for (const row of store.db.select().from(browserRuns).all()) {
      const record = browserRecordSchema.parse(row.body)
      if (record.status === "running") this.save({ ...record, status: "interrupted", reason: "service_interrupted" })
    }
  }
  isActive(taskId: string) { return this.active?.taskId === taskId }
  private save(record: BrowserRecord) {
    const body = browserRecordSchema.parse({ ...record, updatedAt: new Date().toISOString() })
    this.store.db.insert(browserRuns).values({ runId: body.runId, taskId: body.taskId, createdAt: body.createdAt, body })
      .onConflictDoUpdate({ target: browserRuns.runId, set: { body } }).run()
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
  async run<T>(input: unknown, work: (session: Pick<BrowserSession, "command" | "beginStep">, signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
    const grant = grantSchema.parse(input); taskIdSchema.parse(grant.taskId)
    const validate = () => {
      const task = this.store.task(grant.taskId), state = this.store.snapshot(grant.taskId)
      if (task.archived || state.active || state.confirmedVersion !== grant.requirementVersion) throw new BrowserError("permission_denied")
      if (grant.purpose !== "plan_evidence") this.authorize(grant)
    }
    validate()
    if (this.active) throw new BrowserError("busy")
    if (this.store.db.select().from(browserRuns).where(eq(browserRuns.runId, grant.runId)).get()) conflict("该浏览器运行已有记录，请使用新的运行。")
    const record: BrowserRecord = { runId: grant.runId, taskId: grant.taskId, requirementVersion: grant.requirementVersion,
      purpose: grant.purpose, status: "running", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reason: null }
    this.save(record)
    let finish!: () => void
    const done = new Promise<void>((resolve) => { finish = resolve })
    const active = { taskId: grant.taskId, runId: grant.runId, controller: new AbortController(), done }; this.active = active
    try {
      const result = await this.host.run(grant, (session, lifetime) => work({ command: (command) => { validate(); return session.command(command) },
        beginStep: (...args) => { validate(); session.beginStep(...args) } }, lifetime),
        AbortSignal.any([active.controller.signal, ...(signal ? [signal] : [])]))
      validate(); this.save({ ...record, status: "succeeded" }); return result
    } catch (error) {
      const reason = error instanceof BrowserError ? error.code : "command_failed"
      const status = reason === "manual_required" || reason === "cancelled" || reason === "cleanup_required" ? reason : "failed"
      this.save({ ...record, status, reason }); throw error
    } finally { this.active = null; finish() }
  }
  async close() { const active = this.active; active?.controller.abort(); await this.host.close(); await active?.done }
}
