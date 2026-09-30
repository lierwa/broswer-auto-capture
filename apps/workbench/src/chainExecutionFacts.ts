import type { TaskExecutionEvent, TaskExecutionEventBatch } from "@browser-capture/contracts"

type Segment = { started: TaskExecutionEvent | undefined; finished: TaskExecutionEvent | undefined }
const cache = new WeakMap<TaskExecutionEventBatch, ReturnType<typeof indexEvents>>()
const empty = indexEvents([])

function facts(batch: TaskExecutionEventBatch | null) {
  if (!batch) return empty
  let indexed = cache.get(batch)
  if (!indexed) { indexed = indexEvents(batch.events); cache.set(batch, indexed) }
  return indexed
}

/** WHY：batch 是不可变事实快照；同一次渲染内排序、调用配对与耗时只计算一次。 */
function indexEvents(source: TaskExecutionEvent[]) {
  const seen = new Set<string>(), byNode = new Map<string, TaskExecutionEvent[]>()
  const latest = new Map<string, TaskExecutionEvent>(), segments = new Map<number, Segment>()
  const starts = new Map<string, TaskExecutionEvent>(), elapsed = new Map<string, number[]>()
  const incomplete = new Set<string>()
  const ordered = source.filter(item => {
    const key = `${item.runId}:${item.event.sequence}`
    if (seen.has(key)) return false
    seen.add(key); return true
  }).sort((left, right) => left.sequence - right.sequence)
  for (const item of ordered) {
    const id = item.event.nodeId, key = `${item.runId}:${item.event.invocationId}:${id}`
    const events = byNode.get(id) ?? []; events.push(item); byNode.set(id, events); latest.set(id, item)
    if (item.event.status === "started") {
      if (starts.has(key)) incomplete.add(id)
      starts.set(key, item)
    }
    const started = starts.get(key)
    segments.set(item.sequence, { started, finished: item.event.status === "finished" ? item : undefined })
    if (item.event.status !== "finished") continue
    starts.delete(key)
    if (!started) { incomplete.add(id); continue }
    const duration = Date.parse(item.event.at) - Date.parse(started.event.at)
    if (duration < 0 || !Number.isFinite(duration)) incomplete.add(id)
    else { const values = elapsed.get(id) ?? []; values.push(duration); elapsed.set(id, values) }
  }
  for (const start of starts.values()) incomplete.add(start.event.nodeId)
  const durations = new Map([...byNode.keys()].map(id => {
    const values = elapsed.get(id) ?? [], total = formatDuration(values.reduce((sum, value) => sum + value, 0))
    return [id, incomplete.has(id) ? "耗时记录不完整" : !values.length ? "耗时未记录"
      : values.length > 1 ? `累计 ${total}（${values.length} 次）` : total] as const
  }))
  return { ordered, byNode, latest, segments, durations }
}

export function orderedExecutionEvents(batch: TaskExecutionEventBatch | null) { return facts(batch).ordered }
export function nodeExecutionEvents(nodeId: string, batch: TaskExecutionEventBatch | null) {
  return facts(batch).byNode.get(nodeId) ?? []
}
export function latestExecutionEvents(batch: TaskExecutionEventBatch | null) { return facts(batch).latest }
export function nodeDurationLabel(nodeId: string, batch: TaskExecutionEventBatch | null) {
  return facts(batch).durations.get(nodeId) ?? (batch ? "耗时未记录" : undefined)
}

export function stageDurationLabel(nodeIds: readonly string[], batch: TaskExecutionEventBatch | null) {
  const ids = new Set(nodeIds), events = orderedExecutionEvents(batch).filter(item => ids.has(item.event.nodeId))
  if (!events.length) return batch ? "耗时未记录" : undefined
  const first = events.find(item => item.event.status === "started"), last = events.at(-1)
  if (!first || last?.event.status !== "finished" || events.some(item => item.sequence < first.sequence
    && item.event.status === "finished") || nodeIds.some(id => nodeDurationLabel(id, batch) === "耗时记录不完整")) {
    return "耗时记录不完整"
  }
  const duration = Date.parse(last.event.at) - Date.parse(first.event.at)
  return Number.isFinite(duration) && duration >= 0 ? `跨度 ${formatDuration(duration)}` : "耗时记录不完整"
}

export function executionSegment(event: TaskExecutionEvent | undefined, batch: TaskExecutionEventBatch | null): Segment {
  return event ? facts(batch).segments.get(event.sequence) ?? {
    started: event.event.status === "started" ? event : undefined,
    finished: event.event.status === "finished" ? event : undefined,
  } : { started: undefined, finished: undefined }
}

function formatDuration(elapsed: number) {
  if (elapsed < 1_000) return `${elapsed} 毫秒`
  const seconds = elapsed / 1_000
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`
}
