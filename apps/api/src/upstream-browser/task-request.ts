import type {
  JsonValue, Predicate, TaskPlan, TaskPlanStep, TaskRequirement, ValueBinding, ValueSchema,
} from "@browser-capture/contracts"

const legacyFence = "```bat-compilation/v1"

/** WHY：历史机器块只能供旧 artifact 读取；新 Agent 只接收用户确认的自然语言正文。 */
export function naturalRequirementText(requirement: TaskRequirement) {
  const kept: string[] = []
  let insideLegacyBlock = false, legacyMachineBlockRemoved = false
  for (const line of requirement.definition.body.split(/\r?\n/)) {
    if (!insideLegacyBlock && line.trim() === legacyFence) {
      insideLegacyBlock = true; legacyMachineBlockRemoved = true; continue
    }
    if (insideLegacyBlock && line.trim() === "```") { insideLegacyBlock = false; continue }
    if (!insideLegacyBlock) kept.push(line)
  }
  if (insideLegacyBlock) throw new Error("legacy_machine_block_unterminated")
  const text = kept.join("\n").trim()
  if (!text) throw new Error("natural_requirement_text_missing")
  return { text, legacyMachineBlockRemoved }
}

/** WHY：上游 Agent 接收完整业务请求；页面寻找、滚动、定位和抽取策略仍由 browser-use 决定。 */
export function browserUseTask(input: { requirement: TaskRequirement; plan: TaskPlan; step: TaskPlanStep;
  resolvedInput: JsonValue }) {
  const { requirement, plan, step } = input
  const requirementText = naturalRequirementText(requirement)
  const mode = step.invocation.mode === "each" ? "这是集合中一个独立项目的完整执行。" : "这是本步骤的完整执行。"
  const origin = requirementText.legacyMachineBlockRemoved
    ? "以下内容来自已确认的历史需求正文；历史机器规则块已经排除，不属于本次业务指令。"
    : "以下内容来自用户已确认的需求正文。"
  return [
    "你正在执行 B-A-T 已确认的一次浏览器任务步骤。请按自然语言目标理解页面并完成业务结果。",
    "【完整需求】",
    origin,
    requirementText.text,
    "【本次步骤】",
    `步骤名称：${step.title}`,
    `业务目标：${step.goal}`,
    `在总任务中的作用：${plan.summary}`,
    `已完成的前置步骤：${step.dependsOn.length ? step.dependsOn.join("、") : "无"}`,
    mode,
    "【本次真实输入】",
    ...describeValue(input.resolvedInput, "输入"),
    "复跑时输入值可以变化，但字段、类型和边界如下：",
    ...describeSchema(step.inputContract.schema, "输入", true),
    "【必须返回的结果】",
    ...describeSchema(step.outputContract.schema, "结果", true),
    "【完成条件】",
    ...step.completion.map((condition) => `- ${condition.description}；判定为${describePredicate(condition.predicate)}`),
    "需求正文中的相关完成条件也必须满足；条件不足时不得报告完整成功。",
    "【范围与等待点】",
    `授权范围：${plan.authorizationScope}`,
    `风险与停止点：${step.risks.length ? step.risks.join("；") : "无额外风险"}`,
    "遇到登录、验证码、一次性口令、权限确认、访问限制或不可逆外部操作时停止并请求处理，不得绕过。",
    "自行理解页面并选择浏览器动作；不得编造字段、数量、来源或成功结果。",
  ].join("\n")
}

export function describeValue(value: JsonValue, path = "值"): string[] {
  if (Array.isArray(value)) {
    const lines = [`- ${path}：列表，共 ${value.length} 项`]
    for (const [index, item] of value.entries()) lines.push(...describeValue(item, `${path}[${index + 1}]`))
    return lines
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
    if (!entries.length) return [`- ${path}：空对象`]
    return entries.flatMap(([key, item]) => describeValue(item, joinPath(path, key)))
  }
  return [`- ${path}：${scalar(value)}`]
}

function describeSchema(schema: ValueSchema, path: string, required: boolean): string[] {
  const presence = required ? "必填" : "可选"
  if (schema.type === "object") {
    const policy = schema.additionalProperties ? "允许需求未列出的附加字段" : "只允许列出的字段"
    const lines = [`- ${path}：对象，${presence}，${policy}`]
    for (const [key, child] of Object.entries(schema.properties)) {
      lines.push(...describeSchema(child, joinPath(path, key), schema.required.includes(key)))
    }
    return lines
  }
  if (schema.type === "array") {
    const bounds = range(schema.minItems, schema.maxItems, "项")
    return [`- ${path}：列表，${presence}${bounds}`, ...describeSchema(schema.items, `${path}[]`, true)]
  }
  if (schema.type === "string") {
    const bounds = range(schema.minLength, schema.maxLength, "个字符")
    const choices = schema.enum?.length ? `，允许值为 ${schema.enum.map((item) => `“${item}”`).join("、")}` : ""
    return [`- ${path}：文本，${presence}${bounds}${choices}`]
  }
  if (schema.type === "number" || schema.type === "integer") {
    return [`- ${path}：${schema.type === "integer" ? "整数" : "数字"}，${presence}${range(schema.minimum, schema.maximum, "")}`]
  }
  return [`- ${path}：${schema.type === "boolean" ? "是或否" : "空值"}，${presence}`]
}

function describePredicate(predicate: Predicate) {
  if (predicate.operator === "exists") return `${describeBinding(predicate.value)}存在`
  if (predicate.operator === "equals") return `${describeBinding(predicate.left)}等于${describeBinding(predicate.right)}`
  if (predicate.operator === "greater_than") return `${describeBinding(predicate.left)}大于${describeBinding(predicate.right)}`
  return `${describeBinding(predicate.value)}的项目数不少于${describeBinding(predicate.minimum)}`
}

function describeBinding(binding: ValueBinding) {
  if (binding.source === "constant") return inlineValue(binding.value)
  const base = binding.source === "input" ? "任务输入"
    : binding.source === "node" ? `步骤“${binding.nodeId}”的输出` : `当前项目“${binding.name}”`
  return binding.path.reduce<string>((value, item) => typeof item === "number"
    ? `${value}[${item + 1}]` : joinPath(value, item), base)
}

function inlineValue(value: JsonValue): string {
  if (Array.isArray(value)) return `列表（${value.map((item, index) => `第 ${index + 1} 项为${inlineValue(item)}`).join("；")}）`
  if (value && typeof value === "object") return `对象（${Object.entries(value)
    .map(([key, item]) => `${key} 为${inlineValue(item)}`).join("；")}）`
  return scalar(value)
}

function range(minimum: number | undefined, maximum: number | undefined, unit: string) {
  if (minimum !== undefined && maximum !== undefined) return `，${minimum} 至 ${maximum}${unit}`
  if (minimum !== undefined) return `，至少 ${minimum}${unit}`
  if (maximum !== undefined) return `，最多 ${maximum}${unit}`
  return ""
}

function scalar(value: JsonValue) {
  if (value === null) return "空值"
  if (typeof value === "string") return `“${value}”`
  if (typeof value === "boolean") return value ? "是" : "否"
  return String(value)
}

function joinPath(base: string, key: string) { return `${base}.${key}` }
