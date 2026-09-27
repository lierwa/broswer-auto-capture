import { isDeepStrictEqual } from "node:util"
import { createHash } from "node:crypto"
import { z } from "zod"
import { jsonValueSchema, stableChainNodeV2Schema, type JsonValue } from "@browser-capture/contracts"
import { functionDraftSchema, functionSegmentSchema, hybridNaturalRequestSchema, readSpecificationSchema,
  type HybridCompilation } from "./hybrid-schema.js"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { validateSelectionDraft } from "./selection-validation.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
type Segment = z.infer<typeof functionSegmentSchema>
type Context = { request: Request; compilation: HybridCompilation;
  assertFact: ReturnType<typeof naturalPayloadContext>["assertFact"] }
const evidence = z.object({ actionRef: z.string(), readFactRef: z.string(), requirementDigest: z.string(),
  draft: functionDraftSchema }).strict()
const failureContext = z.object({ actionRefs: z.array(z.string()).max(1) }).strict()

export async function withSelectionValidation(envelope: Parameters<typeof naturalPayloadContext>[0],
  request: Record<string, JsonValue>, signal: AbortSignal) {
  try {
    await validateSelectionFunctions(envelope, request, signal)
    return envelope
  } catch (error) {
    if (signal.aborted) throw error
    // WHY：沙箱拒绝仍应保存这次真实来源与失败原因，不能在artifact写入前丢失整个准备证据。
    const reason = error instanceof Error && /^(selection_function_|function_)[a-z_]+$/.test(error.message)
      ? error.message : "selection_function_validation_failed"
    const context = failureContext.safeParse(error instanceof Error ? error.cause : undefined)
    const { canonicalDigest: _digest, ...body } = envelope.compilation
    const next = { ...body, gaps: [...body.gaps, { id: "g-selection-validation", code: "invalid_source" as const,
      actionRefs: context.success ? context.data.actionRefs : [], clauseRefs: [], reason, resolution: "reject_trace" as const }] }
    const canonicalPayload = JSON.stringify(next)
    return { ...envelope, canonicalPayload, compilation: { ...next,
      canonicalDigest: createHash("sha256").update(canonicalPayload).digest("hex") } }
  }
}

/** WHY：Function 只接收已证明的实时集合；模型不能修改节点身份、边、输入来源或预算。 */
export function materializeSelectionFunction(segment: Segment, context: Context) {
  assertSelectionSource(segment, context)
  return stableChainNodeV2Schema.parse({ id: segment.id, label: segment.label, kind: "function",
    language: "javascript", source: segment.draft.source, inputs: segment.inputBindings, timeoutMs: 1000,
    outputContract: { id: segment.id, version: 1, dialect: "bat-value-schema/v1", schema: segment.draft.outputSchema },
    writes: [] })
}

export async function validateSelectionFunctions(envelope: Parameters<typeof naturalPayloadContext>[0],
  request: Record<string, JsonValue>, signal: AbortSignal) {
  if (envelope.compilation.compilerVersion !== "bat-hybrid/2") return
  const segments = envelope.compilation.segments.filter((segment) => segment.kind === "function")
  if (segments.length === 0) return
  const payload = naturalPayloadContext(envelope, request)
  for (const segment of segments) {
    try {
      assertSelectionSource(segment, { request: payload.ordinary, compilation: envelope.compilation,
        assertFact: payload.assertFact })
      await validateSelectionDraft({ id: segment.id, label: segment.label, draft: segment.draft,
        bindings: segment.inputBindings, timeoutMs: 1000, signal })
    } catch (error) {
      if (signal.aborted) throw error
      // WHY：定位来自当前源码中实际动作与编译器的固定segment身份关系，不猜选择规则或改写来源。
      const actionRefs = payload.ordinary.trace.actions
        .filter((action) => segment.id === `selection-${action.id}`).map((action) => action.id)
      throw new Error(error instanceof Error ? error.message : "selection_function_validation_failed", {
        cause: { actionRefs },
      })
    }
  }
}

function assertSelectionSource(segment: Segment, context: Context) {
  const { request, compilation, assertFact } = context
  const matches = request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "selection_function"
      && fact.id === segment.id).map((fact) => ({ fact, observation })))
  if (matches.length !== 1) throw new Error("selection_function_evidence_required")
  const { fact, observation } = matches[0]!, value = evidence.parse(fact.value)
  assertFact(fact, observation.id)
  const action = request.trace.actions.find((item) => item.id === value.actionRef)
  const source = request.trace.observations.flatMap((owner) => owner.facts
    .filter((item) => item.id === value.readFactRef && item.kind === "verified_natural_read")
    .map((item) => ({ item, owner })))
  if (!action || action.name !== "click" || action.status !== "succeeded"
    || action.preObservationRef !== observation.id || source.length !== 1
    || segment.id !== `selection-${action.id}` || value.requirementDigest !== request.requirement.sourceDigest
    || !isDeepStrictEqual(value.draft, segment.draft) || !isDeepStrictEqual(fact.sourceRefs, segment.proofRefs)) {
    throw new Error("selection_function_source_mismatch")
  }
  const { item: readFact, owner } = source[0]!
  assertFact(readFact, owner.id)
  const read = z.object({ actionRef: z.string(), output: jsonValueSchema,
    specification: readSpecificationSchema, stable: z.literal(true) }).passthrough().parse(readFact.value)
  const structures = observation.facts.filter((item) => item.kind === "dom_structure"
    && typeof item.value === "object" && item.value !== null && !Array.isArray(item.value)
    && item.value.actionRef === action.id)
  const structure = z.object({ queryCandidate: z.object({ readActionRef: z.string() }).passthrough() })
    .passthrough().safeParse(structures[0]?.value)
  if (structures.length !== 1 || !structure.success
    || structure.data.queryCandidate.readActionRef !== read.actionRef) {
    throw new Error("selection_function_source_mismatch")
  }
  assertFact(structures[0]!, observation.id)
  const readIndex = request.trace.actions.findIndex((item) => item.id === read.actionRef)
  const clickIndex = request.trace.actions.findIndex((item) => item.id === action.id)
  const binding = { candidates: { source: "node", nodeId: `s-${read.actionRef}`, path: [] } }
  const consumer = compilation.segments.find((item) => item.id === `s-${action.id}`)
  const target = consumer?.kind === "deterministic" ? consumer.target : null
  if (readIndex < 0 || readIndex >= clickIndex || !read.specification.includeOrdinal
    || request.trace.actions[readIndex]?.postObservationRef !== owner.id
    || !isDeepStrictEqual(segment.inputBindings, binding)
    || !isDeepStrictEqual(segment.draft.inputs, { candidates: read.specification.outputSchema })
    || !isDeepStrictEqual(segment.draft.outputSchema, { type: "integer", minimum: 1, maximum: read.specification.maxItems })
    || target?.strategy !== "structure" || target.items.value !== read.specification.container
    || !isDeepStrictEqual(target.ordinalBinding, { source: "node", nodeId: segment.id, path: [] })
    || !isDeepStrictEqual(segment.draft.examples[0], { input: { candidates: read.output }, output: target.ordinal })) {
    throw new Error("selection_function_binding_mismatch")
  }
}
