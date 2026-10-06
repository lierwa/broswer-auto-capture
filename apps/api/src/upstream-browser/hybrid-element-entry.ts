import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { valueBindingSchema } from "@browser-capture/contracts"
import { elementEntrySchema, elementEntryValueSchema } from "./element-entry-contract.js"
import type { hybridNaturalRequestSchema, HybridSegment, HybridCompilation } from "./hybrid-schema.js"
import type { naturalPayloadContext } from "./hybrid-natural-payload.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
export function assertInputEntryTarget(segment: Exclude<HybridSegment, { kind: "function" }>, request: Request,
  payload: ReturnType<typeof naturalPayloadContext>, compilation: HybridCompilation) {
  if (segment.kind !== "deterministic") return
  const owners = compilation.coverage.filter(row => row.disposition === "compiled" && row.ownerSegmentId === segment.id)
    .map(row => request.trace.actions.find(action => action.id === row.actionRef))
  for (const action of owners) {
    if (action?.name !== "click") continue
    const pre = request.trace.observations.find(item => item.id === action.preObservationRef)
    const post = request.trace.observations.find(item => item.id === action.postObservationRef)
    const facts = pre?.facts.filter(fact => ["input_entry_mismatch", "input_entry_context"].includes(fact.kind)) ?? []
    for (const fact of facts) payload.assertFact(fact, pre!.id)
    if (facts.some(fact => fact.kind === "input_entry_mismatch") || facts.length
      && pre && post && (pre.url !== post.url || pre.tabId !== post.tabId)) {
      throw new Error("hybrid_entry_input_unproven")
    }
  }
  if (segment.target?.strategy !== "entry") return
  if (!segment.target.entryBinding || segment.target.entry) throw new Error("hybrid_entry_binding_required")
  if (owners.length !== 1 || owners[0]?.name !== "click" || owners[0].status !== "succeeded") {
    throw new Error("hybrid_entry_action_invalid")
  }
  const action = owners[0], pre = request.trace.observations.find(item => item.id === action.preObservationRef)
  const facts = pre?.facts.filter(fact => fact.kind === "input_entry_target") ?? []
  if (facts.length !== 1 || !pre) throw new Error("hybrid_entry_source_missing")
  const fact = facts[0]!
  payload.assertFact(fact, pre.id)
  const value = z.object({ actionRef: z.string(), binding: valueBindingSchema, entry: elementEntrySchema,
    backendNodeId: z.number().int().positive(), targetId: z.string(),
    withinEntry: z.string().min(1).max(2000).regex(/^:scope > /u).refine(value => !value.includes(",")).optional()
  }).strict().parse(fact.value)
  let schema = request.runtimeInputSchema
  const binding = segment.target.entryBinding
  for (const part of binding.path) {
    if (schema.type !== "object" || typeof part !== "string" || !schema.required.includes(part)) {
      throw new Error("hybrid_entry_input_invalid")
    }
    schema = schema.properties[part]!
  }
  if (value.actionRef !== action.id || !isDeepStrictEqual(value.binding, binding)
    || !isDeepStrictEqual(schema, elementEntryValueSchema) || value.targetId !== pre.tabId
    || value.withinEntry !== segment.target.withinEntry
    || value.withinEntry === undefined && value.backendNodeId !== value.entry.backendNodeId
    || value.entry.tabId !== pre.tabId?.slice(-4) || value.entry.url !== pre.url) {
    throw new Error("hybrid_entry_source_mismatch")
  }
}
