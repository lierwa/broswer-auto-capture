export type DemoStage = "draft" | "confirmed" | "queued" | "running" | "paused" | "complete"

export interface DemoState {
  requirement: string
  stage: DemoStage
}

export type DemoAction =
  | { type: "edit_requirement"; requirement: string }
  | { type: "confirm_plan" }
  | { type: "queue_demo" }
  | { type: "start_demo" }
  | { type: "pause_demo" }
  | { type: "resume_demo" }
  | { type: "complete_demo" }

export const initialDemoState: DemoState = {
  requirement: "采集指定品牌旗舰店可枚举的冰箱商品；每个商品保留原始参数、来源页面及页面默认排序下最多 100 条评价。",
  stage: "draft",
}

const validTransitions: Partial<Record<DemoStage, Partial<Record<DemoAction["type"], DemoStage>>>> = {
  draft: { confirm_plan: "confirmed" },
  confirmed: { queue_demo: "queued" },
  queued: { start_demo: "running" },
  running: { pause_demo: "paused", complete_demo: "complete" },
  paused: { resume_demo: "running" },
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "edit_requirement") {
    return { requirement: action.requirement, stage: "draft" }
  }

  const nextStage = validTransitions[state.stage]?.[action.type]
  return nextStage ? { ...state, stage: nextStage } : state
}
