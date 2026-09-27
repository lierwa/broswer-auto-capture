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

test("展开与查看使用独立图投影，冻结图源及验证元数据保持不变", () => {
  const source = structuredClone({ chain, presentation, revision: 4, checksum: "b".repeat(64),
    validation: { status: "passed", revision: 4, checksum: "b".repeat(64) } })
  const before = structuredClone(source)
  freeze(source)
  const entered: string[] = [], inspected: string[] = []
  const overview = buildCanvasGraph(source.chain, source.presentation, null, null,
    (id) => entered.push(id), (id) => inspected.push(id))
  const stageNode = overview.nodes.find((node) => node.type === "chain-stage") as StageCanvasNode
  stageNode.data.onEnter(stageNode.id)
  const focused = buildCanvasGraph(source.chain, source.presentation, source.presentation.stages[0]!, null,
    (id) => entered.push(id), (id) => inspected.push(id))
  const action = focused.nodes.find((node) => node.type === "chain-action") as ActionCanvasNode
  action.data.onInspect(action.id)
  action.position.x += 100
  action.selected = true
  assert.deepEqual(entered, [stage.id])
  assert.deepEqual(inspected, ["read"])
  assert.deepEqual(source, before)
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
