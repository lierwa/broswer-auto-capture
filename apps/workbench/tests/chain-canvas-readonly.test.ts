import assert from "node:assert/strict"
import test from "node:test"
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ReactFlowProvider, type NodeProps } from "@xyflow/react"
import type { ChainPresentation, TaskChain } from "@browser-capture/contracts"
import { buildCanvasGraph } from "../src/ChainCanvasGraph.js"
import { ActionCanvasCard, StageCanvasCard, type ActionCanvasNode, type StageCanvasNode } from "../src/ChainCanvasNodes.js"
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

test("单节点阶段直接显示真实动作卡，冻结图源及验证元数据保持不变", () => {
  const source = structuredClone({ chain, presentation, revision: 4, checksum: "b".repeat(64),
    validation: { status: "passed", revision: 4, checksum: "b".repeat(64) } })
  const before = structuredClone(source)
  freeze(source)
  const entered: string[] = [], inspected: string[] = []
  const overview = buildCanvasGraph(source.chain, source.presentation, null, null,
    (id) => entered.push(id), (id) => inspected.push(id))
  assert.equal(overview.nodes.some((node) => node.type === "chain-stage"), false)
  const action = overview.nodes.find((node) => node.type === "chain-action") as ActionCanvasNode
  action.data.onInspect(action.id)
  action.position.x += 100
  action.selected = true
  assert.deepEqual(entered, [])
  assert.deepEqual(inspected, ["read"])
  assert.deepEqual(source, before)
})

test("展开多节点阶段只替换该阶段并把外边接回真实入口与出口", () => {
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
  const groupedPresentation = { stages: [grouped, tail], overviewLayout: [], focusLayouts: [
    { stageId: grouped.id, nodes: grouped.nodeIds.map((nodeId, index) => ({ nodeId, x: index * 100, y: 0 })) },
    { stageId: tail.id, nodes: [{ nodeId: "third", x: 0, y: 0 }] },
  ] } as unknown as ChainPresentation
  const entered: string[] = []
  const collapsed = buildCanvasGraph(groupedChain, groupedPresentation, null, null,
    (id) => entered.push(id), () => {})
  assert.ok(collapsed.nodes.some((node) => node.id === grouped.id && node.type === "chain-stage"))
  assert.ok(collapsed.nodes.some((node) => node.id === "third" && node.type === "chain-action"))
  ;(collapsed.nodes.find((node) => node.id === grouped.id) as StageCanvasNode).data.onEnter(grouped.id)
  assert.deepEqual(entered, [grouped.id])
  const expanded = buildCanvasGraph(groupedChain, groupedPresentation, grouped, null, () => {}, () => {})
  assert.equal(expanded.nodes.some((node) => node.id === grouped.id), false)
  assert.deepEqual(["first", "second", "third"].map((id) => expanded.nodes.some((node) => node.id === id)), [true, true, true])
  assert.equal(expanded.nodes.some((node) => node.id.startsWith("__stage_")), false)
  assert.ok(expanded.edges.some((edge) => edge.source === "__start" && edge.target === "first"))
  assert.ok(expanded.edges.some((edge) => edge.source === "second" && edge.target === "third"))
  const internalRight = Math.max(...expanded.nodes.filter((node) => grouped.nodeIds.includes(node.id))
    .map((node) => node.position.x + Number(node.width ?? 240)))
  const tailLeft = expanded.nodes.find((node) => node.id === "third")!.position.x
  assert.ok(tailLeft > internalRight, "展开后的动作不能覆盖后续阶段")
})

test("动作详情与阶段展开保留原生按钮，详情激活仅调用当前节点回调", () => {
  const inspected: string[] = []
  const props = { id: "read", data: { title: "读取列表", direction: "LR", tone: "idle",
    onInspect: (id: string) => inspected.push(id) } } as NodeProps<ActionCanvasNode>
  const element = ActionCanvasCard(props)
  const button = findButton(element)
  assert.ok(button)
  assert.equal(button.props.type, "button")
  assert.equal(button.props["aria-label"], "查看动作：读取列表")
  let stopped = 0
  button.props.onClick({ stopPropagation: () => stopped++ })
  assert.deepEqual(inspected, ["read"])
  assert.equal(stopped, 1)
  const html = renderToStaticMarkup(createElement(ReactFlowProvider, null, element,
    createElement(StageCanvasCard, { id: stage.id, data: { title: stage.title, summary: stage.summary,
      tone: "idle", direction: "LR", onEnter: () => {} } } as NodeProps<StageCanvasNode>)))
  assert.match(html, /<button[^>]*aria-label="查看动作：读取列表"/)
  assert.match(html, /<button[^>]*>展开动作 /)
})

test("亮暗画布均透传主题并保留具名缩放与适应视图控件", () => {
  const noop = () => {}
  const model = { displayChain: chain, presentation, focusStage: null, chainEvents: null,
    setSelectedStageId: noop, setFocusStageId: noop, setSelectedNodeId: noop, setContextMode: noop,
    selectedNodeId: null, selectedStageId: null, focusStageId: null } as unknown as LiveChainModel
  for (const theme of ["light", "dark"] as const) {
    const html = renderToStaticMarkup(createElement(LiveChainCanvas, { model, active: true, theme }))
    assert.match(html, new RegExp(`class="[^"]*react-flow [^"]*${theme}`))
    // SSR 不执行 React Flow StoreUpdater effect；这里只验原生控件有名字，不能冒充挂载后的中文提示验证。
    const controls = [...html.matchAll(/<button\b[^>]*class="[^"]*react-flow__controls-(zoomin|zoomout|fitview)"[^>]*aria-label="([^"]+)"/g)]
    assert.deepEqual(controls.map((match) => match[1]).sort(), ["fitview", "zoomin", "zoomout"])
    assert.ok(controls.every((match) => match[2]!.trim()), `${theme}: 缩放控件缺少可访问名称`)
  }
})

function freeze(value: unknown): void {
  if (!value || typeof value !== "object") return
  Object.values(value).forEach(freeze)
  Object.freeze(value)
}

type ButtonElement = ReactElement<{ type?: string; "aria-label"?: string;
  onClick(event: { stopPropagation(): void }): void }>
function findButton(node: ReactNode): ButtonElement | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined
  if (node.type === "button") return node as ButtonElement
  return Children.toArray(node.props.children).map(findButton).find(Boolean)
}
