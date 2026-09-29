import { z } from "zod"
import { contractVersionSchema, digestSchema, keySchema, textSchema, versionReferenceSchema } from "./common.js"
import type { ChainNode } from "./node.js"

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

/** WHY：展示标题只读取已冻结的动作、绑定和目标摘要；不能在 React 渲染时猜 URL 业务语义或解析 Function 源码。 */
export function chainNodeDisplayTitle(node: ChainNode): string {
  if (node.kind === "terminal") return node.label
  if (node.label !== node.id) return node.label
  if (node.kind === "capability" && node.capability.name === "browser.read-fields") {
    return readFieldsTitle(node.config)
  }
  const action = workflowAction(node)
  if (action) return workflowActionTitle(node, action)
  if (node.kind === "function") return "按输入确定下一步"
  if (node.kind === "capability") return node.capability.name.startsWith("browser.") ? "执行浏览器能力" : "处理数据"
  return ({ branch: "判断后续路径", loop: "重复处理输入", llm: "执行显式模型步骤", invoke: "调用子链路",
    browser: "执行浏览器动作", observe: "读取现场", data: "处理数据", condition: "判断条件", human: "等待人工处理",
    checkpoint: "保存检查点", emit: "生成任务输出" } as Partial<Record<ChainNode["kind"], string>>)[node.kind] ?? node.kind
}

function workflowAction(node: ChainNode) {
  if (node.kind === "browser") return node.operation
  if (node.kind !== "capability" || node.capability.name !== "browser.workflow-step" || !isRecord(node.config)) return null
  return typeof node.config.actionName === "string" ? node.config.actionName : null
}

function workflowActionTitle(node: ChainNode, action: string) {
  if (node.kind === "browser") return browserActionTitle(action) ?? action
  if (node.kind !== "capability" || !isRecord(node.config)) return browserActionTitle(action) ?? action
  const input = node.input
  const target = isRecord(node.config.target) ? node.config.target : null
  const targetName = targetSummary(target)
  if (action === "navigate") {
    const url = constantBinding(input.url)
    if (typeof url !== "string") return "打开读取到的页面"
    try { return `打开 ${new URL(url).hostname}` } catch { return "打开指定页面" }
  }
  if (action === "input") return targetName ? `在 ${targetName} 中输入内容` : "输入内容"
  if (action === "send_keys") {
    const keys = constantBinding(input.keys)
    return typeof keys === "string" && keys.length <= 40 ? `发送按键：${keys}` : "发送按键"
  }
  if (action === "click") {
    const candidate = isRecord(input.targetOrdinal) && input.targetOrdinal.source === "node"
    if (candidate) return targetName ? `点击候选：${targetName}` : "点击读取到的候选"
    return targetName ? `点击：${targetName}` : "点击目标"
  }
  const base = browserActionTitle(action) ?? action
  return targetName ? `${base}：${targetName}` : base
}

function readFieldsTitle(config: unknown) {
  if (!isRecord(config) || !isRecord(config.specification)) return "读取页面字段"
  const specification = config.specification
  const fields = isRecord(specification.fields) ? Object.keys(specification.fields) : []
  const businessFields = fields.filter((name) => name !== "text" && name !== "ordinal" && !name.startsWith("attribute_"))
  if (businessFields.length) return `读取字段：${businessFields.slice(0, 4).join("、")}`
  const target = typeof specification.container === "string" ? selectorSummary(specification.container) : null
  return target ? `读取：${target}` : "读取页面字段"
}

function targetSummary(target: Record<string, unknown> | null) {
  if (!target) return null
  const items = isRecord(target.items) && typeof target.items.value === "string" ? selectorSummary(target.items.value) : null
  const within = isRecord(target.withinItem) && typeof target.withinItem.value === "string"
    ? selectorSummary(target.withinItem.value) : null
  return within ?? items
}

function selectorSummary(selector: string) {
  const attributes = [...selector.matchAll(/\[(aria-label|data-testid|rel|role|href)\s*(?:\*?=)\s*["']([^"']+)["']\]/g)]
  const preferred = [...attributes].reverse().find((match) => match[1] === "aria-label") ?? attributes.at(-1)
  if (preferred?.[2]) return preferred[2].slice(0, 80)
  const tag = /(?:^|[\s>+~])([a-z][a-z0-9-]*)[^\s>+~]*$/i.exec(selector)?.[1]
  return tag ? `${tag} 元素` : null
}

function constantBinding(binding: unknown) {
  return isRecord(binding) && binding.source === "constant" ? binding.value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}
