import { z } from "zod"
import { jsonValueSchema, requiredNodeOutcomes, valueBindingSchema, valuePathSchema, valueSchemaSchema,
  type StableChainNode, type ValueBinding, type TaskDataContract } from "@browser-capture/contracts"
import { hybridOutputAssemblySchema, type HybridCompilation } from "./hybrid-schema.js"

const assemblySchema = hybridOutputAssemblySchema.omit({ sourceRef: true, proofRefs: true })
const schema = z.object({ assemble: assemblySchema }).strict()

/** WHY：只做 IR 映射；实际 merge/assemble、路径安全和执行由已有数据能力与 compiler 拥有。 */
export function materializeHybridOutput(clauses: Array<{ kind: string; expression: unknown }>, compilation: HybridCompilation,
  rewrite: (binding: ValueBinding) => ValueBinding) {
  const matches = clauses.filter((clause) => clause.kind === "output" && schema.safeParse(clause.expression).success)
  if (!matches.length) return null
  if (matches.length !== 1) throw new Error("hybrid_output_assembly_ambiguous")
  return materializeOutputAssembly(schema.parse(matches[0]!.expression).assemble, rewrite)
}

export function materializeOutputAssembly(raw: unknown, rewrite: (binding: ValueBinding) => ValueBinding) {
  const assemble = assemblySchema.parse(raw)
  const fields = Object.fromEntries(assemble.fields.map((field, index) => [`value${index}`, rewrite(field.binding)]))
  const paths = Object.fromEntries(assemble.fields.map((field, index) => [`value${index}`, field.path]))
  const contract = (id: string, value: TaskDataContract["schema"]): TaskDataContract => ({ id, version: 1, dialect: "bat-value-schema/v1", schema: value })
  const make = (id: string, input: Record<string, ValueBinding>, config: unknown, outputContract: TaskDataContract): StableChainNode => ({
    id, label: "组合任务输出", kind: "capability", capability: { name: "data.transform", version: 1 },
    input, config: jsonValueSchema.parse(config), effect: "read", timeoutMs: 1000, outputContract, writes: [],
    outcomes: [...requiredNodeOutcomes.capability] })
  const merge = make("output-values", fields, { operation: "merge", arguments: Object.fromEntries(Object.keys(fields).map((key) => [key, key])) },
    contract("output-values", { type: "object", properties: {}, required: [], additionalProperties: true }))
  const assembleNode = make("output-assemble", { source: { source: "node", nodeId: merge.id, path: [] },
    paths: { source: "constant", value: paths }, mode: { source: "constant", value: "assemble" } },
    { operation: "transform", arguments: { source: "source", paths: "paths", mode: "mode" } }, contract("output-assemble", assemble.schema))
  const edges = [merge, assembleNode].flatMap((node) => node.outcomes.map((outcome) => ({ from: node.id, outcome,
    to: outcome === "success" ? node.id === merge.id ? assembleNode.id : "completed" : outcome })))
  return { nodes: [merge, assembleNode], edges, entry: merge.id,
    binding: { source: "node", nodeId: assembleNode.id, path: [] } as ValueBinding, schema: assemble.schema }
}
