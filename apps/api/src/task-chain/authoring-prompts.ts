import { z } from "zod"
import type { JsonValue, TaskChain, TaskPlan, TaskRequirement } from "@browser-capture/contracts"
import type { ExplorationTrace } from "./exploration-trace.js"

export function planPrompt(requirement: TaskRequirement, representativeInput?: JsonValue) {
  const inputRule = representativeInput === undefined ? "" :
    `\n本次代表输入：${JSON.stringify(representativeInput)}\n`+
    `计划级 inputContract 必须直接接受这份输入：字段名和基础类型保持一致，不得改名，不得用 enum 或相同上下界把样本值冻结为常量。`+
    `步骤可以只取其中需要的字段，但 binding 必须引用这些真实字段。`
  return `你在为通用浏览器任务生成可组合 TaskPlan。计划步骤只表示用户要求在每次正式执行中发生的业务动作。`+
    `每个步骤之后都会由宿主独立执行代表输入探索、链路编译、样本验证、换输入验证和授权复跑；这些产品生命周期动作绝不能成为计划步骤。`+
    `每个步骤必须对应一条可独立探索和复跑的浏览器流程；纯本地汇总、拼接或报告排版不能另建步骤，计划输出应直接绑定已有步骤输出。`+
    `一个无需拆分的浏览器任务只生成一个步骤；存在不同数据依赖或可独立复用的浏览器流程时必须拆步。`+
    `上一步产出集合、下一步每项互相独立时，下一步使用 invocation.mode=each 和集合 binding。`+
    `若下一步必须跨项去重、累计结果、按结果决定何时停止，使用 invocation.mode=batch：step.input 绑定完整上游输出，collection 指向其中的数组，链内用 loop 保存一份循环体。`+
    `batch 的代表探索只处理 collection 第一项，但步骤输入仍是完整 step.input，步骤结果提交符合 outputContract 的一项代表累计结果；正式执行才由链内 loop 处理集合。`+
    `发现步骤只收集当前列表页可见或正常加载得到的有序公开 href/语义目标及来源证据，不得为了筛选下游业务字段逐项打开详情；跨项筛选和停止由后续 batch 步骤负责。`+
    `当目标数量只有进入下游页面后才能确认时，发现步骤必须保留有界候选余量，不能声称候选已经合格；batch 输出同时保留被接纳结果和逐候选处理结果，按被接纳结果的稳定键去重，达到输入目标数量立即停止。`+
    `发现集合中的浏览器落点统一放在 target 对象：kind 是 url 或 semantic；url 可选；role 使用 link/button 闭集且可选；name、occurrence 可选。`+
    `target 不能把 url/href 声明为必填，因为真实列表可能只暴露可点击语义目标；集合项还要保存稳定来源键和已观察来源 URL。`+
    `列表页公开 URL 时原样保存 target.url；只暴露可点击语义目标时保存 target.role、target.name 和可选 occurrence。后续步骤在同一产品运行和浏览器会话中逐项进入目标，并记录实际落点。`+
    `首个浏览器步骤需要导航、但已确认需求没有可绑定的字面公开 URL 时，计划级 inputContract 声明必填 startUrl，并由首步骤引用；模型不得猜测地址。`+
    `each.collection 引用任务输入或已依赖步骤输出中的数组，step.input 引用同一 itemVariable；batch.collection 同样引用数组，但 step.input 绑定包含该数组的完整值。maxItems 只声明安全上限。`+
    `each 步骤 outputContract 描述单次输出，计划运行时聚合为数组；计划级引用该步骤输出时看到聚合数组。`+
    `步骤 completion 也在聚合完成后判断；引用 each 步骤自身输出时必须先写数组索引。`+
    `登录、验证码和页面可访问性是链路观察或人工等待的现场事实，运行输入不得用布尔值自行宣称满足。`+
    `不得写入网站或业务专用平台类型；网站名称和字段只能存在于版本化任务合同与文字中。\n\n`+
    `合同保持紧凑：只展开跨步骤绑定、完成判断和最终结果必需的字段；嵌套详情对象可声明必要字段并允许其他属性。`+
    `不要把需求章节、说明文字、候选日志的每个可选细节复制成深层 schema。整个候选 JSON 控制在 12000 字符内。`+
    `已确认需求：\n${requirement.definition.body}${inputRule}\n\n根据需求声明计划级动态输入与输出合同。`+
    `每个步骤声明单次调用的输入输出、依赖、binding、调用模式、完成条件和风险；不得生成技术预算或节点图。`+
    `每个步骤的 input binding 必须产生符合 inputContract 的完整值。`+
    `各项互相独立且部分结果仍有价值时 each 使用 continue；任一项失败使全部无效时用 stop。外部访问阻断由宿主熔断。`+
    `binding 路径只能引用合同中定义的属性或数组索引。候选少于 8000 字符，通常二至四步且不超过六步。`+
    `链路引用和计划总预算由宿主分配与汇总，不要输出。`
}

export function annotationPrompt(trace: ExplorationTrace, invocation?: TaskPlan["steps"][number]["invocation"]) {
  const batch = invocation?.mode === "batch" ? "本步骤是 batch 代表探索：必须用 repeatRegions 把第一项代表事件编译为输入集合上的循环；collectionPath 是 batch.collection 相对 step.input 的路径，循环体只保留一份。" : ""
  return "只给真实探索轨迹的紧凑编译注解。不要生成节点、连线、脚本、技术预算或轨迹外动作。" + batch +
    "replayEventIds 按原顺序列出复跑需要的 completed 事件；失败探针排除，所有 binding、来源、完成和循环引用事件必须在列表中。" +
    "tabs、tab_select 和 tab_close 只管理首次探索临时标签，不得进入复跑、来源或完成条件。" +
    "continueOnMissingEventIds 只列可缺失的遮罩关闭等非必要目标交互；导航、读取、填写、业务提交和被引用事件不得列入。" +
    "inputBindings 把 command 样本常量映射到 input 路径；同一动态目标的 locator 字段分别绑定。字段来源由宿主复用，不输出 outputMappings。" +
    "completion.resultPath 从对应 event.output 根开始，只引用可观察的非空结果。" +
    "repeatRegions 只标真实重复区域、集合来源、稳定键和上限；集合来自输入时只填 collectionPath，来自循环前读取时只填 collectionEvent。" +
    "循环体只选一轮代表事件，其他同构轮次不得进 replayEventIds。逐项结果写入同一数组时填写 aggregate；第二个累计数组写 additionalAggregates。outputPath 是数组路径，itemOutputPath 是代表项路径，stableKeyPath 是可选去重键。" +
    "某类结果只有满足本轮字段条件才计入时填写 appendWhen；累计数组达到运行输入中的动态数量就应停止时，在负责计数的累计项填写 stopAfterInputPath。" +
    "宿主只生成一份循环体和一个显式模型节点并累计各轮结果；三个以上数组项分别映射却没有 aggregate 会被拒绝。" +
    "事件 outputPaths 只表示真实输出的非空路径；无法参数化或来源不可复现时不要伪造。reuseBoundary 说明适用与失效条件。\n" +
    JSON.stringify(compactTraceForModel(trace))
}

export function repairAnnotationPrompt(trace: ExplorationTrace, chain: TaskChain, failedRun: {
  status: string; outcome: unknown; input: JsonValue; binding: { runId: string }
}) {
  return annotationPrompt(trace) + "\n\n已有候选链在正式复跑失败。只修正轨迹注解中的定位、输入绑定、循环、完成条件或复用边界；" +
    `不得增加轨迹外动作或照抄验证输入。\n失败运行：${JSON.stringify({ runId: failedRun.binding.runId,
      status: failedRun.status, outcome: failedRun.outcome, input: failedRun.input })}\n当前候选：${JSON.stringify(chain)}`
}

export function compactTraceForModel(trace: ExplorationTrace) {
  const provenanceEventIds = trace.result?.provenance.flatMap((item) => item.source === "tool"
    ? [item.eventId] : item.eventIds) ?? []
  return z.json().parse({ input: trace.input, resultSubmitted: trace.result !== null,
    resultTopLevelPaths: nonNullPaths(trace.result?.result ?? null), provenanceEventIds: [...new Set(provenanceEventIds)],
    events: trace.events.filter((event) => event.id !== "initial").map((event) => ({ id: event.id,
      status: event.status, error: event.error, command: event.command,
      outputPaths: nonNullPaths(event.output), observedUrl: event.observation?.url ?? null })) })
}

function nonNullPaths(value: JsonValue) {
  if (value === null) return []
  if (typeof value !== "object" || Array.isArray(value)) return [[]]
  return Object.entries(value).filter(([, child]) => child !== null).map(([key]) => [key])
}
