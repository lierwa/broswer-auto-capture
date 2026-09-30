import {
  browserActionTitle, chainNodeDisplayTitle, nodeBindings,
  type ChainNode, type Predicate, type TaskChain, type ValueBinding, type ValueSchema,
} from "@browser-capture/contracts"

export type PresentationChain = Pick<TaskChain, "nodes" | "edges"> & Partial<Pick<TaskChain, "inputContract" | "variables">>

const chainFamilyLabels: Record<ChainNode["kind"], string> = {
  capability: "通用能力", function: "确定性函数", branch: "分支", browser: "浏览器动作", observe: "现场观察",
  data: "数据处理", condition: "条件", loop: "循环", invoke: "链路调用", human: "人工等待", llm: "显式模型",
  checkpoint: "检查点", emit: "发布输出", terminal: "终态",
}

export function browserActionLabel(action: string) { return browserActionTitle(action) ?? action }

export function actionPresentation(node: ChainNode) {
  if (node.kind === "terminal") return { type: "结束", description: node.reason, title: terminalPresentation(node).label }
  const action = browserAction(node)
  const data = dataAction(node)
  const type = data ?? (node.kind === "function" ? "Function" : node.kind === "capability" ? capabilityType(node, action)
    : node.kind === "observe" ? "读取" : chainFamilyLabels[node.kind])
  const description = data ? "使用确定性数据操作生成下游值" : action ? browserActionTitle(action) ?? "执行浏览器动作"
    : node.kind === "function" ? "根据参数计算结果"
    : type === "读取" ? "读取当前页面数据" : type === "分支" ? "按条件选择后续动作" : type
  return { type, description, title: chainNodeDisplayTitle(node) }
}

function dataAction(node: ChainNode) {
  if (node.kind !== "capability" || node.capability.name !== "data.transform" || node.capability.version !== 1) return null
  const config = recordValue(node.config)
  // WHY：这两项来自已注册算法的确定语义，适用于任意任务；不按任务标题猜作用，也不另造操作翻译表。
  if (config?.operation === "merge") return "合并数据"
  const modeInput = recordValue(config?.arguments)?.mode
  const mode = typeof modeInput === "string" ? node.input?.[modeInput] : undefined
  return config?.operation === "transform" && mode?.source === "constant" && mode.value === "assemble"
    ? "组装数据" : "数据处理"
}

export function actionTarget(node: ChainNode, nodes: readonly ChainNode[] = []) {
  if (node.kind === "terminal") return "本次链路"
  if (node.kind === "function") return Object.keys(node.inputs ?? {}).join("、") || "无参数计算"
  if (node.kind === "branch" || node.kind === "condition") return "predicate" in node
    ? predicateLabel(node.predicate, nodes) : node.cases.map((item) => item.label).join("；")
  if (node.kind === "loop") return node.iteration.mode === "each" ? bindingSourceLabel(node.iteration.collection, nodes)
    : predicateLabel(node.iteration.condition, nodes)
  if (node.kind === "invoke") return `子链路版本 ${node.chain.version}`
  if (node.kind === "llm") return bindingSourceLabel(node.input, nodes)
  if (node.kind === "human") return "需要用户处理的当前页面"
  if (node.kind === "browser" || node.kind === "observe") return stableTargetLabel(node.target)
    ?? (node.kind === "observe" ? "当前浏览器现场" : "当前页面")
  if (node.kind !== "capability") return actionInputSources(node, nodes)
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
  return node.capability.name.startsWith("browser.") ? "当前浏览器现场" : actionInputSources(node, nodes)
}

export function actionInputSources(node: ChainNode, nodes: readonly ChainNode[]) {
  const sources = nodeBindings(node).map((binding) => bindingSourceLabel(binding, nodes))
  return [...new Set(sources)].join("；") || "无需额外输入"
}

export function terminalPresentation(node: ChainNode) {
  if (node.kind !== "terminal") return { label: node.label }
  // WHY：ID 只定位节点；等待、超时等语义必须来自版本数据或运行事实，不能从 ID 猜。
  const labels = { completed: "完成", partial: "部分完成", failed: "失败", blocked: "受阻", cancelled: "已取消" }
  return { label: node.label !== node.id ? node.label : labels[node.status] }
}

function browserAction(node: ChainNode) {
  if (node.kind === "browser") return node.operation
  if (node.kind !== "capability" || node.capability.name !== "browser.workflow-step"
    || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) return null
  return typeof node.config.actionName === "string" ? node.config.actionName : null
}

export function bindingSourceLabel(binding: ValueBinding, nodes: readonly ChainNode[]) {
  const path = binding.source !== "constant" && binding.path.length ? `（${binding.path.join(" › ")}）` : ""
  if (binding.source === "input") return `任务输入${path}`
  if (binding.source === "variable") return `运行变量 ${binding.name}${path}`
  if (binding.source === "node") {
    const source = nodes.find((item) => item.id === binding.nodeId)
    return `前一节点：${source ? chainNodeDisplayTitle(source) : "未记录的上游动作"}${path}`
  }
  return `固定值：${valueSummary(binding.value)}`
}

export function namedInputBindings(node: ChainNode, nodes: readonly ChainNode[], chain?: PresentationChain) {
  const bindings = node.kind === "function" ? node.inputs : node.kind === "capability" ? node.input
    : node.kind === "browser" || node.kind === "data" ? node.arguments : null
  return Object.entries(bindings ?? {}).map(([name, binding]) => ({ name, binding,
    source: binding.source === "constant" ? "版本固定值" : bindingSourceLabel(binding, nodes),
    type: bindingType(binding, nodes, chain, node.kind === "function") }))
}

function bindingType(binding: ValueBinding, nodes: readonly ChainNode[], chain?: PresentationChain, requirements = false) {
  if (binding.source === "constant") return valueType(binding.value)
  const source = binding.source === "input" ? chain?.inputContract?.schema : binding.source === "variable"
    ? chain?.variables?.[binding.name]?.schema : nodes.find((item) => item.id === binding.nodeId)?.outputContract?.schema
  let schema = source
  // WHY：沿公开合同逐段读类型；缺字段或开放对象不猜类型，也不把历史实值冒充合同。
  for (const part of binding.path) {
    schema = typeof part === "number" && schema?.type === "array" ? schema.items
      : typeof part === "string" && schema?.type === "object" ? schema.properties[part] : undefined
  }
  return schema ? schemaTypeLabel(schema, requirements) : "类型未记录"
}

export function schemaTypeLabel(schema: ValueSchema, requirements = false): string {
  if (!requirements) return schema.type === "array" ? `array<${schemaTypeLabel(schema.items)}>` : schema.type
  // WHY：仅翻译运行校验已经消费的合同声明；不从实值补结构，也不另造描述协议。
  if (schema.type === "object") {
    const fields = Object.entries(schema.properties).map(([name, child]) =>
      `${name}（${schema.required.includes(name) ? "必填" : "可选"}）：${schemaTypeLabel(child, true)}`)
    return `object（${fields.join("；") || "无已声明字段"}；${schema.additionalProperties ? "允许" : "不允许"}额外字段）`
  }
  const constraints: string[] = []
  if (schema.type === "string") {
    if (schema.minLength !== undefined) constraints.push(`长度至少 ${schema.minLength}`)
    if (schema.maxLength !== undefined) constraints.push(`长度至多 ${schema.maxLength}`)
    if (schema.enum) constraints.push(`可选值：${schema.enum.map(valueSummary).join("、")}`)
  }
  if (schema.type === "number" || schema.type === "integer") {
    if (schema.minimum !== undefined) constraints.push(`不小于 ${schema.minimum}`)
    if (schema.maximum !== undefined) constraints.push(`不大于 ${schema.maximum}`)
  }
  if (schema.type === "array") {
    if (schema.minItems !== undefined) constraints.push(`至少 ${schema.minItems} 项`)
    if (schema.maxItems !== undefined) constraints.push(`至多 ${schema.maxItems} 项`)
  }
  const type = schema.type === "array" ? `array<${schemaTypeLabel(schema.items, true)}>` : schema.type
  return `${type}${constraints.length ? `（${constraints.join("；")}）` : ""}`
}

export function predicateLabel(predicate: Predicate, nodes: readonly ChainNode[]) {
  if (predicate.operator === "exists") return `${bindingSourceLabel(predicate.value, nodes)}存在`
  if (predicate.operator === "array_length_at_least") {
    return `${bindingSourceLabel(predicate.value, nodes)}的项数不少于${bindingSourceLabel(predicate.minimum, nodes)}`
  }
  return `${bindingSourceLabel(predicate.left, nodes)}${predicate.operator === "equals" ? "等于" : "大于"}${bindingSourceLabel(predicate.right, nodes)}`
}

function valueType(value: unknown) {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value
}

function valueSummary(value: unknown): string {
  if (value === null) return "空值（null）"
  if (value === "") return "空字符串"
  if (Array.isArray(value)) return `${value.length} 项列表`
  if (typeof value === "object") return `记录（${Object.keys(value!).join("、")}）`
  return String(value)
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
