import { randomUUID } from "node:crypto"
import { currentDraft, type InterviewCommand, type InterviewOutput, type InterviewState } from "@browser-capture/contracts/interview"
import { conflict } from "../errors.js"

export type ModelCommand = Extract<InterviewCommand, { type: "message" | "retry" }>
export function beginRound(state: InterviewState, command: ModelCommand) {
  if (command.type === "retry" && !["failed", "cancelled"].includes(state.messages.at(-1)?.status ?? "")) conflict("没有可重试的失败轮次。")
  let userMessageId = state.messages.findLast((message) => message.role === "user")?.id
  if (command.type === "message") {
    userMessageId = randomUUID()
    if (command.answer) acceptAnswer(state, command, userMessageId)
    state.messages.push({ id: userMessageId, role: "user", text: command.text, status: "complete", question: null, draftVersion: null, aiEvents: [] })
  }
  if (!userMessageId) conflict("没有可以继续处理的用户原文。")
  state.revision += 1; state.confirmedVersion = null; state.active = true; state.cancellationRequested = false
  const assistantMessageId = randomUUID(), id = randomUUID()
  state.messages.push({ id: assistantMessageId, role: "assistant", text: "", status: "running", question: null, draftVersion: null, aiEvents: [] })
  state.turns.push({ id, revision: state.revision, userMessageId, assistantMessageId, status: "running", reason: null, createdAt: new Date().toISOString(), completedAt: null })
  state.activeTurnId = id
  return id
}
function acceptAnswer(state: InterviewState, command: Extract<ModelCommand, { type: "message" }>, messageId: string) {
  const answer = command.answer!
  const item = state.unresolved.find((question) => question.id === answer.questionId)
  if (!item || item.status !== "open" || state.messages.at(-1)?.id !== item.id) conflict("这个问题已不属于当前轮次，请查看最新对话。")
  const answerText = answer.type === "choice" ? answer.label : answer.text
  if (command.text !== answerText) conflict("提交内容与当前回答不匹配。")
  if (answer.type === "choice" && !item.question.options.some((option) => option.label === answer.label)) conflict("选项与当前问题不匹配。")
  if (answer.type === "free_text" && item.question.options.length > 0) conflict("当前问题需要选择或补充说明。")
  item.status = "answered"; item.answerMessageId = messageId
  state.decisions.push({ id: randomUUID(), revision: state.revision + 1,
    kind: answer.type === "choice" ? "option" : "free_text", text: answerText, messageId,
    questionId: item.id, draftVersion: null, createdAt: new Date().toISOString(),
  })
}
export function confirmDraft(state: InterviewState, version: number) {
  if (currentDraft(state)?.version !== version) conflict("只能确认当前对话对应的最新草稿。")
  if (state.confirmedVersion === version) return
  state.confirmedVersion = version
  state.decisions.push({ id: randomUUID(), revision: state.revision, kind: "draft_confirmation", text: `确认需求草稿 v${version}`,
    messageId: null, questionId: null, draftVersion: version, createdAt: new Date().toISOString(),
  })
  for (const question of state.unresolved) question.status = "resolved"
}
export function finishRound(state: InterviewState, id: string, outcome: "succeeded" | "failed" | "cancelled", output?: InterviewOutput, reason?: string) {
  if (state.activeTurnId !== id) return
  const turn = state.turns.find((item) => item.id === id)!
  const assistant = state.messages.find((item) => item.id === turn.assistantMessageId)!
  // WHY：取消是已持久化的轮次事实，即使供应商随后返回成功也不能提交草稿。
  const status = turn.status === "cancelling" ? "cancelled" : outcome
  turn.status = status; turn.completedAt = new Date().toISOString(); turn.reason = reason ?? (status === "cancelled" ? "已停止本轮" : null)
  assistant.status = status === "succeeded" ? "complete" : status
  if (status === "succeeded" && output) {
    // WHY：流中正文已由唯一 authoring parser 原位增长；终态只以同一解析结果校准，不能再次追加而制造重复消息。
    assistant.text = output.assistantText; assistant.question = output.question
    for (const question of state.unresolved) if (question.status === "open") question.status = "superseded"
    if (output.question) state.unresolved.push({ id: assistant.id, revision: state.revision, question: output.question, status: "open", answerMessageId: null })
    if (output.draft) {
      const version = (state.drafts.at(-1)?.version ?? 0) + 1
      state.drafts.push({ ...output.draft, version, revision: state.revision }); assistant.draftVersion = version
    }
  } else {
    assistant.question = null
    assistant.text += `\n${status === "cancelled" ? "已停止，本轮未提交草稿。" : reason ?? "本轮未完成，结果未提交。请重试。"}`
  }
  state.active = false; state.activeTurnId = null; state.cancellationRequested = false
}
