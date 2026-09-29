import { MarkerType, type Edge } from "@xyflow/react"
import type { ChainPresentation, ChainStage, TaskChain, TaskExecutionEventBatch, TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import type { ActionCanvasNode, StageCanvasNode, TerminalCanvasNode } from "./ChainCanvasNodes.js"
import { actionPresentation, terminalPresentation } from "./chainNodePresentation.js"
import { edgePortLabel, nodeRunTone, stageRunTone, visibleChainEdges,
  terminalCanvasId, type ChainRunTone, type ProjectedChainEdge } from "./chainWorkbenchProjection.js"
import { layoutChainGraph, type ChainLayoutDirection } from "./chainLayout.js"

type FlowNode = StageCanvasNode | ActionCanvasNode | TerminalCanvasNode

/** WHY：生成片段只有已校验节点和真实边，没有伪入口、终点或 TaskRun 成功态。 */
export function buildPreparationGraph(build: NonNullable<NonNullable<TaskWorkspaceSnapshot["activity"]>["build"]>,
  onInspect: (id: string) => void) {
  const nodes: ActionCanvasNode[] = build.nodes.map(node => ({ id: node.id, type: "chain-action",
    position: { x: 0, y: 0 }, width: 240, height: 112,
    data: { title: actionPresentation(node).title, tone: "idle", direction: "LR", onInspect } }))
  const edges = build.edges.map(edge => flowEdge({ id: `${edge.from}:${edge.port}:${edge.to}`,
    source: edge.from, target: edge.to, port: edge.port, tone: "idle" }))
  return { nodes: layoutChainGraph(nodes, edges, "LR"), edges }
}

export function buildCanvasGraph(chain: TaskChain, presentation: ChainPresentation, focus: ChainStage | null,
  batch: TaskExecutionEventBatch | null, onEnter: (id: string) => void, onInspect: (id: string) => void) {
  const direction: ChainLayoutDirection = "LR"
  const projected = visibleChainEdges(chain, presentation, focus, batch)
  const edges = projected.map(flowEdge)
  const raw = visibleNodes(chain, presentation, focus, direction, batch, onEnter, onInspect)
  // WHY：画布布局只服务阅读，统一自动排布；拖拽与缩放不写回草稿或影响发布校验。
  if (!focus) return { nodes: layoutChainGraph(raw, edges, direction), edges }
  // WHY：展开只在原阶段位置排布内部真实节点；其余阶段沿折叠图保持原位，避免视口未重置但内容整体跳动。
  const collapsedProjected = visibleChainEdges(chain, presentation, null, batch)
  const collapsedEdges = collapsedProjected.map(flowEdge)
  const collapsed = layoutChainGraph(visibleNodes(chain, presentation, null, direction, batch, onEnter, onInspect),
    collapsedEdges, direction)
  return { nodes: expandAtStagePosition(raw, edges, collapsed, focus), edges }
}

function expandAtStagePosition(raw: FlowNode[], edges: Edge[], collapsed: FlowNode[], stage: ChainStage) {
  const ids = new Set(stage.nodeIds), internal = raw.filter((node) => ids.has(node.id))
  const internalEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target))
  const laidOut = layoutChainGraph(internal, internalEdges, "LR")
  const anchor = collapsed.find((node) => node.id === stage.id)
  if (!anchor || !laidOut.length) return layoutChainGraph(raw, edges, "LR")
  const bounds = laidOut.reduce((value, node) => ({
    left: Math.min(value.left, node.position.x), top: Math.min(value.top, node.position.y),
    right: Math.max(value.right, node.position.x + Number(node.width ?? 240)),
    bottom: Math.max(value.bottom, node.position.y + Number(node.height ?? 112)),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
  const anchorWidth = Number(anchor.width ?? 300), expandedWidth = bounds.right - bounds.left
  const anchorCenterY = anchor.position.y + Number(anchor.height ?? 148) / 2
  // WHY：内部动作从被替换阶段的左边缘展开；新增宽度只推开右侧列，保留上游和并列分支的阅读锚点。
  const offset = { x: anchor.position.x - bounds.left,
    y: anchorCenterY - (bounds.top + bounds.bottom) / 2 }
  const internalPositions = new Map(laidOut.map((node) => [node.id,
    { x: node.position.x + offset.x, y: node.position.y + offset.y }]))
  const downstreamShift = Math.max(0, expandedWidth - anchorWidth)
  const collapsedPositions = new Map(collapsed.map((node) => [node.id, {
    x: node.position.x > anchor.position.x ? node.position.x + downstreamShift : node.position.x,
    y: node.position.y,
  }]))
  return raw.map((node) => ({ ...node, position: internalPositions.get(node.id)
    ?? collapsedPositions.get(node.id) ?? node.position }))
}

function visibleNodes(chain: TaskChain, presentation: ChainPresentation, focus: ChainStage | null,
  direction: ChainLayoutDirection, batch: TaskExecutionEventBatch | null,
  onEnter: (id: string) => void, onInspect: (id: string) => void): FlowNode[] {
  const positions = new Map(presentation.overviewLayout.map((item) => [item.stageId, item]))
  const visible: FlowNode[] = presentation.stages.flatMap((stage): FlowNode[] => {
    if (stage.nodeIds.length > 1 && stage.id !== focus?.id) return [{ id: stage.id, type: "chain-stage" as const,
      position: positions.get(stage.id) ?? { x: 0, y: 0 }, width: 300, height: 148,
      data: { title: stage.title, summary: stage.summary, tone: stageRunTone(stage, batch), direction, onEnter } }]
    const focusPositions = new Map(presentation.focusLayouts.find((item) => item.stageId === stage.id)?.nodes
      .map((item) => [item.nodeId, item]) ?? [])
    return stage.nodeIds.map((id) => {
      const node = chain.nodes.find((item) => item.id === id)!
      const info = actionPresentation(node)
      return { id, type: "chain-action" as const, position: focusPositions.get(id) ?? { x: 0, y: 0 }, width: 240, height: 112,
        data: { title: info.title, tone: nodeRunTone(id, batch, stage), direction, onInspect } }
    })
  })
  const values = [...positions.values()], xs = values.map((item) => item.x), ys = values.map((item) => item.y)
  const start = direction === "LR" ? { x: Math.min(0, ...xs) - 150, y: Math.min(0, ...ys) }
    : { x: Math.min(0, ...xs), y: Math.min(0, ...ys) - 100 }
  const end = direction === "LR" ? { x: Math.max(0, ...xs) + 300, y: Math.max(0, ...ys) }
    : { x: Math.max(0, ...xs), y: Math.max(0, ...ys) + 220 }
  const targets = new Set(visibleChainEdges(chain, presentation, focus, batch).map((edge) => edge.target))
  const terminals = chain.nodes.filter((node) => targets.has(terminalCanvasId(node.id))).map((node, index) => {
    const terminal = terminalPresentation(node)
    return terminalNode(terminalCanvasId(node.id), terminal.label, "end", direction,
      { x: end.x, y: end.y + index * 72 }, nodeRunTone(node.id, batch))
  })
  return [terminalNode("__start", "开始", "start", direction, start), ...visible, ...terminals]
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
