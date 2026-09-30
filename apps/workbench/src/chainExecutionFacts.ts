import type { TaskExecutionEvent, TaskExecutionEventBatch } from "@browser-capture/contracts"

export function orderedExecutionEvents(batch: TaskExecutionEventBatch | null) {
  const seen = new Set<string>()
  return (batch?.events ?? []).filter((item) => {
    const key = `${item.runId}:${item.event.sequence}`
    if (seen.has(key)) return false
    seen.add(key); return true
  }).sort((left, right) => left.sequence - right.sequence)
}

export function nodeDurationLabel(nodeId: string, batch: TaskExecutionEventBatch | null) {
  const events = orderedExecutionEvents(batch).filter((item) => item.event.nodeId === nodeId)
  if (!events.length) return batch ? "耗时未记录" : undefined
  const starts = new Map<string, TaskExecutionEvent>(), elapsed: number[] = []
  let incomplete = false
  for (const item of events) {
    const key = `${item.runId}:${item.event.invocationId}:${item.event.nodeId}`
    if (item.event.status === "started") {
      if (starts.has(key)) incomplete = true
      starts.set(key, item)
    }
    if (item.event.status !== "finished") continue
    const start = starts.get(key)
    if (!start) { incomplete = true; continue }
    starts.delete(key)
    const duration = Date.parse(item.event.at) - Date.parse(start.event.at)
    if (duration < 0 || !Number.isFinite(duration)) incomplete = true
    else elapsed.push(duration)
  }
  if (incomplete || starts.size) return "耗时记录不完整"
  if (!elapsed.length) return "耗时未记录"
  const total = formatDuration(elapsed.reduce((sum, value) => sum + value, 0))
  return elapsed.length > 1 ? `累计 ${total}（${elapsed.length} 次）` : total
}

export function stageDurationLabel(nodeIds: readonly string[], batch: TaskExecutionEventBatch | null) {
  const events = orderedExecutionEvents(batch).filter((item) => nodeIds.includes(item.event.nodeId))
  if (!events.length) return batch ? "耗时未记录" : undefined
  const first = events.find((item) => item.event.status === "started"), last = events.at(-1)
  if (!first || last?.event.status !== "finished" || events.some((item) => item.sequence < first.sequence
    && item.event.status === "finished")) return "耗时记录不完整"
  if (nodeIds.some((id) => nodeDurationLabel(id, batch) === "耗时记录不完整")) return "耗时记录不完整"
  const duration = Date.parse(last.event.at) - Date.parse(first.event.at)
  return Number.isFinite(duration) && duration >= 0 ? `跨度 ${formatDuration(duration)}` : "耗时记录不完整"
}

export function executionSegment(event: TaskExecutionEvent | undefined, batch: TaskExecutionEventBatch | null) {
  if (!event) return { started: undefined, finished: undefined }
  const prior = orderedExecutionEvents(batch).filter((item) => item.runId === event.runId
    && item.event.nodeId === event.event.nodeId && item.event.invocationId === event.event.invocationId
    && item.sequence <= event.sequence)
  const lastFinished = prior.findLast((item) => item.event.status === "finished" && item.sequence < event.sequence)?.sequence ?? -1
  return { started: prior.findLast((item) => item.event.status === "started" && item.sequence > lastFinished),
    finished: event.event.status === "finished" ? event : undefined }
}

function formatDuration(elapsed: number) {
  if (elapsed < 1_000) return `${elapsed} 毫秒`
  const seconds = elapsed / 1_000
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`
}
