import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { interviewStateSchema, type InterviewState } from "../src/interviewContract.js"
import {
  interviewErrorMessage,
  projectInterviewEntries,
  projectInterviewTimeline,
  submittedInterviewAnswer,
} from "../src/interviewTimelineProjection.js"

const noop = () => undefined
const noopAnswer = async () => undefined
const projection = (state: InterviewState) => ({
  state, blocked: false, onDraft: noop, onSources: noop, onRetry: noopAnswer,
})
const state = (input: Partial<InterviewState>) => interviewStateSchema.parse({
  revision: 0, sequence: 0, activeTurnId: null, cancellationRequested: false,
  active: false, confirmedVersion: null, audits: [], turns: [], decisions: [], unresolved: [], drafts: [], messages: [],
  ...input,
})
const assistant = (id: string, question: InterviewState["messages"][number]["question"] = null) => ({
  id, role: "assistant" as const, text: "请确认。", status: "complete" as const,
  question, draftVersion: null, aiEvents: [],
})

test("业务正文、草稿和确认卡作为 canonical entries 进入共享投影", () => {
  const value = state({
    revision: 2, sequence: 4, confirmedVersion: 1,
    turns: [{ id: "turn-1", revision: 1, userMessageId: "user-1", assistantMessageId: "assistant-1",
      status: "succeeded", reason: null, createdAt: "2026-09-08T04:05:06.000Z", completedAt: "2026-09-08T04:05:07.000Z" }],
    drafts: [{ version: 1, revision: 2, title: "验收需求", markdown: "# 需求", brief: null }],
    messages: [
      { id: "user-1", role: "user", text: "整理商品资料", status: "complete", question: null, draftVersion: null, aiEvents: [] },
      { ...assistant("assistant-1"), text: "已整理范围。", draftVersion: 1 },
    ],
  })
  const entries = projectInterviewEntries(projection(value))
  assert.deepEqual(entries.map((entry) => [entry.id, entry.role]), [
    ["user-1", "user"], ["assistant-1", "assistant"], ["assistant-1:artifacts", "assistant"], ["assistant-1:confirmed", "assistant"],
  ])
  const content = entries.filter((entry) => entry.value.kind === "content")
    .map((entry) => entry.value.kind === "content" ? renderToStaticMarkup(entry.value.content) : "").join("")
  assert.match(content, /验收需求/)
  assert.match(content, /需求 v1 已确认/)
})

test("只有最新 open waitpoint 成为选择题 Interaction，提交保留 identity", () => {
  const question = { prompt: "选择范围", options: [
    { label: "小范围", description: "较快交付", recommended: true },
    { label: "全范围", description: "覆盖完整", recommended: false },
  ] }
  const value = state({ revision: 2, sequence: 4,
    unresolved: [
      { id: "old", revision: 1, question, status: "superseded", answerMessageId: null },
      { id: "current", revision: 2, question, status: "open", answerMessageId: null },
    ],
    messages: [assistant("old", question), assistant("current", question)],
  })
  const timeline = projectInterviewTimeline(projection(value))
  assert.equal(timeline.activeInteraction?.interactionId, "current")
  assert.equal(timeline.presentedSurface?.questions[0]?.type, "choice")
  assert.equal(timeline.status, "waiting_for_user")
  assert.deepEqual(submittedInterviewAnswer(value, {
    answers: [{ questionId: "current", data: { selectedOptionIds: ["option:1"] } }], displayText: "小范围",
  }), { type: "choice", questionId: "current", label: "小范围" })
  assert.throws(() => submittedInterviewAnswer(value, {
    answers: [{ questionId: "old", data: { selectedOptionIds: ["option:1"] } }], displayText: "小范围",
  }), /interview_answer_invalid/)
})

test("options=[] 映成公共 free_form Module 并提交 typed free-text reply", () => {
  const question = { prompt: "目标数量与字段是什么？", options: [] }
  const value = state({ revision: 1, sequence: 2,
    unresolved: [{ id: "current", revision: 1, question, status: "open", answerMessageId: null }],
    messages: [assistant("current", question)],
  })
  const timeline = projectInterviewTimeline(projection(value))
  assert.equal(timeline.presentedSurface?.questions[0]?.type, "free_form")
  assert.deepEqual(timeline.presentedSurface?.questions[0]?.data, {
    stem: question.prompt, placeholder: "直接回答当前问题，或补充你的要求……", multiline: true,
  })
  assert.deepEqual(submittedInterviewAnswer(value, {
    answers: [{ questionId: "current", data: { text: " 100 个型号，名称与主图 " } }], displayText: "回答",
  }), { type: "free_text", questionId: "current", text: "100 个型号，名称与主图" })
})

test("当前 Run 在首段正文到达前仍建立共享空壳，闭合题块不提前可答", () => {
  const question = { prompt: "选择负责人范围", options: [
    { label: "小范围", description: "较快", recommended: true },
    { label: "全范围", description: "完整", recommended: false },
  ] }
  const value = state({ revision: 1, sequence: 2, activeTurnId: "turn-1", active: true,
    turns: [{ id: "turn-1", revision: 1, userMessageId: "user-1", assistantMessageId: "assistant-1",
      status: "running", reason: null, createdAt: "2026-09-08T04:05:06.000Z", completedAt: null }],
    messages: [
      { id: "user-1", role: "user", text: "请梳理", status: "complete", question: null, draftVersion: null, aiEvents: [] },
      { ...assistant("assistant-1", question), text: "", status: "running" },
    ],
  })
  const timeline = projectInterviewTimeline(projection(value))
  assert.equal(timeline.status, "generating")
  assert.equal(timeline.activeInteraction, null)
  assert.equal(timeline.currentRun?.status, "working")
  assert.equal(timeline.currentAssistantTurnId, "interactive-assistant-turn:turn-1")
  assert.deepEqual(timeline.turns.at(-1)?.entries, [])
})

test("choice 与 free_text decision 使用同一共享 locked history，替换对应用户文本", () => {
  const choice = { prompt: "选择范围", options: [
    { label: "小范围", description: "较快", recommended: true },
    { label: "全范围", description: "完整", recommended: false },
  ] }
  const free = { prompt: "目标数量？", options: [] }
  const value = state({ revision: 4, sequence: 8,
    unresolved: [
      { id: "choice-q", revision: 1, question: choice, status: "answered", answerMessageId: "choice-a" },
      { id: "free-q", revision: 3, question: free, status: "answered", answerMessageId: "free-a" },
    ],
    decisions: [
      { id: "d1", revision: 2, kind: "option", text: "小范围", messageId: "choice-a", questionId: "choice-q", draftVersion: null, createdAt: "2026-09-08T04:05:08.000Z" },
      { id: "d2", revision: 4, kind: "free_text", text: "100 个", messageId: "free-a", questionId: "free-q", draftVersion: null, createdAt: "2026-09-08T04:05:10.000Z" },
    ],
    messages: [
      assistant("choice-q", choice),
      { id: "choice-a", role: "user", text: "小范围", status: "complete", question: null, draftVersion: null, aiEvents: [] },
      assistant("free-q", free),
      { id: "free-a", role: "user", text: "100 个", status: "complete", question: null, draftVersion: null, aiEvents: [] },
    ],
  })
  const entries = projectInterviewTimeline(projection(value)).turns.flatMap((turn) => turn.entries)
  const answered = entries.filter((entry) => entry.value.kind === "answered-interaction")
  assert.deepEqual(answered.map((entry) => entry.id), ["answered-interaction:choice-q", "answered-interaction:free-q"])
  assert.deepEqual(answered.map((entry) => entry.value.kind === "answered-interaction"
    ? entry.value.interaction.surfaceSubmit.answers[0]?.data : null), [
    { selectedOptionIds: ["option:1"] }, { text: "100 个" },
  ])
  assert.equal(entries.some((entry) => entry.id === "choice-a" || entry.id === "free-a"), false)
})

test("旧重复 label 选择题保留原文本，不伪造 option identity 或可答 Surface", () => {
  const question = { prompt: "选择范围", options: [
    { label: "同一范围", description: "方案一", recommended: true },
    { label: "同一范围", description: "方案二", recommended: false },
  ] }
  const value = state({ revision: 2, sequence: 4,
    unresolved: [{ id: "question", revision: 1, question, status: "answered", answerMessageId: "answer" }],
    decisions: [{ id: "decision", revision: 2, kind: "option", text: "同一范围", messageId: "answer",
      questionId: "question", draftVersion: null, createdAt: "2026-09-08T04:05:08.000Z" }],
    messages: [assistant("question", question),
      { id: "answer", role: "user", text: "同一范围", status: "complete", question: null, draftVersion: null, aiEvents: [] }],
  })
  const timeline = projectInterviewTimeline(projection(value))
  const entries = timeline.turns.flatMap((turn) => turn.entries)
  assert.equal(entries.some((entry) => entry.value.kind === "answered-interaction"), false)
  assert.equal(entries.some((entry) => entry.id === "answer" && entry.value.kind === "message"), true)
  assert.equal(timeline.activeInteraction, null)
})

test("真实 typed AI event 只进入公共 activity hooks，结构 text.delta 不重复业务正文", () => {
  const cancelled = { ...assistant("assistant-cancelled"), text: "已停止本轮处理。", status: "cancelled" as const,
    aiEvents: [{ type: "generation.started" as const, invocationId: "call-1", sequence: 0, createdAt: 10,
      output: "text" as const, model: { connectionId: "account", modelId: "model", reasoningEffort: "low" as const } },
      { type: "text.delta" as const, invocationId: "call-1", sequence: 1, createdAt: 11,
        text: '<authoring><interview-result>{"draft":{}}</interview-result></authoring>' },
      { type: "generation.cancelled" as const, invocationId: "call-1", sequence: 2, createdAt: 12 }],
  }
  const cancelledState = state({ revision: 2, sequence: 4, messages: [cancelled] })
  const entries = projectInterviewEntries(projection(cancelledState))
  const messages = entries.filter((entry) => entry.value.kind === "message")
  assert.equal(messages.length, 1)
  assert.equal(messages[0]?.id, "assistant-cancelled")
  assert.equal(JSON.stringify(messages).includes("interview-result"), false)
  const timeline = projectInterviewTimeline(projection(cancelledState))
  assert.deepEqual(timeline.hooks.map((hook) => [hook.kind, hook.status]), [["ai-generation", "waiting"]])
  const content = entries.filter((entry) => entry.value.kind === "content")
    .map((entry) => entry.value.kind === "content" ? renderToStaticMarkup(entry.value.content) : "").join("")
  assert.match(content, /重新提交本轮/)
  assert.equal(interviewErrorMessage(cancelled), undefined)
  const failed = { ...assistant("assistant-failed"), status: "failed" as const }
  assert.equal(projectInterviewTimeline(projection(state({ messages: [failed] }))).canRetry, true)
  assert.equal(interviewErrorMessage(failed), "本轮结果未提交，可以重试。")
})
