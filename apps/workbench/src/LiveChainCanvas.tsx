import { memo, useCallback, useMemo } from "react"
import { Background, Controls, MiniMap, ReactFlow, type Edge, type NodeTypes } from "@xyflow/react"
import { StageCanvasCard, TerminalCanvasCard, type StageCanvasNode, type TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { buildCanvasGraph, buildPreparationGraph, selectCanvasNodes, shareCanvasGraph } from "./ChainCanvasGraph.js"
import { startFact } from "./chainTerminalFacts.js"
import type { ChainPresentation } from "@browser-capture/contracts"
import type { LiveChainModel } from "./useLiveChain.js"

type FlowNode = StageCanvasNode | TerminalCanvasNode
const nodeTypes = { "chain-stage": memo(StageCanvasCard), "chain-terminal": memo(TerminalCanvasCard) } satisfies NodeTypes
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
  const { setContextMode, setSelectedStageId, setSelectedNodeId } = model
  const inspect = useCallback((id: string) => {
    setContextMode(null); setSelectedStageId(null); setSelectedNodeId(id)
  }, [setContextMode, setSelectedStageId, setSelectedNodeId])
  const select = useCallback((id: string) => {
    setContextMode(null); setSelectedNodeId(null); setSelectedStageId(id)
  }, [setContextMode, setSelectedStageId, setSelectedNodeId])
  const start = useCallback(() => {
    setSelectedNodeId(null); setSelectedStageId(null); setContextMode("start")
  }, [setContextMode, setSelectedStageId, setSelectedNodeId])
  const project = useMemo(() => shareCanvasGraph(), [])
  const requirement = model.plan?.requirement
  const summary = `需求 v${requirement?.version ?? "未记录"} · ${model.requirement?.goal ?? model.chain?.name ?? "入口"}`
  const state = startFact(model.detail?.execution ?? model.selectedExecution, Boolean(model.selectedCall), Boolean(model.acceptedExecutionId))
  const status = model.selectedRunId !== null && !model.selectedCall ? "所选调用未读取"
    : { bound: "实际输入已绑定", waiting: "已受理，步骤待开始", not_entered: "本次未进入步骤", idle: "尚未运行" }[state]
  const call = model.selectedCall?.run
  const graph = useMemo(() => project(model.build ? buildPreparationGraph(model.build, inspect, select)
    : displayChain && presentation ? buildCanvasGraph(displayChain, presentation, chainEvents,
      inspect, select, null, { summary, status, call, onStart: start }) : { nodes: [] as FlowNode[], edges: [] as Edge[] }),
    [model.build, displayChain, presentation, chainEvents, inspect, select, start, summary, status, call, project])
  const nodes = useMemo(() => selectCanvasNodes(graph.nodes, selectedNodeId, selectedStageId, model.contextMode),
    [graph.nodes, selectedNodeId, selectedStageId, model.contextMode])
  if (!model.build && (!displayChain || !presentation)) return null
  return <div className="canvas-shell"><div className="flow-canvas chain-stage-canvas" aria-label="链路阶段图">
    {active && <CanvasSurface nodes={nodes} edges={graph.edges} canvasKey={model.canvasKey}
      presentation={presentation ?? null} theme={theme} onSelect={select} />}
  </div></div>
}

const CanvasSurface = memo(function CanvasSurface({ nodes, edges, canvasKey, presentation, theme, onSelect }: {
  nodes: FlowNode[]; edges: Edge[]; canvasKey: string; presentation: Pick<ChainPresentation, "stages"> | null;
  theme: "light" | "dark"; onSelect(id: string): void
}) {
  return <ReactFlow<FlowNode, Edge> key={canvasKey} nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={theme}
    fitView fitViewOptions={{ padding: 0.16, minZoom: 0.3, maxZoom: 1 }} minZoom={0.3} maxZoom={1.8}
    nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} ariaLabelConfig={ariaLabelConfig}
    onNodeClick={(_, item) => { if (item.type === "chain-stage") onSelect(item.id) }}
    onEdgeClick={(_, edge) => { if (presentation?.stages.some(item => item.id === edge.source)) onSelect(edge.source) }}>
    <Background gap={24} /><Controls showInteractive={false} /><MiniMap pannable zoomable />
  </ReactFlow>
})

export function LiveChainCanvasToolbar({ model }: { model: LiveChainModel }) {
  return model.canvasPresentation ? <div className="canvas-mode-controls"><strong>任务链路</strong></div> : null
}
