import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { authoredQuestionSchema, interviewCommandSchema, interviewOutputSchema, modelInterviewOutputSchema, questionSchema } from "../src/interview.js"
import { taskCommandSchema } from "../src/task.js"

const brief = {
  goal: "采集指定品牌官网产品", scope: "用户确认的品牌与官网产品范围",
  sourceStrategy: { mode: "discover" as const, scope: "查找并核验品牌官网", providedUrls: [] },
  deliverables: [{ entity: "产品", fields: ["名称", "链接"], coverage: "官网公开产品", limit: "完成可核验枚举" }],
  discoveryTasks: [], completionCriteria: ["结果保留来源链接"], constraints: [], proposedDefaults: [],
}

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
  const openQuestion = { prompt: "请提供要采集的品牌名称。", options: [] }
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: openQuestion, draft: null }).success, true)
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: null, draft: { title: "采集范围", brief } }).success, true)
  assert.equal(modelInterviewOutputSchema.safeParse({ assistantText: "", question: null, draft: null }).success, false)
})

test("新生成选择题拒绝重复 label，历史读取 schema 保持兼容", () => {
  const legacy = { prompt: "选择范围", options: [
    { label: "同一范围", description: "方案一", recommended: true },
    { label: "同一范围", description: "方案二", recommended: false },
  ] }
  assert.equal(questionSchema.safeParse(legacy).success, true)
  assert.throws(() => authoredQuestionSchema.parse(legacy), /选项名称必须唯一/)
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
