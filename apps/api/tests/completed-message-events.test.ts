import assert from "node:assert/strict"
import test from "node:test"
import { createPiAgentSessionAIEventBridge } from "@agent-platform/pi-agent-session"
import type { AIEvent } from "@agent-platform/ai-connect/server"
import { completedMessageEvents } from "../src/ai/completed-message-events.js"

test("原生 commentary partial 不污染完成正文，多轮工具消息仍按原生结束结果交接", async () => {
  const events: AIEvent[] = []
  const binding = { connectionId: "77667601-abef-4513-9b5a-800b353d25b6", modelId: "fixture", reasoningEffort: "medium",
    resolve: async () => ({ providerId: "fixture" }) }
  const bridge = createPiAgentSessionAIEventBridge({ invocationId: "fa0a0c05-00ab-4a49-8655-3e12dc16026b",
    binding: binding as never, onEvent: (event: AIEvent) => { events.push(event) } })
  await bridge.start()
  const accept = completedMessageEvents(bridge.onRuntimeEvent)
  const base = { eventId: "event", runId: "run", sequence: 1, timestamp: 1,
    source: { kind: "agent-runtime" as const, id: "pi-agent-session" }, itemId: "assistant-1" }
  await accept({ ...base, type: "assistant.message.delta", delta: "进度文字" })
  await accept({ ...base, type: "assistant.message.delta", delta: "正文一" })
  await accept({ ...base, type: "assistant.message.ended", stopReason: "toolUse", text: "正文一" })
  await accept({ ...base, itemId: "assistant-2", type: "assistant.message.ended", stopReason: "stop", text: "正文二" })
  await bridge.settle({ status: "completed", finishReason: "stop", outputText: "正文一正文二" })
  assert.equal(events.flatMap(event => event.type === "text.delta" ? [event.text] : []).join(""), "正文一正文二")
  assert.equal(events.at(-1)!.type, "generation.completed")
})
