import { z } from "zod"
import { jsonValueSchema, requiredNodeOutcomes,
  type ChainEdgeV1, type StableChainNode, type ValueBinding, type TaskDataContract } from "@browser-capture/contracts"
import { hybridOutputAssemblySchema, type HybridCompilation } from "./hybrid-schema.js"
import { identityOutput, projectedOutput, type BindingSchema } from "./hybrid-output-identity.js"

const assemblySchema = hybridOutputAssemblySchema.omit({ sourceRef: true, proofRefs: true })
const schema = z.object({ assemble: assemblySchema }).strict()
type OutputPath = { nodes: StableChainNode[]; edges: ChainEdgeV1[]; entry: string;
  binding: ValueBinding; schema: TaskDataContract["schema"] }
export type MaterializedOutput = OutputPath & { alternates: Array<{ terminalId: string } & OutputPath> }

/** WHY：只做 IR 映射；实际 merge/assemble、路径安全和执行由已有数据能力与 compiler 拥有。 */
export function materializeHybridOutput(clauses: Array<{ kind: string; expression: unknown }>, compilation: HybridCompilation,
  rewrite: (binding: ValueBinding) => ValueBinding, sourceSchema?: BindingSchema) {
  const matches = clauses.filter((clause) => clause.kind === "output" && schema.safeParse(clause.expression).success)
  if (!matches.length) return null
  if (matches.length !== 1) throw new Error("hybrid_output_assembly_ambiguous")
  return materializeOutputAssembly(schema.parse(matches[0]!.expression).assemble, rewrite, { sourceSchema })
}

export function materializeOutputAssembly(raw: unknown, rewrite: (binding: ValueBinding) => ValueBinding,
  options: { idPrefix?: string; terminalId?: string; writeVariable?: string; sourceSchema?: BindingSchema | undefined } = {}): MaterializedOutput {
  const assemble = assemblySchema.parse(raw)
  const prefix = options.idPrefix ?? "output"
  const rewritten = assemble.fields.map(field => ({ ...field, binding: rewrite(field.binding) }))
  const identity = identityOutput(rewritten, assemble.schema, options.sourceSchema)
  if (identity && !options.writeVariable) return { nodes: [], edges: [], entry: options.terminalId ?? "completed",
    binding: identity, schema: assemble.schema, alternates: [] }
  const fields = Object.fromEntries(rewritten.map((field, index) => [`value${index}`, field.binding]))
  const paths = Object.fromEntries(assemble.fields.map((field, index) => [`value${index}`, field.path]))
  const contract = (id: string, value: TaskDataContract["schema"]): TaskDataContract => ({ id, version: 1, dialect: "bat-value-schema/v1", schema: value })
  const make = (id: string, input: Record<string, ValueBinding>, config: unknown, outputContract: TaskDataContract): StableChainNode => ({
    id, label: "组合任务输出", kind: "capability", capability: { name: "data.transform", version: 1 },
    input, config: jsonValueSchema.parse(config), effect: "read", timeoutMs: 1000, outputContract, writes: [],
    outcomes: [...requiredNodeOutcomes.capability] })
  if (identity && options.writeVariable) {
    const node = make(`${prefix}-assign`, { value: identity }, { operation: "assign", arguments: { value: "value" } },
      contract("output-assign", assemble.schema))
    node.label = "保存任务返回值"; node.writes = [{ variable: options.writeVariable, path: [] }]
    return { nodes: [node], edges: node.outcomes.map(outcome => ({ from: node.id, outcome,
      to: outcome === "success" ? options.terminalId ?? "completed" : outcome })), entry: node.id,
      binding: { source: "variable", name: options.writeVariable, path: [] }, schema: assemble.schema, alternates: [] }
  }
  const merge = make(`${prefix}-values`, fields, { operation: "merge", arguments: Object.fromEntries(Object.keys(fields).map((key) => [key, key])) },
    contract("output-values", { type: "object", properties: {}, required: [], additionalProperties: true }))
  const projection = projectedOutput(rewritten, options.sourceSchema)
  const assembleNode = make(`${prefix}-assemble`, { source: projection?.source ?? { source: "node", nodeId: merge.id, path: [] },
    paths: { source: "constant", value: projection?.paths ?? paths }, mode: { source: "constant", value: "assemble" } },
    { operation: "transform", arguments: { source: "source", paths: "paths", mode: "mode" } }, contract("output-assemble", assemble.schema))
  merge.label = "读取任务返回字段"
  if (options.writeVariable) assembleNode.writes = [{ variable: options.writeVariable, path: [] }]
  const nodes = projection ? [assembleNode] : [merge, assembleNode]
  const edges: ChainEdgeV1[] = nodes.flatMap((node) => node.outcomes.map((outcome) => ({ from: node.id, outcome,
    to: outcome === "success" ? node.id === merge.id ? assembleNode.id : options.terminalId ?? "completed" : outcome })))
  return { nodes, edges, entry: nodes[0]!.id,
    binding: options.writeVariable ? { source: "variable", name: options.writeVariable, path: [] } as ValueBinding
      : { source: "node", nodeId: assembleNode.id, path: [] } as ValueBinding, schema: assemble.schema, alternates: [] }
}
