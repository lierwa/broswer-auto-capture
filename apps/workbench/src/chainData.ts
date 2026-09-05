import { Position, type Edge, type Node } from "@xyflow/react"

export const planSteps = [
  { id: "catalog", title: "枚举店铺商品", input: "已核验的店铺入口", output: "商品来源键 + 商品 URL", depends: "无前置步骤",
    finish: "列表到末页；按稳定来源键去重", source: "待核验：店铺商品列表", budget: "商品 / 页数上限待真实调研后确认" },
  { id: "details", title: "读取商品详情", input: "步骤 01 的商品 URL", output: "型号、原始参数、来源链接", depends: "01 枚举店铺商品",
    finish: "逐商品保留原文；缺失字段明确记录", source: "待核验：商品详情页", budget: "每商品一次详情提取；重试上限待确认" },
  { id: "reviews", title: "采集商品评价", input: "步骤 01 的商品来源键", output: "评价原文 + 来源 + 终止原因", depends: "01 枚举店铺商品",
    finish: "每商品 100 条或页面无更多；保留默认排序", source: "待核验：商品评价区域", budget: "最多 100 条 / 商品；时间与翻页上限待确认" },
] as const
export type StepId = typeof planSteps[number]["id"]
export interface NodeDetail { title: string; kind: string; input: string; output: string; rule: string; finish: string }

const definitions: Record<StepId, NodeDetail[]> = {
  catalog: [
    { title: "打开店铺列表", kind: "普通动作", input: "storeUrl", output: "列表页观察", rule: "navigate → 等待列表语义就绪", finish: "登录或访问受限时暂停" },
    { title: "提取商品链接", kind: "普通动作", input: "当前列表页", output: "sourceKey + productUrl", rule: "读取商品卡片；保留来源", finish: "提取规则尚待真实探索" },
    { title: "去重与检查点", kind: "检查点", input: "本页商品", output: "本运行唯一商品集合", rule: "按稳定来源键去重并保存游标", finish: "检查点与结果一致提交" },
    { title: "还有下一页？", kind: "条件分支", input: "页面观察 + 已读页数", output: "继续 / 结束", rule: "有下一页且未达到授权预算才继续", finish: "无更多或预算耗尽，记录原因" },
    { title: "翻到下一页", kind: "普通动作", input: "下一页语义目标", output: "新列表页", rule: "重新定位目标并等待内容变化", finish: "内容未变化时暂停，不无限循环" },
    { title: "输出商品集合", kind: "结果输出", input: "商品集合 + 终止原因", output: "详情与评价步骤输入", rule: "保留来源关系与覆盖证据", finish: "完成状态依据实际覆盖" },
  ],
  details: [
    { title: "打开商品页", kind: "普通动作", input: "productUrl", output: "商品页观察", rule: "等待商品主体就绪", finish: "受限时暂停，不绕过" },
    { title: "读取原始参数", kind: "普通动作", input: "商品页", output: "型号 + 原始参数", rule: "保留字段原文，不做商品归一化", finish: "缺失明确记录" },
    { title: "关联来源", kind: "检查点", input: "参数 + sourceKey", output: "来源关联记录", rule: "同运行同来源键幂等保存", finish: "保存成功后推进游标" },
    { title: "输出详情", kind: "结果输出", input: "来源关联记录", output: "商品详情结果", rule: "附运行与抓取时间", finish: "字段检查通过" },
  ],
  reviews: [
    { title: "打开评价区域", kind: "普通动作", input: "productUrl", output: "默认排序评价页", rule: "保持页面默认排序", finish: "记录实际排序" },
    { title: "提取当前评价", kind: "普通动作", input: "当前评价页", output: "评价原文 + 来源键", rule: "读取可见评价，不补造内容", finish: "提取规则尚待真实探索" },
    { title: "去重并计数", kind: "检查点", input: "本页评价", output: "本商品累计评价", rule: "稳定键去重；每商品独立计数", finish: "保存当前页与游标" },
    { title: "达到终止条件？", kind: "条件分支", input: "实际条数 + 页面观察", output: "继续 / 结束", rule: "满 100 条、无更多或预算耗尽则结束", finish: "保留实际数量和终止原因" },
    { title: "加载更多评价", kind: "普通动作", input: "下一页语义目标", output: "后续评价页", rule: "等待语义变化后重新提取", finish: "重复页面或结构漂移时暂停" },
    { title: "输出评价结果", kind: "结果输出", input: "评价 + 商品来源键", output: "关联商品的评价集合", rule: "不足 100 条保留实际数量", finish: "记录排序、来源和终止原因" },
  ],
}

export function stepGraph(step: StepId): { nodes: Node[]; edges: Edge[]; details: NodeDetail[] } {
  const details = definitions[step]
  const branching = details.length === 6
  const positions = branching
    ? [{ x: 0, y: 60 }, { x: 225, y: 60 }, { x: 450, y: 60 }, { x: 675, y: 60 }, { x: 450, y: 245 }, { x: 900, y: 60 }]
    : details.map((_, index) => ({ x: index * 225, y: 90 }))
  const nodes: Node[] = details.map((detail, index) => ({
    id: String(index), position: positions[index]!, data: { label: `${detail.title}\n${detail.kind}` },
    sourcePosition: Position.Right, targetPosition: Position.Left,
    type: index === 0 ? "input" : index === details.length - 1 ? "output" : "default",
    className: `flow-node ${detail.kind === "检查点" ? "checkpoint-node" : ""}`,
  }))
  const links: [number, number, string?][] = branching
    ? [[0, 1], [1, 2], [2, 3], [3, 4, "继续"], [4, 1, "新一页"], [3, 5, "结束"]]
    : [[0, 1], [1, 2], [2, 3]]
  const edges = links.map(([from, to, label]) => ({ id: `${from}-${to}`, source: String(from), target: String(to), label, type: "smoothstep" }))
  return { nodes, edges, details }
}
