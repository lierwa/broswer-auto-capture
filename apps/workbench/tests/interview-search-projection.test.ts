import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { emptyInterview } from "../src/interviewContract.js"
import { projectInterviewTimeline } from "../src/interviewTimelineProjection.js"

test("Pi 搜索工具的开始、结果引用和失败绑定同一条需求消息，刷新可重建", () => {
  const rawTail = "搜索原始结果末尾".repeat(80)
  const invocationId = "interview-search-projection"
  const model = { connectionId: "fixture", modelId: "fixture", reasoningEffort: "medium" as const }
  const extension = (sequence: number, name: string, payload: Record<string, unknown>) => parseAIEvent({
    type: "extension", invocationId, sequence, createdAt: sequence + 1,
    namespace: "agent-platform.pi-agent-session", name, version: 1, payload,
  })
  const state = structuredClone(emptyInterview)
  state.messages.push({ id: "assistant-search", role: "assistant", text: "已核对公开资料。", status: "complete",
    question: null, draftVersion: null, aiEvents: [
      parseAIEvent({ type: "generation.started", invocationId, sequence: 0, createdAt: 1, output: "text", model }),
      extension(1, "tool.execution.started", { type: "tool.execution.started", callId: "search-1",
        toolName: "web_search", input: { query: "Acme 官方资料" } }),
      extension(2, "tool.execution.completed", { type: "tool.execution.completed", callId: "search-1",
        toolName: "web_search", output: { content: [{ type: "text", text: `[Acme](https://acme.example/)\n[Guide][guide]\n[guide]: https://guide.example/acme\n${rawTail}` }],
          details: { queries: ["Acme 官方资料"], successfulQueries: 1 } } }),
      extension(3, "tool.execution.failed", { type: "tool.execution.failed", callId: "search-2",
        toolName: "search_sources" }),
      parseAIEvent({ type: "generation.completed", invocationId, sequence: 4, createdAt: 5,
        providerId: "fixture", modelId: "fixture", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }),
    ] })
  const project = () => projectInterviewTimeline({ state, blocked: false, onDraft: () => undefined,
    onPlan: () => undefined, onRetry: async () => undefined })
  const first = project().hooks.filter((hook) => hook.kind === "tool-progress")
  assert.deepEqual(first.map((hook) => hook.status), ["completed", "error"], "每次搜索调用只保留最新活动")
  assert.ok(first.every((hook) => hook.relatedMessageId === "assistant-search"))
  assert.equal(first[0]!.title, "搜索完成")
  assert.equal(first[0]!.description ?? "", "", "完整查询与来源留在详情中")
  assert.deepEqual(project().hooks.filter((hook) => hook.kind === "tool-progress"), first)
  const entries = project().turns.flatMap((turn) => turn.entries)
    .filter((entry) => entry.id.startsWith("assistant-search:search:"))
  assert.equal(entries.length, 2, "开始和完成属于同一条可见搜索记录，失败的另一次调用也保留")
  const html = entries.map((entry) => entry.value.kind === "content"
    ? renderToStaticMarkup(entry.value.content) : "").join("")
  assert.match(html, /data-interview-search-record="completed"/)
  assert.match(html, /data-interview-search-record="error"/)
  assert.match(html, /<details>/)
  assert.match(html, /Acme 官方资料/)
  assert.match(html, /https:\/\/acme\.example\//)
  assert.match(html, /https:\/\/guide\.example\/acme/)
  assert.match(html, /搜索原始结果末尾(?:搜索原始结果末尾){79}/, "折叠详情保留原始证据，不截断持久化结果")
  assert.deepEqual(project().turns.flatMap((turn) => turn.entries)
    .filter((entry) => entry.id.startsWith("assistant-search:search:")).map((entry) => entry.id), entries.map((entry) => entry.id))
})
