import type { JsonValue, TaskPlan, TaskPlanStep, TaskRequirement } from "@browser-capture/contracts"

/** WHY：上游 Agent 接收完整业务请求；页面寻找、滚动、定位和抽取策略仍由 browser-use 决定。 */
export function browserUseTask(input: { requirement: TaskRequirement; plan: TaskPlan; step: TaskPlanStep;
  resolvedInput: JsonValue; workflowInputs: Record<string, string> }) {
  const { requirement, plan, step } = input
  const mode = step.invocation.mode === "each" ? "这是对集合中一个独立输入的完整步骤执行。" : "这是本步骤的完整执行。"
  return [
    "你正在执行 B-A-T 已确认的一次浏览器任务步骤。",
    "【已确认需求】",
    `需求版本：${requirement.version}；修订：${requirement.revision}`,
    requirement.definition.body,
    "【本次步骤】",
    `步骤：${step.title}`,
    `业务目标：${step.goal}`,
    `在总任务中的作用：${plan.summary}`,
    `已完成依赖：${step.dependsOn.length ? step.dependsOn.join("、") : "无"}`,
    "【本次真实输入】",
    JSON.stringify(input.resolvedInput),
    `复跑时允许变化的 primitive 输入：${Object.entries(input.workflowInputs).map(([source, target]) => `${source}→${target}`).join("、")}`,
    "【本次输出】",
    "必须返回符合以下 schema 的结构化结果：",
    JSON.stringify(step.outputContract.schema),
    "【完成标准】",
    JSON.stringify(step.completion),
    "这些条件以及需求正文中的相关完成条件必须全部满足；不满足时不得报告完整成功。",
    "【范围与等待点】",
    `授权范围：${plan.authorizationScope}`,
    `风险与停止点：${step.risks.length ? step.risks.join("；") : "无额外风险"}`,
    "遇到登录、验证码、一次性口令、权限确认、访问限制或不可逆外部操作时停止，不得绕过。",
    "【执行边界】",
    mode,
    "自行理解页面并选择浏览器动作；不得编造字段、数量、来源或成功结果。",
  ].join("\n")
}
