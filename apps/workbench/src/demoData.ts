import type { Edge, Node } from "@xyflow/react"

export const demoNodes: Node[] = [
  { id: "scope", position: { x: 0, y: 110 }, data: { label: "确认来源范围\n演示计划" }, type: "input", className: "flow-node plan-node" },
  { id: "open", position: { x: 210, y: 110 }, data: { label: "打开商品页\n普通节点" }, className: "flow-node" },
  { id: "specs", position: { x: 420, y: 35 }, data: { label: "读取原始参数\n普通节点" }, className: "flow-node" },
  { id: "reviews", position: { x: 420, y: 190 }, data: { label: "逐页读取评价\n循环检查点" }, className: "flow-node checkpoint-node" },
  { id: "result", position: { x: 650, y: 110 }, data: { label: "保存样例结构\n来源关联" }, type: "output", className: "flow-node result-node" },
]

export const demoEdges: Edge[] = [
  { id: "scope-open", source: "scope", target: "open" },
  { id: "open-specs", source: "open", target: "specs" },
  { id: "open-reviews", source: "open", target: "reviews" },
  { id: "specs-result", source: "specs", target: "result" },
  { id: "reviews-result", source: "reviews", target: "result" },
]

export const nodeDetails: Record<string, { title: string; detail: string }> = {
  scope: { title: "确认来源范围", detail: "输入：旗舰店入口；输出：演示范围。" },
  open: { title: "打开商品页", detail: "普通节点候选：按已确认的来源链接导航。" },
  specs: { title: "读取原始参数", detail: "普通节点候选：保留字段原文与来源页面关联。" },
  reviews: { title: "逐页读取评价", detail: "循环检查点候选：最多 100 条，不足时记录终止原因。" },
  result: { title: "保存样例结构", detail: "输出字段包含商品、原始参数、评价和来源关联。" },
}
