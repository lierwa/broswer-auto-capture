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
      policyVersion: task.interviewPolicyVersion,
      active: Boolean(task.activeTurnId), activeTurnId: task.activeTurnId, cancellationRequested: turns.some((turn) => turn.id === task.activeTurnId && turn.status === "cancelling"),
      messages: this.db.select().from(schema.messages).where(eq(schema.messages.taskId, id)).orderBy(asc(schema.messages.ordinal)).all().map((row) => row.body),
      drafts: read(this.db.select().from(schema.drafts).where(eq(schema.drafts.taskId, id)).orderBy(asc(schema.drafts.version)).all()),
      audits: read(this.db.select().from(schema.audits).where(eq(schema.audits.taskId, id)).orderBy(asc(schema.audits.ordinal)).all()), turns,
      decisions: read(this.db.select().from(schema.decisions).where(eq(schema.decisions.taskId, id)).orderBy(asc(schema.decisions.createdAt)).all()),
      unresolved: read(this.db.select().from(schema.questions).where(eq(schema.questions.taskId, id)).orderBy(asc(schema.questions.revision)).all()),
      sourceResolutions: this.db.select().from(schema.sourceResolutions).where(eq(schema.sourceResolutions.taskId, id))
        .orderBy(asc(schema.sourceResolutions.revision)).all().map((row) => row.body),
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
    const taskId = this.operationOwner(scope, resultId)
    if (!taskId) throw new DomainError("operation_owner_unknown", "无法确认请求记录所属任务，操作已停止。", 409)
    this.db.insert(schema.operations).values({ scope, requestId, digest: digest(input), resultId, taskId }).run()
  }
  private operationOwner(scope: string, resultId: string): string | null {
    if (scope === "tasks") return this.connection.prepare("SELECT id FROM tasks WHERE id = ?").get(resultId)
      ? resultId : null
    if (this.connection.prepare("SELECT id FROM tasks WHERE id = ?").get(scope)) return scope
    // WHY：旧全局幂等键没有 owner；只接受存活事实的唯一任务归属，不能从 UUID 或命令名称猜测。
    const rows = this.connection.prepare(`SELECT DISTINCT taskId FROM (
      SELECT taskId FROM taskAuthoringJobs WHERE id = ? UNION ALL
      SELECT taskId FROM taskExecutions WHERE id = ? UNION ALL
      SELECT taskId FROM taskDrafts WHERE id = ? UNION ALL
      SELECT taskId FROM taskReleases WHERE releaseId = ? UNION ALL
      SELECT taskId FROM taskArtifacts WHERE artifactId = ? UNION ALL
      SELECT taskId FROM plans WHERE id = ? UNION ALL
      SELECT taskId FROM chains WHERE id = ? UNION ALL
      SELECT taskId FROM executions WHERE id = ? UNION ALL
      SELECT taskId FROM taskContracts WHERE recordId = ? OR entityId = ? UNION ALL
      SELECT taskId FROM taskExecutions WHERE EXISTS (
        SELECT 1 FROM json_each(taskExecutions.body, '$.reviews')
        WHERE json_extract(value, '$.id') = ?)
    )`).all(...Array(11).fill(resultId)) as Array<{ taskId: string }>
    return rows.length === 1 ? rows[0]!.taskId : null
  }
  taskAuthoringPrivateOwners(taskId: string) {
    this.task(taskId)
    return this.connection.prepare(`SELECT id, json_extract(body,'$.browserRunId') AS browserRunId
      FROM taskAuthoringJobs WHERE taskId = ?`).all(taskId)
      .map((row) => row as { id: string; browserRunId: string | null })
  }
  assertTaskDeletionReady(taskId: string, expectedUpdatedAt: string) {
    const task = this.task(taskId)
    if (task.updatedAt !== expectedUpdatedAt) conflict("任务已变化，请刷新列表后重新确认删除。")
    if (task.activeTurnId) conflict("访谈仍在处理，请先等待或停止。")
    const pending = (table: string, condition: string) => this.connection
      .prepare(`SELECT 1 FROM ${table} WHERE taskId = ? AND (${condition}) LIMIT 1`).get(taskId)
    if (pending("taskAuthoringJobs", "status IN ('queued','running','waiting_for_human')"))
      conflict("准备任务或人工等待尚未结束，请先完成或停止。")
    if (pending("taskExecutions", `status IN ('queued','running','paused','waiting_for_human','cleanup_required')
      OR json_extract(body,'$.cleanup.status') IN ('pending','unconfirmed')`))
      conflict("运行或资源清理尚未结束，请先完成或清理。")
    if (pending("taskExecutions", `json_extract(body,'$.browserHandoff.status') IN ('active','pending')
      OR (json_extract(body,'$.browserHandoff.status') = 'unavailable'
        AND json_extract(body,'$.browserHandoff.leaseId') IS NOT NULL)`)) {
      conflict("原浏览器窗口仍由本任务租约持有，请先结束并核验窗口。")
    }
    if (pending("browserRuns", "json_extract(body,'$.status') IN ('running','waiting_human','cleanup_required')"))
      conflict("浏览器运行或清理尚未结束，请先完成或清理。")
  }
  activeBrowserWindowLease(exceptExecutionId?: string): { taskId: string; executionId: string } | null {
    // WHY：交付给用户的窗口不再属于 runner 清理总账，但共享 Profile 在精确结束前不能被另一运行接管。
    const row = this.connection.prepare(`SELECT taskId, id AS executionId FROM taskExecutions
      WHERE id <> ? AND (json_extract(body,'$.browserHandoff.status') IN ('active','pending')
      OR (json_extract(body,'$.browserHandoff.status') = 'unavailable'
        AND json_extract(body,'$.browserHandoff.leaseId') IS NOT NULL)) LIMIT 1`)
      .get(exceptExecutionId ?? "") as { taskId: string; executionId: string } | undefined
    return row ?? null
  }
  taskBrowserWindowLease(taskId: string): string | null {
    const row = this.connection.prepare(`SELECT id FROM taskExecutions WHERE taskId = ?
      AND status NOT IN ('queued','running')
      AND (json_extract(body,'$.browserHandoff.status') = 'active'
        OR (json_extract(body,'$.browserHandoff.status') IN ('pending','unavailable')
          AND json_extract(body,'$.browserHandoff.leaseId') IS NOT NULL))
      ORDER BY updatedAt DESC LIMIT 1`).get(taskId) as { id: string } | undefined
    return row?.id ?? null
  }
  deleteTask(taskId: string, expectedUpdatedAt: string) {
    this.assertAvailable()
    return this.connection.transaction(() => {
      this.assertTaskDeletionReady(taskId, expectedUpdatedAt)
      // WHY：旧 operation 无 owner 列；仅在仍可由任务 scope 或唯一存活结果事实证明归属时定向删除。
      const operations = this.connection.prepare("SELECT scope, requestId, resultId, taskId FROM operations")
        .all() as Array<{ scope: string; requestId: string; resultId: string; taskId: string | null }>
      const removeOperation = this.connection.prepare("DELETE FROM operations WHERE scope = ? AND requestId = ?")
      for (const operation of operations) {
        if (operation.taskId === taskId || operation.taskId === null
          && this.operationOwner(operation.scope, operation.resultId) === taskId) {
          removeOperation.run(operation.scope, operation.requestId)
        }
      }
      const children = ["taskExecutionCandidates", "taskExecutionCleanupAudits", "chains", "executions", "plans",
        "taskContracts", "taskAuthoringJobs", "taskExecutions", "taskArtifacts", "taskReleases", "taskDrafts",
        "browserRuns", "messages", "drafts", "turns", "questions", "decisions", "sourceResolutions", "audits",
        "taskWorkspaceSequences"] as const
      for (const table of children) this.connection.prepare(`DELETE FROM ${table} WHERE taskId = ?`).run(taskId)
      // WHY：早期 researchRuns 在部分 v18 本地库已移除，仍存在于另一条正式迁移路径；按真实表事实清理。
      if (this.connection.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='researchRuns'").get()) {
        this.connection.prepare("DELETE FROM researchRuns WHERE taskId = ?").run(taskId)
      }
      this.connection.prepare("DELETE FROM tasks WHERE id = ?").run(taskId)
      return taskId
    })()
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
    this.db.insert(schema.tasks).values({ ...taskMetaSchema.parse(meta), revision: value.revision, sequence: value.sequence,
      confirmedVersion: value.confirmedVersion, activeTurnId: value.activeTurnId, interviewPolicyVersion: value.policyVersion }).run()
    this.saveRows(meta.id, value)
  }
  mutate<T>(id: string, change: (state: InterviewState) => T): T {
    this.assertAvailable()
    return this.db.transaction(() => {
      const state = this.snapshot(id)
      const result = change(state)
      state.sequence += 1
      this.saveRows(id, validateState(state))
      this.db.update(schema.tasks).set({ revision: state.revision, sequence: state.sequence, confirmedVersion: state.confirmedVersion,
        activeTurnId: state.activeTurnId, interviewPolicyVersion: state.policyVersion,
        updatedAt: new Date().toISOString() }).where(eq(schema.tasks.id, id)).run()
      return result
    })
  }
  private saveRows(taskId: string, state: InterviewState) {
    // TRADE-OFF：F1 按任务在同一同步事务重投影小规模访谈表；每轮独立行，避免跨文件半提交。
    // 不在事务中等待模型；规模优化可改增量 upsert，不改变这些事实表的归属。
    for (const table of [schema.messages, schema.drafts, schema.turns, schema.questions, schema.decisions,
      schema.sourceResolutions, schema.audits]) this.db.delete(table).where(eq(table.taskId, taskId)).run()
    if (state.messages.length) this.db.insert(schema.messages).values(state.messages.map((body, ordinal) => ({ taskId, id: body.id, ordinal, body }))).run()
    if (state.drafts.length) this.db.insert(schema.drafts).values(state.drafts.map((row) => ({ taskId, ...row }))).run()
    if (state.turns.length) this.db.insert(schema.turns).values(state.turns.map((row) => ({ taskId, ...row }))).run()
    if (state.unresolved.length) this.db.insert(schema.questions).values(state.unresolved.map((row) => ({ taskId, ...row }))).run()
    if (state.decisions.length) this.db.insert(schema.decisions).values(state.decisions.map((row) => ({ taskId, ...row }))).run()
    if (state.sourceResolutions.length) this.db.insert(schema.sourceResolutions).values(state.sourceResolutions
      .map((body) => ({ taskId, id: body.id, revision: body.revision, body }))).run()
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
