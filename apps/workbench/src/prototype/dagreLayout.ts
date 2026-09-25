import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

export type LayoutDirection = "LR" | "TB";

export function layoutGraph<T extends Node>(
  nodes: T[],
  edges: Edge[],
  direction: LayoutDirection,
): T[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    ranksep: direction === "LR" ? 74 : 56,
    nodesep: direction === "LR" ? 42 : 54,
    marginx: 28,
    marginy: 28,
  });
  nodes.forEach((node) => {
    const width = Number(node.measured?.width ?? node.width ?? 228);
    const height = Number(node.measured?.height ?? node.height ?? 116);
    graph.setNode(node.id, { width, height });
  });
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return nodes.map((node) => {
    const point = graph.node(node.id) as { x: number; y: number };
    const width = Number(node.measured?.width ?? node.width ?? 228);
    const height = Number(node.measured?.height ?? node.height ?? 116);
    return { ...node, position: { x: point.x - width / 2, y: point.y - height / 2 } };
  });
}
