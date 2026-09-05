import { currentDraft, interviewStateSchema, type InterviewState } from "@browser-capture/contracts/interview"

export function validateState(input: InterviewState) {
  const state = interviewStateSchema.parse(input)
  if (state.active !== Boolean(state.activeTurnId)) throw new Error("轮次活动状态不一致")
  if (new Set(state.messages.map((item) => item.id)).size !== state.messages.length) throw new Error("消息标识重复")
  const active = state.turns.filter((turn) => ["running", "cancelling"].includes(turn.status))
  if (active.length !== Number(state.active) || (state.active && active[0]?.id !== state.activeTurnId)) throw new Error("活动轮次归属错误")
  if (state.confirmedVersion !== null && (state.active || currentDraft(state)?.version !== state.confirmedVersion)) throw new Error("确认必须绑定当前有效草稿")
  for (const turn of state.turns) {
    if (!state.messages.some((message) => message.id === turn.userMessageId && message.role === "user")) throw new Error("轮次缺少用户原文")
    if (!state.messages.some((message) => message.id === turn.assistantMessageId && message.role === "assistant")) throw new Error("轮次缺少助手消息")
  }
  return state
}
