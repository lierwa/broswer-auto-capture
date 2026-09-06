import { planStateSchema, planCommandSchema, type PlanState } from "@browser-capture/contracts/plan"

export class PlanConnection {
  private view: { state: PlanState | null; error: string; pending: unknown | null; busy: boolean } = { state: null, error: "", pending: null, busy: false }
  private listeners = new Set<() => void>()
  private endpoint: string
  constructor(readonly taskId: string, private fetcher: typeof fetch = (...args) => fetch(...args)) { this.endpoint = `/api/plan?taskId=${encodeURIComponent(taskId)}` }
  snapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(value: Partial<typeof this.view>) { this.view = { ...this.view, ...value }; for (const listener of this.listeners) listener() }
  accept(raw: unknown) {
    const state = planStateSchema.parse(raw), previous = this.view.state
    if (state.taskId !== this.taskId) throw new Error("计划任务不匹配")
    // WHY：版本失效依赖访谈序列，生成/排队依赖产物序列；任一倒退都不能覆盖新事实。
    if (previous && (state.taskSequence < previous.taskSequence || state.sequence < previous.sequence || (state.source?.version ?? 0) < (previous.source?.version ?? 0))) return
    this.update({ state })
  }
  async reload(signal?: AbortSignal) {
    try {
      const response = await this.fetcher(this.endpoint, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const value: unknown = await response.json()
      if (!signal?.aborted) { this.accept(value); if (!this.view.pending) this.update({ error: "" }) }
    } catch { if (!signal?.aborted) this.update({ error: "计划状态读取失败，请重新连接；已有计划和授权保留。" }) }
  }
  async dispatch(raw: unknown) {
    if (this.view.busy) return false
    const command = planCommandSchema.parse(raw)
    this.update({ busy: true, pending: command, error: "" })
    try {
      const response = await this.fetcher(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) })
      const value = await response.json() as { error?: string }
      if (!response.ok) throw new Error(value.error ?? "操作未完成，请重新连接。")
      this.accept(value); this.update({ pending: null, error: "" }); return true
    } catch (error) { this.update({ error: error instanceof Error ? error.message : "操作未完成，请重试原请求。" }); await this.reload(); return false }
    finally { this.update({ busy: false }) }
  }
  retry = () => this.view.pending ? this.dispatch(this.view.pending) : Promise.resolve(false)
  dismiss = () => this.update({ pending: null, error: "" })
}
