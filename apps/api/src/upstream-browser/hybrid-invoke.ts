import { z } from "zod"
import { budgetSchema, jsonValueSchema, valueSchemaSchema, versionReferenceSchema, type TaskChain, type VersionReference } from "@browser-capture/contracts"
import { compileTaskChain, executableChainDigest } from "@browser-capture/runtime"
import { isDeepStrictEqual } from "node:util"

export const hybridVerifiedChildSchema = z.object({ chain: versionReferenceSchema, inputSchema: valueSchemaSchema,
  outputSchema: valueSchemaSchema, budget: budgetSchema, operations: z.array(z.record(z.string(), jsonValueSchema)).min(1).max(500) }).strict()
export type ResolveHybridChild = (reference: VersionReference) => TaskChain

/** WHY：只投影现有已验证版本；子链运行、模型和 Browser 所有权仍由现有 invoke 实现承担。 */
export function projectVerifiedChild(chain: TaskChain) {
  const fingerprint = executableChainDigest(chain)
  const evidence = chain.validation.evidence.filter((item) => item.passed && item.chainDigest === fingerprint && item.modelCalls !== null)
  if (chain.validation.status !== "verified" || !evidence.some((sample) => sample.phase === "sample" && evidence.some((other) =>
    other.phase === "verification" && other.inputDigest !== sample.inputDigest && other.runId !== sample.runId))) throw new Error("hybrid_invoked_chain_not_verified")
  compileTaskChain(chain)
  if (Object.keys(chain.variables).length) throw new Error("hybrid_child_control_mapping_unavailable")
  const operations = [], visited = new Set<string>(), nodes = new Map(chain.nodes.map((node) => [node.id, node]))
  let id = chain.entry
  while (!visited.has(id)) {
    visited.add(id)
    const node = nodes.get(id)
    if (node?.kind === "terminal" && node.status === "completed") break
    if (node?.kind !== "capability" || node.writes.length || !["browser.workflow-step", "browser.read-fields"].includes(node.capability.name)
      || node.capability.version !== 2) throw new Error("hybrid_child_control_mapping_unavailable")
    const config = z.record(z.string(), jsonValueSchema).parse(node.config)
    const read = node.capability.name === "browser.read-fields"
    const operation = read ? { ...node.capability, specification: config.specification }
      : { ...node.capability, actionName: config.actionName }
    const target = read ? { strategy: "css", value: (config.specification as { container: string }).container } : config.target
    const postconditions = read ? [{ kind: "output_schema", schemaDigest: null }]
      : z.array(z.record(z.string(), jsonValueSchema)).parse(config.postconditions).map(({ clauseRef: _ref, ...condition }) => condition)
    operations.push({ id: node.id, operation, target, arguments: node.input, postconditions, effect: node.effect,
      outputSchema: node.outputContract.schema })
    const exits = chain.edges.filter((edge) => edge.from === id)
    if (exits.some((edge) => edge.outcome !== "success" && nodes.get(edge.to)?.kind !== "terminal")) throw new Error("hybrid_child_control_mapping_unavailable")
    id = exits.find((edge) => edge.outcome === "success")!.to
  }
  if (!operations.length || operations.length !== chain.nodes.filter((node) => node.kind !== "terminal").length) {
    throw new Error("hybrid_child_control_mapping_unavailable")
  }
  const terminal = nodes.get(id), last = operations.at(-1)!
  const expected = last.outputSchema.type === "null" ? { source: "constant", value: null }
    : { source: "node", nodeId: last.id, path: [] }
  if (terminal?.kind !== "terminal" || !("result" in terminal) || terminal.result?.output.kind !== "value"
    || !isDeepStrictEqual(terminal.result.output.value, expected) || !isDeepStrictEqual(last.outputSchema, chain.outputContract.schema)) {
    throw new Error("hybrid_child_output_mapping_unavailable")
  }
  return hybridVerifiedChildSchema.parse({ chain: { id: chain.id, version: chain.version, digest: fingerprint },
    inputSchema: chain.inputContract.schema, outputSchema: chain.outputContract.schema, budget: chain.budget, operations })
}

export function assertHybridChild(reference: VersionReference, budget: unknown, outputSchema: unknown, resolve?: ResolveHybridChild) {
  if (!resolve) throw new Error("hybrid_verified_child_resolver_required")
  const child = projectVerifiedChild(resolve(reference))
  if (child.chain.digest !== reference.digest || !isDeepStrictEqual(child.budget, budget)
    || !isDeepStrictEqual(child.outputSchema, outputSchema)) throw new Error("hybrid_verified_child_mismatch")
  return child
}
