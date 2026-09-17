import assert from "node:assert/strict"

type GraphNode = { id: string; parentRef: string | null; childrenRefs: string[];
  root?: { kind?: unknown; hostRef?: unknown } }
type GraphPart = { kind?: unknown; ref?: unknown }
type EventEvidence = { graph: { targetRef: string | null; target?: GraphPart;
  composedPath: GraphPart[]; nodes: GraphNode[] } }

/** The event snapshot may contain its path plus target children, never unrelated ancestor siblings. */
export function assertLocalEventGraph(event: EventEvidence) {
  const { graph } = event
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  assert.equal(nodes.size, graph.nodes.length, "event graph node ids must be unique")

  const pathRefs = graph.composedPath.filter((part) => part.kind === "element")
    .map((part) => String(part.ref))
  for (const ref of pathRefs) assert.ok(nodes.has(ref), `event path ref missing: ${ref}`)
  if (graph.targetRef !== null) {
    assert.ok(nodes.has(graph.targetRef), "event target ref missing")
    assert.equal(graph.target?.kind, "element")
    assert.equal(graph.target?.ref, graph.targetRef)
    assert.ok(pathRefs.includes(graph.targetRef), "retargeted event target missing from composed path")
  }

  const targetChildren = new Set(graph.targetRef === null ? [] : nodes.get(graph.targetRef)!.childrenRefs)
  const allowed = new Set([...pathRefs, ...targetChildren])
  for (const node of graph.nodes) {
    assert.ok(allowed.has(node.id), `unrelated local graph node: ${node.id}`)
    if (node.root?.kind === "shadow_root" && typeof node.root.hostRef === "string") {
      assert.notEqual(node.parentRef, node.root.hostRef, `shadow host used as DOM parent: ${node.id}`)
    }
    if (node.parentRef !== null && nodes.has(node.parentRef)) {
      assert.ok(nodes.get(node.parentRef)!.childrenRefs.includes(node.id), `parent missing child ref: ${node.id}`)
    }
    for (const childRef of node.childrenRefs) {
      assert.ok(nodes.has(childRef), `child ref missing: ${childRef}`)
      assert.equal(nodes.get(childRef)!.parentRef, node.id, `child parent mismatch: ${childRef}`)
    }
    if (!pathRefs.includes(node.id)) assert.equal(node.parentRef, graph.targetRef)
  }
}
