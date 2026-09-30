import { useMemo } from "react"
import { Background, Controls, MiniMap, ReactFlow, type Edge, type NodeTypes } from "@xyflow/react"
import { StageCanvasCard, TerminalCanvasCard, type StageCanvasNode, type TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { buildCanvasGraph, buildPreparationGraph } from "./ChainCanvasGraph.js"
import { latestExecutionEvents } from "./chainWorkbenchProjection.js"
import { executionStatus } from "./ExecutionPresentation.js"
import { startFact, terminalFact } from "./chainTerminalFacts.js"
import type { LiveChainModel } from "./useLiveChain.js"

type FlowNode = StageCanvasNode | TerminalCanvasNode
const nodeTypes = { "chain-stage": StageCanvasCard, "chain-terminal": TerminalCanvasCard } satisfies NodeTypes
const nodeDescription = "画布只读。按 Tab 前往阶段或动作，再按 Enter 或空格查看。"
const ariaLabelConfig = {
  "node.a11yDescription.default": nodeDescription,
  "node.a11yDescription.keyboardDisabled": nodeDescription,
  "edge.a11yDescription.default": "画布只读。按 Enter 或空格选择连线，按 Escape 取消选择。",
  "controls.ariaLabel": "画布视图", "controls.zoomIn.ariaLabel": "放大",
  "controls.zoomOut.ariaLabel": "缩小", "controls.fitView.ariaLabel": "适应视图", "minimap.ariaLabel": "链路缩略图",
}

export function LiveChainCanvas({ model, active, theme }: { model: LiveChainModel; active: boolean; theme: "light" | "dark" }) {
  const { displayChain, canvasPresentation: presentation, chainEvents, selectedNodeId, selectedStageId } = model
  const inspect = (id: string) => { model.setContextMode(null); model.setSelectedStageId(null); model.setSelectedNodeId(id) }
  const select = (id: string) => { model.setContextMode(null); model.setSelectedNodeId(null); model.setSelectedStageId(id) }
  const graph = useMemo(() => model.build ? buildPreparationGraph(model.build, inspect, select, selectedNodeId)
    : displayChain && presentation ? buildCanvasGraph(displayChain, presentation, chainEvents,
      inspect, select, selectedNodeId) : { nodes: [] as FlowNode[], edges: [] as Edge[] },
    [model.build, displayChain, presentation, chainEvents, selectedNodeId])
  if (!model.build && (!displayChain || !presentation)) return null
  const nodes = graph.nodes.map((item) => decorateTerminal(item, model))
  const edges = graph.edges.map(edge => {
    if (edge.data?.tone === "idle" || edge.data?.tone === "unselected") return edge
    const target = nodes.find(node => node.id === edge.target && node.type === "chain-terminal" && node.data.terminal === "end")
    if (!target) return edge
    const tone = target.data.tone
    const color = tone === "success" ? "var(--green-9)" : tone === "failure" ? "var(--red-9)" : "var(--gray-8)"
    return { ...edge, animated: false, className: `chain-edge chain-edge-${tone}`, style: { ...edge.style, stroke: color, strokeWidth: 1.4 } }
  })
  return <div className="canvas-shell"><div className="flow-canvas chain-stage-canvas" aria-label="链路阶段图">
    {active && <ReactFlow<FlowNode, Edge> key={model.canvasKey} nodes={nodes.map((item) => ({ ...item,
      selected: item.id === selectedNodeId || item.id === `__end:${selectedNodeId}` || item.id === selectedStageId || item.id === "__start" && model.contextMode === "start" }))}
      edges={edges} nodeTypes={nodeTypes} colorMode={theme}
      fitView fitViewOptions={{ padding: 0.16, minZoom: 0.3, maxZoom: 1 }} minZoom={0.3} maxZoom={1.8}
      nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} ariaLabelConfig={ariaLabelConfig}
      onNodeClick={(_, item) => { if (item.type === "chain-stage") select(item.id) }}
      onEdgeClick={(_, edge) => { if (presentation?.stages.some((item) => item.id === edge.source)) select(edge.source) }}>
      <Background gap={24} /><Controls showInteractive={false} /><MiniMap pannable zoomable />
    </ReactFlow>}
  </div></div>
}

function decorateTerminal(item: FlowNode, model: LiveChainModel): FlowNode {
  if (item.type !== "chain-terminal") return item
  const start = item.data.terminal === "start"
  const nodeId = start ? model.chain?.entry : item.id.slice("__end:".length)
  const node = model.chain?.nodes.find((node) => node.id === nodeId)
  const requirement = model.plan?.requirement
  const event = nodeId ? latestExecutionEvents(model.chainEvents).get(nodeId)?.event : null
  const fact = node?.kind === "terminal" ? terminalFact(node, event ?? undefined, model.selectedCall?.run) : "unreached"
  const reached = fact === "reached"
  const state = startFact(model.detail?.execution ?? model.selectedExecution, Boolean(model.selectedCall), Boolean(model.acceptedExecutionId))
  const statusLabel = start ? model.selectedRunId !== null && !model.selectedCall ? "所选调用未读取"
    : { bound: "实际输入已绑定", waiting: "已受理，步骤待开始", not_entered: "本次未进入步骤", idle: "尚未运行" }[state]
    : reached ? "已到达 · 查看本次返回" : fact === "return_failed" ? "返回处理失败" : event ? "终点事实待确认" : "未到达"
  return { ...item, width: 220, height: 96,
    position: { x: item.position.x - (start ? 80 : 0), y: item.position.y - 23 },
    data: { ...item.data, ...(!start && fact === "return_failed" ? { tone: "failure" as const }
      : !start && !reached ? { tone: "idle" as const } : {}), summary: start ? `需求 v${requirement?.version ?? "未记录"} · ${model.requirement?.goal ?? model.chain?.name ?? "入口"}`
      : node?.kind === "terminal" ? node.reason === node.status ? executionStatus(node.status) : node.reason : "声明终点", statusLabel,
      onInspect: () => { if (start) model.openContext("start"); else {
        model.setContextMode(null); model.setSelectedStageId(null); model.setSelectedNodeId(nodeId ?? null)
      } } } }
}

export function LiveChainCanvasToolbar({ model }: { model: LiveChainModel }) {
  return model.canvasPresentation ? <div className="canvas-mode-controls"><strong>任务链路</strong></div> : null
}
