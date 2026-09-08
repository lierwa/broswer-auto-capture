import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { interviewStateSchema } from "../src/interviewContract.js"
import { interviewErrorMessage, projectInterviewMessages } from "../src/ChatTimeline.js"

const noop = () => undefined
const noopAnswer = async () => undefined

test("需求消息完整保留业务正文，并按消息顺序附加问题、草稿和确认卡", () => {
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
  const messages = projectInterviewMessages({ state, blocked: false, onDraft: noop, onAnswer: noopAnswer, onSources: noop, onRetry: noopAnswer })
  assert.deepEqual(messages.map((message) => [message.id, message.role]), [["user-1", "user"], ["assistant-1", "assistant"]])
  assert.deepEqual(messages.map((message) => message.createdAt), [Date.parse("2026-09-08T04:05:06.000Z"), Date.parse("2026-09-08T04:05:06.000Z")])
  const assistant = messages[1]!
  assert.ok(Array.isArray(assistant.content))
  const parts = assistant.content as Exclude<typeof assistant.content, string>
  assert.equal(parts[0]?.type, "text")
  assert.equal(parts[0]?.type === "text" ? parts[0].text : "", "已整理范围，并保留示例 {\"model\":\"catalog\"}。")
  const html = parts.filter((part) => part.type === "content").map((part) => renderToStaticMarkup(part.content)).join("")
  assert.match(html, /优先哪个范围/)
  assert.match(html, /验收需求/)
  assert.match(html, /需求 v1 已确认/)
})

test("历史问题只读，只有最后一个未阻塞问题可以回答", () => {
  const message = (id: string) => ({ id, role: "assistant" as const, text: "请选择。", status: "complete" as const,
    question: { prompt: `${id}问题`, options: [
      { label: "方案一", description: "第一种", recommended: true },
      { label: "方案二", description: "第二种", recommended: false },
    ] }, draftVersion: null, aiEvents: [] })
  const state = interviewStateSchema.parse({ revision: 2, sequence: 4, activeTurnId: null, cancellationRequested: false,
    active: false, confirmedVersion: null, audits: [], turns: [], decisions: [], unresolved: [], drafts: [],
    messages: [message("old"), message("current")] })
  const messages = projectInterviewMessages({ state, blocked: false, onDraft: noop, onAnswer: noopAnswer, onSources: noop, onRetry: noopAnswer })
  assert.deepEqual(messages.map((entry) => entry.createdAt), [0, 1])
  const html = messages.map((entry) => {
    if (typeof entry.content === "string") return entry.content
    return entry.content.filter((part) => part.type === "content").map((part) => renderToStaticMarkup(part.content)).join("")
  })
  assert.match(html[0]!, /disabled/)
  assert.doesNotMatch(html[1]!, /disabled/)
})

test("当前开放问题不重复提示输入位置，历史问题仍标明只读", () => {
  const message = (id: string) => ({ id, role: "assistant" as const, text: "请补充范围。", status: "complete" as const,
    question: { prompt: `${id}范围是什么？`, options: [] }, draftVersion: null, aiEvents: [] })
  const state = interviewStateSchema.parse({ revision: 2, sequence: 4, activeTurnId: null, cancellationRequested: false,
    active: false, confirmedVersion: null, audits: [], turns: [], decisions: [], unresolved: [], drafts: [],
    messages: [message("old"), message("current")] })
  const projected = projectInterviewMessages({ state, blocked: false, onDraft: noop, onAnswer: noopAnswer,
    onSources: noop, onRetry: noopAnswer })
  const html = projected.map((entry) => Array.isArray(entry.content)
    ? entry.content.filter((part) => part.type === "content").map((part) => renderToStaticMarkup(part.content)).join("")
    : "")
  assert.match(html[0]!, /这是历史问题，仅供查阅/)
  assert.doesNotMatch(html[1]!, /直接在下方回答|decision-hint/)
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
  const messages = projectInterviewMessages({ state, blocked: false, onDraft: noop, onAnswer: noopAnswer,
    onSources: noop, onRetry: noopAnswer })
  const content = messages[1]!.content
  assert.ok(Array.isArray(content))
  const html = content.filter((part) => part.type === "content")
    .map((part) => renderToStaticMarkup(part.content)).join("")
  assert.equal(interviewErrorMessage(state.messages[1]), undefined)
  assert.doesNotMatch(html, /正在生成结构结果/)
  assert.doesNotMatch(html, /model|low|data-ai-invocation-status/)
  assert.match(html, /重新提交本轮/)
})
