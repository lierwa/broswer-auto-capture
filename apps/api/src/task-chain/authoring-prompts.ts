import type { JsonValue, TaskRequirement } from "@browser-capture/contracts"

export function planPrompt(requirement: TaskRequirement, representativeInput?: JsonValue) {
  const inputRule = representativeInput === undefined ? "" :
    `\n本次真实输入：${JSON.stringify(representativeInput)}\n` +
    `计划级 inputContract 必须直接接受这份输入；字段名和基础类型保持一致，不得把样本值冻结为 enum 或相同上下界。`
  return `你在为通用浏览器任务生成可组合 TaskPlan。计划只描述每次正式执行中用户要求发生的业务步骤。` +
    `探索、workflow 生成、样本验证、换输入验证、授权和修复属于宿主生命周期，不能成为计划步骤。` +
    `一个浏览器流程能完整交付结果时只生成一个步骤；只有存在明确数据依赖或可独立复用的后续浏览器流程时才拆步。` +
    `步骤调用只使用 once 或 each。上一步或任务输入提供集合，且每项能独立处理时使用 each；不得生成 batch。` +
    `each.collection 必须绑定合同中真实存在的数组，step.input 必须绑定同一个 itemVariable。` +
    `each 步骤 outputContract 描述单项输出，后续步骤和计划输出看到的是聚合数组。` +
    `每个步骤的 inputContract 必须是严格对象，所有属性都必填，且属性只能是 string、number、integer 或 boolean；` +
    `不得在步骤输入中使用可选字段、数组、嵌套对象或额外属性。需要处理集合时，计划级输入或前序输出保存集合，each 步骤只接收其中一个扁平项。` +
    `首个步骤需要导航，而已确认需求没有可绑定的公开 URL 时，计划级输入声明必填 startUrl，并由首步骤输入引用；不得猜地址。` +
    `步骤只声明业务目标、输入输出、依赖、binding、调用模式、完成条件和风险；不得声明 DOM、选择器、点击顺序、滚动策略、页面 target 或节点图。` +
    `登录、验证码和访问限制由运行现场判断，不能由输入布尔值声称已经满足。` +
    `网站名称和业务字段只能存在于版本化任务合同与文字中，不能变成平台类型。` +
    `binding 路径必须存在于合同中。合同只保留跨步骤传值、完成判断和最终输出必需的字段。` +
    `各项互相独立且部分结果仍有价值时 each 使用 continue；任一项失败使全部无效时使用 stop。` +
    `候选通常一至四步且最多六步；链路引用和预算由宿主生成，不要输出。\n\n` +
    `已确认需求：\n${requirement.definition.body}${inputRule}\n\n` +
    `返回完整计划候选 JSON。`
}

export function planCorrectionPrompt(requirement: TaskRequirement, representativeInput: JsonValue | undefined,
  candidate: JsonValue, issues: JsonValue) {
  return planPrompt(requirement, representativeInput) +
    `\n\n上一个候选没有通过宿主校验。只修正这些错误并返回完整候选，不改变任务含义：${JSON.stringify(issues)}` +
    `\n对象 schema 的 required 与 additionalProperties 必须和 properties 同级，例如：` +
    `{"type":"object","properties":{"name":{"type":"string"}},"required":["name"],"additionalProperties":false}。` +
    `不得把 required 或 additionalProperties 放进 properties。\n上一个候选：${JSON.stringify(candidate)}`
}
