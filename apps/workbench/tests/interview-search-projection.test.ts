import assert from "node:assert/strict"
import test from "node:test"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { emptyInterview } from "../src/interviewContract.js"
import { projectInterviewTimeline } from "../src/interviewTimelineProjection.js"

test("Pi 搜索工具的开始、结果引用和失败绑定同一条需求消息，刷新可重建", () => {
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
        toolName: "web_search", output: { content: [{ type: "text", text: "[Acme](https://acme.example/)\n[Guide][guide]\n[guide]: https://guide.example/acme" }],
          details: { queries: ["Acme 官方资料"], successfulQueries: 1 } } }),
      extension(3, "tool.execution.failed", { type: "tool.execution.failed", callId: "search-2",
        toolName: "search_sources" }),
      parseAIEvent({ type: "generation.completed", invocationId, sequence: 4, createdAt: 5,
        providerId: "fixture", modelId: "fixture", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }),
    ] })
  const project = () => projectInterviewTimeline({ state, blocked: false, onDraft: () => undefined,
    onPlan: () => undefined, onRetry: async () => undefined })
  const first = project().hooks.filter((hook) => hook.kind === "tool-progress")
  assert.deepEqual(first.map((hook) => hook.status), ["running", "completed", "error"])
  assert.ok(first.every((hook) => hook.relatedMessageId === "assistant-search"))
  assert.match(first[1]!.description ?? "", /https:\/\/acme\.example\//)
  assert.match(first[1]!.description ?? "", /https:\/\/guide\.example\/acme/)
  assert.deepEqual(project().hooks.filter((hook) => hook.kind === "tool-progress"), first)
})
