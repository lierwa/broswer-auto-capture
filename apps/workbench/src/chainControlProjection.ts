import type { ChainNode, ChainStage, TaskChain, TaskExecutionEventBatch } from "@browser-capture/contracts"
import { actionPresentation, bindingSourceLabel, predicateLabel } from "./chainNodePresentation.js"
import { orderedExecutionEvents } from "./chainExecutionFacts.js"

export type ControlGraph = { nodes: readonly ChainNode[]; edges: readonly TaskChain["edges"][number][] }
type Loop = Extract<ChainNode, { kind: "loop" }>
type Branch = Extract<ChainNode, { kind: "branch" | "condition" }>

export function branchDefinitions(node: ChainNode, chain: ControlGraph) {
  if (node.kind !== "branch" && node.kind !== "condition") return []
  const definitions = "cases" in node ? [...node.cases.map((item, index) => ({ port: item.id,
    label: `${index ? "else if" : "if"} ${item.label}：${predicateLabel(item.predicate, chain.nodes)}` })),
    { port: "default", label: "else：以上规则均不成立" }]
    : [{ port: "true", label: `if ${predicateLabel(node.predicate, chain.nodes)}` },
      { port: "false", label: "else：条件不成立" }]
  return definitions.map((definition) => {
    const edge = chain.edges.find((item) => item.from === node.id && edgePort(item) === definition.port)
    const target = chain.nodes.find((item) => item.id === edge?.to)
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
  if (!("body" in node)) return new Set<string>()
  const exits = new Set(node.body.exits)
  // WHY：只有声明 body 的出口确实回到当前 loop，才用它划定当前轮；旧链缺定义时不猜列表归属。
  if (!node.body.exits.every((id) => chain.edges.some((edge) => edge.from === id && edge.to === node.id))) {
    return new Set<string>()
  }
  return reachable(node.body.entry, chain, new Set([node.id]), exits)
}

export function currentNodeEvents(nodeId: string, chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  const events = orderedExecutionEvents(batch)
  let boundary = -1
  for (const loop of chain.nodes.filter((node): node is Loop => node.kind === "loop")) {
    if (!loopBodyIds(loop, chain).has(nodeId)) continue
    const latest = events.findLast((item) => item.event.nodeId === loop.id)
    if (!latest) continue
    // WHY：新门控开始即撤下上一轮状态；body 的 finished 只表示本轮已进入，不表示范围完成。
    const rangeStart = latest.event.status === "finished" && ["done", "limit"].includes(latest.event.outcome ?? "")
      ? events.findLast((item) => item.event.nodeId === loop.id && item.sequence < latest.sequence
        && item.event.status === "finished" && item.event.outcome === "body")?.sequence ?? latest.sequence
      : latest.sequence
    boundary = Math.max(boundary, rangeStart)
  }
  return events.filter((item) => item.event.nodeId === nodeId && item.sequence > boundary)
}

export function currentNodeEvent(nodeId: string, chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  return currentNodeEvents(nodeId, chain, batch).at(-1)
}

export function isNodeUnselected(nodeId: string, stage: ChainStage | undefined,
  chain: ControlGraph, batch: TaskExecutionEventBatch | null) {
  if (!stage || currentNodeEvent(nodeId, chain, batch)) return false
  const allowed = new Set(stage.nodeIds)
  for (const branch of chain.nodes.filter((node): node is Branch => allowed.has(node.id)
    && (node.kind === "branch" || node.kind === "condition"))) {
    const selected = branchRows(branch, chain, batch).find((row) => row.selection === "selected")?.port
    if (!selected) continue
    const paths = branchDefinitions(branch, chain).map((row) => {
      const edge = chain.edges.find((item) => item.from === branch.id && edgePort(item) === row.port)
      return { port: row.port, ids: edge ? reachable(edge.to, chain, new Set([branch.id])) : new Set<string>() }
    })
    const owners = paths.filter((path) => path.ids.has(nodeId))
    if (owners.length !== 1 || owners[0]!.port === selected) continue
    const exclusive = new Set([...owners[0]!.ids].filter((id) => allowed.has(id)
      && paths.filter((path) => path.ids.has(id)).length === 1))
    const externalTargets = chain.edges.filter((edge) => exclusive.has(edge.to)
      && edge.from !== branch.id && !exclusive.has(edge.from)).map((edge) => edge.to)
    // WHY：外来入口后的整段都不能证明由该分支独占；只剔除入口本身会错灰它的后续动作。
    const externallyReachable = new Set(externalTargets.flatMap((id) => [...reachable(id, chain, new Set([branch.id]))]))
    if (!externallyReachable.has(nodeId)) return true
  }
  return false
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
    const node = chain.nodes.find((item) => item.id === id)
    if (!node || node.kind === "terminal") continue
    result.add(id)
    if (exits.has(id)) continue
    pending.push(...chain.edges.filter((edge) => edge.from === id).map((edge) => edge.to))
  }
  return result
}

function edgePort(edge: ControlGraph["edges"][number]) { return "port" in edge ? edge.port : edge.outcome }
