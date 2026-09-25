import { z } from "zod"
import {
  capabilityDescriptorSchema, type CapabilityDescriptor, type ChainRevisionOperation, type TaskChain,
} from "@browser-capture/contracts"
import { dataCapabilityConfigSchema } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import { hybridTargetSchema } from "../upstream-browser/hybrid-schema.js"

export const CAPABILITY_DESCRIPTOR_REGISTRY_VERSION = "bat-capability-descriptors/v1"

const actions = ["navigate", "go_back", "wait", "click", "input", "scroll", "send_keys",
  "dropdown_options", "select_dropdown", "bat_scroll_to", "bat_wait_for"] as const
const actionOptions = actions.map((value) => ({ value, label: value }))
const resultPorts: CapabilityDescriptor["ports"] = [
  { name: "success", role: "primary", label: "完成" },
  { name: "missing", role: "decision", label: "目标缺失" },
  { name: "timeout", role: "exception", label: "超时" },
  { name: "blocked", role: "exception", label: "受阻" },
  { name: "human_required", role: "decision", label: "等待人工" },
  { name: "failed", role: "exception", label: "失败" },
  { name: "cancelled", role: "exception", label: "已取消" },
]
const descriptor = (value: CapabilityDescriptor) => capabilityDescriptorSchema.parse(value)

const registry = [
  descriptor({ capability: { name: "browser.workflow-step", version: 2 }, descriptorVersion: 1,
    family: "browser", displayName: "浏览器动作", summary: "在当前页面执行一个已验证动作并检查后置条件。",
    editableFields: [{ path: "config.actionName", label: "动作", control: "select", required: true,
      options: actionOptions }, { path: "config.target", label: "浏览器目标", control: "browser_target", required: false }],
    targetMode: "live_browser_picker", ports: resultPorts,
    replacements: [{ name: "browser.workflow-step", version: 2, label: "浏览器动作" }],
    validationScope: "node_and_downstream" }),
  descriptor({ capability: { name: "browser.read-fields", version: 2 }, descriptorVersion: 1,
    family: "browser", displayName: "读取页面字段", summary: "按已验证读取规格提取页面数据。",
    editableFields: [], targetMode: "saved_browser_target", ports: resultPorts, replacements: [],
    validationScope: "node_and_downstream" }),
  descriptor({ capability: { name: "browser.target-readiness", version: 1 }, descriptorVersion: 1,
    family: "browser", displayName: "检查目标就绪", summary: "检查后续动作的浏览器目标是否可用。",
    editableFields: [{ path: "config.actionName", label: "后续动作", control: "select", required: true,
      options: actionOptions.filter((item) => ["click", "input", "dropdown_options", "select_dropdown"].includes(item.value)) },
    { path: "config.target", label: "浏览器目标", control: "browser_target", required: true }],
    targetMode: "live_browser_picker", ports: resultPorts, replacements: [], validationScope: "node_and_downstream" }),
  descriptor({ capability: { name: "browser.perform", version: 1 }, descriptorVersion: 1,
    family: "browser", displayName: "浏览器动作", summary: "执行通用浏览器操作或观察页面。",
    editableFields: [{ path: "config.operation", label: "动作", control: "select", required: false,
      options: actionOptions }, { path: "config.target", label: "浏览器目标", control: "browser_target", required: false }],
    targetMode: "live_browser_picker", ports: resultPorts,
    replacements: [{ name: "browser.perform", version: 1, label: "浏览器动作" }],
    validationScope: "node_and_downstream" }),
  descriptor({ capability: { name: "data.transform", version: 1 }, descriptorVersion: 1,
    family: "data", displayName: "转换数据", summary: "使用确定性数据操作生成下游值。",
    editableFields: [{ path: "config.operation", label: "转换方式", control: "select", required: true,
      options: ["extract", "assign", "transform", "filter", "map", "deduplicate", "sort", "merge", "count"]
        .map((value) => ({ value, label: value })) }], targetMode: "none", ports: resultPorts,
    replacements: [{ name: "data.transform", version: 1, label: "转换数据" }], validationScope: "node_and_downstream" }),
] as const

const configs = new Map<string, (value: unknown) => void>()
configs.set("browser.workflow-step@2", (value) => { z.object({ actionName: z.enum(actions), target: hybridTargetSchema.nullable(),
  postconditions: z.array(z.json()).min(1) }).passthrough().parse(value) })
configs.set("browser.read-fields@2", (value) => { z.object({ specification: z.json() }).passthrough().parse(value) })
configs.set("browser.target-readiness@1", (value) => { z.object({
  actionName: z.enum(["click", "input", "dropdown_options", "select_dropdown"]), target: hybridTargetSchema,
}).passthrough().parse(value) })
configs.set("browser.perform@1", (value) => { z.object({ mode: z.enum(["perform", "human"]),
  operation: z.string().nullable().optional(), target: hybridTargetSchema.nullable().optional() }).passthrough().parse(value) })
configs.set("data.transform@1", (value) => { dataCapabilityConfigSchema.parse(value) })

export function capabilityDescriptors() { return registry.map((item) => structuredClone(item)) }

export function capabilityDescriptor(name: string, version: number) {
  return registry.find((item) => item.capability.name === name && item.capability.version === version) ?? null
}

export function replaceCapability(chain: TaskChain,
  operation: Extract<ChainRevisionOperation, { type: "replace_capability" }>) {
  const node = chain.nodes.find((item) => item.id === operation.nodeId)
  if (!node) throw new DomainError("chain_node_not_found", "节点不存在。", 404)
  if (node.kind !== "capability") throw new DomainError("chain_node_not_capability", "当前节点不是可替换的 capability。", 409)
  const current = capabilityDescriptor(node.capability.name, node.capability.version)
  const next = capabilityDescriptor(operation.capability.name, operation.capability.version)
  if (!current || !next) throw new DomainError("capability_descriptor_missing", "当前动作没有可编辑 descriptor，只能读取。", 409)
  const allowed = current.replacements.some((item) => item.name === operation.capability.name
    && item.version === operation.capability.version)
  if (!allowed) throw new DomainError("capability_replacement_unsupported", "这两个动作不能直接替换。", 409)
  configs.get(`${operation.capability.name}@${operation.capability.version}`)?.(operation.config)
  return { ...node, capability: operation.capability, config: operation.config }
}
