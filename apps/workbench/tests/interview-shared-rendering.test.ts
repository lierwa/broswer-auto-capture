import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { InteractiveTimeline } from "@agent-platform/ai-connect-react/chat"
import { emptyInterview } from "../src/interviewContract.js"
import { interviewQuestionRegistry, projectInterviewTimeline } from "../src/interviewTimelineProjection.js"

const commands = {
  send: async () => undefined,
  submit: async () => undefined,
  retry: async () => undefined,
  stop: async () => undefined,
}

test("共享题板实际渲染一个题干", () => {
  const state = structuredClone(emptyInterview)
  const question = { prompt: "选择处理范围", options: [
    { label: "仅公开页面", description: "无需登录", recommended: true },
    { label: "全部页面", description: "可能需要登录", recommended: false },
  ] }
  state.messages.push({ id: "question-1", role: "assistant", text: "请确认。", status: "complete",
    question, draftVersion: null, aiEvents: [] })
  state.unresolved.push({ id: "question-1", revision: 0, question, status: "open", answerMessageId: null })
  const value = projectInterviewTimeline({ state, blocked: false, onDraft: () => undefined,
    onPlan: () => undefined, onRetry: commands.retry })
  const html = renderToStaticMarkup(createElement(InteractiveTimeline, {
    resetKey: "question-render", value, commands, composition: { questions: interviewQuestionRegistry },
  }))
  assert.equal(html.split("选择处理范围").length - 1, 1)
  assert.doesNotMatch(html, /其他补充/, "可选补充不默认占用一个大框")
})

test("失败轮次只显示共享重试入口", () => {
  const state = structuredClone(emptyInterview)
  state.messages.push({ id: "user-1", role: "user", text: "整理资料", status: "complete",
    question: null, draftVersion: null, aiEvents: [] })
  state.messages.push({ id: "assistant-1", role: "assistant", text: "", status: "failed",
    question: null, draftVersion: null, aiEvents: [] })
  state.turns.push({ id: "turn-1", revision: 1, userMessageId: "user-1", assistantMessageId: "assistant-1",
    status: "failed", reason: "模型调用失败", createdAt: "2026-09-27T00:00:00.000Z",
    completedAt: "2026-09-27T00:00:01.000Z" })
  const value = projectInterviewTimeline({ state, blocked: false, onDraft: () => undefined,
    onPlan: () => undefined, onRetry: commands.retry })
  const html = renderToStaticMarkup(createElement(InteractiveTimeline, {
    resetKey: "failure-render", value, commands, composition: { questions: interviewQuestionRegistry },
  }))
  assert.equal(html.split('aria-label="重试消息"').length - 1, 1)
  assert.doesNotMatch(html, /重新提交本轮/)
})
