import { reduceAIEventSequence } from "@agent-platform/ai-connect/browser"
import { AIInvocationTimeline } from "@agent-platform/ai-connect-react/components/AIInvocationTimeline"
import type { AIEvent } from "@browser-capture/contracts/ai"

export function InvocationEvents({ events }: { events: readonly AIEvent[] }) {
  if (!events.length) return null
  // WHY：每个业务 audit 可恢复自己的完整事件序列；按 invocation 隔离后交给公共 reducer，不能拼接不同调用。
  return <>{reduceAIEventSequence(events).map((invocation) =>
    <AIInvocationTimeline key={invocation[0]!.invocationId} events={invocation} emptyTitle="暂无模型调用" />)}</>
}
