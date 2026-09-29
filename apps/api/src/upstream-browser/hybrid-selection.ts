import { isDeepStrictEqual } from "node:util"
import { createHash } from "node:crypto"
import { z } from "zod"
import { jsonValueSchema, stableChainNodeV2Schema, valueBindingSchema, type JsonValue } from "@browser-capture/contracts"
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
  if (!action || (action.name !== "click" && action.name !== "navigate") || action.status !== "succeeded"
    || action.preObservationRef !== observation.id || source.length !== 1
    || segment.id !== `selection-${action.id}` || value.requirementDigest !== request.requirement.sourceDigest
    || !isDeepStrictEqual(value.draft, segment.draft) || !isDeepStrictEqual(fact.sourceRefs, segment.proofRefs)) {
    throw new Error("selection_function_source_mismatch")
  }
  const { item: readFact, owner } = source[0]!
  assertFact(readFact, owner.id)
  const read = z.object({ actionRef: z.string(), output: jsonValueSchema,
    specification: readSpecificationSchema, stable: z.literal(true) }).passthrough().parse(readFact.value)
  if (action.name === "navigate") {
    assertNavigationSelection(segment, context, action, read, owner, observation)
    return
  }
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

function assertNavigationSelection(segment: Segment, context: Context, action: Request["trace"]["actions"][number],
  read: { actionRef: string; output: JsonValue; specification: z.infer<typeof readSpecificationSchema> },
  owner: Request["trace"]["observations"][number], before: Request["trace"]["observations"][number]) {
  const trace = context.request.trace, args = z.object({ url: z.string() }).passthrough().parse(action.args)
  const readIndex = trace.actions.findIndex(item => item.id === read.actionRef)
  const actionIndex = trace.actions.indexOf(action)
  const consumer = context.compilation.segments.find(item => item.id === `s-${action.id}`)
  const rows = z.array(z.record(z.string(), jsonValueSchema)).parse(read.output)
  if (readIndex < 0 || readIndex >= actionIndex || trace.actions[readIndex]?.name !== "find_elements"
    || trace.actions[readIndex]?.status !== "succeeded" || trace.actions[readIndex]?.postObservationRef !== owner.id
    || typeof owner.url !== "string" || typeof owner.tabId !== "string"
    || owner.url !== before.url || owner.tabId !== before.tabId || !read.specification.includeOrdinal
    || !rows.some(row => row.attribute_href === args.url)
    || !isDeepStrictEqual(segment.inputBindings, { candidates: { source: "node", nodeId: `s-${read.actionRef}`, path: [] } })
    || !isDeepStrictEqual(segment.draft.inputs, { candidates: read.specification.outputSchema })
    || !isDeepStrictEqual(segment.draft.outputSchema, { type: "string" })
    || !isDeepStrictEqual(segment.draft.examples[0], { input: { candidates: read.output }, output: args.url })
    || consumer?.kind !== "deterministic" || consumer.operation.name !== "browser.workflow-step"
    || consumer.operation.actionName !== "navigate" || !consumer.bindings.some(binding =>
      "derivation" in binding && binding.derivation === "selection_function" && binding.sourceRef === segment.id)) {
    throw new Error("selection_function_binding_mismatch")
  }
}

/** WHY：新增的是现有 Function 输出到原导航参数的接线，不是另一种执行节点。 */
export function assertSelectionValueBinding(raw: unknown, trace: Request["trace"],
  assertFact: Context["assertFact"]) {
  const decision = z.object({ actionRef: z.string(), argumentPath: z.literal("url"), sourceRef: z.string(),
    binding: valueBindingSchema, proofRefs: z.array(z.object({ ref: z.string(), digest: z.string() }).strict()) })
    .passthrough().parse(raw)
  const action = trace.actions.find(item => item.id === decision.actionRef)
  const before = trace.observations.find(item => item.id === action?.preObservationRef)
  const matches = before?.facts.filter(fact => fact.id === decision.sourceRef && fact.kind === "selection_function") ?? []
  if (!action || action.name !== "navigate" || action.status !== "succeeded" || matches.length !== 1
    || !before || decision.sourceRef !== `selection-${action.id}`
    || !isDeepStrictEqual(decision.binding, { source: "node", nodeId: decision.sourceRef, path: [] })) {
    throw new Error("selection_function_binding_mismatch")
  }
  const fact = matches[0]!, value = evidence.parse(fact.value)
  assertFact(fact, before.id)
  const args = z.object({ url: z.string() }).passthrough().parse(action.args)
  if (value.actionRef !== action.id || !isDeepStrictEqual(value.draft.outputSchema, { type: "string" })
    || value.draft.examples[0]?.output !== args.url || !isDeepStrictEqual(decision.proofRefs, fact.sourceRefs)) {
    throw new Error("selection_function_binding_mismatch")
  }
  return decision.binding
}
