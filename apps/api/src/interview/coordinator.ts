import { setTimeout as delay } from "node:timers/promises"
import { ModelRuntimeError } from "@browser-capture/model-runtime"
import { interviewCommandSchema, interviewOutputSchema, type InterviewCommand, type InterviewOutput } from "@browser-capture/contracts/interview"
import { taskCommandSchema, type TaskCommand } from "@browser-capture/contracts/task"
import { ProductStore } from "../database/store.js"
import { conflict, DomainError } from "../errors.js"
import { beginRound, confirmDraft, finishRound } from "./transitions.js"
import { interviewPrompt, outputSchema, type ModelSession, type ModelSessionFactory } from "./modelSession.js"

interface Job { taskId: string; turnId: string; controller: AbortController; done: Promise<void>; session?: ModelSession; closeTimer?: ReturnType<typeof setTimeout> }
export class InterviewCoordinator {
  private job: Job | null = null
  private closing = false
  private failed = false
  constructor(readonly store: ProductStore, private createSession: ModelSessionFactory) {}
  private available() {
    if (this.closing || this.failed) throw new DomainError("service_unavailable", "访谈服务已停止或持久化异常，请重启后恢复。", 503)
  }
  snapshot(id: string) { this.available(); return this.store.snapshot(id) }
  list() { this.available(); return this.store.list() }
  taskAction(input: TaskCommand) { this.available(); return this.store.taskAction(taskCommandSchema.parse(input)) }
  dispatch(id: string, input: InterviewCommand) {
    this.available()
    const command = interviewCommandSchema.parse(input)
    if (command.type === "cancel") return this.cancel(id, command.turnId)
    this.store.task(id)
    if (this.store.operation(id, command.requestId, command)) return this.snapshot(id)
    if (command.type !== "confirm" && this.job) conflict("另一轮需求正在处理，请等待完成；仍可切换任务查看与编辑。")
    const turnId = this.store.mutate(id, (state) => {
      if (this.store.task(id).archived) conflict("请先恢复这个归档任务。")
      if (state.active) conflict("当前轮次仍在运行，请先停止或等待完成。")
      if (command.expectedRevision !== state.revision) conflict("对话已经更新，请读取最新状态后再操作。")
      if (command.type === "confirm") {
        confirmDraft(state, command.version)
        this.store.recordOperation(id, command.requestId, command, `draft:${command.version}`)
        return null
      }
      const value = beginRound(state, command)
      this.store.recordOperation(id, command.requestId, command, value)
      return value
    })
    if (turnId) {
      const job: Job = { taskId: id, turnId, controller: new AbortController(), done: Promise.resolve() }
      this.job = job
      // WHY：执行由服务持有，不依赖 HTTP 客户端消费；断线只取消观察，不取消模型轮次。
      job.done = this.run(job).catch(() => { this.failed = true }).finally(() => { if (this.job === job) this.job = null })
    }
    return this.snapshot(id)
  }
  private cancel(id: string, turnId: string) {
    const before = this.snapshot(id)
    if (before.activeTurnId !== turnId) {
      if (!before.active && before.turns.some((turn) => turn.id === turnId)) return before
      conflict("该取消请求已过期，当前轮次没有被停止。")
    }
    if (!before.cancellationRequested) this.store.mutate(id, (state) => {
      state.turns.find((turn) => turn.id === turnId)!.status = "cancelling"; state.cancellationRequested = true
    })
    const job = this.job
    if (job?.taskId === id && job.turnId === turnId) {
      job.controller.abort()
      job.closeTimer ??= setTimeout(() => { void job.session?.client.close().catch(() => {}) }, 2_000)
    }
    return this.snapshot(id)
  }
  private async run(job: Job) {
    let output: InterviewOutput | undefined, reason: string | undefined
    let interrupted = false, commentary = ""
    try {
      job.session = await this.createSession()
      if (job.controller.signal.aborted) return
      for await (const event of job.session.client.runTurn(interviewPrompt(this.store.snapshot(job.taskId)), outputSchema(), job.controller.signal)) {
        if (event.type === "turn_succeeded" || event.type === "interrupted") {
          this.store.mutate(job.taskId, (state) => {
            state.audits.push({ revision: state.turns.find((turn) => turn.id === job.turnId)!.revision,
              model: event.audit.requestedModel, effort: event.audit.requestedEffort, invocations: event.audit.invocationCount })
          })
        }
        if (job.controller.signal.aborted) continue
        if (event.type === "interrupted") interrupted = true
        if (event.type === "turn_succeeded") output = interviewOutputSchema.parse(JSON.parse(event.outputText))
        if (event.type === "commentary_delta") {
          commentary += event.delta
          if (!/^[\s]*[\{\[`]/.test(commentary)) this.store.mutate(job.taskId, (state) => {
            const turn = state.turns.find((item) => item.id === job.turnId)!
            state.messages.find((message) => message.id === turn.assistantMessageId)!.text = commentary
          })
        }
      }
    } catch (error) { output = undefined; reason = error instanceof ModelRuntimeError ? error.message : "本轮未完成，结果未提交。请重试。" }
    finally {
      if (job.closeTimer) clearTimeout(job.closeTimer)
      try { await job.session?.dispose() }
      finally { this.store.mutate(job.taskId, (state) => finishRound(state, job.turnId,
        job.controller.signal.aborted || interrupted ? "cancelled" : output ? "succeeded" : "failed", output, reason)) }
    }
  }
  async *observe(id: string, after: number, signal: AbortSignal) {
    // 已提交快照具有单调序号；观察短轮询不持有模型或事务，可跨刷新重新连接。
    while (!signal.aborted) {
      const state = this.snapshot(id)
      if (state.sequence > after) { after = state.sequence; yield { taskId: id, state } }
      if (!state.active) return
      try { await delay(200, undefined, { signal }) } catch { return }
    }
  }
  async waitForIdle() { await this.job?.done }
  async close() {
    if (this.closing) return
    if (this.job) this.cancel(this.job.taskId, this.job.turnId)
    this.closing = true
    await this.job?.done
  }
}
