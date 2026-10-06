import type { createPiAgentSessionAIEventBridge } from "@agent-platform/pi-agent-session"

type Event = Parameters<ReturnType<typeof createPiAgentSessionAIEventBridge>["onRuntimeEvent"]>[0]

/** WHY：上游 Codex 的 partial text 可能尚无 commentary phase；原生 ended 才是可交接正文事实。 */
export function completedMessageEvents(consume: (event: Event) => Promise<void>) {
  return async (event: Event) => {
    if (event.type === "assistant.message.delta") return
    if (event.type === "assistant.message.ended" && event.stopReason !== "error" && event.stopReason !== "aborted" && event.text) {
      // TRADE-OFF：消息完成才展示正文；started/工具/推理等事件照常实时交付，不复制原生 Agent loop。
      const { text, stopReason: _stop, errorMessage: _error, ...envelope } = event
      await consume({ ...envelope, type: "assistant.message.delta", delta: text })
    }
    await consume(event)
  }
}
