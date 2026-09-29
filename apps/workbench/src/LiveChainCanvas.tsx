import { useMemo } from "react"
import { Button } from "@radix-ui/themes"
import { ChevronLeft } from "lucide-react"
import { Background, Controls, MiniMap, ReactFlow, type Edge, type NodeTypes } from "@xyflow/react"
import { ActionCanvasCard, StageCanvasCard, TerminalCanvasCard, type ActionCanvasNode, type StageCanvasNode, type TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { buildCanvasGraph, buildPreparationGraph } from "./ChainCanvasGraph.js"
import type { LiveChainModel } from "./useLiveChain.js"

type FlowNode = StageCanvasNode | ActionCanvasNode | TerminalCanvasNode
const nodeTypes = { "chain-stage": StageCanvasCard, "chain-action": ActionCanvasCard,
  "chain-terminal": TerminalCanvasCard } satisfies NodeTypes
const nodeDescription = "画布只读。按 Tab 前往展开动作或动作标题按钮，再按 Enter 或空格查看。"
const ariaLabelConfig = {
  "node.a11yDescription.default": nodeDescription,
  "node.a11yDescription.keyboardDisabled": nodeDescription,
  "edge.a11yDescription.default": "画布只读。按 Enter 或空格选择连线，按 Escape 取消选择。",
  "controls.ariaLabel": "画布视图", "controls.zoomIn.ariaLabel": "放大",
  "controls.zoomOut.ariaLabel": "缩小", "controls.fitView.ariaLabel": "适应视图",
  "minimap.ariaLabel": "链路缩略图",
}

export function LiveChainCanvas({ model, active, theme }: { model: LiveChainModel; active: boolean; theme: "light" | "dark" }) {
  const { displayChain, presentation, focusStage, chainEvents, setSelectedStageId,
    setFocusStageId, setSelectedNodeId, selectedNodeId, selectedStageId } = model
  const graph = useMemo(() => model.build ? buildPreparationGraph(model.build,
    id => { model.setContextMode(null); setSelectedStageId(null); setSelectedNodeId(id) })
    : displayChain && presentation ? buildCanvasGraph(displayChain, presentation, focusStage,
    chainEvents, (id) => { setFocusStageId(id); setSelectedStageId(null); setSelectedNodeId(null) },
    (id) => { model.setContextMode(null); setSelectedStageId(null); setSelectedNodeId(id) })
    : { nodes: [] as FlowNode[], edges: [] as Edge[] },
  [model.build, displayChain, focusStage, presentation, chainEvents])
  if (!model.build && (!displayChain || !presentation)) return null
  return <div className="canvas-shell"><div className="flow-canvas chain-stage-canvas" aria-label={focusStage ? `任务链路，已展开${focusStage.title}` : "链路阶段总览"}>
            {active && <ReactFlow<FlowNode, Edge> key={model.canvasKey}
              nodes={graph.nodes.map((item) => ({ ...item, selected: item.id === selectedNodeId || item.id === selectedStageId }))}
              edges={graph.edges} nodeTypes={nodeTypes} colorMode={theme}
              fitView fitViewOptions={{ padding: 0.16, minZoom: 0.5, maxZoom: 1 }} minZoom={0.3} maxZoom={1.8}
              nodesDraggable={false} nodesConnectable={false} deleteKeyCode={null} ariaLabelConfig={ariaLabelConfig}
              onNodeClick={(_, item) => { model.setContextMode(null); if (item.type === "chain-stage") {
                setSelectedNodeId(null); setSelectedStageId(item.id)
              } else if (item.type === "chain-action") { setSelectedStageId(null); setSelectedNodeId(item.id) } }}
              onEdgeClick={(_, edge) => { if ((model.build?.nodes ?? displayChain?.nodes)?.some((item) => item.id === edge.source)) {
                setSelectedStageId(null); setSelectedNodeId(edge.source)
              } }}
              >
              <Background gap={24} /><Controls showInteractive={false} /><MiniMap pannable zoomable /></ReactFlow>}
          </div></div>
}

export function LiveChainCanvasToolbar({ model }: { model: LiveChainModel }) {
  const { focusStage, presentation, setFocusStageId, setSelectedNodeId } = model
  if (!presentation) return null
  return <div className="canvas-mode-controls"><div>{focusStage && <Button size="1" variant="ghost" onClick={() => {
          setFocusStageId(null); setSelectedNodeId(null) }}><ChevronLeft size={14} />收起阶段</Button>}
          <strong>{focusStage?.title ?? "任务链路"}</strong></div></div>
}
