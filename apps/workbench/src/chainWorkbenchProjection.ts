import type {
  ChainNode, ChainPresentation, ChainStage, TaskChain, TaskExecutionEventBatch,
} from "@browser-capture/contracts"
import { currentNodeEvent, isNodeUnselected, loopBodyIds, type ControlGraph } from "./chainControlProjection.js"
import { latestExecutionEvents, orderedExecutionEvents } from "./chainExecutionFacts.js"

type StagePresentation = Pick<ChainPresentation, "stages">
const toneCache = new WeakMap<ControlGraph, WeakMap<TaskExecutionEventBatch, Map<string, ChainRunTone>>>()

export type ChainRunTone = "idle" | "queued" | "running" | "success" | "waiting" | "failure" | "skipped" | "ended" | "unselected"
export type ProjectedChainEdge = { id: string; source: string; target: string; port: string; label: string; tone: ChainRunTone }

export function eventsForStep(stepId: string, executionId: string | null, batch: TaskExecutionEventBatch | null,
  selectedRunId?: string | null) {
  if (!executionId || batch?.executionId !== executionId) return null
  const stepEvents = batch.events.filter((item) => item.executionId === executionId && item.stepId === stepId)
  const runId = selectedRunId ?? stepEvents.at(-1)?.runId
  // WHY：同一 execution 内仍可能重进同一步；只让最后一次真实 run 给当前图上色，绝不拼接旧 run。
  return { ...batch, events: runId ? stepEvents.filter((item) => item.runId === runId) : [] }
}

export { latestExecutionEvents } from "./chainExecutionFacts.js"

export function nodeRunTone(nodeId: string, batch: TaskExecutionEventBatch | null, stage?: ChainStage,
  chain?: ControlGraph): ChainRunTone {
  if (!chain || !batch) return computeNodeRunTone(nodeId, batch, stage, chain)
  let batches = toneCache.get(chain)
  if (!batches) { batches = new WeakMap(); toneCache.set(chain, batches) }
  let tones = batches.get(batch)
  if (!tones) { tones = new Map(); batches.set(batch, tones) }
  const key = JSON.stringify([stage?.id, nodeId])
  let tone = tones.get(key)
  if (!tone) { tone = computeNodeRunTone(nodeId, batch, stage, chain); tones.set(key, tone) }
  return tone
}
function computeNodeRunTone(nodeId: string, batch: TaskExecutionEventBatch | null, stage?: ChainStage,
  chain?: ControlGraph): ChainRunTone {
  const event = chain ? currentNodeEvent(nodeId, chain, batch)?.event : latestExecutionEvents(batch).get(nodeId)?.event
  if (!event) return chain && isNodeUnselected(nodeId, stage, chain, batch) ? "unselected" : "idle"
  if (event.status === "planned") return batch?.status === "running" || batch?.status === "queued" ? "queued" : inactiveTone(batch)
  if (event.status === "started") return batch?.status === "running" ? "running" : inactiveTone(batch)
  const node = chain?.nodes.find((item) => item.id === nodeId)
  // WHY：case ID 是版本数据；与标准端口同名也仍是已声明的正常选择，不凭字符串改判异常。
  if (branchCase(node, event.outcome)) return "success"
  if (event.outcome === "human_required") return "waiting"
  if (event.outcome === "cancelled") return "ended"
  if (event.outcome === "limit") return "ended"
  if (event.outcome === "body") return loopRangeTone(nodeId, batch, chain)
  if (["failed", "blocked", "timeout", "missing"].includes(event.outcome ?? "")) return "failure"
  if (node?.kind === "terminal") return node.status === "completed" ? "success"
    : ["cancelled", "partial"].includes(node.status) ? "ended" : "failure"
  return "success"
}

export function stageRunTone(stage: ChainStage, batch: TaskExecutionEventBatch | null, chain?: ControlGraph): ChainRunTone {
  const tones = stage.nodeIds.map((nodeId) => nodeRunTone(nodeId, batch, stage, chain))
  // WHY：当前动作或循环范围事实优先；旧出口不能覆盖下一轮 started 和 body/限额停止。
  for (const tone of ["running", "waiting", "failure", "queued", "ended"] as const) if (tones.includes(tone)) return tone
  const exit = stageExitEvent(stage, batch)
  if (exit) return outcomeTone(exit.event.outcome, chain?.nodes.find((node) => node.id === exit.event.nodeId))
  if (tones.length && tones.every((tone) => tone === "skipped")) return "skipped"
  if (tones.length && tones.every((tone) => ["success", "skipped", "unselected"].includes(tone))) return "success"
  return tones.some((tone) => tone !== "idle") ? batch?.status === "running" ? "running" : inactiveTone(batch) : "idle"
}

function stageExitEvent(stage: ChainStage, batch: TaskExecutionEventBatch | null) {
  const latest = orderedExecutionEvents(batch).findLast((item) => stage.nodeIds.includes(item.event.nodeId))
  // WHY：确认真实离开阶段即可完成；未走的业务分支不能令前一阶段永远运行中。
  return latest?.event.status === "finished" && stage.exits.some((exit) => exit.sourceNodeId === latest.event.nodeId
    && exit.sourcePort === latest.event.outcome) ? latest : null
}

export function overviewChainEdges(chain: TaskChain, presentation: StagePresentation,
  batch: TaskExecutionEventBatch | null): ProjectedChainEdge[] {
  const stageByNode = new Map(presentation.stages.flatMap((stage) => stage.nodeIds.map((nodeId) => [nodeId, stage.id] as const)))
  const entryStage = stageByNode.get(chain.entry), edges: ProjectedChainEdge[] = []
  const caseEdges = new Set<string>()
  if (entryStage) edges.push({ id: `overview:start:${entryStage}`, source: "__start", target: entryStage,
    port: "", label: "", tone: targetEdgeTone(null, chain.entry, "start", batch, chain) })
  for (const edge of chain.edges) {
    const source = stageByNode.get(edge.from), target = stageByNode.get(edge.to)
    if (!source || source === target) continue
    const port = "port" in edge ? edge.port : edge.outcome
    const sourceNode = chain.nodes.find((node) => node.id === edge.from)
    const label = edgePortLabel(port, sourceNode), id = `overview:${source}:${edge.from}:${target ?? edge.to}:${port}`
    if (branchCase(sourceNode, port)) caseEdges.add(id)
    edges.push({ id, source, target: target ?? terminalCanvasId(edge.to), port, label,
      tone: targetEdgeTone(edge.from, edge.to, port, batch, chain) })
  }
  return collapseOverviewEdges(edges, caseEdges)
}

export function terminalCanvasId(nodeId: string) { return `__end:${nodeId}` }

export function edgePortLabel(port: string, node?: ChainNode) {
  const declared = branchCase(node, port)
  if (declared) return declared.label
  return ({ success: "", completed: "", start: "", entry: "", failed: "失败", blocked: "受阻",
    timeout: "超时", missing: "未找到", human_required: "等待人工", cancelled: "取消",
    true: "条件成立", false: "条件不成立", default: "其他情况", body: "进入循环体", done: "按规则结束",
    limit: "限额停止", partial: "部分完成" } as Record<string, string>)[port] ?? port
}

function targetEdgeTone(sourceId: string | null, targetId: string, port: string,
  batch: TaskExecutionEventBatch | null, chain: ControlGraph): ChainRunTone {
  const target = currentNodeEvent(targetId, chain, batch)?.event
  const source = sourceId ? currentNodeEvent(sourceId, chain, batch)?.event : null
  const sourceNode = chain.nodes.find((node) => node.id === sourceId)
  if (source?.status === "finished") {
    if (source.outcome !== port) return "idle"
    if (sourceNode?.kind === "loop" && source.outcome === "body") return nodeRunTone(source.nodeId, batch, undefined, chain)
    const outcome = outcomeTone(source.outcome, sourceNode)
    if (outcome !== "success") return outcome
    return target?.status === "finished" ? nodeRunTone(targetId, batch, undefined, chain)
      : batch?.status === "running" ? "running" : inactiveTone(batch)
  }
  if (!sourceId && target?.status === "finished") return "success"
  if (target?.status === "started") return batch?.status === "running" ? "running" : inactiveTone(batch)
  return "idle"
}

function collapseOverviewEdges(edges: ProjectedChainEdge[], caseEdges: Set<string>) {
  const groups = new Map<string, ProjectedChainEdge[]>()
  for (const edge of edges) {
    // WHY：真实 case 的源身份在创建时确认；文案相同也不能与 loop 混并，不从 ID 字符串猜节点语义。
    const key = caseEdges.has(edge.id) ? edge.id : `${edge.source}\0${edge.target}\0${edge.port}\0${edge.label}`
    const group = groups.get(key) ?? []
    group.push(edge); groups.set(key, group)
  }
  return [...groups.values()].map((group) => group.length === 1 ? group[0]! : {
    ...group[0]!, tone: strongestTone(group.map((edge) => edge.tone)),
  })
}

function outcomeTone(outcome: string | null, node?: ChainNode): ChainRunTone {
  if (branchCase(node, outcome)) return "success"
  if (outcome === "human_required") return "waiting"
  if (["cancelled", "limit", "partial"].includes(outcome ?? "")) return "ended"
  if (outcome === "body") return "running"
  return ["failed", "blocked", "timeout", "missing"].includes(outcome ?? "") ? "failure" : "success"
}

function branchCase(node: ChainNode | undefined, port: string | null) {
  return node?.kind === "branch" && "cases" in node ? node.cases.find((item) => item.id === port) : undefined
}

function strongestTone(tones: ChainRunTone[]) {
  return (["running", "waiting", "failure", "success", "queued", "skipped", "ended", "unselected", "idle"] as const)
    .find((tone) => tones.includes(tone)) ?? "idle"
}

function inactiveTone(batch: TaskExecutionEventBatch | null): ChainRunTone {
  return batch && ["paused", "waiting_for_human"].includes(batch.status) ? "waiting" : "ended"
}

function loopRangeTone(nodeId: string, batch: TaskExecutionEventBatch | null, chain?: ControlGraph): ChainRunTone {
  const node = chain?.nodes.find((item) => item.id === nodeId)
  if (node?.kind === "loop") {
    const gate = currentNodeEvent(nodeId, chain!, batch)
    const body = loopBodyIds(node, chain!)
    const latest = orderedExecutionEvents(batch).findLast((item) => body.has(item.event.nodeId)
      && item.sequence > (gate?.sequence ?? -1))?.event
    const tone = outcomeTone(latest?.outcome ?? null, chain?.nodes.find((item) => item.id === latest?.nodeId))
    if (latest?.status === "finished" && tone === "failure") return "failure"
    if (tone === "waiting") return "waiting"
  }
  return batch?.status === "running" ? "running" : inactiveTone(batch)
}
