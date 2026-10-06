import { MarkerType, type Edge } from "@xyflow/react"
import type { ChainPresentation, ChainStage, TaskChain, TaskExecutionEventBatch, TaskExecutionDetail, TaskWorkspaceSnapshot } from "@browser-capture/contracts"
import { toneLabel, type StageCanvasNode, type TerminalCanvasNode, type ChainCanvasNode } from "./ChainCanvasNodes.js"
import { actionPresentation, terminalPresentation } from "./chainNodePresentation.js"
import { edgePortLabel, nodeRunTone, overviewChainEdges, stageRunTone,
  terminalCanvasId, type ChainRunTone, type ProjectedChainEdge } from "./chainWorkbenchProjection.js"
import { terminalFact } from "./chainTerminalFacts.js"
import { executionStatus } from "./ExecutionPresentation.js"
import { layoutChainGraph, type ChainLayoutDirection } from "./chainLayout.js"
import { branchRows, currentNodeEvent, loopContext } from "./chainControlProjection.js"
import { latestExecutionEvents, nodeDurationLabel, stageDurationLabel } from "./chainExecutionFacts.js"
import { canvasStageList } from "./chainCanvasList.js"

type FlowNode = ChainCanvasNode
type Build = NonNullable<NonNullable<TaskWorkspaceSnapshot["activity"]>["build"]>
type Presentation = Pick<ChainPresentation, "stages" | "overviewLayout">
type GraphNode = TaskChain["nodes"][number] | Build["nodes"][number]
type GraphEdge = TaskChain["edges"][number] | Build["edges"][number]
export type CanvasBoundaryFacts = { summary: string; status: string;
  call: TaskExecutionDetail["calls"][number]["run"] | undefined; onStart(): void }
const layouts = new WeakMap<object, WeakMap<Presentation, Map<string, { x: number; y: number }>>>()

/** WHY：生成片段只有已校验节点和真实边，没有伪入口、终点或 TaskRun 成功态。 */
export function buildPreparationGraph(build: Build, onInspect: (id: string) => void,
  onSelect: (id: string) => void = () => {}, selectedNodeId: string | null = null) {
  const direction: ChainLayoutDirection = "LR"
  const projected = preparationStageEdges(build)
  const edges = projected.map(flowEdge)
  const raw = build.presentation.stages.map((stage) => stageNode(stage, build,
    direction, null, "已生成", onInspect, onSelect, selectedNodeId))
  return { nodes: layoutPresentedGraph(raw, edges, build.presentation, direction, build), edges }
}

export function buildCanvasGraph(chain: TaskChain, presentation: Presentation,
  batch: TaskExecutionEventBatch | null, onInspect: (id: string) => void,
  onSelect: (id: string) => void = () => {}, selectedNodeId: string | null = null, boundary?: CanvasBoundaryFacts) {
  const direction: ChainLayoutDirection = "LR"
  const projected = overviewChainEdges(chain, presentation, batch)
  const stages: FlowNode[] = presentation.stages.map((stage) => stageNode(stage, chain,
    direction, batch, "", onInspect, onSelect, selectedNodeId))
  const targets = new Set(projected.map((edge) => edge.target))
  const terminals = chain.nodes.filter(node => targets.has(terminalCanvasId(node.id))).map(node => {
    const event = latestExecutionEvents(batch).get(node.id)?.event
    const fact = node.kind === "terminal" ? terminalFact(node, event, boundary?.call) : "unreached"
    const tone = boundary ? fact === "return_failed" ? "failure" : fact === "reached"
      ? nodeRunTone(node.id, batch, undefined, chain) : "idle" : nodeRunTone(node.id, batch, undefined, chain)
    const terminal = terminalNode(terminalCanvasId(node.id), terminalPresentation(node).label, "end", direction,
      { x: 0, y: 0 }, tone, nodeDurationLabel(node.id, batch))
    terminal.data = { ...terminal.data,
      summary: node.kind === "terminal" ? node.reason === node.status ? executionStatus(node.status) : node.reason : "声明终点",
      statusLabel: fact === "reached" ? "已到达 · 查看本次返回" : fact === "return_failed" ? "返回处理失败"
        : event ? "终点事实待确认" : "未到达", onInspect }
    return terminal
  })
  const terminalTones = new Map(terminals.map(node => [node.id, node.data.tone]))
  const edges = projected.map(edge => flowEdge(boundary && edge.tone !== "idle" && edge.tone !== "unselected"
    && terminalTones.has(edge.target) ? { ...edge, tone: terminalTones.get(edge.target)! } : edge))
  const start = terminalNode("__start", "开始", "start", direction, { x: 0, y: 0 })
  if (boundary) start.data = { ...start.data, summary: boundary.summary, statusLabel: boundary.status, onInspect: boundary.onStart }
  // WHY：终点尺寸和事实在唯一投影中确定，布局后不再改尺寸或覆盖到达边。
  return { nodes: layoutPresentedGraph([start, ...stages, ...terminals], edges, presentation, direction, chain), edges }

}

function layoutPresentedGraph(nodes: FlowNode[], edges: Edge[], presentation: Presentation,
  direction: ChainLayoutDirection, owner: object): FlowNode[] {
  let versions = layouts.get(owner)
  if (!versions) { versions = new WeakMap(); layouts.set(owner, versions) }
  const cached = versions.get(presentation)
  if (cached) return nodes.map(node => ({ ...node, position: { ...cached.get(node.id)! } }))
  const placed = placePresentedGraph(nodes, edges, presentation, direction)
  versions.set(presentation, new Map(placed.map(node => [node.id, { ...node.position }])))
  return placed
}

function placePresentedGraph(nodes: FlowNode[], edges: Edge[], presentation: Presentation,
  direction: ChainLayoutDirection): FlowNode[] {
  const positions = new Map(presentation.overviewLayout.map((item) => [item.stageId, item]))
  const stages = nodes.filter((node): node is StageCanvasNode => node.type === "chain-stage")
  // WHY：正常公开 presentation 的布局完整且不可变；只给缺布局的旧受控夹具保留 Dagre 后备。
  const frozen = nodes.map((node) => node.type === "chain-stage" && positions.has(node.id)
    ? { ...node, position: { x: positions.get(node.id)!.x, y: positions.get(node.id)!.y } } : node)
  // WHY：旧版本布局按窄卡片生成。只有新常驻列表会重叠时才用已有 Dagre 适配，状态变化不重排。
  const placed = stages.some(stage => !positions.has(stage.id)) || stagesOverlap(frozen)
    ? layoutChainGraph(nodes, edges, direction) : frozen
  const byId = new Map(placed.filter((node): node is StageCanvasNode => node.type === "chain-stage")
    .map((node) => [node.id, node]))
  const fallback = [...byId.values()].sort((left, right) => right.position.x - left.position.x)[0]
  const peers = new Map<string, number>()
  return placed.map((node) => {
    if (node.type !== "chain-terminal") return node
    const link = edges.find((edge) => node.data.terminal === "start" ? edge.source === node.id : edge.target === node.id)
    const anchor = byId.get(node.data.terminal === "start" ? link?.target ?? "" : link?.source ?? "") ?? fallback
    if (!anchor) return node
    const key = `${node.data.terminal}:${anchor.id}`, peerIndex = peers.get(key) ?? 0
    peers.set(key, peerIndex + 1)
    // WHY：正常布局与旧布局后备都对齐业务标题区端口，不能按整个长列表的中心放起止节点。
    const y = anchor.position.y + 27 - Number(node.height ?? 54) / 2 + peerIndex * (Number(node.height ?? 54) + 12)
    const x = node.data.terminal === "start"
      ? anchor.position.x - Number(node.width ?? 140) - 32
      : anchor.position.x + Number(anchor.width ?? 300) + 32
    return { ...node, position: { x, y } }
  })
}

function stageNode(stage: ChainStage, chain: { nodes: GraphNode[]; edges: GraphEdge[] }, direction: ChainLayoutDirection,
  batch: TaskExecutionEventBatch | null, statusLabel: string, onInspect: (id: string) => void,
  onSelect: (id: string) => void, selectedNodeId: string | null): StageCanvasNode {
  const { nodes } = chain
  const stageTone = batch ? stageRunTone(stage, batch, chain) : "idle"
  const actions = stage.nodeIds.map((id, index) => {
    const node = nodes.find((item) => item.id === id)!
    const info = actionPresentation(node)
    const tone = batch ? nodeRunTone(id, batch, stage, chain) : "idle" as const
    const event = currentNodeEvent(id, chain, batch)?.event, outcome = event?.outcome
    const statusLabel = node.kind === "loop" ? outcome === "limit" ? "限额停止"
      : outcome === "done" ? event?.execution?.loop?.exitReason === "stop_when" ? "约定停止" : "按规则结束"
        : outcome === "body" && tone === "running" ? "循环处理中" : toneLabel(tone)
      : toneLabel(tone)
    return { id, ordinal: index + 1, outcome, eventStatus: event?.status, title: info.title, type: info.type, tone, statusLabel, selected: selectedNodeId === id,
      kind: node.kind, capabilityName: node.kind === "capability" ? node.capability.name : undefined,
      durationLabel: nodeDurationLabel(id, batch), branches: branchRows(node, chain, batch),
      context: node.kind === "loop" ? loopContext(node, chain, batch) : [] }
  })
  const items = canvasStageList(stage, chain)
  const hasControl = actions.some(action => action.type === "循环" || action.branches.length > 0)
  const width = hasControl ? 520 : 300
  const height = Math.max(49, textHeight(stage.title, width - 120, 17) + 14) + canvasListHeight(items, actions, width - (hasControl ? 80 : 36)) + 4
  return { id: stage.id, type: "chain-stage", position: { x: 0, y: 0 }, width,
    initialHeight: height, initialWidth: width,
    data: { title: stage.title, summary: stage.summary, tone: stageTone,
      direction, actions, items, statusLabel: statusLabel || toneLabel(stageTone), durationLabel: stageDurationLabel(stage.nodeIds, batch), onInspect, onSelect } }
}

function stagesOverlap(nodes: FlowNode[]) {
  const stages = nodes.filter(node => node.type === "chain-stage")
  return stages.some((left, index) => stages.slice(index + 1).some(right =>
    left.position.x < right.position.x + Number(right.width) + 16
    && right.position.x < left.position.x + Number(left.width) + 16
    && left.position.y < right.position.y + Number(right.initialHeight ?? 112) + 16
    && right.position.y < left.position.y + Number(left.initialHeight ?? 112) + 16))
}

function canvasListHeight(items: ReturnType<typeof canvasStageList>, actions: StageCanvasNode["data"]["actions"], width: number): number {
  return items.reduce((height, item) => {
    const action = actions.find(action => action.id === item.id)!
    const main = item.body ? Math.max(42, textHeight(action.title, width - 100, 13, 1) + 14)
      + canvasListHeight(item.body, actions, width - 30) : Math.max(40, textHeight(action.title, width - 70, 14, 1) + 14)
    const routes = item.routes.reduce((sum, route) => sum + Math.max(36,
      textHeight(route.label, 84, 11, 1) + 4, textHeight(route.target, width - 26 - 84 - 12 - 70, 14, 1) + 4), 0)
    return height + main + routes + (item.routes.length ? item.body ? 24 : 16 : 0)
  }, 0)
}

function textHeight(text: string, width: number, size: number, maxLines = Infinity) {
  // WHY：布局只依赖冻结名称；子节点按实际单行上限估算，不能为已省略的文字留空白或触发重排。
  const units = [...text].reduce((sum, character) => sum + (character.charCodeAt(0) < 128 ? .56 : 1), 0)
  return Math.min(maxLines, Math.max(1, Math.ceil(units * size / Math.max(80, width)))) * size * 1.45
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
  return { id, type: "chain-terminal", position, width: 140, height: 54, data: { label, terminal, tone, direction, durationLabel } }
}

export function flowEdge(edge: ProjectedChainEdge): Edge {
  const color = edge.tone === "running" ? "var(--accent-9)" : edge.tone === "success" ? "var(--green-9)"
    : edge.tone === "failure" ? "var(--red-9)" : "var(--gray-8)"
  return { id: edge.id, source: edge.source, target: edge.target, label: edge.label, type: "smoothstep", data: { tone: edge.tone },
    animated: edge.tone === "running", markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
    className: `chain-edge chain-edge-${edge.tone}`, style: { stroke: color, strokeWidth: edge.tone === "running" ? 2.4 : 1.4 } }
}

/** 仅选择态变化时不触发布局；没有变化的节点/动作保留引用供 React Flow 复用。 */
export function selectCanvasNodes(nodes: FlowNode[], nodeId: string | null, stageId: string | null, context: string | null,
  stepId?: string) {
  const selectedNodes = nodes.map(node => {
    const selected = node.id === stageId || node.id === terminalCanvasId(nodeId ?? "")
      || node.type === "chain-terminal" && node.data.scopeStepId === stepId && node.data.nodeId === nodeId
      || node.id === "__start" && context === "start"
      || node.id === "__plan_start" && context === "plan-start"
      || node.id === "__plan_end" && context === "plan-end"
    const inStep = !stepId || !node.data.scopeStepId || node.data.scopeStepId === stepId
    const actions = node.type === "chain-stage" ? node.data.actions.map(action =>
      Boolean(action.selected) === (inStep && action.id === nodeId) ? action : { ...action, selected: inStep && action.id === nodeId }) : null
    const changed = actions && actions.some((action, index) => action !== (node as StageCanvasNode).data.actions[index])
    if (Boolean(node.selected) === selected && !changed) return node
    return { ...node, selected, data: changed ? { ...node.data, actions } : node.data } as FlowNode
  })
  return selectedNodes.every((node, index) => node === nodes[index]) ? nodes : selectedNodes
}

export function shareCanvasGraph() {
  let previous: { nodes: FlowNode[]; edges: Edge[] } | undefined
  return (graph: { nodes: FlowNode[]; edges: Edge[] }) => {
    const priorNodes = new Map(previous?.nodes.map(node => [node.id, node]))
    const priorEdges = new Map(previous?.edges.map(edge => [edge.id, edge]))
    const nodes = graph.nodes.map(node => sameValue(node, priorNodes.get(node.id)) ? priorNodes.get(node.id)! : node)
    const edges = graph.edges.map(edge => sameValue(edge, priorEdges.get(edge.id)) ? priorEdges.get(edge.id)! : edge)
    const result = { nodes: previous && nodes.every((node, index) => node === previous!.nodes[index])
      && nodes.length === previous.nodes.length ? previous.nodes : nodes,
      edges: previous && edges.every((edge, index) => edge === previous!.edges[index])
      && edges.length === previous.edges.length ? previous.edges : edges }
    previous = result; return result
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key)
    && sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]))
}
