import type { ChainNode, ChainStage, TaskChain, TaskExecutionEventBatch } from "@browser-capture/contracts"
import { actionPresentation, bindingSourceLabel, predicateLabel } from "./chainNodePresentation.js"
import { nodeExecutionEvents } from "./chainExecutionFacts.js"

export type ControlGraph = { nodes: readonly ChainNode[]; edges: readonly TaskChain["edges"][number][] }
type Loop = Extract<ChainNode, { kind: "loop" }>
type Branch = Extract<ChainNode, { kind: "branch" | "condition" }>
type BranchDefinition = { port: string; label: string; target: string }
const cache = new WeakMap<ControlGraph, ReturnType<typeof indexGraph>>()
function topology(chain: ControlGraph) {
  let indexed = cache.get(chain)
  if (!indexed) { indexed = indexGraph(chain); cache.set(chain, indexed) }
  return indexed
}
function indexGraph(chain: ControlGraph) {
  const nodes = new Map(chain.nodes.map(node => [node.id, node]))
  const outgoing = new Map<string, ControlGraph["edges"][number][]>()
  for (const edge of chain.edges) {
    const edges = outgoing.get(edge.from) ?? []; edges.push(edge); outgoing.set(edge.from, edges)
  }
  return { nodes, outgoing, bodies: new Map<string, Set<string>>(),
    definitions: new Map<string, ReturnType<typeof defineBranches>>(),
    exclusions: new WeakMap<ChainStage, Map<string, Map<string, Set<string>>>>(),
    current: new WeakMap<TaskExecutionEventBatch, Map<string, TaskExecutionEventBatch["events"]>>() }
}

export function branchDefinitions(node: ChainNode, chain: ControlGraph) {
  const indexed = topology(chain)
  let definitions = indexed.definitions.get(node.id)
  if (!definitions) { definitions = defineBranches(node, chain); indexed.definitions.set(node.id, definitions) }
  return definitions
}
function defineBranches(node: ChainNode, chain: ControlGraph): BranchDefinition[] {
  if (node.kind !== "branch" && node.kind !== "condition") return []
  const definitions = "cases" in node ? [...node.cases.map((item, index) => ({ port: item.id,
    label: `${index ? "else if" : "if"} ${item.label}：${predicateLabel(item.predicate, chain.nodes)}` })),
    { port: "default", label: "else：以上规则均不成立" }]
    : [{ port: "true", label: `if ${predicateLabel(node.predicate, chain.nodes)}` },
      { port: "false", label: "else：条件不成立" }]
  return definitions.map((definition) => {
    const edge = topology(chain).outgoing.get(node.id)?.find(item => edgePort(item) === definition.port)
    const target = topology(chain).nodes.get(edge?.to ?? "")
    return { ...definition, target: target ? actionPresentation(target).title : "后续动作尚未记录" }
  })
}

export function branchRows(node: ChainNode, chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  const event = currentNodeEvent(node.id, chain, batch)?.event
  const definitions = branchDefinitions(node, chain)
  const selected = event?.status === "finished" && definitions.some((item) => item.port === event.outcome)
    ? event.outcome : null
  return definitions.map((row) => ({ ...row, selection: selected === null ? "pending" as const
    : selected === row.port ? "selected" as const : "unselected" as const }))
}

export function loopBodyIds(node: Loop, chain: ControlGraph) {
  const indexed = topology(chain), cached = indexed.bodies.get(node.id)
  if (cached) return cached
  const body = defineLoopBody(node, chain)
  indexed.bodies.set(node.id, body); return body
}
function defineLoopBody(node: Loop, chain: ControlGraph) {
  if (!("body" in node)) return new Set<string>()
  const exits = new Set(node.body.exits)
  // WHY：只有声明 body 的出口确实回到当前 loop，才用它划定当前轮；旧链缺定义时不猜列表归属。
  if (!node.body.exits.every((id) => chain.edges.some((edge) => edge.from === id && edge.to === node.id))) {
    return new Set<string>()
  }
  return reachable(node.body.entry, chain, new Set([node.id]), exits)
}

export function currentNodeEvents(nodeId: string, chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  if (!batch) return []
  const indexed = topology(chain)
  let current = indexed.current.get(batch)
  if (!current) {
    const boundaries = new Map<string, number>()
    for (const loop of chain.nodes.filter((node): node is Loop => node.kind === "loop")) {
      const events = nodeExecutionEvents(loop.id, batch), latest = events.at(-1)
      if (!latest) continue
      // WHY：新门控撤下上一轮；done/limit 保留最后一次真实进入 body 的状态。
      const boundary = latest.event.status === "finished" && ["done", "limit"].includes(latest.event.outcome ?? "")
        ? events.findLast(item => item.sequence < latest.sequence && item.event.status === "finished"
          && item.event.outcome === "body")?.sequence ?? latest.sequence : latest.sequence
      for (const id of loopBodyIds(loop, chain)) boundaries.set(id, Math.max(boundaries.get(id) ?? -1, boundary))
    }
    current = new Map(chain.nodes.map(node => [node.id,
      nodeExecutionEvents(node.id, batch).filter(item => item.sequence > (boundaries.get(node.id) ?? -1))]))
    indexed.current.set(batch, current)
  }
  return current.get(nodeId) ?? []
}

export function currentNodeEvent(nodeId: string, chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  return currentNodeEvents(nodeId, chain, batch).at(-1)
}

export function isNodeUnselected(nodeId: string, stage: ChainStage | undefined,
  chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  if (!stage || currentNodeEvent(nodeId, chain, batch)) return false
  for (const [branchId, ports] of stageExclusions(stage, chain)) {
    const event = currentNodeEvent(branchId, chain, batch)?.event
    if (event?.status !== "finished") continue
    for (const [port, ids] of ports) if (port !== event.outcome && ports.has(event.outcome ?? "") && ids.has(nodeId)) return true
  }
  return false
}

/** WHY：独占路径和外来入口只由版本图决定，与节点事件和选中状态无关。 */
function stageExclusions(stage: ChainStage, chain: ControlGraph) {
  const indexed = topology(chain), cached = indexed.exclusions.get(stage)
  if (cached) return cached
  const allowed = new Set(stage.nodeIds), rules = new Map<string, Map<string, Set<string>>>()
  for (const branch of chain.nodes.filter((node): node is Branch => allowed.has(node.id)
    && (node.kind === "branch" || node.kind === "condition"))) {
    const paths = branchDefinitions(branch, chain).map(row => {
      const edge = indexed.outgoing.get(branch.id)?.find(item => edgePort(item) === row.port)
      return { port: row.port, ids: edge ? reachable(edge.to, chain, new Set([branch.id])) : new Set<string>() }
    })
    const ports = new Map<string, Set<string>>()
    for (const path of paths) {
      const exclusive = new Set([...path.ids].filter(id => allowed.has(id)
        && paths.filter(other => other.ids.has(id)).length === 1))
      const external = chain.edges.filter(edge => exclusive.has(edge.to)
        && edge.from !== branch.id && !exclusive.has(edge.from)).map(edge => edge.to)
      const reachableOutside = new Set(external.flatMap(id => [...reachable(id, chain, new Set([branch.id]))]))
      ports.set(path.port, new Set([...exclusive].filter(id => !reachableOutside.has(id))))
    }
    rules.set(branch.id, ports)
  }
  indexed.exclusions.set(stage, rules); return rules
}

export function loopContext(node: Loop, chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  const event = currentNodeEvent(node.id, chain, batch)?.event
  const fact = event?.execution?.loop
  const range = node.iteration.mode === "each" ? `处理：${bindingSourceLabel(node.iteration.collection, chain.nodes)}`
    : `继续：${predicateLabel("repeatCondition" in node.iteration && node.iteration.repeatCondition
      ? node.iteration.repeatCondition : node.iteration.condition, chain.nodes)}`
  const exit = node.iteration.mode === "each" ? "退出：输入集合已处理完毕"
    : "退出：继续条件不成立"
  const knownTotal = node.iteration.mode === "each" && fact?.total !== undefined ? ` / 总计 ${fact.total} 项` : ""
  // WHY：while 的完成事实是轮次，不代表输出记录数；只有 each 处理已声明的集合项。
  const unit = node.iteration.mode === "each" ? "项" : "轮"
  const count = fact ? `${node.iteration.mode === "each" ? "已处理" : "已完成"} ${fact.completedStableKeysCount} ${unit}${knownTotal}${fact.activeStableKey !== null
    ? `；当前第 ${fact.completedStableKeysCount + 1} ${unit}` : ""}` : "逐轮进度未记录"
  const progress = event?.outcome === "limit" ? `限额停止：技术上限 ${node.maxIterations} 次；${count}`
    : fact?.exitReason === "stop_when" ? `已达到约定停止条件；${count}`
      : event?.outcome === "done" ? `已按声明规则结束；${count}` : count
  return [range, exit, ...("stopWhen" in node && node.stopWhen
    ? [`约定停止：${predicateLabel(node.stopWhen, chain.nodes)}`] : []), progress]
}

function reachable(entry: string, chain: ControlGraph, stop: Set<string>, exits = new Set<string>()) {
  const result = new Set<string>(), pending = [entry]
  while (pending.length) {
    const id = pending.pop()!
    if (result.has(id) || stop.has(id)) continue
    const node = topology(chain).nodes.get(id)
    if (!node || node.kind === "terminal") continue
    result.add(id)
    if (exits.has(id)) continue
    pending.push(...(topology(chain).outgoing.get(id) ?? []).map(edge => edge.to))
  }
  return result
}

function edgePort(edge: ControlGraph["edges"][number]) { return "port" in edge ? edge.port : edge.outcome }
