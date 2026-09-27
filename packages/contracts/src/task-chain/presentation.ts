import { z } from "zod"
import { contractVersionSchema, digestSchema, keySchema, textSchema, versionReferenceSchema } from "./common.js"

export const chainStageExitSchema = z.object({
  id: keySchema, label: textSchema, sourceNodeId: keySchema, sourcePort: keySchema,
}).strict()

export const chainStageSchema = z.object({
  id: keySchema, title: textSchema, summary: textSchema,
  nodeIds: z.array(keySchema).min(1).max(500), entryNodeId: keySchema,
  exits: z.array(chainStageExitSchema).max(500),
}).strict().superRefine((stage, context) => {
  if (new Set(stage.nodeIds).size !== stage.nodeIds.length) {
    context.addIssue({ code: "custom", message: "stage_node_duplicate" })
  }
  if (!stage.nodeIds.includes(stage.entryNodeId)) {
    context.addIssue({ code: "custom", message: "stage_entry_missing" })
  }
  if (new Set(stage.exits.map((exit) => exit.id)).size !== stage.exits.length) {
    context.addIssue({ code: "custom", message: "stage_exit_duplicate" })
  }
})

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
export const chainOverviewLayoutSchema = z.array(z.object({ stageId: keySchema }).extend(pointSchema.shape).strict()).max(500)
export const chainFocusLayoutSchema = z.object({
  stageId: keySchema,
  nodes: z.array(z.object({ nodeId: keySchema }).extend(pointSchema.shape).strict()).max(500),
}).strict()

export const chainPresentationContentSchema = z.object({
  stages: z.array(chainStageSchema).max(500),
  overviewLayout: chainOverviewLayoutSchema,
  focusLayouts: z.array(chainFocusLayoutSchema).max(500),
}).strict()

export const chainPresentationSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("chain_presentation"),
  chain: versionReferenceSchema, descriptorRegistryVersion: textSchema,
  ...chainPresentationContentSchema.shape,
  presentationDigest: digestSchema,
}).strict().superRefine((presentation, context) => {
  const stageIds = presentation.stages.map((stage) => stage.id)
  if (new Set(stageIds).size !== stageIds.length) context.addIssue({ code: "custom", message: "stage_identity" })
  const overviewIds = presentation.overviewLayout.map((item) => item.stageId)
  if (new Set(overviewIds).size !== overviewIds.length) context.addIssue({ code: "custom", message: "overview_layout_duplicate" })
  const focusIds = presentation.focusLayouts.map((item) => item.stageId)
  if (new Set(focusIds).size !== focusIds.length) context.addIssue({ code: "custom", message: "focus_layout_duplicate" })
})

export type ChainStage = z.infer<typeof chainStageSchema>
export type ChainPresentationContent = z.infer<typeof chainPresentationContentSchema>
export type ChainPresentation = z.infer<typeof chainPresentationSchema>

// WHY：当前图和历史事件都使用同一动作名称，避免旧运行与当前图对同一动作给出不同文案。
const browserActionTitles: Record<string, string> = {
  navigate: "打开页面", input: "输入内容", click: "点击目标", wait: "等待条件满足", scroll: "滚动页面",
  go_back: "返回上一页", switch: "切换页面", close: "关闭页面", send_keys: "发送按键",
  upload_file: "上传文件", select_dropdown: "选择选项", drag_drop: "拖放目标",
  dropdown_options: "读取选项", bat_scroll_to: "滚动到目标", bat_wait_for: "等待目标就绪",
}

export function browserActionTitle(action: string): string | undefined { return browserActionTitles[action] }
