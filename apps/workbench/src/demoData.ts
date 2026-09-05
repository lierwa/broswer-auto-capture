import type { Edge, Node } from "@xyflow/react"
import type { DemoStage } from "./demoState.js"

export const demoNodes: Node[] = [
  { id: "scope", position: { x: 0, y: 110 }, data: { label: "确认来源范围\n演示计划" }, type: "input", className: "flow-node plan-node" },
  { id: "open", position: { x: 210, y: 110 }, data: { label: "打开商品页\n普通节点" }, className: "flow-node" },
  { id: "specs", position: { x: 420, y: 35 }, data: { label: "读取原始参数\n普通节点" }, className: "flow-node" },
  { id: "reviews", position: { x: 420, y: 190 }, data: { label: "逐页读取评价\n循环检查点" }, className: "flow-node checkpoint-node" },
  { id: "result", position: { x: 650, y: 110 }, data: { label: "保存样例结构\n来源关联" }, type: "output", className: "flow-node result-node" },
]

export const demoEdges: Edge[] = [
  { id: "scope-open", source: "scope", target: "open", animated: true },
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

export const stageCopy: Record<DemoStage, { label: string; queue: string; next: string }> = {
  draft: { label: "演示 · 待确认", queue: "尚未排队", next: "请先确认演示计划" },
  confirmed: { label: "演示 · 已确认", queue: "可加入演示队列", next: "模拟加入队列" },
  queued: { label: "演示 · 排队中", queue: "演示队列第 1 位", next: "模拟开始执行" },
  running: { label: "演示 · 模拟执行中", queue: "模拟执行中", next: "模拟暂停" },
  paused: { label: "演示 · 已暂停", queue: "已保存演示进度", next: "模拟恢复" },
  complete: { label: "演示 · 已完成", queue: "演示流程已结束", next: "样例结果可查看" },
}
