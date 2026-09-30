import assert from "node:assert/strict"
import test from "node:test"
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ReactFlowProvider, type NodeProps } from "@xyflow/react"
import type { ChainPresentation, TaskChain } from "@browser-capture/contracts"
import { buildCanvasGraph, selectCanvasNodes, shareCanvasGraph } from "../src/ChainCanvasGraph.js"
import { StageCanvasCard, type StageCanvasNode } from "../src/ChainCanvasNodes.js"
import { LiveChainCanvas } from "../src/LiveChainCanvas.js"
import type { LiveChainModel } from "../src/useLiveChain.js"

const stage = { id: "read-stage", title: "读取页面", summary: "读取当前页的公开记录", nodeIds: ["read"],
  entryNodeId: "read", exits: [{ id: "done", label: "完成", sourceNodeId: "read", sourcePort: "success" }] }
const chain = { entry: "read", nodes: [
  { id: "read", kind: "capability", label: "读取列表", capability: { name: "browser.read-fields", version: 2 }, config: {} },
  { id: "done", kind: "terminal", label: "完成", status: "completed", reason: "完成" },
], edges: [{ from: "read", outcome: "success", to: "done" }] } as TaskChain
const presentation = { presentationDigest: "a".repeat(64), stages: [stage],
  overviewLayout: [{ stageId: stage.id, x: 21, y: 32 }],
  focusLayouts: [{ stageId: stage.id, nodes: [{ nodeId: "read", x: 43, y: 54 }] }],
} as ChainPresentation

test("单动作阶段仍是唯一阶段父节点，真实 nodeId 只存在于内部动作行", () => {
  const source = structuredClone({ chain, presentation, revision: 4, checksum: "b".repeat(64),
    validation: { status: "passed", revision: 4, checksum: "b".repeat(64) } })
  const before = structuredClone(source)
  freeze(source)
  const inspected: string[] = []
  const overview = buildCanvasGraph(source.chain, source.presentation, null, (id) => inspected.push(id))
  assert.deepEqual(overview.nodes.map((node) => node.type), ["chain-terminal", "chain-stage", "chain-terminal"])
  assert.equal(overview.nodes.filter((node) => node.type === "chain-stage").length, 1)
  assert.equal(overview.nodes.some((node) => node.type === "chain-action"), false)
  const stageNode = overview.nodes.find((node) => node.type === "chain-stage") as StageCanvasNode
  assert.deepEqual(stageNode.position, { x: 21, y: 32 })
  assert.deepEqual(overview.nodes.find((node) => node.id === "__start")!.position, { x: -251, y: 6 })
  assert.deepEqual(overview.nodes.find((node) => node.id === "__end:done")!.position, { x: 313, y: 6 })
  assert.deepEqual(stageNode.data.actions.map((item) => item.id), ["read"])
  stageNode.data.onInspect("read")
  stageNode.position.x += 100
  stageNode.selected = true
  assert.deepEqual(inspected, ["read"])
  assert.deepEqual(source, before)
})

test("子行始终原位显示；动作选择不改变 React Flow 身份与父级边", () => {
  const grouped = { id: "grouped", title: "读取并选择", summary: "读取 → 选择", nodeIds: ["first", "second"],
    entryNodeId: "first", exits: [{ id: "next", label: "继续", sourceNodeId: "second", sourcePort: "success" }] }
  const tail = { id: "tail", title: "读取结果", summary: "读取结果", nodeIds: ["third"], entryNodeId: "third",
    exits: [{ id: "done", label: "完成", sourceNodeId: "third", sourcePort: "success" }] }
  const groupedChain = { entry: "first", nodes: [
    { id: "first", kind: "function", label: "读取候选" }, { id: "second", kind: "function", label: "选择候选" },
    { id: "third", kind: "function", label: "读取结果" },
    { id: "done", kind: "terminal", label: "完成", status: "completed", reason: "完成" },
  ], edges: [{ from: "first", port: "success", to: "second" },
    { from: "second", port: "success", to: "third" }, { from: "third", port: "success", to: "done" }] } as TaskChain
  const groupedPresentation = { stages: [grouped, tail], overviewLayout: [
    { stageId: grouped.id, x: 113, y: 71 }, { stageId: tail.id, x: 467, y: 239 },
  ], focusLayouts: [
    { stageId: grouped.id, nodes: grouped.nodeIds.map((nodeId, index) => ({ nodeId, x: index * 100, y: 0 })) },
    { stageId: tail.id, nodes: [{ nodeId: "third", x: 0, y: 0 }] },
  ] } as unknown as ChainPresentation
  const initial = buildCanvasGraph(groupedChain, groupedPresentation, null, () => {})
  assert.ok(initial.nodes.some((node) => node.id === grouped.id && node.type === "chain-stage"))
  assert.ok(initial.nodes.some((node) => node.id === tail.id && node.type === "chain-stage"))
  assert.equal(initial.nodes.some((node) => node.type === "chain-action"), false)
  const selected = buildCanvasGraph(groupedChain, groupedPresentation, null, () => {}, () => {}, "second")
  assert.deepEqual(selected.nodes.map((node) => [node.id, node.type]), initial.nodes.map((node) => [node.id, node.type]))
  assert.deepEqual(selected.edges.map((edge) => [edge.source, edge.target]), initial.edges.map((edge) => [edge.source, edge.target]))
  const initialStage = initial.nodes.find((node) => node.id === grouped.id) as StageCanvasNode
  const selectedStage = selected.nodes.find((node) => node.id === grouped.id) as StageCanvasNode
  assert.deepEqual(selectedStage.data.actions.map((item) => [item.id, item.selected]), [["first", false], ["second", true]])
  assert.deepEqual(selectedStage.position, initialStage.position)
  assert.deepEqual(selectedStage.position, { x: 113, y: 71 })
  assert.equal(selectedStage.height, initialStage.height)
})

test("阶段与动作保留原生按钮，选中持续可辨且没有路径展开", () => {
  const selected: string[] = [], inspected: string[] = []
  const props = { id: stage.id, data: { title: stage.title, summary: stage.summary, direction: "LR", tone: "idle",
    statusLabel: "待运行",
    actions: [{ id: "read", title: "读取列表", type: "读取", tone: "idle", selected: true }],
    onSelect: (id: string) => selected.push(id), onInspect: (id: string) => inspected.push(id) } } as NodeProps<StageCanvasNode>
  const element = StageCanvasCard(props)
  const button = findButton(element, "查看动作：读取列表")
  assert.ok(button)
  assert.equal(button.props.type, "button")
  let stopped = 0
  button.props.onClick({ stopPropagation: () => stopped++ })
  assert.deepEqual(inspected, ["read"])
  assert.equal(stopped, 1)
  findButton(element, "查看阶段：读取页面")!.props.onClick({ stopPropagation() {} })
  assert.equal(findButton(element, "展开路径：读取页面"), undefined)
  assert.deepEqual(selected, [stage.id])
  const html = renderToStaticMarkup(createElement(ReactFlowProvider, null, element))
  assert.match(html, /<button[^>]*aria-label="查看动作：读取列表"/)
  assert.doesNotMatch(html, /展开路径|chain-stage-routes/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /data-selected="true"/)
  assert.match(html, /chain-stage-handle/)
})

test("亮暗画布均透传主题并保留具名缩放与适应视图控件", () => {
  const noop = () => {}
  const model = { displayChain: chain, presentation, canvasPresentation: presentation, chainEvents: null,
    setSelectedStageId: noop, setSelectedNodeId: noop, setContextMode: noop,
    selectedNodeId: null, selectedStageId: null } as unknown as LiveChainModel
  for (const theme of ["light", "dark"] as const) {
    const html = renderToStaticMarkup(createElement(LiveChainCanvas, { model, active: true, theme }))
    assert.match(html, new RegExp(`class="[^"]*react-flow [^"]*${theme}`))
    // SSR 不执行 React Flow StoreUpdater effect；这里只验原生控件有名字，不能冒充挂载后的中文提示验证。
    const controls = [...html.matchAll(/<button\b[^>]*class="[^"]*react-flow__controls-(zoomin|zoomout|fitview)"[^>]*aria-label="([^"]+)"/g)]
    assert.deepEqual(controls.map((match) => match[1]).sort(), ["fitview", "zoomin", "zoomout"])
    assert.ok(controls.every((match) => match[2]!.trim()), `${theme}: 缩放控件缺少可访问名称`)
  }
})

test("终点尺寸在布局时确定，同阶段多个真实终点互不重叠", () => {
  const graph = buildCanvasGraph({ ...chain, nodes: [...chain.nodes,
    { id: "failed", kind: "terminal", label: "失败", status: "failed", reason: "目标受阻" }],
    edges: [...chain.edges, { from: "read", outcome: "failed", to: "failed" }] } as TaskChain,
  presentation, null, () => {})
  const terminals = graph.nodes.filter(item => item.type === "chain-terminal" && item.data.terminal === "end")
    .sort((a, b) => a.position.y - b.position.y)
  assert.ok(terminals.every(item => item.height === 96 && item.width === 220))
  assert.ok(terminals[1]!.position.y >= terminals[0]!.position.y + Number(terminals[0]!.height))
})

test("运行投影相同保留整图引用，仅动作选择只改变所属阶段", () => {
  const inspect = () => {}, select = () => {}, share = shareCanvasGraph()
  const first = share(buildCanvasGraph(chain, presentation, null, inspect, select))
  const same = share(buildCanvasGraph(chain, presentation, null, inspect, select))
  assert.equal(same.nodes, first.nodes)
  assert.equal(same.edges, first.edges)
  const selected = selectCanvasNodes(first.nodes, "read", null, null)
  for (const item of first.nodes) {
    const next = selected.find(node => node.id === item.id)!
    if (item.type === "chain-stage") {
      assert.notEqual(next, item)
      assert.equal(next.position, item.position)
      assert.equal((next as StageCanvasNode).data.actions[0]!.selected, true)
    } else assert.equal(next, item)
  }
})

function freeze(value: unknown): void {
  if (!value || typeof value !== "object") return
  Object.values(value).forEach(freeze)
  Object.freeze(value)
}

type ButtonElement = ReactElement<{ type?: string; "aria-label"?: string;
  onClick(event: { stopPropagation(): void }): void }>
function findButton(node: ReactNode, label: string): ButtonElement | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined
  if (node.type === "button" && (node.props as { "aria-label"?: string })["aria-label"] === label) return node as ButtonElement
  return Children.toArray(node.props.children).map((child) => findButton(child, label)).find(Boolean)
}
