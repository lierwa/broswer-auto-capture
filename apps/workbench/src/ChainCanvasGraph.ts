import { MarkerType, type Edge } from "@xyflow/react"
import type { ChainPresentation, ChainStage, TaskChain, TaskExecutionEventBatch } from "@browser-capture/contracts"
import type { ActionCanvasNode, StageCanvasNode, TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { actionPresentation, terminalPresentation } from "./chainNodePresentation.js"
import { edgePortLabel, focusChainEdges, latestExecutionEvents, nodeRunTone, overviewChainEdges, stageRunTone,
  terminalCanvasId, type ChainRunTone, type ProjectedChainEdge } from "./chainWorkbenchProjection.js"
import { layoutChainGraph, type ChainLayoutDirection } from "./chainLayout.js"

type FlowNode = StageCanvasNode | ActionCanvasNode | TerminalCanvasNode

export function buildCanvasGraph(chain: TaskChain, presentation: ChainPresentation, focus: ChainStage | null,
  batch: TaskExecutionEventBatch | null, onEnter: (id: string) => void, onInspect: (id: string) => void) {
  const direction: ChainLayoutDirection = "LR"
  const projected = focus ? focusChainEdges(chain, focus, batch) : overviewChainEdges(chain, presentation, batch)
  const edges = projected.map(flowEdge)
  const raw = focus ? focusNodes(chain, presentation, focus, direction, batch, onInspect)
    : overviewNodes(chain, presentation, direction, batch, onEnter)
  // WHY：画布布局只服务阅读，统一自动排布；拖拽与缩放不写回草稿或影响发布校验。
  return { nodes: layoutChainGraph(raw, edges, direction), edges }
}

function overviewNodes(chain: TaskChain, presentation: ChainPresentation,
  direction: ChainLayoutDirection, batch: TaskExecutionEventBatch | null,
  onEnter: (id: string) => void): FlowNode[] {
  const positions = new Map(presentation.overviewLayout.map((item) => [item.stageId, item]))
  const stages: StageCanvasNode[] = presentation.stages.map((stage) => ({ id: stage.id, type: "chain-stage",
    position: positions.get(stage.id) ?? { x: 0, y: 0 }, width: 300, height: 148,
    data: { title: stage.title, summary: stage.summary, tone: stageRunTone(stage, batch), direction, onEnter } }))
  const values = [...positions.values()], xs = values.map((item) => item.x), ys = values.map((item) => item.y)
  const start = direction === "LR" ? { x: Math.min(0, ...xs) - 150, y: Math.min(0, ...ys) }
    : { x: Math.min(0, ...xs), y: Math.min(0, ...ys) - 100 }
  const end = direction === "LR" ? { x: Math.max(0, ...xs) + 300, y: Math.max(0, ...ys) }
    : { x: Math.max(0, ...xs), y: Math.max(0, ...ys) + 220 }
  const targets = new Set(overviewChainEdges(chain, presentation, batch).map((edge) => edge.target))
  const terminals = chain.nodes.filter((node) => targets.has(terminalCanvasId(node.id))).map((node, index) => {
    const terminal = terminalPresentation(node)
    return terminalNode(terminalCanvasId(node.id), terminal.label, "end", direction,
      { x: end.x, y: end.y + index * 72 }, nodeRunTone(node.id, batch))
  })
  return [terminalNode("__start", "开始", "start", direction, start), ...stages, ...terminals]
}

function focusNodes(chain: TaskChain, presentation: ChainPresentation, stage: ChainStage,
  direction: ChainLayoutDirection, batch: TaskExecutionEventBatch | null, onInspect: (id: string) => void): FlowNode[] {
  const layout = presentation.focusLayouts.find((item) => item.stageId === stage.id)
  const positions = new Map(layout?.nodes.map((item) => [item.nodeId, item]) ?? [])
  const actions: ActionCanvasNode[] = stage.nodeIds.map((id) => {
    const node = chain.nodes.find((item) => item.id === id)!
    const info = actionPresentation(node)
    return { id, type: "chain-action", position: positions.get(id) ?? { x: 0, y: 0 }, width: 240, height: 112,
      data: { title: info.title, tone: nodeRunTone(id, batch, stage), direction, onInspect } }
  })
  const entry = terminalNode("__stage_entry", "阶段入口", "start", direction, { x: -150, y: 0 })
  const exits = stage.exits.map((exit, index) => {
    const edge = chain.edges.find((item) => item.from === exit.sourceNodeId
      && ("port" in item ? item.port : item.outcome) === exit.sourcePort)
    const target = chain.nodes.find((node) => node.id === edge?.to)
    const next = presentation.stages.find((item) => item.nodeIds.includes(edge?.to ?? ""))
    const terminal = target?.kind === "terminal" ? terminalPresentation(target) : null
    const source = latestExecutionEvents(batch).get(exit.sourceNodeId)?.event
    const sourceTone = nodeRunTone(exit.sourceNodeId, batch, stage)
    const taken = source?.status === "finished" && source.outcome === exit.sourcePort
    const tone = taken ? terminal && target ? nodeRunTone(target.id, batch) : sourceTone
      : source?.status === "finished" || sourceTone === "skipped" ? "skipped" : "idle"
    return terminalNode(`__stage_exit:${exit.id}`, next ? `进入：${next.title}` : terminal?.label ?? exit.label, "end", direction,
      direction === "LR" ? { x: Math.max(0, ...actions.map((node) => node.position.x)) + 300, y: index * 72 }
        : { x: index * 120, y: Math.max(0, ...actions.map((node) => node.position.y)) + 180 }, tone)
  })
  return [entry, ...actions, ...exits]
}

function terminalNode(id: string, label: string, terminal: "start" | "end", direction: ChainLayoutDirection,
  position: { x: number; y: number }, tone: ChainRunTone = "idle"): TerminalCanvasNode {
  return { id, type: "chain-terminal", position, width: 140, height: 50, data: { label, terminal, tone, direction } }
}

function flowEdge(edge: ProjectedChainEdge): Edge {
  const color = edge.tone === "running" ? "var(--accent-9)" : edge.tone === "success" ? "var(--green-9)"
    : edge.tone === "failure" ? "var(--red-9)" : "var(--gray-8)"
  return { id: edge.id, source: edge.source, target: edge.target, label: edgePortLabel(edge.port), type: "smoothstep",
    animated: edge.tone === "running", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
    className: `chain-edge chain-edge-${edge.tone}`, style: { stroke: color, strokeWidth: edge.tone === "running" ? 2.4 : 1.4 } }
}

