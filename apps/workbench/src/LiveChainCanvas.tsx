import { useEffect, useMemo } from "react"
import { Button } from "@radix-ui/themes"
import { ChevronLeft, Sparkles } from "lucide-react"
import { Background, Controls, MiniMap, ReactFlow, useNodesState, type Edge, type NodeTypes } from "@xyflow/react"
import { ActionCanvasCard, StageCanvasCard, TerminalCanvasCard, type ActionCanvasNode, type StageCanvasNode, type TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { buildCanvasGraph } from "./ChainCanvasGraph.js"
import type { LiveChainModel } from "./useLiveChain.js"

type FlowNode = StageCanvasNode | ActionCanvasNode | TerminalCanvasNode
const nodeTypes = { "chain-stage": StageCanvasCard, "chain-action": ActionCanvasCard,
  "chain-terminal": TerminalCanvasCard } satisfies NodeTypes

export function LiveChainCanvas({ model, active, theme }: { model: LiveChainModel; active: boolean; theme: "light" | "dark" }) {
  const { displayChain, presentation, focusStage, previewStageId, direction, arranged, chainEvents, setSelectedStageId,
    setPreviewStageId, setFocusStageId, setSelectedNodeId, selectedNodeId, selectedStageId, focusStageId, setDirection, setArranged, draft, apply } = model
  const graph = useMemo(() => displayChain && presentation ? buildCanvasGraph(displayChain, presentation, focusStage,
    previewStageId, direction, arranged, chainEvents,
    (id) => { setSelectedStageId(id); setPreviewStageId((value) => value === id ? null : id) },
    (id) => { setFocusStageId(id); setSelectedStageId(null); setSelectedNodeId(null); setPreviewStageId(null) })
    : { nodes: [] as FlowNode[], edges: [] as Edge[] },
  [arranged, direction, displayChain, focusStage, presentation, previewStageId, chainEvents])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes)
  useEffect(() => setNodes(graph.nodes), [graph.nodes, setNodes])
  if (!displayChain || !presentation) return null
  return <div className="canvas-shell"><div className="flow-canvas chain-stage-canvas" aria-label={focusStage ? `${focusStage.title}动作子图` : "链路阶段总览"}>
            {active && <ReactFlow<FlowNode, Edge> key={`${presentation.presentationDigest}:${focusStageId ?? "overview"}:${direction}:${arranged}`}
              nodes={nodes.map((item) => ({ ...item, selected: item.id === selectedNodeId || item.id === selectedStageId }))}
              edges={graph.edges} nodeTypes={nodeTypes} colorMode={theme} onNodesChange={onNodesChange}
              fitView fitViewOptions={{ padding: 0.16, minZoom: 0.5, maxZoom: 1 }} minZoom={0.3} maxZoom={1.8}
              nodesDraggable={Boolean(draft && focusStage && !model.editingBusy)} nodesConnectable={false}
              onNodeClick={(_, item) => { model.setContextMode(null); if (item.type === "chain-stage") {
                setSelectedNodeId(null); setSelectedStageId(item.id)
              } else if (item.type === "chain-action") { setSelectedStageId(null); setSelectedNodeId(item.id) } }}
              onEdgeClick={(_, edge) => { if (draft && displayChain.nodes.some((item) => item.id === edge.source)) {
                setSelectedStageId(null); setSelectedNodeId(edge.source)
              } }}
              onNodeDoubleClick={(_, item) => { if (item.type === "chain-stage") { setFocusStageId(item.id); setSelectedStageId(null) } }}
              onNodeDragStop={(_, item) => draft && item.type === "chain-action"
                && apply([{ type: "move_node", nodeId: item.id, position: item.position }])}>
              <Background gap={24} /><Controls showInteractive /><MiniMap pannable zoomable /></ReactFlow>}
          </div></div>
}

export function LiveChainCanvasToolbar({ model }: { model: LiveChainModel }) {
  const { focusStage, presentation, setFocusStageId, setSelectedNodeId, direction, setDirection, setArranged } = model
  if (!presentation) return null
  return <div className="canvas-mode-controls"><div>{focusStage && <Button size="1" variant="ghost" onClick={() => {
          setFocusStageId(null); setSelectedNodeId(null) }}><ChevronLeft size={14} />任务链路</Button>}
          <strong>{focusStage?.title ?? `${presentation.stages.length} 个阶段`}</strong></div>
          <div><Button size="1" variant={direction === "LR" ? "soft" : "ghost"} onClick={() => { setDirection("LR"); setArranged(true) }}>横向</Button>
            <Button size="1" variant={direction === "TB" ? "soft" : "ghost"} onClick={() => { setDirection("TB"); setArranged(true) }}>纵向</Button>
            <Button size="1" variant="ghost" onClick={() => setArranged(true)} aria-label="整理布局"><Sparkles size={13} /></Button></div></div>
}
