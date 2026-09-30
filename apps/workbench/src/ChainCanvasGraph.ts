import { MarkerType, type Edge } from "@xyflow/react"
import type { ChainPresentation, ChainStage, TaskChain, TaskExecutionEventBatch, TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { toneLabel, type StageCanvasNode, type TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { actionPresentation, terminalPresentation } from "./chainNodePresentation.js"
import { edgePortLabel, nodeRunTone, overviewChainEdges, stageRunTone,
  terminalCanvasId, type ChainRunTone, type ProjectedChainEdge } from "./chainWorkbenchProjection.js"
import { layoutChainGraph, type ChainLayoutDirection } from "./chainLayout.js"
import { branchRows, currentNodeEvent, loopContext } from "./chainControlProjection.js"
import { nodeDurationLabel, stageDurationLabel } from "./chainExecutionFacts.js"

type FlowNode = StageCanvasNode | TerminalCanvasNode
type Build = NonNullable<NonNullable<TaskWorkspaceSnapshot["activity"]>["build"]>
type Presentation = Pick<ChainPresentation, "stages" | "overviewLayout">
type GraphNode = TaskChain["nodes"][number] | Build["nodes"][number]
type GraphEdge = TaskChain["edges"][number] | Build["edges"][number]

/** WHY：生成片段只有已校验节点和真实边，没有伪入口、终点或 TaskRun 成功态。 */
export function buildPreparationGraph(build: Build, onInspect: (id: string) => void,
  onSelect: (id: string) => void = () => {}, selectedNodeId: string | null = null) {
  const direction: ChainLayoutDirection = "LR"
  const projected = preparationStageEdges(build)
  const edges = projected.map(flowEdge)
  const raw = build.presentation.stages.map((stage) => stageNode(stage, build.nodes, build.edges,
    direction, null, build.phase === "prefix" ? "生成中" : "已生成", onInspect, onSelect, selectedNodeId))
  return { nodes: layoutPresentedGraph(raw, edges, build.presentation, direction), edges }
}

export function buildCanvasGraph(chain: TaskChain, presentation: Presentation,
  batch: TaskExecutionEventBatch | null, onInspect: (id: string) => void,
  onSelect: (id: string) => void = () => {}, selectedNodeId: string | null = null) {
  const direction: ChainLayoutDirection = "LR"
  const projected = overviewChainEdges(chain, presentation, batch)
  const edges = projected.map(flowEdge)
  const stages: FlowNode[] = presentation.stages.map((stage) => stageNode(stage, chain.nodes, chain.edges,
    direction, batch, toneLabel(stageRunTone(stage, batch, chain)), onInspect, onSelect, selectedNodeId))
  const targets = new Set(projected.map((edge) => edge.target))
  const terminals = chain.nodes.filter((node) => targets.has(terminalCanvasId(node.id))).map((node, index) => {
    const terminal = terminalPresentation(node)
    return terminalNode(terminalCanvasId(node.id), terminal.label, "end", direction,
      { x: 0, y: index * 72 }, nodeRunTone(node.id, batch, undefined, chain), nodeDurationLabel(node.id, batch))
  })
  // WHY：开始/结束只属于完整链；子行始终原位可读，React Flow 身份仍是同一批阶段。
  const raw = [terminalNode("__start", "开始", "start", direction, { x: 0, y: 0 }), ...stages, ...terminals]
  return { nodes: layoutPresentedGraph(raw, edges, presentation, direction), edges }
}

function layoutPresentedGraph(nodes: FlowNode[], edges: Edge[], presentation: Presentation,
  direction: ChainLayoutDirection): FlowNode[] {
  const positions = new Map(presentation.overviewLayout.map((item) => [item.stageId, item]))
  const stages = nodes.filter((node): node is StageCanvasNode => node.type === "chain-stage")
  // WHY：正常公开 presentation 的布局完整且不可变；只给缺布局的旧受控夹具保留 Dagre 后备。
  if (stages.some((stage) => !positions.has(stage.id))) return layoutChainGraph(nodes, edges, direction)
  const placed = nodes.map((node) => node.type === "chain-stage"
    ? { ...node, position: { x: positions.get(node.id)!.x, y: positions.get(node.id)!.y } } : node)
  if (direction !== "LR") return placeVerticalTerminals(placed, edges)
  const byId = new Map(placed.filter((node): node is StageCanvasNode => node.type === "chain-stage")
    .map((node) => [node.id, node]))
  const fallback = [...byId.values()].sort((left, right) => right.position.x - left.position.x)[0]
  const terminals = placed.filter((node): node is TerminalCanvasNode => node.type === "chain-terminal")
  return placed.map((node) => {
    if (node.type !== "chain-terminal") return node
    const link = edges.find((edge) => node.data.terminal === "start" ? edge.source === node.id : edge.target === node.id)
    const anchor = byId.get(node.data.terminal === "start" ? link?.target ?? "" : link?.source ?? "") ?? fallback
    if (!anchor) return node
    const peerIndex = terminals.slice(0, terminals.indexOf(node)).filter((peer) => {
      if (peer.data.terminal !== node.data.terminal) return false
      const peerLink = edges.find((edge) => peer.data.terminal === "start" ? edge.source === peer.id : edge.target === peer.id)
      return (peer.data.terminal === "start" ? peerLink?.target : peerLink?.source) === anchor.id
    }).length
    const y = anchor.position.y + 22 - Number(node.height ?? 50) / 2 + peerIndex * 62
    const x = node.data.terminal === "start"
      ? anchor.position.x - Number(node.width ?? 140) - 52
      : anchor.position.x + Number(anchor.width ?? 240) + 52
    return { ...node, position: { x, y } }
  })
}

function placeVerticalTerminals(nodes: FlowNode[], edges: Edge[]): FlowNode[] {
  const stages = new Map(nodes.filter((node): node is StageCanvasNode => node.type === "chain-stage")
    .map((node) => [node.id, node]))
  return nodes.map((node) => {
    if (node.type !== "chain-terminal") return node
    const link = edges.find((edge) => node.data.terminal === "start" ? edge.source === node.id : edge.target === node.id)
    const anchor = stages.get(node.data.terminal === "start" ? link?.target ?? "" : link?.source ?? "")
    if (!anchor) return node
    return { ...node, position: {
      x: anchor.position.x + (Number(anchor.width ?? 240) - Number(node.width ?? 140)) / 2,
      y: node.data.terminal === "start" ? anchor.position.y - Number(node.height ?? 50) - 52
        : anchor.position.y + Number(anchor.height ?? 79) + 52,
    } }
  })
}

function stageNode(stage: ChainStage, nodes: GraphNode[], edges: GraphEdge[], direction: ChainLayoutDirection,
  batch: TaskExecutionEventBatch | null, statusLabel: string, onInspect: (id: string) => void,
  onSelect: (id: string) => void, selectedNodeId: string | null): StageCanvasNode {
  const chain = { nodes, edges }
  const actions = stage.nodeIds.map((id) => {
    const node = nodes.find((item) => item.id === id)!
    const info = actionPresentation(node)
    const tone = batch ? nodeRunTone(id, batch, stage, chain) : "idle" as const
    const event = currentNodeEvent(id, chain, batch)?.event, outcome = event?.outcome
    const statusLabel = node.kind === "loop" ? outcome === "limit" ? "限额停止"
      : outcome === "done" ? event?.execution?.loop?.exitReason === "stop_when" ? "约定停止" : "按规则结束"
        : outcome === "body" && tone === "running" ? "循环处理中" : toneLabel(tone)
      : toneLabel(tone)
    return { id, title: info.title, type: info.type, tone, statusLabel, selected: selectedNodeId === id,
      durationLabel: nodeDurationLabel(id, batch), branches: branchRows(node, chain, batch),
      context: node.kind === "loop" ? loopContext(node, chain, batch) : [] }
  })
  return { id: stage.id, type: "chain-stage", position: { x: 0, y: 0 }, width: 240,
    data: { title: stage.title, summary: stage.summary, tone: batch ? stageRunTone(stage, batch, chain) : "idle",
      direction, actions, statusLabel, durationLabel: stageDurationLabel(stage.nodeIds, batch), onInspect, onSelect } }
}

function preparationStageEdges(build: Build): ProjectedChainEdge[] {
  const stageByNode = new Map(build.presentation.stages.flatMap((stage) => stage.nodeIds
    .map((nodeId) => [nodeId, stage.id] as const)))
  const edges = build.edges.flatMap((edge): ProjectedChainEdge[] => {
    const source = stageByNode.get(edge.from), target = stageByNode.get(edge.to)
    if (!source || !target || source === target) return []
    return [{ id: `preparation:${source}:${edge.from}:${edge.port}:${target}`, source, target, port: edge.port,
      label: edgePortLabel(edge.port, build.nodes.find((node) => node.id === edge.from)), tone: "idle" }]
  })
  return edges.filter((edge, index) => edges.findIndex((item) => item.id === edge.id) === index)
}

function terminalNode(id: string, label: string, terminal: "start" | "end", direction: ChainLayoutDirection,
  position: { x: number; y: number }, tone: ChainRunTone = "idle", durationLabel?: string): TerminalCanvasNode {
  return { id, type: "chain-terminal", position, width: 140, height: 50, data: { label, terminal, tone, direction, durationLabel } }
}

function flowEdge(edge: ProjectedChainEdge): Edge {
  const color = edge.tone === "running" ? "var(--accent-9)" : edge.tone === "success" ? "var(--green-9)"
    : edge.tone === "failure" ? "var(--red-9)" : "var(--gray-8)"
  return { id: edge.id, source: edge.source, target: edge.target, label: edge.label, type: "smoothstep", data: { tone: edge.tone },
    animated: edge.tone === "running", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
    className: `chain-edge chain-edge-${edge.tone}`, style: { stroke: color, strokeWidth: edge.tone === "running" ? 2.4 : 1.4 } }
}
