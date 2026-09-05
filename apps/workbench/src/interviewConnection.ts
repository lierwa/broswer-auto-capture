import { z } from "zod"
import { emptyInterview, interviewCommandSchema, interviewStateSchema, type InterviewCommand, type InterviewState } from "./interviewContract.js"

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
  private update(value: Partial<View>) { this.view = { ...this.view, ...value }; for (const listener of this.listeners) listener() }
  accept(input: unknown) {
    const { taskId, state } = envelope.parse(input)
    // WHY：轮次 revision 不覆盖同轮增量，sequence 防止取消响应、流和刷新快照相互倒退。
    if (taskId !== this.taskId || (this.view.ready && state.sequence < this.view.state.sequence)) return
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
    while (!signal.aborted) {
      try {
        await this.reload(signal)
        if (!this.view.pending) this.update({ error: "" })
        if (this.view.state.active) await this.stream(signal)
      } catch { if (!signal.aborted) this.update({ error: "状态连接中断，正在重新连接；服务端保留本轮记录。" }) }
      if (!signal.aborted) await pause(signal)
    }
  }
  private async stream(signal: AbortSignal) {
    const response = await this.fetcher(`/api/interview/events?taskId=${encodeURIComponent(this.taskId)}&after=${this.view.state.sequence}`, { signal })
    if (!response.ok || !response.body) throw new Error("无法连接状态流")
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ""
    try {
      for (;;) {
        const chunk = await reader.read()
        buffer += chunk.value ?? ""
        const lines = buffer.split("\n"); buffer = lines.pop() ?? ""
        for (const line of lines.filter(Boolean)) if (!signal.aborted) this.accept(JSON.parse(line))
        if (chunk.done) break
      }
      if (buffer.trim()) throw new Error("状态流未完整接收")
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  }
  async dispatch(command: InterviewCommand) {
    if (this.view.busy && command.type !== "cancel") return
    const input = interviewCommandSchema.parse(command)
    const cancelling = input.type === "cancel"
    if (!cancelling) this.update({ busy: true, pending: input, error: "" })
    try {
      const response = await this.fetcher(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
      const result: unknown = await response.json()
      if (!response.ok) throw new Error(errorEnvelope.parse(result).error)
      this.accept(result)
      if (!cancelling) this.update({ pending: null, error: "" })
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "请求未完成，请重新连接。" })
      // TRADE-OFF：响应丢失不代表提交失败。保留原幂等键供用户重发，并先恢复服务端事实。
      await this.reload().catch(() => {})
    } finally { if (!cancelling) this.update({ busy: false }) }
  }
  retrySubmission = async () => { if (this.view.pending) await this.dispatch(this.view.pending) }
  dismissSubmission = () => this.update({ pending: null, error: "" })
}

function pause(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve() }
    const timer = setTimeout(done, 1200)
    signal.addEventListener("abort", done, { once: true })
  })
}
