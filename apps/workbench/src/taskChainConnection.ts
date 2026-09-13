import { taskChainCommandSchema, taskChainStateSchema, type TaskChainCommand, type TaskChainState } from "@browser-capture/contracts/api"
import { isStaleVersion } from "./taskChainProjection.js"

export class TaskChainConnection {
  private view: { state: TaskChainState | null; error: string; pending: TaskChainCommand | null; busy: boolean }
    = { state: null, error: "", pending: null, busy: false }
  private readonly listeners = new Set<() => void>()
  private readonly ensureWork = new Map<number, Promise<boolean>>()
  private readonly endpoint: string
  constructor(readonly taskId: string, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.endpoint = `/api/task-chain?taskId=${encodeURIComponent(taskId)}`
  }
  snapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(value: Partial<typeof this.view>) {
    this.view = { ...this.view, ...value }
    for (const listener of this.listeners) listener()
  }
  accept(raw: unknown) {
    const state = taskChainStateSchema.parse(raw)
    if (state.taskId !== this.taskId) throw new Error("任务链路归属不匹配")
    if (this.view.state && state.stateSequence < this.view.state.stateSequence) return
    this.update({ state })
  }
  async reload(signal?: AbortSignal) {
    try {
      const response = await this.fetcher(this.endpoint, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const value: unknown = await response.json()
      if (!signal?.aborted) { this.accept(value); if (!this.view.pending) this.update({ error: "" }) }
    } catch { if (!signal?.aborted) this.update({ error: "无法读取任务链路状态；已有版本和运行记录保留。" }) }
  }
  async dispatch(raw: unknown) {
    if (this.view.busy) return false
    const command = taskChainCommandSchema.parse(raw)
    this.update({ busy: true, pending: command, error: "" })
    try {
      const response = await this.fetcher(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command) })
      const value = await response.json() as { error?: string }
      if (!response.ok) throw new Error(value.error ?? "操作未完成，请刷新后重试。")
      this.accept(value); this.update({ pending: null, error: "" }); return true
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "操作未完成，请刷新后重试。" })
      await this.reload(); return false
    } finally { this.update({ busy: false }) }
  }
  async ensure(requirementVersion: number) {
    const active = this.ensureWork.get(requirementVersion)
    if (active) return active
    const work = this.ensureCurrent(requirementVersion).finally(() => this.ensureWork.delete(requirementVersion))
    this.ensureWork.set(requirementVersion, work)
    return work
  }
  retry = () => this.view.pending ? this.dispatch(this.view.pending) : Promise.resolve(false)
  dismiss = () => this.update({ pending: null, error: "" })
  private async ensureCurrent(requirementVersion: number) {
    await this.reload()
    const current = this.view.state?.plans.some((plan) => plan.requirement.version === requirementVersion
      && !isStaleVersion(this.view.state!, "plan", plan.id, plan.version))
    return current || this.dispatch({ type: "generate_plan", requestId: crypto.randomUUID(), requirementVersion })
  }
}
