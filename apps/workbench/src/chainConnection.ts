import { chainStateSchema, type ChainState } from "@browser-capture/contracts/chain"

export class ChainConnection {
  private view: { state: ChainState | null; error: string } = { state: null, error: "" }
  private listeners = new Set<() => void>()
  constructor(readonly taskId: string, private fetcher: typeof fetch = (...args) => fetch(...args)) {}
  snapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(value: typeof this.view) { this.view = value; for (const listener of this.listeners) listener() }
  accept(raw: unknown) {
    const state = chainStateSchema.parse(raw), old = this.view.state
    if (state.taskId !== this.taskId) throw new Error("链路任务不匹配")
    if (old && (state.taskSequence < old.taskSequence || old.records.some((record) => !state.records.some((next) => next.id === record.id && next.sequence >= record.sequence)))) return
    this.update({ state, error: "" })
  }
  async reload(signal?: AbortSignal) {
    try {
      const response = await this.fetcher(`/api/chains?taskId=${encodeURIComponent(this.taskId)}`, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const raw: unknown = await response.json()
      if (!signal?.aborted) this.accept(raw)
    } catch { if (!signal?.aborted) this.update({ ...this.view, error: "链路读取失败，已有版本保留，请重新连接。" }) }
  }
}
