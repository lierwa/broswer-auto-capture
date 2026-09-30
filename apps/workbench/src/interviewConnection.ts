import { z } from "zod"
import { emptyInterview, interviewCommandSchema, interviewStateSchema, type InterviewCommand, type InterviewState } from "./interviewContract.js"
import { jsonLines, reconnect } from "./stateStream.js"

const envelope = z.object({ taskId: z.string(), state: interviewStateSchema })
const errorEnvelope = z.object({ error: z.string() })
type View = { state: InterviewState; ready: boolean; error: string; busy: boolean; pending: InterviewCommand | null }

export class InterviewConnection {
  private view: View = { state: structuredClone(emptyInterview), ready: false, error: "", busy: false, pending: null }
  private listeners = new Set<() => void>()
  private lifetime: AbortController | undefined
  private endpoint: string
  constructor(readonly taskId: string, private fetcher: typeof fetch = (...args) => fetch(...args)) { this.endpoint = `/api/interview?taskId=${encodeURIComponent(taskId)}` }
  snapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(value: Partial<View>) {
    if (Object.entries(value).every(([key, next]) => Object.is(this.view[key as keyof View], next))) return
    this.view = { ...this.view, ...value }; for (const listener of this.listeners) listener()
  }
  accept(input: unknown) {
    const { taskId, state } = envelope.parse(input)
    // WHY：轮次 revision 不覆盖同轮增量，sequence 防止取消响应、流和刷新快照相互倒退。
    if (taskId !== this.taskId || (this.view.ready && state.sequence <= this.view.state.sequence)) return
    this.update({ state, ready: true })
  }
  async reload(signal?: AbortSignal) {
    const response = await this.fetcher(this.endpoint, { signal: signal ?? null })
    if (!response.ok) throw new Error("无法读取需求对话，请检查本地服务后重新连接。")
    const state = interviewStateSchema.parse(await response.json())
    if (!signal?.aborted) this.accept({ taskId: this.taskId, state })
  }
  start() {
    this.stop()
    const controller = new AbortController()
    this.lifetime = controller
    void this.observe(controller.signal)
    return () => { controller.abort(); if (this.lifetime === controller) this.lifetime = undefined }
  }
  stop() { this.lifetime?.abort(); this.lifetime = undefined }
  private async observe(signal: AbortSignal) {
    let failures = 0
    while (!signal.aborted) {
      try {
        await this.reload(signal)
        if (!this.view.pending) this.update({ error: "" })
        const response = await this.fetcher(`/api/interview/events?taskId=${encodeURIComponent(this.taskId)}&after=${this.view.state.sequence}&continuous=true`, { signal })
        for await (const item of jsonLines(response, signal)) { this.accept(item); failures = 0 }
        if (!signal.aborted) throw new Error("状态流中断")
      } catch {
        if (!signal.aborted) {
          this.update({ error: "状态连接中断，正在重新连接；服务端保留本轮记录。" })
          await reconnect(signal, failures++)
        }
      }
    }
  }
  async dispatch(command: InterviewCommand) {
    if (this.view.busy && command.type !== "cancel") return false
    const input = interviewCommandSchema.parse(command)
    const cancelling = input.type === "cancel"
    if (!cancelling) this.update({ busy: true, pending: input, error: "" })
    try {
      const response = await this.fetcher(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
      const result: unknown = await response.json()
      if (!response.ok) throw new Error(errorEnvelope.parse(result).error)
      this.accept(result)
      if (!cancelling) this.update({ pending: null, error: "" })
      return true
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "请求未完成，请重新连接。" })
      // TRADE-OFF：响应丢失不代表提交失败。保留原幂等键供用户重发，并先恢复服务端事实。
      await this.reload().catch(() => {})
      return false
    } finally { if (!cancelling) this.update({ busy: false }) }
  }
  retrySubmission = async () => { if (this.view.pending) await this.dispatch(this.view.pending) }
  dismissSubmission = () => this.update({ pending: null, error: "" })
}
