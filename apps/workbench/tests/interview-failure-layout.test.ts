import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { emptyInterview } from "@browser-capture/contracts/interview"
import { projectInterviewEntries } from "../src/interviewTimelineProjection.js"

function failureEntries(blocked: boolean, historical = false) {
  const state = structuredClone(emptyInterview)
  state.messages = [{ id: "failed", role: "assistant", text: "本轮无法提交。", status: "failed",
    question: null, draftVersion: null, aiEvents: [] }]
  if (historical) state.messages.push({ ...state.messages[0]!, id: "next", status: "complete", text: "后续已完成。" })
  return projectInterviewEntries({ state, blocked, onDraft() {}, onPlan() {}, async onRetry() {} })
}

function failureMarkup(blocked = false, historical = false) {
  return failureEntries(blocked, historical).filter((entry) => entry.value.kind === "content")
    .map((entry) => entry.value.kind === "content" ? renderToStaticMarkup(createElement("div", {}, entry.value.content)) : "").join("")
}

// WHY：失败提示与重试必须属于同轮状态，不再分成共享尾部孤立图标和全局红条。
test("最新失败轮次生成同组状态与有文字的重试操作", () => {
  const html = failureMarkup()
  assert.match(html, /class="interview-turn-failure"/)
  assert.match(html, /本轮未提交/)
  assert.match(html, /重试本轮/)
  assert.match(html, /role="alert"/)
})

test("重试受互斥状态限制；历史失败只显示事实，不提供旧轮次重试", () => {
  assert.match(failureMarkup(true), /disabled=""/)
  const historical = failureMarkup(false, true)
  assert.match(historical, /本轮未提交/)
  assert.doesNotMatch(historical, /重试本轮|role="alert"/)
})
