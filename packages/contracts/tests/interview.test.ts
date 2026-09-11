import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { createCommonChoiceQuestion, createCommonQuestionFromPanel, createCommonQuestionSurface } from "@agent-platform/ai-connect/integration/authoring/question"
import { authoredQuestionSchema, interviewCommandSchema, interviewOutputSchema, messageSchema, modelInterviewOutputSchema, questionSchema } from "../src/interview.js"
import { taskCommandSchema } from "../src/task.js"

const brief = {
  goal: "采集指定品牌官网产品", scope: "用户确认的品牌与官网产品范围",
  sourceStrategy: { mode: "discover" as const, scope: "查找并核验品牌官网", providedUrls: [] },
  deliverables: [{ entity: "产品", fields: ["名称", "链接"], coverage: "官网公开产品", limit: "完成可核验枚举" }],
  discoveryTasks: [], completionCriteria: ["结果保留来源链接"], constraints: [], proposedDefaults: [],
}
const genericMarkdown = "# 任务目标\n播放指定内容并定位到目标时间。\n\n# 可观察完成标准\n目标内容正在播放且当前位置为 180 秒。"

test("正式命令强制幂等键、修订及精确取消轮次，并保留用户原文", () => {
  const command = { type: "message", requestId: randomUUID(), expectedRevision: 0, text: "  原文\n" }
  assert.equal(interviewCommandSchema.parse(command).type, "message")
  assert.deepEqual(interviewCommandSchema.parse(command), command)
  assert.equal(interviewCommandSchema.safeParse({ ...command, requestId: undefined }).success, false)
  assert.equal(interviewCommandSchema.safeParse({ ...command, text: "  " }).success, false)
  assert.equal(interviewCommandSchema.safeParse({ type: "cancel" }).success, false)
  assert.equal(taskCommandSchema.safeParse({ type: "create" }).success, false)
})

test("负责人问题与可确认草稿互斥，建议不能自动成为决策", () => {
  const question = { prompt: "范围？", options: [{ label: "小", description: "少", recommended: true }, { label: "大", description: "多", recommended: false }] }
  assert.equal(interviewOutputSchema.safeParse({ assistantText: "请确认范围", question, draft: { title: "范围", markdown: "# 范围" } }).success, false)
  assert.equal(interviewOutputSchema.safeParse({ assistantText: "请确认范围", question, draft: null }).success, true)
})

test("开放事实问题保留自由回答，负责人取舍题使用二到三个选项和唯一推荐", () => {
  assert.equal(questionSchema.safeParse({ prompt: "希望采集哪个品牌？", options: [] }).success, true)
  const recommended = { label: "较小范围", description: "较快得到可审阅结果，但覆盖较少", recommended: true }
  const alternative = { label: "完整范围", description: "覆盖目标全集，但需要更长执行时间", recommended: false }
  assert.equal(questionSchema.safeParse({ prompt: "本轮采用哪种覆盖范围？", options: [recommended, alternative] }).success, true)
  assert.equal(questionSchema.safeParse({ prompt: "如何提供？", options: [recommended] }).success, false)
  assert.equal(questionSchema.safeParse({ prompt: "范围？", options: [recommended, { ...alternative, recommended: true }] }).success, false)
  assert.equal(questionSchema.safeParse({ prompt: "范围？", options: [{ ...recommended, recommended: false }, alternative] }).success, false)
  assert.equal(questionSchema.safeParse({ prompt: "范围？", options: [recommended, { ...alternative, description: "" }] }).success, false)
})

test("模型可只提交可靠问题或草稿，但完全空输出不能成为成功结果", () => {
  const openQuestion = createCommonQuestionFromPanel({ id: "question-1", panel: {
    mode: "free_form", prompt: "请提供要采集的品牌名称。", options: [],
  } })
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: openQuestion, draft: null }).success, true)
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: null, draft: { title: "采集范围", brief } }).success, true)
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: null,
    draft: { title: "媒体播放需求", markdown: genericMarkdown, brief: null },
  }).success, true)
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: null,
    draft: { title: "媒体播放需求", brief: null },
  }).success, false)
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: null,
    draft: { title: "采集范围", markdown: genericMarkdown, brief },
  }).success, false)
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: null, draft: null }).success, false)
})

test("新生成问题只接受公共 Question，历史读取 schema 保持兼容", () => {
  const legacy = { prompt: "选择范围", options: [
    { label: "同一范围", description: "方案一", recommended: true },
    { label: "同一范围", description: "方案二", recommended: false },
  ] }
  assert.equal(questionSchema.safeParse(legacy).success, true)
  assert.equal(authoredQuestionSchema.safeParse(legacy).success, false)
})

test("开放题答复使用 typed free-text，旧选择题命令仍解析为 typed choice", () => {
  const common = { type: "message" as const, requestId: randomUUID(), expectedRevision: 1 }
  const freeText = interviewCommandSchema.parse({ ...common, text: "海尔", answer: {
    type: "free_text", questionId: "question-1", text: "海尔",
  } })
  assert.equal(freeText.type, "message")
  if (freeText.type !== "message") throw new Error("message command expected")
  assert.deepEqual(freeText.answer, { type: "free_text", questionId: "question-1", text: "海尔" })
  const legacyChoice = interviewCommandSchema.parse({ ...common, text: "前 20 条", answer: {
    questionId: "question-2", label: "前 20 条",
  } })
  assert.equal(legacyChoice.type, "message")
  if (legacyChoice.type !== "message") throw new Error("message command expected")
  assert.deepEqual(legacyChoice.answer, { type: "choice", questionId: "question-2", label: "前 20 条" })
  assert.equal(interviewCommandSchema.safeParse({ ...common, text: "海尔", answer: {
    type: "free_text", questionId: "question-1", text: "  ",
  } }).success, false)
})

test("公共 Question、compound submit 与原 Surface reply 可按既有消息 envelope 往返", () => {
  const canonical = createCommonQuestionFromPanel({ id: "question-1", panel: {
    mode: "choice", prompt: "选择范围",
    options: [
      { id: "small", label: "小范围", description: "较快交付", recommended: true },
      { id: "all", label: "全范围", description: "覆盖完整", recommended: false },
    ],
    inputs: [{ id: "other", label: "其他补充", kind: "textarea", role: "follow_up" }],
  } })
  const surface = createCommonQuestionSurface({ id: "question-1", questions: [canonical], submitLabel: "提交回答" })
  const surfaceSubmit = { answers: [{ questionId: "question-1", data: {
    selectedOptionIds: ["small"], inputValues: { other: "只看公开在售商品" },
  } }], displayText: "小范围\n其他补充：只看公开在售商品" }
  const command = interviewCommandSchema.parse({
    type: "message", requestId: randomUUID(), expectedRevision: 1,
    text: "小范围\n其他补充：只看公开在售商品",
    answer: { type: "common_question", questionId: "question-1", surfaceSubmit },
  })
  assert.equal(command.type, "message")
  const persisted = messageSchema.parse({
    id: "answer-1", role: "user", text: surfaceSubmit.displayText, status: "complete",
    question: null, draftVersion: null, aiEvents: [],
    interactionReply: { kind: "common_surface.submit", surfaceId: surface.id, surface, surfaceSubmit },
  })
  assert.deepEqual(persisted.interactionReply?.surface, surface)
  assert.deepEqual(persisted.interactionReply?.surfaceSubmit, surfaceSubmit)
})

test("公共 multi_choice Question 与多选答案可按既有 envelope 往返", () => {
  const question = createCommonChoiceQuestion({ id: "question-multi", type: "multi_choice", stem: "选择字段", options: [
    { id: "name", label: "名称" }, { id: "price", label: "价格" }, { id: "image", label: "图片" },
  ] })
  assert.deepEqual(authoredQuestionSchema.parse(question), question)
  const surface = createCommonQuestionSurface({ id: question.id, questions: [question], submitLabel: "提交回答" })
  const surfaceSubmit = { answers: [{ questionId: question.id, data: {
    selectedOptionIds: ["name", "price"],
  } }], displayText: "名称\n价格" }
  const persisted = messageSchema.parse({
    id: "answer-multi", role: "user", text: surfaceSubmit.displayText, status: "complete",
    question: null, draftVersion: null, aiEvents: [], interactionReply: {
      kind: "common_surface.submit", surfaceId: surface.id, surface, surfaceSubmit,
    },
  })
  assert.deepEqual(persisted.interactionReply?.surface.questions[0], question)
  assert.deepEqual(persisted.interactionReply?.surfaceSubmit, surfaceSubmit)
})

test("模型命令携带严格 UI capability，确认命令不携带模型展示能力", () => {
  const ui = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const command = { type: "message" as const, requestId: randomUUID(), expectedRevision: 0, text: "整理范围", ui }
  const parsed = interviewCommandSchema.parse(command)
  assert.equal(parsed.type, "message")
  if (parsed.type !== "message") throw new Error("message command expected")
  assert.deepEqual(parsed.ui, ui)
  assert.equal(interviewCommandSchema.safeParse({ ...command, ui: {
    schemaVersion: 1, packages: [CommonContentUIProtocol, CommonContentUIProtocol],
  } }).success, false)
  assert.equal(interviewCommandSchema.safeParse({
    type: "confirm", requestId: randomUUID(), expectedRevision: 1, version: 1, ui,
  }).success, false)
})

test("消息可持久化有序正文与 typed Card，旧消息仍可读取", () => {
  const legacy = messageSchema.parse({
    id: "legacy", role: "assistant", text: "旧正文", status: "complete",
    question: null, draftVersion: null, aiEvents: [],
  })
  assert.equal(legacy.parts, undefined)
  const message = messageSchema.parse({ ...legacy, parts: [
    { id: "text-1", type: "text", text: "前文" },
    { id: "card-1", type: "card", card: {
      id: "card-1", type: "content.callout", data: { variant: "highlight", body: "重点" },
    } },
    { id: "text-2", type: "text", text: "后文" },
  ] })
  assert.deepEqual(message.parts?.map((part) => part.type), ["text", "card", "text"])
})
