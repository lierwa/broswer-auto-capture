import { actionGraphSchema, type ActionGraph, type ActionNode } from "@browser-capture/contracts/chain"

export function successors(node: ActionNode): string[] {
  if (node.kind === "finish" || node.kind === "stop") return []
  if (node.kind === "branch") return [node.present, node.absent]
  if (node.kind === "loop") return [node.body, node.exhausted]
  return [node.next]
}
export function compileActionGraph(raw: unknown): ActionGraph {
  const graph = actionGraphSchema.parse(raw), nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  if (nodes.size !== graph.nodes.length || !nodes.has(graph.entry)) throw new Error("graph_identity")
  if (!graph.nodes.some((node) => node.kind === "finish")) throw new Error("graph_termination")
  for (const node of graph.nodes) {
    if (successors(node).some((id) => !nodes.has(id))) throw new Error("graph_edge")
    if (node.kind === "loop" && nodes.get(node.exhausted)?.kind !== "stop") throw new Error("loop_exhaustion_requires_stop")
    if (JSON.stringify(node).match(/@e\d+|javascript:|document\.|localStorage|cookie/i)) throw new Error("unsupported_action")
  }
  const reachable = new Set<string>()
  const visit = (id: string) => { if (reachable.has(id)) return; reachable.add(id); successors(nodes.get(id)!).forEach(visit) }
  visit(graph.entry)
  if (reachable.size !== nodes.size) throw new Error("graph_unreachable")
  // WHY：每个环必须经过显式有界 loop；普通 next/branch 不能构成无界隐形循环。
  const visiting = new Set<string>(), done = new Set<string>()
  const acyclic = (id: string) => {
    if (visiting.has(id)) throw new Error("unbounded_cycle")
    if (done.has(id)) return
    visiting.add(id)
    const node = nodes.get(id)!
    if (node.kind !== "loop") successors(node).forEach(acyclic)
    visiting.delete(id); done.add(id)
  }
  graph.nodes.forEach((node) => acyclic(node.id))
  return graph
}
