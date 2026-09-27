import { type StableChainNode, type StableChainNodeV2, type TaskDataContract, type ValueSchema,
  requiredNodeOutcomes } from "@browser-capture/contracts"
import { z } from "zod"
import { hybridRepeatMethodSchema } from "./hybrid-schema.js"
import type { RepeatAdvanceMode } from "./hybrid-repeat-advance.js"

type Method = z.infer<typeof hybridRepeatMethodSchema>
const contract = (id: string, schema: ValueSchema): TaskDataContract =>
  ({ id, version: 1, dialect: "bat-value-schema/v1", schema })
function fail(reason: string): never { throw new Error(`hybrid_repeat_${reason}`) }

export function bindContinuationVariable(method: Method, mode: RepeatAdvanceMode, input: { nodes: Array<StableChainNode | StableChainNodeV2>;
  variables: Record<string, TaskDataContract>; edges: Array<{ from: string; outcome: string; to: string }> }) {
  const query = input.nodes.find((node) => node.id === method.continuationSegmentId)
  const advance = input.nodes.find((node) => node.id === method.advanceSegmentId)
  if (query?.kind !== "capability" || advance?.kind !== "capability") fail("body_capability_missing")
  const variable = `next-${method.id}`, schema = query.outputContract.schema
  if (schema.type !== "array") fail("continuation_array_required")
  const source = advance.input.url
  let key = "ordinal", arraySchema: ValueSchema = { ...schema, minItems: 0, maxItems: 1 }
  if (mode === "navigation") {
    if (source?.source !== "node" || source.nodeId !== query.id) fail("continuation_binding_mismatch")
    const href = source.path[1]
    const hrefSchema = typeof href === "string" && schema.items.type === "object" ? schema.items.properties[href] : undefined
    if (typeof href !== "string" || schema.items.type !== "object" || hrefSchema?.type !== "string") fail("continuation_href_schema_invalid")
    key = href
    arraySchema = { ...arraySchema, items: { ...schema.items, properties: { ...schema.items.properties,
      [href]: { ...hrefSchema, minLength: Math.max(1, hrefSchema.minLength ?? 0) } } } }
    advance.input.url = { source: "variable", name: variable, path: source.path }
  }
  input.variables[variable] = contract(variable, arraySchema)
  const deduplicateId = `unique-next-${method.id}`
  const deduplicate: StableChainNode = { id: deduplicateId, label: "核验唯一继续条件", kind: "capability",
    capability: { name: "data.transform", version: 1 }, input: {
      source: { source: "node", nodeId: query.id, path: [] }, path: { source: "constant", value: [key] } },
    config: { operation: "deduplicate", arguments: { source: "source", path: "path" } },
    effect: "read", timeoutMs: 1000, outputContract: contract(variable, arraySchema),
    writes: [{ variable, path: [] }], outcomes: [...requiredNodeOutcomes.capability] }
  // WHY：链接按地址合并；同页控制按ordinal保留，超过一项由输出合同拒绝，不能任意取首项。
  for (const edge of input.edges) if (edge.from === query.id && edge.outcome === "success") edge.to = deduplicateId
  input.edges.push(...deduplicate.outcomes.map((outcome) => ({ from: deduplicateId, outcome,
    to: outcome === "success" ? `loop-${method.id}` : outcome })))
  input.nodes.push(deduplicate)
  // WHY：显式初始化保护所有静态路径；cursor 分支只在查询已成功后读取下一页地址。
  const initializer: StableChainNode = { id: `init-next-${method.id}`, label: "初始化下一页观察", kind: "capability",
    capability: { name: "data.transform", version: 1 }, input: { value: { source: "constant" as const, value: [] } },
    config: { operation: "assign", arguments: { value: "value" } }, effect: "read" as const, timeoutMs: 1000,
    outputContract: contract(variable, arraySchema), writes: [{ variable, path: [] }], outcomes: [...requiredNodeOutcomes.capability] }
  return { initializer, deduplicateId }
}
