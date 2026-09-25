import type { JsonValue, TaskRequirement } from "@browser-capture/contracts"
import { describeValue, naturalRequirementText } from "../upstream-browser/task-request.js"

export function planPrompt(requirement: TaskRequirement, representativeInput?: JsonValue) {
  const inputRule = representativeInput === undefined ? "" :
    `\n本次真实输入：\n${describeValue(representativeInput, "输入").join("\n")}\n` +
    `计划级 inputContract 必须直接接受这份输入；字段名和基础类型保持一致，不得把样本值冻结为 enum 或相同上下界。`
  const source = naturalRequirementText(requirement)
  return `你在为通用浏览器任务生成可组合 TaskPlan。计划只描述每次正式执行中用户要求发生的业务步骤。` +
    `探索、workflow 生成、样本验证、换输入验证、授权和修复属于宿主生命周期，不能成为计划步骤。` +
    `一个浏览器流程能完整交付结果时只生成一个步骤；只有存在明确数据依赖或可独立复用的后续浏览器流程时才拆步。` +
    `步骤调用只使用 once 或 each。上一步或任务输入提供集合，且每项能独立处理时使用 each；不得生成 batch。` +
    `each.collection 必须绑定合同中真实存在的数组，step.input 必须绑定同一个 itemVariable。` +
    `each 步骤 outputContract 描述单项输出，后续步骤和计划输出看到的是聚合数组。` +
    `每个步骤的 inputContract 必须符合来源的类型合同；对象禁止额外属性，数组必须有数量上限，嵌套对象和可选字段保留来源语义。` +
    `需要逐项独立处理集合时使用 each，步骤接收该项的真实类型，不要强制摊平成字符串或扁平项。` +
    `运行输入只声明用户会在同一任务复跑时改变的业务值；URL、当前内容入口和页面路径由已确认来源边界与预执行解析，不得作为默认要求用户填写的技术字段。` +
    `entryUrls 是预执行使用的完整 http/https 入口，不是运行输入；必须根据已确认需求中的目标站点或来源给出至少一个规范入口，且不得扩展到需求未授权的网站。` +
    `正常路径会跨越目标站点的首页、站内搜索、登录或内容子域时，entryUrls 必须完整列出这些第一方入口；不得在执行失败后临时改用无关搜索引擎碰运气。` +
    `目标站点只有名称时解析其规范入口；来源存在真实歧义时不得用无关网站或样本地址凑数。` +
    `步骤只声明业务目标、输入输出、依赖、binding、调用模式、完成条件和风险；不得声明 DOM、选择器、点击顺序、滚动策略、页面 target 或节点图。` +
    `登录、验证码和访问限制由运行现场判断，不能由输入布尔值声称已经满足。` +
    `网站名称和业务字段只能存在于版本化任务合同与文字中，不能变成平台类型。` +
    `根据已确认需求的完整语境为每个步骤生成 resultSpec；禁止按关键词、网站或任务类别判断是否有业务数据输出。` +
    `只执行并核验的步骤使用 bat-result-spec/v1 execution，outputContract 必须为 null；数据步骤使用 data，schema 必须与 outputContract 一致。` +
    `data.fields 为每个结果路径声明稳定逻辑 producerRef；edgeCases 用 controlRef 指向计划中的普通条件流程。` +
    `普通数组计数用 derivations 声明 count、目标 producerRef、来源 producerRef 和来源结果路径；没有派生值时返回空数组。` +
    `producerRef/controlRef 不是 DOM 或 E1 节点 ID，不得包含 CSS、选择器、等待类型、脚本、公式或任意表达式。` +
    `计数、筛选、条件和分支只表达为现有 TaskChain 数据/条件语义；空列表控制必须早于任何第 0 项路径及详情动作。` +
    `只有实际需要普通 branch 的边界才写 edgeCases，并按首次读取受保护列表的执行顺序排列；false 路径省略的输出字段必须在 schema 中可选。` +
    `binding 路径必须存在于合同中。合同只保留跨步骤传值、完成判断和最终输出必需的字段。` +
    `各项互相独立且部分结果仍有价值时 each 使用 continue；任一项失败使全部无效时使用 stop。` +
    `候选通常一至四步且最多六步；链路引用和预算由宿主生成，不要输出。\n\n` +
    `已确认的完整自然语言需求：\n${source.text}${inputRule}\n\n` +
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
