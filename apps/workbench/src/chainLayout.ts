import dagre from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"

export type ChainLayoutDirection = "LR" | "TB"

export function layoutChainGraph<T extends Node>(nodes: T[], edges: Edge[], direction: ChainLayoutDirection) {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: direction, ranksep: direction === "LR" ? 76 : 36,
    nodesep: direction === "LR" ? 44 : 56, marginx: 28, marginy: 28 })
  for (const node of nodes) graph.setNode(node.id, {
    width: Number(node.measured?.width ?? node.width ?? 224),
    height: Number(node.measured?.height ?? node.height ?? 112),
  })
  for (const edge of edges) graph.setEdge(edge.source, edge.target)
  dagre.layout(graph)
  return nodes.map((node) => {
    const point = graph.node(node.id) as { x: number; y: number }
    const width = Number(node.measured?.width ?? node.width ?? 224)
    const height = Number(node.measured?.height ?? node.height ?? 112)
    return { ...node, position: { x: point.x - width / 2, y: point.y - height / 2 } }
  })
}
