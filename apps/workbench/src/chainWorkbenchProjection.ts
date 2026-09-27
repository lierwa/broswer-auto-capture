import type {
  ChainPresentation, ChainStage, TaskChain, TaskExecutionEvent, TaskExecutionEventBatch,
} from "@browser-capture/contracts"

export type ChainRunTone = "idle" | "queued" | "running" | "success" | "waiting" | "failure" | "skipped" | "ended"
export type ProjectedChainEdge = { id: string; source: string; target: string; port: string; tone: ChainRunTone }

export function eventsForStep(stepId: string, executionId: string | null, batch: TaskExecutionEventBatch | null) {
  if (!executionId || batch?.executionId !== executionId) return null
  const stepEvents = batch.events.filter((item) => item.executionId === executionId && item.stepId === stepId)
  const runId = stepEvents.at(-1)?.runId
  // WHY：同一 execution 内仍可能重进同一步；只让最后一次真实 run 给当前图上色，绝不拼接旧 run。
  return { ...batch, events: runId ? stepEvents.filter((item) => item.runId === runId) : [] }
}

export function latestExecutionEvents(batch: TaskExecutionEventBatch | null) {
  const latest = new Map<string, TaskExecutionEvent>()
  for (const item of batch?.events ?? []) latest.set(item.event.nodeId, item)
  return latest
}

export function nodeRunTone(nodeId: string, batch: TaskExecutionEventBatch | null, stage?: ChainStage): ChainRunTone {
  const event = latestExecutionEvents(batch).get(nodeId)?.event
  if (!event) return batch && (finishedRun(batch) || stage && stageExitEvent(stage, batch)) ? "skipped" : "idle"
  if (event.status === "planned") return batch?.status === "running" || batch?.status === "queued" ? "queued" : inactiveTone(batch)
  if (event.status === "started") return batch?.status === "running" ? "running" : inactiveTone(batch)
  if (event.outcome === "human_required") return "waiting"
  if (event.outcome === "cancelled") return "skipped"
  if (["failed", "blocked", "timeout", "missing"].includes(event.outcome ?? "")) return "failure"
  return "success"
}

export function stageRunTone(stage: ChainStage, batch: TaskExecutionEventBatch | null): ChainRunTone {
  const exit = stageExitEvent(stage, batch)
  if (exit) return outcomeTone(exit.event.outcome)
  const tones = stage.nodeIds.map((nodeId) => nodeRunTone(nodeId, batch))
  for (const tone of ["running", "waiting", "failure", "queued"] as const) if (tones.includes(tone)) return tone
  if (tones.length && tones.every((tone) => tone === "skipped")) return "skipped"
  if (tones.length && tones.every((tone) => tone === "success" || tone === "skipped")) return "success"
  return tones.some((tone) => tone !== "idle") ? batch?.status === "running" ? "running" : inactiveTone(batch) : "idle"
}

function stageExitEvent(stage: ChainStage, batch: TaskExecutionEventBatch | null) {
  const latest = batch?.events.findLast((item) => stage.nodeIds.includes(item.event.nodeId))
  // WHY：确认真实离开阶段即可完成；未走的业务分支不能令前一阶段永远运行中。
  return latest?.event.status === "finished" && stage.exits.some((exit) => exit.sourceNodeId === latest.event.nodeId
    && exit.sourcePort === latest.event.outcome) ? latest : null
}

export function overviewChainEdges(chain: TaskChain, presentation: ChainPresentation,
  batch: TaskExecutionEventBatch | null): ProjectedChainEdge[] {
  const stageByNode = new Map(presentation.stages.flatMap((stage) => stage.nodeIds.map((nodeId) => [nodeId, stage.id] as const)))
  const entryStage = stageByNode.get(chain.entry), edges: ProjectedChainEdge[] = []
  if (entryStage) edges.push({ id: `overview:start:${entryStage}`, source: "__start", target: entryStage,
    port: "", tone: targetEdgeTone(null, chain.entry, "start", batch) })
  for (const edge of chain.edges) {
    const source = stageByNode.get(edge.from), target = stageByNode.get(edge.to)
    if (!source || source === target) continue
    const port = "port" in edge ? edge.port : edge.outcome
    edges.push({ id: `overview:${source}:${target ?? edge.to}:${port}`, source, target: target ?? terminalCanvasId(edge.to), port,
      tone: targetEdgeTone(edge.from, edge.to, port, batch) })
  }
  return collapseOverviewEdges(edges)
}

export function focusChainEdges(chain: TaskChain, stage: ChainStage,
  batch: TaskExecutionEventBatch | null): ProjectedChainEdge[] {
  const nodeIds = new Set(stage.nodeIds), edges: ProjectedChainEdge[] = [{ id: `focus:entry:${stage.id}`,
    source: "__stage_entry", target: stage.entryNodeId, port: "",
    tone: targetEdgeTone(null, stage.entryNodeId, "entry", batch) }]
  for (const edge of chain.edges) {
    if (!nodeIds.has(edge.from)) continue
    const port = "port" in edge ? edge.port : edge.outcome
    const exit = stage.exits.find((item) => item.sourceNodeId === edge.from && item.sourcePort === port)
    if (nodeIds.has(edge.to)) edges.push({ id: `focus:${edge.from}:${port}:${edge.to}`, source: edge.from,
      target: edge.to, port, tone: targetEdgeTone(edge.from, edge.to, port, batch) })
    else if (exit) edges.push({ id: `focus:${edge.from}:${port}:${exit.id}`, source: edge.from,
      target: `__stage_exit:${exit.id}`, port, tone: targetEdgeTone(edge.from, edge.to, port, batch) })
  }
  return uniqueEdges(edges)
}

export function terminalCanvasId(nodeId: string) { return `__end:${nodeId}` }

export function edgePortLabel(port: string) {
  return ({ success: "", completed: "", start: "", entry: "", failed: "失败", blocked: "受阻",
    timeout: "超时", missing: "未找到", human_required: "等待人工", cancelled: "取消",
    true: "条件成立", false: "条件不成立", default: "其他情况" } as Record<string, string>)[port] ?? port
}

function targetEdgeTone(sourceId: string | null, targetId: string, port: string,
  batch: TaskExecutionEventBatch | null): ChainRunTone {
  const events = latestExecutionEvents(batch), target = events.get(targetId)?.event
  const source = sourceId ? events.get(sourceId)?.event : null
  if (source?.status === "finished") {
    if (source.outcome !== port) return "idle"
    const outcome = outcomeTone(source.outcome)
    if (outcome !== "success") return outcome
    return target?.status === "finished" ? "success" : batch?.status === "running" ? "running" : inactiveTone(batch)
  }
  if (!sourceId && target?.status === "finished") return "success"
  if (target?.status === "started") return batch?.status === "running" ? "running" : inactiveTone(batch)
  return "idle"
}

function collapseOverviewEdges(edges: ProjectedChainEdge[]) {
  const groups = new Map<string, ProjectedChainEdge[]>()
  for (const edge of edges) {
    const key = `${edge.source}\0${edge.target}\0${edge.port}`, group = groups.get(key) ?? []
    group.push(edge); groups.set(key, group)
  }
  return [...groups.values()].map((group) => group.length === 1 ? group[0]! : {
    ...group[0]!, tone: strongestTone(group.map((edge) => edge.tone)),
  })
}

function outcomeTone(outcome: string | null): ChainRunTone {
  if (outcome === "human_required") return "waiting"
  if (outcome === "cancelled") return "skipped"
  return ["failed", "blocked", "timeout", "missing"].includes(outcome ?? "") ? "failure" : "success"
}

function finishedRun(batch: TaskExecutionEventBatch) {
  return ["completed", "failed", "blocked", "cancelled", "partial", "cleanup_required"].includes(batch.status)
}

function strongestTone(tones: ChainRunTone[]) {
  return (["running", "waiting", "failure", "success", "queued", "skipped", "ended", "idle"] as const)
    .find((tone) => tones.includes(tone)) ?? "idle"
}

function inactiveTone(batch: TaskExecutionEventBatch | null): ChainRunTone {
  return batch && ["paused", "waiting_for_human"].includes(batch.status) ? "waiting" : "ended"
}

function uniqueEdges(edges: ProjectedChainEdge[]) {
  return edges.filter((edge, index) => edges.findIndex((candidate) => candidate.id === edge.id) === index)
}
