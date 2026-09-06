import { researchStateSchema, researchCommandSchema, type ResearchState } from "@browser-capture/contracts/research"

export class ResearchConnection {
  private view: { state: ResearchState | null; error: string; pending: unknown | null; busy: boolean } = { state: null, error: "", pending: null, busy: false }
  private listeners = new Set<() => void>()
  private endpoint: string
  constructor(readonly taskId: string, private fetcher: typeof fetch = (...args) => fetch(...args)) { this.endpoint = `/api/research?taskId=${encodeURIComponent(taskId)}` }
  snapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(value: Partial<typeof this.view>) { this.view = { ...this.view, ...value }; for (const listener of this.listeners) listener() }
  accept(raw: unknown) {
    const state = researchStateSchema.parse(raw)
    if (state.taskId !== this.taskId) throw new Error("调研任务不匹配")
    const previous = this.view.state
    if (previous && state.taskSequence < previous.taskSequence) return
    // WHY：同任务迟到的启动响应不能覆盖已经轮询到的证据或终态。
    if (previous && (state.records.length < previous.records.length || state.records.some((record) => record.sequence < (previous.records.find((item) => item.id === record.id)?.sequence ?? -1)))) return
    this.update({ state })
  }
  async reload(signal?: AbortSignal) {
    try {
      const response = await this.fetcher(this.endpoint, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const value: unknown = await response.json()
      if (!signal?.aborted) { this.accept(value); if (!this.view.pending) this.update({ error: "" }) }
    } catch { if (!signal?.aborted) this.update({ error: "来源状态读取失败，请重新连接；已有证据保留。" }) }
  }
  async dispatch(raw: unknown) {
    if (this.view.busy) return false
    const command = researchCommandSchema.parse(raw)
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
