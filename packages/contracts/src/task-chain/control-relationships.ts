import type { ChainNode } from "./node.js"
import type { TaskChain } from "./chain.js"

export type ChainControlGraph = { nodes: readonly ChainNode[]; edges: readonly TaskChain["edges"][number][] }

/** WHY：body 是冻结图的声明关系，供展示和事实隔离共同消费；不是新的调度或执行规则。 */
export function declaredLoopBodyIds(node: Extract<ChainNode, { kind: "loop" }>, graph: ChainControlGraph): Set<string> {
  if (!("body" in node) || !node.body.exits.length) return new Set()
  if (!node.body.exits.every(id => graph.edges.some(edge => edge.from === id && edge.to === node.id))) return new Set()
  if (!graph.edges.some(edge => edge.from === node.id && edge.to === node.body.entry
    && ("port" in edge ? edge.port : edge.outcome) === "body")) return new Set()
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  const outgoing = new Map<string, string[]>()
  for (const edge of graph.edges) { const targets = outgoing.get(edge.from) ?? []; targets.push(edge.to); outgoing.set(edge.from, targets) }
  const exits = new Set(node.body.exits), found = new Set<string>(), pending = [node.body.entry]
  while (pending.length) {
    const id = pending.pop()!, current = nodes.get(id)
    if (id === node.id || found.has(id) || !current || current.kind === "terminal") continue
    found.add(id)
    if (!exits.has(id)) pending.push(...outgoing.get(id) ?? [])
  }
  return node.body.exits.every(id => found.has(id)) ? found : new Set()
}
