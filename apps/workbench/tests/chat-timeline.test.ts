import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { renderToStaticMarkup } from "react-dom/server"
import { buildCommonSurfaceReplyPayload, createCommonChoiceQuestion, createCommonQuestionFromPanel, createCommonQuestionSurface } from "@agent-platform/ai-connect/ui-contracts"
import { interviewCommandSchema, interviewStateSchema, type InterviewState } from "../src/interviewContract.js"
import { InterviewConnection } from "../src/interviewConnection.js"
import {
  interviewErrorMessage,
  projectInterviewEntries,
  projectInterviewTimeline,
  submittedInterviewAnswer,
} from "../src/interviewTimelineProjection.js"
import { interviewAgentUI } from "../src/interviewAgentUI.js"

const noop = () => undefined
const noopAnswer = async () => undefined
const projection = (state: InterviewState) => ({
  state, blocked: false, onDraft: noop, onPlan: noop, onRetry: noopAnswer,
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
  const submission = {
    answers: [{ questionId: "current", data: { selectedOptionIds: ["option:1"] } }], displayText: "小范围",
  }
  assert.deepEqual(submittedInterviewAnswer(value, submission), {
    text: "小范围", answer: { type: "common_question", questionId: "current", surfaceSubmit: submission },
  })
  assert.throws(() => submittedInterviewAnswer(value, {
    answers: [{ questionId: "old", data: { selectedOptionIds: ["option:1"] } }], displayText: "小范围",
  }), /interview_answer_invalid/)
})

test("正式采访决策题保留推荐单选、follow_up 补充和一次 compound 提交", () => {
  const question = createCommonQuestionFromPanel({ id: "current", panel: {
    mode: "choice", prompt: "选择范围",
    options: [
      { id: "small", label: "小范围", description: "较快交付", recommended: true },
      { id: "all", label: "全范围", description: "覆盖完整", recommended: false },
    ],
    inputs: [{ id: "other", label: "其他补充", kind: "textarea", role: "follow_up",
      placeholder: "补充选项之外的约束或说明（可选）" }],
  } })
  const value = state({ revision: 2, sequence: 4,
    unresolved: [{ id: "current", revision: 2, question, status: "open", answerMessageId: null }],
    messages: [assistant("current", question)],
  })
  const timeline = projectInterviewTimeline(projection(value))
  assert.deepEqual(timeline.presentedSurface?.questions[0], {
    id: "current",
    type: "choice",
    data: {
      stem: "选择范围",
      options: [
        { id: "small", label: "小范围", subtitle: "较快交付", recommended: true },
        { id: "all", label: "全范围", subtitle: "覆盖完整", recommended: false },
      ],
      inputs: [{
        id: "other",
        label: "其他补充",
        kind: "textarea",
        role: "follow_up",
        placeholder: "补充选项之外的约束或说明（可选）",
      }],
    },
  })
  assert.deepEqual(submittedInterviewAnswer(value, {
    answers: [{ questionId: "current", data: {
      selectedOptionIds: ["small"],
      inputValues: { other: "只看公开在售商品" },
    } }],
    displayText: "选择范围\n小范围\n其他补充：只看公开在售商品",
  }), {
    text: "小范围\n其他补充：只看公开在售商品",
    answer: {
      type: "common_question", questionId: "current",
      surfaceSubmit: {
        answers: [{ questionId: "current", data: {
          selectedOptionIds: ["small"], inputValues: { other: "只看公开在售商品" },
        } }],
        displayText: "选择范围\n小范围\n其他补充：只看公开在售商品",
      },
    },
  })
})

test("补充文字不能绕过非法或过期的 choice option", () => {
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
  for (const [questionId, optionId] of [["old", "option:1"], ["current", "option:stale"]] as const) {
    assert.throws(() => submittedInterviewAnswer(value, {
      answers: [{ questionId, data: {
        selectedOptionIds: [optionId],
        inputValues: { other: "把这段补充当成答案" },
      } }],
      displayText: "补充文字",
    }), /interview_answer_invalid/)
  }
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
  }), {
    text: "100 个型号，名称与主图",
    answer: { type: "common_question", questionId: "current",
      surfaceSubmit: { answers: [{ questionId: "current", data: { text: " 100 个型号，名称与主图 " } }], displayText: "回答" } },
  })
})

test("公共 multi_choice 展示、多选提交与锁定历史共用同一 Surface", () => {
  const questionId = "multi-q", answerId = "multi-a"
  const question = createCommonChoiceQuestion({ id: questionId, type: "multi_choice", stem: "选择字段", options: [
    { id: "name", label: "名称" }, { id: "price", label: "价格" }, { id: "image", label: "图片" },
  ] })
  const active = state({ revision: 1, sequence: 2,
    unresolved: [{ id: questionId, revision: 1, question, status: "open", answerMessageId: null }],
    messages: [assistant(questionId, question)],
  })
  const timeline = projectInterviewTimeline(projection(active))
  assert.equal(timeline.presentedSurface?.questions[0]?.type, "multi_choice")
  assert.equal(timeline.activeInteraction?.questions[0]?.options.length, 3)
  const surfaceSubmit = { answers: [{ questionId, data: {
    selectedOptionIds: ["name", "price"],
  } }], displayText: "名称\n价格" }
  assert.deepEqual(submittedInterviewAnswer(active, surfaceSubmit), {
    text: surfaceSubmit.displayText,
    answer: { type: "common_question", questionId, surfaceSubmit },
  })

  const surface = createCommonQuestionSurface({ id: questionId, questions: [question], submitLabel: "提交回答" })
  const answered = state({ revision: 2, sequence: 4,
    unresolved: [{ id: questionId, revision: 1, question, status: "answered", answerMessageId: answerId }],
    decisions: [{ id: "decision-multi", revision: 2, kind: "option", text: surfaceSubmit.displayText,
      messageId: answerId, questionId, draftVersion: null, createdAt: "2026-09-11T00:00:00.000Z" }],
    messages: [assistant(questionId, question), {
      id: answerId, role: "user", text: surfaceSubmit.displayText, status: "complete", question: null,
      draftVersion: null, aiEvents: [], interactionReply: buildCommonSurfaceReplyPayload({ surface, submit: surfaceSubmit }),
    }],
  })
  const entry = projectInterviewTimeline(projection(answered)).turns.flatMap((turn) => turn.entries)
    .find((item) => item.value.kind === "answered-interaction")
  assert.deepEqual(entry?.value.kind === "answered-interaction"
    ? entry.value.interaction.surfaceSubmit : null, surfaceSubmit)
})

test("公共 Question builder 只把严格 answer 发送到采访命令", async () => {
  const question = createCommonQuestionFromPanel({ id: "current", panel: {
    mode: "choice", prompt: "选择范围",
    options: [
      { id: "1", label: "主流平台", description: "系统发现公开入口", recommended: true },
      { id: "2", label: "指定平台", description: "仅处理指定来源", recommended: false },
    ],
    inputs: [{ id: "other", label: "其他补充", kind: "textarea", role: "follow_up" }],
  } })
  const value = state({ revision: 1, sequence: 3,
    unresolved: [{ id: "current", revision: 1, question, status: "open", answerMessageId: null }],
    messages: [assistant("current", question)],
  })
  const submission = {
    answers: [{ questionId: "current", data: { selectedOptionIds: ["1"] } }],
    displayText: "主流平台",
  }
  const submitted = submittedInterviewAnswer(value, submission)
  const command = interviewCommandSchema.parse({
    type: "message", requestId: randomUUID(), expectedRevision: value.revision,
    text: submitted.text, answer: submitted.answer, ui: interviewAgentUI.capabilities,
  })
  let posted: unknown
  const connection = new InterviewConnection("task-a", async (_input, options) => {
    posted = JSON.parse(String(options?.body))
    return Response.json({ taskId: "task-a", state: value })
  })

  await connection.dispatch(command)

  assert.deepEqual((posted as { answer: unknown }).answer, submitted.answer)
  assert.equal("text" in (posted as { answer: object }).answer, false)
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

test("compound choice history 恢复原题、选项、补充和 interaction identity", () => {
  const question = { prompt: "选择范围", options: [
    { label: "小范围", description: "较快交付", recommended: true },
    { label: "全范围", description: "覆盖完整", recommended: false },
  ] }
  const surface = {
    id: "choice-q",
    submitLabel: "继续",
    questions: [{
      id: "choice-q",
      type: "choice",
      data: {
        stem: "选择范围",
        options: [
          { id: "option:1", label: "小范围", subtitle: "较快交付", recommended: true },
          { id: "option:2", label: "全范围", subtitle: "覆盖完整", recommended: false },
        ],
        inputs: [{
          id: "other",
          label: "其他补充",
          kind: "textarea",
          role: "follow_up",
          placeholder: "补充选项之外的约束或说明（可选）",
        }],
      },
    }],
  } as const
  const surfaceSubmit = {
    answers: [{ questionId: "choice-q", data: {
      selectedOptionIds: ["option:1"],
      inputValues: { other: "只看公开在售商品" },
    } }],
    displayText: "选择范围\n小范围\n其他补充：只看公开在售商品",
  }
  const value = state({ revision: 2, sequence: 4,
    unresolved: [{ id: "choice-q", revision: 1, question, status: "answered", answerMessageId: "choice-a" }],
    decisions: [{ id: "d1", revision: 2, kind: "option", text: "小范围\n其他补充：只看公开在售商品",
      messageId: "choice-a", questionId: "choice-q", draftVersion: null, createdAt: "2026-09-08T04:05:08.000Z" }],
    messages: [
      assistant("choice-q", question),
      { id: "choice-a", role: "user", text: "小范围\n其他补充：只看公开在售商品", status: "complete",
        question: null, draftVersion: null, aiEvents: [] },
    ],
  })
  Object.assign(value.messages[1]!, {
    interactionReply: { kind: "common_surface.submit", surfaceId: "choice-q", surface, surfaceSubmit },
  })
  const answered = projectInterviewTimeline(projection(value)).turns.flatMap((turn) => turn.entries)
    .find((entry) => entry.value.kind === "answered-interaction")
  assert.ok(answered?.value.kind === "answered-interaction")
  assert.equal(answered.value.interaction.interactionId, "choice-q")
  assert.deepEqual(answered.value.interaction.surface, surface)
  assert.deepEqual(answered.value.interaction.surfaceSubmit, surfaceSubmit)
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

test("同一 UI 注册同时提供 capability 与 Card renderer，有序 parts 保留正文卡片位置", () => {
  assert.deepEqual(interviewAgentUI.capabilities.packages, [{ id: "agent-platform.common-content", version: 1 }])
  const card = { id: "card-1", type: "content.callout", data: { variant: "highlight", body: "关键范围" } }
  assert.doesNotThrow(() => interviewAgentUI.cards.resolve(card))
  const value = state({ messages: [{ ...assistant("assistant-1"), text: "前文后文", parts: [
    { id: "text-1", type: "text", text: "前文" },
    { id: "card-1", type: "card", card },
    { id: "text-2", type: "text", text: "后文" },
  ] }] })
  const entries = projectInterviewEntries(projection(value))
  assert.deepEqual(entries.map((entry) => [entry.id, entry.value.kind]), [
    ["assistant-1", "message"],
    ["card-1", "card"],
    ["assistant-1:part:text-2", "message"],
  ])
  assert.equal(entries[1]?.value.kind === "card" ? entries[1].value.streaming : undefined, undefined)
})
