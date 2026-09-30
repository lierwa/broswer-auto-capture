import { useMemo } from "react"
import { Button } from "@radix-ui/themes"
import { ChevronUp } from "lucide-react"
import { Background, Controls, MiniMap, ReactFlow, type Edge, type NodeTypes } from "@xyflow/react"
import { StageCanvasCard, TerminalCanvasCard, type StageCanvasNode, type TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { buildCanvasGraph, buildPreparationGraph } from "./ChainCanvasGraph.js"
import type { LiveChainModel } from "./useLiveChain.js"

type FlowNode = StageCanvasNode | TerminalCanvasNode
const nodeTypes = { "chain-stage": StageCanvasCard, "chain-terminal": TerminalCanvasCard } satisfies NodeTypes
const nodeDescription = "画布只读。按 Tab 前往阶段、动作或路径按钮，再按 Enter 或空格查看。"
const ariaLabelConfig = {
  "node.a11yDescription.default": nodeDescription,
  "node.a11yDescription.keyboardDisabled": nodeDescription,
  "edge.a11yDescription.default": "画布只读。按 Enter 或空格选择连线，按 Escape 取消选择。",
  "controls.ariaLabel": "画布视图", "controls.zoomIn.ariaLabel": "放大",
  "controls.zoomOut.ariaLabel": "缩小", "controls.fitView.ariaLabel": "适应视图",
  "minimap.ariaLabel": "链路缩略图",
}

export function LiveChainCanvas({ model, active, theme }: { model: LiveChainModel; active: boolean; theme: "light" | "dark" }) {
  const { displayChain, canvasPresentation: presentation, expandedStage, chainEvents, setSelectedStageId,
    setExpandedStageId, setSelectedNodeId, selectedNodeId, selectedStageId } = model
  const graph = useMemo(() => model.build ? buildPreparationGraph(model.build,
    id => { model.setContextMode(null); setSelectedStageId(null); setSelectedNodeId(id) }, expandedStage,
    id => setExpandedStageId(expandedStage?.id === id ? null : id),
    id => { model.setContextMode(null); setSelectedNodeId(null); setSelectedStageId(id) })
    : displayChain && presentation ? buildCanvasGraph(displayChain, presentation, expandedStage,
    chainEvents, (id) => { setExpandedStageId(expandedStage?.id === id ? null : id); setSelectedStageId(null); setSelectedNodeId(null) },
    (id) => { model.setContextMode(null); setSelectedStageId(null); setSelectedNodeId(id) },
    (id) => { model.setContextMode(null); setSelectedNodeId(null); setSelectedStageId(id) })
    : { nodes: [] as FlowNode[], edges: [] as Edge[] },
  [model.build, displayChain, expandedStage, presentation, chainEvents])
  if (!model.build && (!displayChain || !presentation)) return null
  return <div className="canvas-shell"><div className="flow-canvas chain-stage-canvas"
    aria-label={expandedStage ? `任务链路，已在原阶段展开${expandedStage.title}的路径` : "链路阶段图"}>
            {active && <ReactFlow<FlowNode, Edge> key={model.canvasKey}
              nodes={graph.nodes.map((item) => ({ ...item, selected: item.id === selectedNodeId || item.id === selectedStageId }))}
              edges={graph.edges} nodeTypes={nodeTypes} colorMode={theme}
              fitView fitViewOptions={{ padding: 0.16, minZoom: 0.5, maxZoom: 1 }} minZoom={0.3} maxZoom={1.8}
              nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} ariaLabelConfig={ariaLabelConfig}
              onNodeClick={(_, item) => { model.setContextMode(null); if (item.type === "chain-stage") {
                setSelectedNodeId(null); setSelectedStageId(item.id)
              } }}
              onEdgeClick={(_, edge) => { if (presentation?.stages.some((item) => item.id === edge.source)) {
                setSelectedNodeId(null); setSelectedStageId(edge.source)
              } }}
              >
              <Background gap={24} /><Controls showInteractive={false} /><MiniMap pannable zoomable /></ReactFlow>}
          </div></div>
}

export function LiveChainCanvasToolbar({ model }: { model: LiveChainModel }) {
  const { expandedStage, canvasPresentation, setExpandedStageId, setSelectedNodeId } = model
  if (!canvasPresentation) return null
  return <div className="canvas-mode-controls"><div>{expandedStage && <Button size="1" variant="ghost" onClick={() => {
          setExpandedStageId(null); setSelectedNodeId(null) }}><ChevronUp size={14} />收起路径</Button>}
          <strong>{expandedStage?.title ?? "任务链路"}</strong></div></div>
}
