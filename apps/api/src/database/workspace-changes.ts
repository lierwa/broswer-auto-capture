import { EventEmitter, once } from "node:events"
import type Database from "better-sqlite3"

/** WHY：复用已有数据库版本；TEMP trigger 仅属于唯一持锁连接，不改永久 schema，也不在空闲时查库。 */
export class WorkspaceChanges {
  private readonly events = new EventEmitter().setMaxListeners(0)
  private readonly pending = new Map<string, number | null>()
  private readonly lifetime = new AbortController()
  constructor(private readonly connection: Database.Database) {
    connection.function("bat_workspace_changed", (taskId: string, before: number | null) => {
      if (!this.lifetime.signal.aborted && !this.pending.has(taskId)) {
        if (!this.pending.size) queueMicrotask(() => this.flush())
        this.pending.set(taskId, before)
      }
      return null
    })
    for (const action of ["INSERT", "UPDATE", "DELETE"] as const) {
      const row = action === "DELETE" ? "OLD" : "NEW", before = action === "INSERT" ? "NULL" : "OLD.sequence"
      connection.exec(`CREATE TEMP TRIGGER bat_workspace_${action.toLowerCase()} AFTER ${action}
        ON main.taskWorkspaceSequences BEGIN SELECT bat_workspace_changed(${row}.taskId, ${before}); END`)
    }
  }
  private sequence(taskId: string) {
    return (this.connection.prepare("SELECT sequence FROM taskWorkspaceSequences WHERE taskId = ?")
      .get(taskId) as { sequence: number } | undefined)?.sequence ?? null
  }
  private flush() {
    const pending = [...this.pending]; this.pending.clear()
    if (this.lifetime.signal.aborted) return
    // WHY：先提交后核权威版本；较早成功提交后的回滚不能吞通知，纯回滚也不能发布事实。
    for (const [taskId, before] of pending) {
      const current = this.sequence(taskId)
      // WHY：任务 ID 是数据，不能占用 EventEmitter 的 error 等保留通道。
      if (current !== before) this.events.emit(`task:${taskId}`, current)
    }
  }
  async *observe(taskId: string, after: number, signal: AbortSignal) {
    const cleanup = new AbortController()
    const cancelled = AbortSignal.any([signal, this.lifetime.signal, cleanup.signal])
    try {
      while (!cancelled.aborted) {
        // WHY：只挂一次失效监听，不排队保存版本；慢消费者恢复时直接读权威最新版本。
        // Abort 可发生在 yield 期间，即时接住 native once 的取消拒绝。
        const changed = once(this.events, `task:${taskId}`, { signal: cancelled }).catch(() => undefined)
        const current = this.sequence(taskId)
        if (current === null) return
        if (current > after) { after = current; yield current }
        await changed
      }
    } finally { cleanup.abort() }
  }
  close() { this.lifetime.abort(); this.pending.clear() }
}
