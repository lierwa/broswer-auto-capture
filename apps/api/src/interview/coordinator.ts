import { setTimeout as delay } from "node:timers/promises"
import type { AIEvent } from "@agent-platform/ai-connect/server"
import { interviewCommandSchema, type InterviewCommand, type InterviewOutput } from "@browser-capture/contracts/interview"
import { taskCommandSchema, type TaskCommand } from "@browser-capture/contracts/task"
import { ProductStore } from "../database/store.js"
import { conflict, DomainError } from "../errors.js"
import { beginRound, confirmDraft, finishRound } from "./transitions.js"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import {
  createInterviewAuthoringSession,
  interviewPrompt,
  parseInterviewAuthoringOutput,
  questionFromAuthoringBlock,
} from "./protocol.js"

interface Job { taskId: string; turnId: string; controller: AbortController; done: Promise<void> }
const modelUnavailable = "model_account_model_unavailable"
function failureReason(error: unknown) {
  if (error instanceof DomainError) return error.message
  // WHY：只消费 AI Connect 的稳定错误码，避免把供应商原文或 cause 变成业务协议。
  if (error instanceof Error && error.message === modelUnavailable) return "当前账号不支持所选模型，请选择其他可用模型。"
  return "本轮未完成，结果未提交。请重试。"
}
export class InterviewCoordinator {
  private job: Job | null = null
  private closing = false
  private failed = false
  constructor(readonly store: ProductStore, private aiModel: AIModelProvider, private interviewSkill: string) {}
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
    }
    return this.snapshot(id)
  }
  private async run(job: Job) {
    let output: InterviewOutput | undefined, reason: string | undefined
    try {
      // WHY：一次访谈冻结设置中已保存的模型；缺少选择时保留明确设置提示，不回退到第二套模型入口。
      const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(190_000)])
      const selection = this.aiModel.selection()
      output = await this.runShared(job, await this.aiModel.prepare(selection, signal), signal)
    } catch (error) { output = undefined; reason = failureReason(error) }
    finally {
      this.store.mutate(job.taskId, (state) => finishRound(state, job.turnId,
        job.controller.signal.aborted ? "cancelled" : output ? "succeeded" : "failed", output, reason))
    }
  }
  private async runShared(job: Job, model: PreparedAIModel, signal: AbortSignal) {
    const authoring = createInterviewAuthoringSession()
    let streamedText = ""
    let pendingQuestion: InterviewOutput["question"] = null
    const acceptText = (text: string) => {
      if (!text) return undefined
      streamedText += text
      const update = authoring.push(text)
      let visibleText = "", question: InterviewOutput["question"] | undefined
      for (const item of update.events) {
        if (item.type === "text.delta") visibleText += item.delta
        if (item.type === "authoring.started") pendingQuestion = null
        if (item.type === "authoring.preview") pendingQuestion = questionFromAuthoringBlock(item.block)
        if (item.type === "presentation.checkpoint" && (
          item.checkpoint.reason === "authoring.closed" || item.checkpoint.tag === "question-panel"
        )) {
          question = pendingQuestion
          pendingQuestion = null
        }
      }
      return visibleText || question !== undefined ? { text: visibleText, question } : undefined
    }
    const returnedText = await model.generateText({
      prompt: interviewPrompt(this.store.snapshot(job.taskId), this.interviewSkill), signal,
      onEvent: (event) => {
        const projection = event.type === "text.delta" ? acceptText(event.text) : undefined
        this.appendAIEvent(job, event, projection)
      },
    })
    if (!streamedText) {
      const projection = acceptText(returnedText)
      if (projection) this.appendProjection(job, projection.text, projection.question)
    }
    else if (returnedText !== streamedText) throw new Error("interview_authoring_stream_text_mismatch")
    const result = authoring.finish()
    if (result.textDelta) this.appendProjection(job, result.textDelta)
    const object = parseInterviewAuthoringOutput(result, this.store.snapshot(job.taskId))
    this.store.mutate(job.taskId, (state) => state.audits.push({
      revision: state.turns.find((turn) => turn.id === job.turnId)!.revision,
      model: model.selection.modelId, effort: model.selection.reasoningEffort, invocations: 1,
    }))
    return object
  }
  private appendProjection(job: Job, text: string, question?: InterviewOutput["question"]) {
    this.store.mutate(job.taskId, (state) => {
      const turn = state.turns.find((item) => item.id === job.turnId)!
      const message = state.messages.find((item) => item.id === turn.assistantMessageId)!
      message.text += text
      if (question !== undefined) message.question = question
    })
  }
  private appendAIEvent(job: Job, event: AIEvent, projection?: {
    text: string
    question: InterviewOutput["question"] | undefined
  }) {
    this.store.mutate(job.taskId, (state) => {
      const turn = state.turns.find((item) => item.id === job.turnId)!
      const message = state.messages.find((item) => item.id === turn.assistantMessageId)!
      message.aiEvents.push(event)
      if (projection) {
        message.text += projection.text
        if (projection.question !== undefined) message.question = projection.question
      }
    })
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
