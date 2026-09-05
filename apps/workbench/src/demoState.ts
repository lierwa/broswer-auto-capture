export type DemoStage = "draft" | "confirmed" | "queued" | "running" | "paused" | "complete"
export interface DemoMessage { role: "user" | "assistant"; text: string }
export interface DemoState {
  requirement: string
  stage: DemoStage
  revision: number
  planRevision: number | null
  messages: DemoMessage[]
}
export type DemoAction =
  | { type: "edit_requirement"; requirement: string }
  | { type: "load_example" }
  | { type: "reset" }
  | { type: "confirm_plan" }
  | { type: "queue_demo" }
  | { type: "start_demo" }
  | { type: "pause_demo" }
  | { type: "resume_demo" }
  | { type: "complete_demo" }

export const exampleRequirement = "采集指定品牌旗舰店可枚举的冰箱商品；保留型号、原始参数和来源链接，每个商品按页面默认排序读取最多 100 条评价。"
export const initialDemoState: DemoState = {
  requirement: "", stage: "draft", revision: 0, planRevision: null, messages: [],
}
export function isExecuting(stage: DemoStage) {
  return stage === "queued" || stage === "running" || stage === "paused"
}
const validTransitions: Partial<Record<DemoStage, Partial<Record<DemoAction["type"], DemoStage>>>> = {
  draft: { confirm_plan: "confirmed" },
  confirmed: { queue_demo: "queued" },
  queued: { start_demo: "running" },
  running: { pause_demo: "paused", complete_demo: "complete" },
  paused: { resume_demo: "running" },
}
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "reset") return isExecuting(state.stage) ? state : initialDemoState
  if (action.type === "load_example") {
    if (state.messages.length || isExecuting(state.stage)) return state
    return {
      requirement: exampleRequirement, stage: "draft", revision: 1, planRevision: 1,
      messages: [
        { role: "user", text: exampleRequirement },
        { role: "assistant", text: "已载入预设的冰箱采集示例。请核对计划中的来源、采集字段和完成条件；确认后可以体验排队、暂停和结果查看。示例没有绑定真实店铺。" },
      ],
    }
  }
  if (action.type === "edit_requirement") {
    const requirement = action.requirement.trim()
    if (!requirement || requirement.length > 4000 || isExecuting(state.stage)) return state
    // WHY：自由文本没有经过模型生成与校验，必须移除旧计划，不能按关键词套用演示方案。
    return {
      requirement, stage: "draft", revision: state.revision + 1, planRevision: null,
      messages: [...state.messages,
        { role: "user", text: requirement },
        { role: "assistant", text: "已记录这次需求，当前计划等待重新生成。本页尚未接入真实模型，不会把固定示例当作你的采集方案。" },
      ],
    }
  }
  if (state.planRevision === null || state.planRevision !== state.revision) return state
  const nextStage = validTransitions[state.stage]?.[action.type]
  return nextStage ? { ...state, stage: nextStage } : state
}
