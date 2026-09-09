import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { interviewStateSchema } from "../src/interviewContract.js"
import {
  interviewErrorMessage,
  projectInterviewMessages,
  projectInterviewTimeline,
  selectedInterviewOption,
} from "../src/interviewTimelineProjection.js"

const noop = () => undefined
const noopAnswer = async () => undefined
const projection = (state: ReturnType<typeof interviewStateSchema.parse>) => ({
  resetKey: "task-1", state, blocked: false, onDraft: noop, onSources: noop, onRetry: noopAnswer,
})

test("需求消息完整保留业务正文，并按消息顺序附加草稿和确认卡", () => {
  const state = interviewStateSchema.parse({
    revision: 2,
    sequence: 4,
    activeTurnId: null,
    cancellationRequested: false,
    active: false,
    confirmedVersion: 1,
    audits: [], turns: [{ id: "turn-1", revision: 1, userMessageId: "user-1", assistantMessageId: "assistant-1",
      status: "succeeded", reason: null, createdAt: "2026-09-08T04:05:06.000Z", completedAt: "2026-09-08T04:05:07.000Z" }],
    decisions: [], unresolved: [],
    drafts: [{ version: 1, revision: 2, title: "验收需求", markdown: "# 需求", brief: null }],
    messages: [
      { id: "user-1", role: "user", text: "整理商品资料", status: "complete", question: null, draftVersion: null, aiEvents: [] },
      { id: "assistant-1", role: "assistant", text: "已整理范围，并保留示例 {\"model\":\"catalog\"}。", status: "complete",
        question: { prompt: "优先哪个范围？", options: [
          { label: "在售商品", description: "只收集当前在售型号", recommended: true },
          { label: "全部商品", description: "包含历史型号", recommended: false },
        ] }, draftVersion: 1, aiEvents: [] },
    ],
  })
  const messages = projectInterviewMessages(projection(state))
  assert.deepEqual(messages.map((message) => [message.id, message.role]), [["user-1", "user"], ["assistant-1", "assistant"]])
  assert.deepEqual(messages.map((message) => message.createdAt), [Date.parse("2026-09-08T04:05:06.000Z"), Date.parse("2026-09-08T04:05:06.000Z")])
  const assistant = messages[1]!
  assert.ok(Array.isArray(assistant.content))
  const parts = assistant.content as Exclude<typeof assistant.content, string>
  assert.equal(parts[0]?.type, "text")
  assert.equal(parts[0]?.type === "text" ? parts[0].text : "", "已整理范围，并保留示例 {\"model\":\"catalog\"}。")
  const html = parts.filter((part) => part.type === "content").map((part) => renderToStaticMarkup(part.content)).join("")
  assert.match(html, /验收需求/)
  assert.match(html, /需求 v1 已确认/)
})

test("只有最新 assistant message 对应的 open unresolved 才成为可答 Interaction", () => {
  const message = (id: string) => ({ id, role: "assistant" as const, text: "请选择。", status: "complete" as const,
    question: { prompt: `${id}问题`, options: [
      { label: "方案一", description: "第一种", recommended: true },
      { label: "方案二", description: "第二种", recommended: false },
    ] }, draftVersion: null, aiEvents: [] })
  const state = interviewStateSchema.parse({ revision: 2, sequence: 4, activeTurnId: null, cancellationRequested: false,
    active: false, confirmedVersion: null, audits: [], turns: [], decisions: [], drafts: [], unresolved: [
      { id: "old", revision: 1, question: message("old").question, status: "superseded", answerMessageId: null },
      { id: "current", revision: 2, question: message("current").question, status: "open", answerMessageId: null },
    ],
    messages: [message("old"), message("current")] })
  const messages = projectInterviewMessages(projection(state))
  assert.deepEqual(messages.map((entry) => entry.createdAt), [0, 1])
  const html = messages.map((entry) => {
    if (typeof entry.content === "string") return entry.content
    return entry.content.filter((part) => part.type === "content").map((part) => renderToStaticMarkup(part.content)).join("")
  })
  assert.equal(html[0], "")
  assert.equal(html[1], "")
  const timeline = projectInterviewTimeline(projection(state))
  assert.equal(timeline.activeInteraction?.interactionId, "current")
  assert.equal(timeline.presentedSurface?.id, "current")
  assert.equal(timeline.presentedSurface?.questions[0]?.id, "current")
  assert.equal(timeline.status, "waiting_for_user")
  assert.deepEqual(selectedInterviewOption(state, {
    answers: [{ questionId: "current", data: { selectedOptionIds: ["option:1"] } }],
    displayText: "current问题\n方案一",
  }), { questionId: "current", label: "方案一" })
  assert.throws(() => selectedInterviewOption(state, {
    answers: [{ questionId: "old", data: { selectedOptionIds: ["option:1"] } }], displayText: "方案一",
  }), /interview_option_selection_invalid/)
})

test("无选项事实问题保持普通文本与自由回答，不制造选择 Interaction", () => {
  const message = (id: string) => ({ id, role: "assistant" as const, text: "请补充范围。", status: "complete" as const,
    question: { prompt: `${id}范围是什么？`, options: [] }, draftVersion: null, aiEvents: [] })
  const state = interviewStateSchema.parse({ revision: 2, sequence: 4, activeTurnId: null, cancellationRequested: false,
    active: false, confirmedVersion: null, audits: [], turns: [], decisions: [], drafts: [], unresolved: [
      { id: "current", revision: 2, question: message("current").question, status: "open", answerMessageId: null },
    ],
    messages: [message("old"), message("current")] })
  const projected = projectInterviewMessages(projection(state))
  const html = projected.map((entry) => Array.isArray(entry.content)
    ? entry.content.filter((part) => part.type === "content").map((part) => renderToStaticMarkup(part.content)).join("")
    : "")
  assert.deepEqual(html, ["", ""])
  assert.deepEqual(projected.map((entry) => Array.isArray(entry.content) ? entry.content[0]?.text : entry.content),
    ["请补充范围。", "请补充范围。"])
  const timeline = projectInterviewTimeline(projection(state))
  assert.equal(timeline.activeInteraction, null)
  assert.equal(timeline.presentedSurface, null)
})

test("运行中已闭合题块保持非交互事实，不提前进入 Timeline Question 或获得 reply 权限", () => {
  const question = { prompt: "选择负责人范围", options: [
    { label: "小范围", description: "较快交付，但覆盖较少", recommended: true },
    { label: "全范围", description: "覆盖完整，但耗时更长", recommended: false },
  ] }
  const state = interviewStateSchema.parse({ revision: 1, sequence: 2, activeTurnId: "turn-1", cancellationRequested: false,
    active: true, confirmedVersion: null, audits: [], decisions: [], unresolved: [], drafts: [],
    turns: [{ id: "turn-1", revision: 1, userMessageId: "user-1", assistantMessageId: "assistant-1",
      status: "running", reason: null, createdAt: "2026-09-08T04:05:06.000Z", completedAt: null }],
    messages: [
      { id: "user-1", role: "user", text: "请梳理", status: "complete", question: null, draftVersion: null, aiEvents: [] },
      { id: "assistant-1", role: "assistant", text: "先确认范围。", status: "running", question, draftVersion: null, aiEvents: [] },
    ] })
  const messages = projectInterviewMessages(projection(state))
  const assistant = messages[1]!
  assert.ok(Array.isArray(assistant.content))
  assert.equal(assistant.content[0]?.type === "text" && assistant.content[0].streaming, true)
  const preview = assistant.content.filter((part) => part.type === "content")
    .map((part) => renderToStaticMarkup(part.content)).join("")
  assert.equal(preview, "")
  const timeline = projectInterviewTimeline(projection(state))
  assert.equal(timeline.status, "generating")
  assert.equal(timeline.activeInteraction, null)
  assert.equal(timeline.presentedSurface, null)
})

test("历史回答只由 option decision 投影为 submitted Interaction，并替换对应用户文本", () => {
  const question = { prompt: "选择范围", options: [
    { label: "小范围", description: "较快交付，但覆盖较少", recommended: true },
    { label: "全范围", description: "覆盖完整，但耗时更长", recommended: false },
  ] }
  const state = interviewStateSchema.parse({ revision: 2, sequence: 4, activeTurnId: null, cancellationRequested: false,
    active: false, confirmedVersion: null, audits: [], drafts: [],
    unresolved: [{ id: "question-owner", revision: 1, question, status: "answered", answerMessageId: "answer-message" }],
    decisions: [{ id: "decision-1", revision: 2, kind: "option", text: "小范围", messageId: "answer-message",
      questionId: "question-owner", draftVersion: null, createdAt: "2026-09-08T04:05:08.000Z" }],
    turns: [], messages: [
      { id: "question-owner", role: "assistant", text: "请决定。", status: "complete", question, draftVersion: null, aiEvents: [] },
      { id: "answer-message", role: "user", text: "小范围", status: "complete", question: null, draftVersion: null, aiEvents: [] },
      { id: "assistant-next", role: "assistant", text: "已记录。", status: "complete", question: null, draftVersion: null, aiEvents: [] },
    ] })
  const timeline = projectInterviewTimeline(projection(state))
  const entries = timeline.turns.flatMap((turn) => turn.entries)
  const answered = entries.find((entry) => entry.value.kind === "answered-interaction")
  assert.equal(answered?.id, "answered-interaction:question-owner")
  assert.deepEqual(answered?.value.kind === "answered-interaction" && answered.value.interaction.surfaceSubmit, {
    answers: [{ questionId: "question-owner", data: { selectedOptionIds: ["option:1"] } }],
    displayText: "小范围",
  })
  assert.equal(entries.some((entry) => entry.value.kind === "message" && entry.value.message.id === "answer-message"), false)
  assert.equal(timeline.activeInteraction, null)
})

test("取消是可重试业务终态，不投影错误或残留运行中的模型状态", () => {
  const cancelled = { id: "assistant-cancelled", role: "assistant" as const, text: "已停止本轮处理。",
    status: "cancelled" as const, question: null, draftVersion: null, aiEvents: [{
      type: "generation.started" as const, invocationId: "call-1", sequence: 0, createdAt: 10,
      output: "object" as const, model: { connectionId: "account", modelId: "model", reasoningEffort: "low" as const },
    }] }
  const state = interviewStateSchema.parse({ revision: 2, sequence: 4, activeTurnId: null, cancellationRequested: false,
    active: false, confirmedVersion: null, audits: [], decisions: [], unresolved: [], drafts: [],
    turns: [{ id: "turn-1", revision: 2, userMessageId: "user-1", assistantMessageId: cancelled.id,
      status: "cancelled", reason: null, createdAt: "2026-09-08T04:05:06.000Z", completedAt: "2026-09-08T04:05:07.000Z" }],
    messages: [{ id: "user-1", role: "user", text: "开始处理", status: "complete", question: null,
      draftVersion: null, aiEvents: [] }, cancelled] })
  const messages = projectInterviewMessages(projection(state))
  const content = messages[1]!.content
  assert.ok(Array.isArray(content))
  const html = content.filter((part) => part.type === "content")
    .map((part) => renderToStaticMarkup(part.content)).join("")
  assert.equal(interviewErrorMessage(state.messages[1]), undefined)
  assert.doesNotMatch(html, /正在生成结构结果/)
  assert.doesNotMatch(html, /model|low|data-ai-invocation-status/)
  assert.match(html, /重新提交本轮/)
})
