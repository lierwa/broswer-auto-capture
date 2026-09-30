import {
  browserActionTitle, chainNodeDisplayTitle, nodeBindings,
  type ChainNode, type ValueBinding,
} from "@browser-capture/contracts"

const chainFamilyLabels: Record<ChainNode["kind"], string> = {
  capability: "通用能力", function: "确定性函数", branch: "分支", browser: "浏览器动作", observe: "现场观察",
  data: "数据处理", condition: "条件", loop: "循环", invoke: "链路调用", human: "人工等待", llm: "显式模型",
  checkpoint: "检查点", emit: "发布输出", terminal: "终态",
}

export function browserActionLabel(action: string) { return browserActionTitle(action) ?? action }

export function actionPresentation(node: ChainNode) {
  if (node.kind === "terminal") return { type: "结束", description: node.reason, title: terminalPresentation(node).label }
  const action = browserAction(node)
  const type = node.kind === "function" ? "Function" : node.kind === "capability" ? capabilityType(node, action)
    : node.kind === "observe" ? "读取" : chainFamilyLabels[node.kind]
  const description = action ? browserActionTitle(action) ?? "执行浏览器动作"
    : node.kind === "function" ? "执行 JavaScript，按输入计算结果"
    : type === "读取" ? "读取当前页面数据" : type === "分支" ? "按条件选择后续动作" : type
  return { type, description, title: chainNodeDisplayTitle(node) }
}

export function actionTarget(node: ChainNode) {
  if (node.kind === "terminal") return "本次链路"
  if (node.kind === "function") return "绑定的输入数据"
  if (node.kind === "branch" || node.kind === "condition") return "已有运行值"
  if (node.kind === "loop") return node.iteration.mode === "each" ? "有界输入集合" : "已声明的继续条件"
  if (node.kind === "invoke") return "已保存的子链路"
  if (node.kind === "llm") return "绑定的语义输入"
  if (node.kind === "human") return "需要用户处理的当前页面"
  if (node.kind === "browser" || node.kind === "observe") return stableTargetLabel(node.target)
    ?? (node.kind === "observe" ? "当前浏览器现场" : "当前页面")
  if (node.kind !== "capability") return "当前运行上下文"
  if (node.capability.name === "browser.read-fields") return readFieldsTarget(node.config)
  if (node.capability.name === "browser.workflow-step") {
    const config = recordValue(node.config), action = browserAction(node)
    const target = targetSummary(recordValue(config?.target))
    if (target) return target
    if (action === "navigate") return "目标页面"
    if (action === "send_keys") return "当前焦点目标"
    if (action === "wait") return "已声明的等待条件"
    return "当前页面"
  }
  return node.capability.name.startsWith("browser.") ? "当前浏览器现场" : "绑定的输入数据"
}

export function actionInputSources(node: ChainNode, nodes: readonly ChainNode[]) {
  const sources = nodeBindings(node).map((binding) => bindingSourceLabel(binding, nodes))
  return [...new Set(sources)].join("；") || "无需额外输入"
}

export function terminalPresentation(node: ChainNode) {
  if (node.kind !== "terminal") return { label: node.label, status: "idle" as const }
  const labels: Record<string, string> = { completed: "完成", failed: "失败", blocked: "受阻", cancelled: "已取消",
    missing: "未找到目标", timeout: "超时", human_required: "等待人工" }
  const label = node.label !== node.id ? node.label : labels[node.id] ?? labels[node.status] ?? "结束"
  return { label, status: node.status === "completed" ? "success" as const
    : node.id === "human_required" ? "waiting" as const : node.status === "cancelled" ? "skipped" as const : "failure" as const }
}

function browserAction(node: ChainNode) {
  if (node.kind === "browser") return node.operation
  if (node.kind !== "capability" || node.capability.name !== "browser.workflow-step"
    || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) return null
  return typeof node.config.actionName === "string" ? node.config.actionName : null
}

function bindingSourceLabel(binding: ValueBinding, nodes: readonly ChainNode[]) {
  const path = binding.source !== "constant" && binding.path.length ? `（${binding.path.join(" › ")}）` : ""
  if (binding.source === "input") return `任务输入${path}`
  if (binding.source === "variable") return `运行变量${path}`
  if (binding.source === "node") {
    const source = nodes.find((item) => item.id === binding.nodeId)
    return `前一节点：${source ? chainNodeDisplayTitle(source) : "未记录的上游动作"}${path}`
  }
  return "常量"
}

function readFieldsTarget(config: unknown) {
  const specification = recordValue(recordValue(config)?.specification)
  const container = typeof specification?.container === "string" ? selectorSummary(specification.container) : null
  return container ?? "当前页面的结构化数据"
}

function stableTargetLabel(target: unknown) {
  const value = recordValue(target)
  if (!value) return null
  if (value.kind === "semantic") return typeof value.role === "string" ? `${value.role} 语义目标` : "语义目标"
  if (value.kind === "locator" && typeof value.strategy === "string") return `${value.strategy} 定位目标`
  return null
}

function targetSummary(target: Record<string, unknown> | null) {
  if (!target) return null
  if (typeof target.name === "string") return target.name.slice(0, 80)
  const within = selectorValue(target.withinItem), items = selectorValue(target.items)
  const container = selectorValue(target.container), direct = typeof target.value === "string" ? selectorSummary(target.value) : null
  return within ?? items ?? container ?? direct
}

function selectorValue(value: unknown) {
  const target = recordValue(value)
  return typeof target?.value === "string" ? selectorSummary(target.value) : null
}

function selectorSummary(selector: string) {
  const attributes = [...selector.matchAll(/\[(aria-label|data-testid|rel|role|href)\s*(?:\*?=)\s*["']([^"']+)["']\]/g)]
  const preferred = [...attributes].reverse().find((match) => match[1] === "aria-label") ?? attributes.at(-1)
  if (preferred?.[2]) return preferred[2].slice(0, 80)
  const tag = /(?:^|[\s>+~])([a-z][a-z0-9-]*)[^\s>+~]*$/i.exec(selector)?.[1]
  return tag ? `${tag} 元素` : "已保存的页面目标"
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function capabilityType(node: Extract<ChainNode, { kind: "capability" }>, action: string | null) {
  if (node.capability.name === "browser.read-fields") return "读取"
  if (action === "wait") return "等待"
  return node.capability.name.startsWith("browser.") ? "浏览器动作" : "能力调用"
}
