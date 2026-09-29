import { randomUUID } from "node:crypto"
import {
  buildCommonSurfaceReplyPayload,
  commonQuestionAnswerFromSubmit,
  createCommonQuestionFromPanel,
  createCommonQuestionSurface,
  type CommonSurfaceQuestion,
  type CommonSurfaceSubmitPayload,
} from "@agent-platform/ai-connect/integration/authoring/question"
import { currentDraft, type InterviewCommand, type InterviewOutput, type InterviewState, type SourceResolution } from "@browser-capture/contracts/interview"
import { conflict } from "../errors.js"
import {
  applySourceResolutionAnswer,
  assertRequirementReady,
  projectProvidedDraftSources,
  recordSourceResolution,
  recordUserProvidedSources,
} from "./source-resolution.js"
import { parsePreparationDraft } from "./preparation-draft.js"

export type ModelCommand = Extract<InterviewCommand, { type: "message" | "retry" }>
export function beginRound(state: InterviewState, command: ModelCommand) {
  if (command.type === "retry" && !["failed", "cancelled"].includes(state.messages.at(-1)?.status ?? "")) conflict("没有可重试的失败轮次。")
  let userMessageId = state.messages.findLast((message) => message.role === "user")?.id
  if (command.type === "message") {
    userMessageId = randomUUID()
    const accepted = command.answer ? acceptAnswer(state, command, userMessageId) : undefined
    state.messages.push({ id: userMessageId, role: "user", text: command.text, status: "complete", question: null,
      draftVersion: null, aiEvents: [], ...(accepted?.interactionReply ? { interactionReply: accepted.interactionReply } : {}) })
    recordUserProvidedSources(state, command.text, state.revision + 1)
  }
  if (!userMessageId) conflict("没有可以继续处理的用户原文。")
  supersedeAbandonedSourceResolutions(state)
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
  if (answer.type === "common_question") {
    return acceptCommonQuestionAnswer(state, item, command.text, answer.surfaceSubmit, messageId)
  }
  if (!("prompt" in item.question)) {
    const surface = surfaceForQuestion(item.id, item.question)
    const question = surface.questions[0]!
    if (answer.type === "free_text" && question.type === "free_form") {
      return acceptCommonQuestionAnswer(state, item, command.text, {
        answers: [{ questionId: item.id, data: { text: answer.text } }], displayText: command.text,
      }, messageId)
    }
    if (answer.type === "choice" && question.type === "choice") {
      const options = (question.data as { options: Array<{ id: string; label: string }> }).options
        .filter((option) => option.label === answer.label)
      if (options.length === 1) return acceptCommonQuestionAnswer(state, item, command.text, {
        answers: [{ questionId: item.id, data: { selectedOptionIds: [options[0]!.id] } }], displayText: command.text,
      }, messageId)
    }
    conflict("回答与当前公共 Question 不匹配。")
  }
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

function acceptCommonQuestionAnswer(
  state: InterviewState,
  item: InterviewState["unresolved"][number],
  commandText: string,
  surfaceSubmit: CommonSurfaceSubmitPayload,
  messageId: string,
) {
  const surface = surfaceForQuestion(item.id, item.question)
  const normalized = commonQuestionAnswerFromSubmit({
    surface, submit: surfaceSubmit, questionId: item.id,
  })
  if (!normalized) conflict("提交内容与当前问题不匹配。")
  const answerText = commonAnswerText(surface.questions[0]!, normalized)
  if (commandText !== answerText) conflict("提交内容与当前回答不匹配。")
  item.status = "answered"; item.answerMessageId = messageId
  state.decisions.push({ id: randomUUID(), revision: state.revision + 1,
    kind: surface.questions[0]!.type === "free_form" ? "free_text" : "option", text: answerText, messageId,
    questionId: item.id, draftVersion: null, createdAt: new Date().toISOString(),
  })
  applySourceResolutionAnswer(state, item.id, normalized, messageId)
  return { interactionReply: buildCommonSurfaceReplyPayload({ surface, submit: surfaceSubmit }) }
}

function surfaceForQuestion(id: string, question: InterviewState["unresolved"][number]["question"]) {
  let canonical: CommonSurfaceQuestion
  if ("prompt" in question) {
    if (new Set(question.options.map((option) => option.label)).size !== question.options.length) {
      conflict("旧问题缺少稳定的选项标识，不能提交。")
    }
    canonical = createCommonQuestionFromPanel({ id, panel: {
      mode: question.options.length ? "choice" : "free_form",
      prompt: question.prompt,
      options: question.options.map((option, index) => ({ id: `option:${index + 1}`, ...option })),
      ...(question.options.length ? { inputs: [{ id: "other", label: "其他补充", kind: "textarea", role: "follow_up",
        placeholder: "补充选项之外的约束或说明（可选）" }] } : {
        placeholder: "直接回答当前问题，或补充你的要求……", multiline: true,
      }),
    } })
  } else canonical = question
  return createCommonQuestionSurface({ id, submitLabel: "提交回答", questions: [canonical] })
}

function commonAnswerText(question: CommonSurfaceQuestion, answer: Record<string, unknown>) {
  if (question.type === "free_form") return String(answer.text)
  const data = question.data as { options: Array<{ id: string; label: string }>; inputs?: Array<{ id: string; label: string }> }
  const selected = answer.selectedOptionIds as string[]
  const values = answer.inputValues as Record<string, string> | undefined
  const lines = selected.map((id) => data.options.find((option) => option.id === id)!.label)
  for (const input of data.inputs ?? []) {
    const value = values?.[input.id]?.trim()
    if (value) lines.push(`${input.label}：${value}`)
  }
  return lines.join("\n")
}
export function confirmDraft(state: InterviewState, version: number) {
  if (currentDraft(state)?.version !== version) conflict("只能确认当前对话对应的最新草稿。")
  if (state.confirmedVersion === version) return
  let projected: InterviewState
  try {
    projected = projectProvidedDraftSources(state, currentDraft(state)!.markdown)
    assertRequirementReady(projected, currentDraft(state)!.markdown, true)
    parsePreparationDraft(currentDraft(state)!.markdown)
  }
  catch { conflict("仍有重要待决事项，或试做入口缺少已确认的来源引用，不能确认准备计划草案。") }
  state.sourceResolutions = projected.sourceResolutions
  state.confirmedVersion = version
  state.decisions.push({ id: randomUUID(), revision: state.revision, kind: "draft_confirmation", text: `确认准备计划草案 v${version}`,
    messageId: null, questionId: null, draftVersion: version, createdAt: new Date().toISOString(),
  })
  for (const question of state.unresolved) question.status = "resolved"
}
export function finishRound(state: InterviewState, id: string, outcome: "succeeded" | "failed" | "cancelled", output?: InterviewOutput,
  reason?: string, sourceResolutions?: SourceResolution | SourceResolution[]) {
  if (state.activeTurnId !== id) return
  const turn = state.turns.find((item) => item.id === id)!
  const assistant = state.messages.find((item) => item.id === turn.assistantMessageId)!
  // WHY：取消是已持久化的轮次事实，即使供应商随后返回成功也不能提交草稿。
  const status = turn.status === "cancelling" ? "cancelled" : outcome
  turn.status = status; turn.completedAt = new Date().toISOString(); turn.reason = reason ?? (status === "cancelled" ? "已停止本轮" : null)
  assistant.status = status === "succeeded" ? "complete" : status
  if (status === "succeeded" && output) {
    // WHY：流中正文已由唯一 authoring parser 原位增长；终态只以同一解析结果校准，不能再次追加而制造重复消息。
    assistant.text = output.assistantText; assistant.question = output.question; assistant.parts = output.parts
    supersedePriorQuestions(state, state.revision)
    if (output.question) state.unresolved.push({ id: assistant.id, revision: state.revision, question: output.question, status: "open", answerMessageId: null })
    for (const resolution of Array.isArray(sourceResolutions) ? sourceResolutions : sourceResolutions ? [sourceResolutions] : []) {
      recordSourceResolution(state, resolution)
    }
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

/** WHY：草案准入与成功轮次必须看到相同的旧题板取代结果；失败轮次不调用此函数写回。 */
export function supersedePriorQuestions(state: InterviewState, revision: number) {
  for (const question of state.unresolved) {
    if (question.status === "open" && question.revision < revision) question.status = "superseded"
  }
  supersedeAbandonedSourceResolutions(state)
}

function supersedeAbandonedSourceResolutions(state: InterviewState) {
  // WHY：来源题板已被新对话取代时，对应候选不能继续阻塞草案确认；保留历史事实，不自动选择候选。
  const abandoned = new Set(state.unresolved.filter((question) => question.status === "superseded").map((question) => question.id))
  for (const resolution of state.sourceResolutions) {
    if (resolution.status === "open" && resolution.questionId && abandoned.has(resolution.questionId)) {
      resolution.status = "superseded"
    }
  }
}
