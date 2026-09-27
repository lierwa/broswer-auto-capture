import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema } from "@browser-capture/contracts"
import { functionDraftSchema, hybridNaturalRequestSchema, readSpecificationSchema, type HybridCompilation } from "./hybrid-schema.js"
import { digestNaturalFactField, type naturalPayloadContext } from "./hybrid-natural-payload.js"
import { materializeSelectionFunction } from "./hybrid-selection.js"
import { assertRepeatDispatch } from "./hybrid-repeat-advance.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
type Observation = Request["trace"]["observations"][number]
type Fact = Observation["facts"][number]
type Context = { request: Request; compilation: HybridCompilation }
  & Pick<ReturnType<typeof naturalPayloadContext>, "assertFact" | "transportRequest">
const selection = z.object({ actionRef: z.string(), readFactRef: z.string(), requirementDigest: z.string(),
  draft: functionDraftSchema }).strict()
const readSchema = z.object({ actionRef: z.string(), stable: z.literal(true),
  output: z.array(z.record(z.string(), jsonValueSchema)), specification: readSpecificationSchema }).passthrough()
const receiptSchema = z.object({ schemaVersion: z.literal("bat.native-action-result/v1"),
  receivedFromToolsAct: z.literal(true), resultRef: z.object({ ref: z.string(), digest: z.string() }).strict(),
  result: z.object({ error: z.null(), extracted_content: z.string() }).passthrough() }).passthrough()

/** WHY：用途取决于可验证的生产入口；现场 Agent 的工具验证不能冒充额外离线模型调用。 */
export function requiresSemanticAnnotationAudit(context: Context) {
  let required = false
  for (const observation of context.request.trace.observations) for (const fact of observation.facts) {
    if (fact.kind === "verified_natural_summary") required = true
    if (fact.kind !== "selection_function") continue
    context.assertFact(fact, observation.id)
    const segment = context.compilation.segments.find((item) => item.id === fact.id)
    if (segment?.kind === "function") materializeSelectionFunction(segment, context)
    // 编译尚有其他缺口时也能独立核验来源，不依赖编译器已经产出 function segment。
    if (!validatedDuringExploration(context, fact, observation)) required = true
  }
  return required
}

function validatedDuringExploration(context: Context, fact: Fact, owner: Observation) {
  const parsed = selection.safeParse(fact.value)
  if (!parsed.success) return false
  const value = parsed.data, trace = context.request.trace
  const clickIndex = trace.actions.findIndex((item) => item.id === value.actionRef), click = trace.actions[clickIndex]
  const reads = trace.observations.flatMap((observation) => observation.facts
    .filter((item) => item.id === value.readFactRef && item.kind === "verified_natural_read")
    .map((item) => ({ item, observation })))
  if (!click || click.name !== "click" || click.status !== "succeeded" || click.preObservationRef !== owner.id
    || fact.id !== `selection-${click.id}` || value.requirementDigest !== context.request.requirement.sourceDigest
    || reads.length !== 1) return false
  const source = reads[0]!, parsedRead = readSchema.safeParse(source.item.value)
  context.assertFact(source.item, source.observation.id)
  if (!parsedRead.success) return false
  const read = parsedRead.data, readIndex = trace.actions.findIndex((item) => item.id === read.actionRef)
  const examples = value.draft.examples, ordinal = examples[0]?.output
  const candidates = read.output.filter((candidate) => candidate.ordinal === ordinal)
  if (readIndex < 0 || readIndex >= clickIndex || candidates.length !== 1
    || trace.actions[readIndex]?.status !== "succeeded"
    || trace.actions[readIndex]?.postObservationRef !== source.observation.id || !read.specification.includeOrdinal
    || !isDeepStrictEqual(examples[0]?.input, { candidates: read.output })
    || !isDeepStrictEqual(value.draft.inputs, { candidates: read.specification.outputSchema })
    || !isDeepStrictEqual(value.draft.outputSchema, { type: "integer", minimum: 1, maximum: read.specification.maxItems })) return false
  const args = { source: value.draft.source,
    examples: examples.slice(1).map((example) => ({ candidates: example.input.candidates, ordinal: example.output })) }
  return trace.actions.slice(readIndex + 1, clickIndex).some((action) => {
    if (action.name !== "bat_validate_selection" || action.effect !== "none" || action.status !== "succeeded"
      || !isDeepStrictEqual(action.args, args)) return false
    const before = trace.observations.find((item) => item.id === action.preObservationRef)
    const after = trace.observations.find((item) => item.id === action.postObservationRef)
    if (!before || !after || !sameDocument(context, [source.observation, before, after, owner])) return false
    return successfulValidationReceipt(context, action, candidates[0]!)
  })
}

function successfulValidationReceipt(context: Context, action: Request["trace"]["actions"][number], selected: unknown) {
  const matches = context.request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "native_action_result" && fact.value && typeof fact.value === "object"
      && !Array.isArray(fact.value) && fact.value.actionRef === action.id).map((fact) => ({ observation, fact })))
  if (matches.length !== 1) return false
  const { observation, fact } = matches[0]!
  context.assertFact(fact, observation.id)
  const parsed = receiptSchema.safeParse(fact.value)
  if (!parsed.success || ![action.preObservationRef, action.postObservationRef].includes(observation.id)) return false
  const receipt = parsed.data
  if (!isDeepStrictEqual(receipt.resultRef, action.resultRef)
    || digestNaturalFactField(context, fact, observation.id, "result") !== receipt.resultRef.digest) return false
  try {
    const dispatch = assertRepeatDispatch(context, action)
    if (dispatch.intentTarget !== null || !isDeepStrictEqual(dispatch.eventCapture,
      { status: "not_applicable", eventExpectation: "none", eventCount: 0, limitations: [] })) return false
    const prefix = "Selection method validated: "
    const suffix = ". Click this candidate using its current Browser-Use index; ordinal is not a click index."
    const content = receipt.result.extracted_content
    return content.startsWith(prefix) && content.endsWith(suffix)
      && isDeepStrictEqual(JSON.parse(content.slice(prefix.length, -suffix.length)), selected)
  } catch { return false }
}

function sameDocument(context: Context, observations: Observation[]) {
  let identity: unknown
  for (const observation of observations) {
    const facts = observation.facts.filter((fact) => fact.kind === "document_identity")
    if (facts.length !== 1 || typeof observation.tabId !== "string" || observation.tabId !== observations[0]!.tabId
      || observation.url !== observations[0]!.url) return false
    const fact = facts[0]!
    context.assertFact(fact, observation.id)
    const parsed = z.object({ targetId: z.literal(observation.tabId),
      documentDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(fact.value)
    if (!parsed.success || identity !== undefined && !isDeepStrictEqual(identity, parsed.data)) return false
    identity = parsed.data
  }
  return true
}
