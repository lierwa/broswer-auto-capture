import { isDeepStrictEqual } from "node:util"
import { isStableTaskChainV2, nodeBindings, predicateBindings, requiredNodePorts,
  type ChainNode, type TaskChain } from "@browser-capture/contracts"
import { compileTaskChain } from "./compiler.js"

const generatedStatuses: Record<string, string> = {
  missing: "failed", timeout: "failed", failed: "failed", blocked: "blocked",
  human_required: "blocked", cancelled: "cancelled",
}

/** 只识别受管编译器原样生成的无业务内容终态；自定义原因、证据与结果必须保留。 */
export function isGeneratedFailureTerminal(node: ChainNode | undefined, port: string): boolean {
  return !!node && node.kind === "terminal" && node.id === port && node.label === port
    && node.reason === port && node.status === generatedStatuses[port] && !("result" in node && node.result)
    && node.writes.length === 0 && isDeepStrictEqual(node.outputContract,
      { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } })
    && isDeepStrictEqual(node.evidence, [{ source: "input", path: [] }])
}

/** WHY：只在新候选/修订中删除已知编译冗余；历史发布版本及运行事实不可原地改写。 */
export function compactGeneratedFailureRoutes(raw: TaskChain): TaskChain {
  const chain = compileTaskChain(raw).chain
  if (!isStableTaskChainV2(chain) || !/^workflow-use hybrid [a-f0-9]{64}$/.test(chain.implementationSummary)) return chain
  const nodes = new Map(chain.nodes.map((node) => [node.id, node]))
  const referenced = new Set([...chain.nodes.flatMap(nodeBindings),
    ...chain.completion.flatMap((item) => predicateBindings(item.predicate))]
    .flatMap((binding) => binding.source === "node" ? [binding.nodeId] : []))
  const removedTargets = new Set<string>()
  const edges = chain.edges.filter((edge) => {
    const source = nodes.get(edge.from)!
    if (edge.to === chain.entry || referenced.has(edge.to) || requiredNodePorts(source).includes(edge.port)
      || !isGeneratedFailureTerminal(nodes.get(edge.to), edge.port)) return true
    removedTargets.add(edge.to)
    return false
  })
  if (edges.length === chain.edges.length) return chain
  const retainedTargets = new Set(edges.map((edge) => edge.to))
  const compact = { ...chain, edges,
    nodes: chain.nodes.filter((node) => !removedTargets.has(node.id) || retainedTargets.has(node.id)),
    validation: { status: "candidate" as const, evidence: [] } }
  return compileTaskChain(compact).chain
}
