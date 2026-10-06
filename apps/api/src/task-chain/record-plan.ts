import type { ResultSpec, TaskPlan, ValueSchema } from "@browser-capture/contracts"
import { stableUuid } from "@browser-capture/runtime"
import { planningEnvelope } from "./preparation-plan-projection.js"
import { elementEntryValueSchema } from "../upstream-browser/element-entry-contract.js"

export const recordKey = "__batRecordKey"
export const recordEntry = "__batRecordEntry"
type Step = TaskPlan["steps"][number]
/** WHY：只依同版需求确认的逐项执行拆分；结果数组不猜执行步骤，也不把最终字段反灌列表。 */
export function confirmedItemSteps(step: Step, selectionGoal: string, maximum = 10_000): Step[] {
  const discover = sourceEntryStep(step, selectionGoal, maximum)
  const item = discover.outputContract.schema.type === "array" ? discover.outputContract.schema.items : { type: "null" } as const
  const outputSchema = step.outputContract.schema
  const singleSchema = outputSchema.type === "array" ? outputSchema.items : outputSchema
  const process: Step = { ...step, id: "item", title: "执行单项任务", goal: entryItemGoal(step.goal),
    dependsOn: [discover.id], inputContract: { ...step.inputContract, id: "selected-source", schema: item },
    outputContract: { ...step.outputContract, id: "item-result", schema: singleSchema },
    resultSpec: step.resultSpec?.mode === "data" ? { ...step.resultSpec, schema: singleSchema,
      fields: step.resultSpec.fields.map(field => ({ ...field,
        path: outputSchema.type === "array" && typeof field.path[0] === "number" ? field.path.slice(1) : field.path })),
      derivations: step.resultSpec.derivations.map(derivation => ({ ...derivation,
        sourcePath: outputSchema.type === "array" && typeof derivation.sourcePath[0] === "number"
          ? derivation.sourcePath.slice(1) : derivation.sourcePath })) } : step.resultSpec,
    input: { source: "variable", name: "record", path: [] },
    invocation: { mode: "each", collection: { source: "node", nodeId: discover.id, path: [] },
      itemVariable: "record", stableKeyPath: [recordKey], maxItems: maximum, onItemFailure: "stop" },
    chain: { id: stableUuid(step.chain.id, "item"), version: 1 }, budget: planningEnvelope(maximum) }
  return [discover, process]
}

/** WHY：入口采集与历史两步拆分分离；标量输入仍是链路输入，仅对象字段能原样继承到入口。 */
export function sourceEntryStep(step: Step, selectionGoal: string, maximum: number): Step {
  const root = step.inputContract.schema
  const parameters = root.type === "object" ? root.properties : {}
  if ([recordKey, recordEntry].some(name => Object.hasOwn(parameters, name))) throw Error("record_input_reserved_key_collision")
  const item: ValueSchema = { type: "object", properties: {
    ...parameters, [recordKey]: { type: "string", minLength: 1, maxLength: 64 }, [recordEntry]: elementEntryValueSchema },
    required: [...(root.type === "object" ? root.required : []), recordKey, recordEntry], additionalProperties: false }
  const collection: ValueSchema = { type: "array", items: item, maxItems: maximum }
  const resultSpec: ResultSpec = { contractVersion: "bat-result-spec/v1", mode: "data", schema: collection,
    fields: [{ path: [], description: "按已确认规则取得的真实入口与身份", producerRef: "entries" }],
    derivations: [], edgeCases: [] }
  return { ...step, id: "sources", title: "选择任务来源", goal: selectionGoal
    + "在已排序/筛选的列表上选择实际可点击入口，优先使用当前页面原生元素索引。"
    + "使用 bat_read_fields(indices, take)；由宿主根据实际 DOM 结构取得复用范围，不需要手写 CSS。已知真实 CSS 时也可使用 container。"
    + "入口、标签页与稳定身份由宿主生成，不声明最终字段；入口可没有 href，不猜造详情 URL。"
    + "不要把一次 a[href] 查询没有目标当成没有入口；页面也可能通过 div、图片或其他控件打开目标。"
    + "继续用原生截图和 DOM 研究实际目标控件，使用它的原生索引或已经确认的可复用范围，不能把客服等无关链接替代目标。"
    + "能点击不等于符合业务目标；依据原生名称、已有链接目的源和页面证据核对所选入口，错误时在结束前更正选择。"
    + "本步骤不逐项进入详情，不采集最终内容；入口能否进入正确详情由下一步骤的代表点击验证，保留列表。"
    + "本次运行参数由宿主按原值继承到每条来源，不为这些参数读取页面或声明字段。"
    + "按已确认顺序和数量应用 take；宿主返回首/尾代表样本用于方法验证，中间序号不在样本中不代表遗漏。"
    + "正式执行由方法读取全部选中项，不要求本次把全部条目抄给模型。排序/选择与来源方法验证成立后，"
    + "以对应 readRef 结束本步骤；整项内容完成由后续代表执行和正式复跑验证。",
    outputContract: { ...step.outputContract, id: "selected-sources", schema: collection }, resultSpec,
    completion: step.completion.map(condition => ({ ...condition,
      description: "按已确认来源选择规则读取当前真实候选，保存可复用的入口方法及代表读取；本步骤在来源列表结束。" })),
    chain: { id: stableUuid(step.chain.id, "sources"), version: 1 } }
}

export function entryItemGoal(goal: string) {
  return goal
    + "本步骤只处理本次输入的一个条目。输入 __batRecordEntry 是宿主从真实列表读取的入口，"
    + "若入口含 navigationUrl，它是实际选中链接的浏览器原生地址；第一步原生 navigate(url=入口.navigationUrl,new_tab=false)，原样使用输入地址，在当前页处理。"
    + "若没有 navigationUrl，第一步原生 switch(tab_id=入口.tabId)，即使代表试做已在该页也执行；"
    + "再依据入口.selector 的当前原生候选及 backendNodeId 找到本次条目的实际索引并原生 click；文档身份由宿主核验。"
    + "text 仅用于展示，允许空值或同名；ordinal 只描述来源顺序，不替代实际元素身份。"
    + "列表已经完成确认的排序/筛选，不重新导航列表，不对没有历史的新页使用 go_back。"
    + "不重选来源，不处理其它条目。范围内容整体取得，不按最终配置参数逐字段寻找。"
    + "正式运行由执行器对每个来源复用同一条链路。"
}
