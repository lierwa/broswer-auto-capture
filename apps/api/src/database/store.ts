import { createHash, randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import Database from "better-sqlite3"
import { and, asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { lock } from "proper-lockfile"
import { currentDraft, emptyInterview, interviewStateSchema, type InterviewState } from "@browser-capture/contracts/interview"
import { taskMetaSchema, type TaskCommand, type TaskMeta, type TaskSummary } from "@browser-capture/contracts/task"
import { DomainError, conflict } from "../errors.js"
import { migrate } from "./migrate.js"
import { validateState } from "./invariants.js"
import * as schema from "./schema.js"
import { parseModelSelection, type ModelSelection } from "@agent-platform/ai-connect/client"

export type ProductDatabase = ReturnType<typeof drizzle<typeof schema>>
export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex") }
export class ProductStore {
  readonly db: ProductDatabase
  private closed = false
  private compromised = false
  private constructor(private connection: Database.Database, private release: () => Promise<void>) {
    migrate(connection)
    this.db = drizzle(connection, { schema })
  }
  static async open(directory: string) {
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, "workbench.sqlite")
    let store: ProductStore | undefined
    const release = await lock(file, { realpath: false, stale: 10_000, update: 2_000, retries: 0,
      onCompromised: () => { if (store) store.compromised = true },
    }).catch(() => { throw new DomainError("database_in_use", "本地数据正在被另一服务使用，请先关闭原服务；异常退出后等待约 10 秒再启动。", 503) })
    let connection: Database.Database | undefined
    try {
      connection = new Database(file)
      connection.pragma("journal_mode = WAL"); connection.pragma("foreign_keys = ON"); connection.pragma("busy_timeout = 5000")
      store = new ProductStore(connection, release)
      return store
    } catch (error) { connection?.close(); await release(); throw error }
  }
  private assertAvailable() {
    if (this.closed || this.compromised) throw new DomainError("storage_unavailable", "本地持久化服务不可用，请重启后恢复。", 503)
  }
  task(id: string) {
    this.assertAvailable()
    const row = this.db.select().from(schema.tasks).where(eq(schema.tasks.id, id)).get()
    if (!row) throw new DomainError("not_found", "任务不存在。", 404)
    return row
  }
  snapshot(id: string): InterviewState {
    const task = this.task(id)
    const read = <T extends { taskId: unknown }>(rows: T[]) => rows.map(({ taskId: _taskId, ...row }) => row)
    const turns = read(this.db.select().from(schema.turns).where(eq(schema.turns.taskId, id)).orderBy(asc(schema.turns.revision)).all())
    return interviewStateSchema.parse({ revision: task.revision, sequence: task.sequence, confirmedVersion: task.confirmedVersion,
      active: Boolean(task.activeTurnId), activeTurnId: task.activeTurnId, cancellationRequested: turns.some((turn) => turn.id === task.activeTurnId && turn.status === "cancelling"),
      messages: this.db.select().from(schema.messages).where(eq(schema.messages.taskId, id)).orderBy(asc(schema.messages.ordinal)).all().map((row) => row.body),
      drafts: read(this.db.select().from(schema.drafts).where(eq(schema.drafts.taskId, id)).orderBy(asc(schema.drafts.version)).all()),
      audits: read(this.db.select().from(schema.audits).where(eq(schema.audits.taskId, id)).orderBy(asc(schema.audits.ordinal)).all()), turns,
      decisions: read(this.db.select().from(schema.decisions).where(eq(schema.decisions.taskId, id)).orderBy(asc(schema.decisions.createdAt)).all()),
      unresolved: read(this.db.select().from(schema.questions).where(eq(schema.questions.taskId, id)).orderBy(asc(schema.questions.revision)).all()),
    })
  }
  list(): TaskSummary[] {
    this.assertAvailable()
    return this.db.select().from(schema.tasks).all().map((row) => {
      const task = taskMetaSchema.parse(row), state = this.snapshot(row.id)
      const status: TaskSummary["status"] = state.active ? "running" : state.confirmedVersion ? "confirmed"
        : ["failed", "cancelled"].includes(state.messages.at(-1)?.status ?? "") ? "failed" : currentDraft(state) ? "draft" : state.messages.length ? "answer" : "new"
      const title = state.drafts.at(-1)?.title ?? state.messages.find((message) => message.role === "user")?.text
      return { ...task, title: task.renamed ? task.title : title?.slice(0, 80) || task.title, status, revision: state.revision }
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  operation(scope: string, requestId: string, input: unknown) {
    const previous = this.db.select().from(schema.operations).where(and(eq(schema.operations.scope, scope), eq(schema.operations.requestId, requestId))).get()
    if (previous && previous.digest !== digest(input)) conflict("同一请求标识不能用于不同内容。")
    return previous?.resultId
  }
  recordOperation(scope: string, requestId: string, input: unknown, resultId: string) {
    this.db.insert(schema.operations).values({ scope, requestId, digest: digest(input), resultId }).run()
  }
  sharedModelSelection(subjectId: string): ModelSelection | undefined {
    this.assertAvailable()
    const row = this.db.select().from(schema.aiSettings).where(eq(schema.aiSettings.subjectId, subjectId)).get()
    return row ? parseModelSelection(row.selection) : undefined
  }
  saveSharedModelSelection(subjectId: string, input: unknown) {
    this.assertAvailable()
    const selection = parseModelSelection(input)
    this.db.insert(schema.aiSettings).values({ subjectId, selection }).onConflictDoUpdate({
      target: schema.aiSettings.subjectId, set: { selection },
    }).run()
    return selection
  }
  clearSharedModelSelection(subjectId: string, connectionId?: string) {
    this.assertAvailable()
    if (connectionId && this.sharedModelSelection(subjectId)?.connectionId !== connectionId) return
    this.db.delete(schema.aiSettings).where(eq(schema.aiSettings.subjectId, subjectId)).run()
  }
  taskAction(command: TaskCommand) {
    this.assertAvailable()
    return this.db.transaction(() => {
      if (command.type === "create") {
        const previous = this.operation("tasks", command.requestId, command)
        if (previous) return previous
        const id = randomUUID()
        this.insertTask({ id, title: "新需求", renamed: false, archived: false, updatedAt: new Date().toISOString() }, structuredClone(emptyInterview))
        this.recordOperation("tasks", command.requestId, command, id)
        return id
      }
      const task = this.task(command.id)
      if (command.type === "archive" && task.activeTurnId) conflict("请先停止或等待本轮完成，再归档任务。")
      this.db.update(schema.tasks).set({ ...(command.type === "rename" ? { title: command.title, renamed: true } : { archived: command.archived }), updatedAt: new Date().toISOString() }).where(eq(schema.tasks.id, task.id)).run()
      return task.id
    })
  }
  insertTask(meta: TaskMeta, state: InterviewState) {
    const value = validateState(state)
    this.db.insert(schema.tasks).values({ ...taskMetaSchema.parse(meta), revision: value.revision, sequence: value.sequence, confirmedVersion: value.confirmedVersion, activeTurnId: value.activeTurnId }).run()
    this.saveRows(meta.id, value)
  }
  mutate<T>(id: string, change: (state: InterviewState) => T): T {
    this.assertAvailable()
    return this.db.transaction(() => {
      const state = this.snapshot(id)
      const result = change(state)
      state.sequence += 1
      this.saveRows(id, validateState(state))
      this.db.update(schema.tasks).set({ revision: state.revision, sequence: state.sequence, confirmedVersion: state.confirmedVersion, activeTurnId: state.activeTurnId, updatedAt: new Date().toISOString() }).where(eq(schema.tasks.id, id)).run()
      return result
    })
  }
  private saveRows(taskId: string, state: InterviewState) {
    // TRADE-OFF：F1 按任务在同一同步事务重投影小规模访谈表；每轮独立行，避免跨文件半提交。
    // 不在事务中等待模型；规模优化可改增量 upsert，不改变这些事实表的归属。
    for (const table of [schema.messages, schema.drafts, schema.turns, schema.questions, schema.decisions, schema.audits]) this.db.delete(table).where(eq(table.taskId, taskId)).run()
    if (state.messages.length) this.db.insert(schema.messages).values(state.messages.map((body, ordinal) => ({ taskId, id: body.id, ordinal, body }))).run()
    if (state.drafts.length) this.db.insert(schema.drafts).values(state.drafts.map((row) => ({ taskId, ...row }))).run()
    if (state.turns.length) this.db.insert(schema.turns).values(state.turns.map((row) => ({ taskId, ...row }))).run()
    if (state.unresolved.length) this.db.insert(schema.questions).values(state.unresolved.map((row) => ({ taskId, ...row }))).run()
    if (state.decisions.length) this.db.insert(schema.decisions).values(state.decisions.map((row) => ({ taskId, ...row }))).run()
    if (state.audits.length) this.db.insert(schema.audits).values(state.audits.map((row, ordinal) => ({ taskId, ordinal, ...row }))).run()
  }
  recoverInterrupted() {
    for (const task of this.list().filter((task) => task.status === "running")) this.mutate(task.id, (state) => {
      const turn = state.turns.find((item) => item.id === state.activeTurnId)!
      turn.status = "interrupted"; turn.reason = "服务已重启，本轮未完成。"; turn.completedAt = new Date().toISOString()
      const message = state.messages.find((item) => item.id === turn.assistantMessageId)!
      message.status = "cancelled"; message.text += "\n服务已重启，本轮未完成。可以重试。"
      state.active = false; state.activeTurnId = null; state.cancellationRequested = false
    })
  }
  async close() {
    if (this.closed) return
    this.closed = true; this.connection.close(); await this.release().catch(() => {})
  }
}
