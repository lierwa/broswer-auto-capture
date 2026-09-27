import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, parseTaskValue, requiredNodeOutcomes, valueBindingSchema, valuePathSchema, type StableChainNode, type StableChainNodeV2,
  type TaskDataContract, type TaskPlan, type TaskPlanStep, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { hybridNaturalRequestSchema, hybridRepeatMethodSchema, readSpecificationSchema,
  type HybridCompilation } from "./hybrid-schema.js"
import type { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { jsonValueAtPath } from "./hybrid-json-path.js"
import { digestRuntimeUrl, RUNTIME_SCOPE_FROM, RUNTIME_SCOPE_SAME_DOCUMENT } from "./hybrid-runtime-scope.js"
import { bindContinuationVariable } from "./hybrid-repeat-continuation.js"
import { repeatAdvanceMode, assertRepeatDispatch, assertPassiveRepeatWait, assertInPageSamples, assertInPageSegment, type RepeatAdvanceMode } from "./hybrid-repeat-advance.js"
import { assertNaturalBinding } from "./hybrid-natural-materialization.js"

type Compilation = Extract<HybridCompilation, { compilerVersion: "bat-hybrid/2" }>
type Request = z.infer<typeof hybridNaturalRequestSchema>
type Method = z.infer<typeof hybridRepeatMethodSchema>
type Loop = Extract<StableChainNode, { kind: "loop" }>
type Input = { compilation: Compilation; request: Request;
  assertFact: ReturnType<typeof naturalPayloadContext>["assertFact"]; outputSchema: ValueSchema }
export const repeatEvidenceSchema = z.object({ requirementDigest: z.string(), outputPath: valuePathSchema,
  stableKeyPath: valuePathSchema, iterations: z.array(z.object({ readActionRef: z.string(),
    continuationActionRef: z.string(), advanceActionRef: z.string().nullable() }).strict()).min(2).max(8) }).strict()
const readEvidenceSchema = z.object({ actionRef: z.string(), specification: readSpecificationSchema,
  outputPath: valuePathSchema, readPath: valuePathSchema, output: jsonValueSchema,
  stable: z.literal(true), targetId: z.string(), urlDigest: z.string(), resultDigest: z.string(),
  coverage: z.object({ scope: z.literal("current_dom_matches"), total: z.number().int().nonnegative(),
    runtimeTruncated: z.literal(false) }).passthrough().nullable().optional() }).passthrough()
const contract = (id: string, schema: ValueSchema): TaskDataContract =>
  ({ id, version: 1, dialect: "bat-value-schema/v1", schema })
const unit = contract("unit", { type: "null" })

export type ValidatedNaturalRepeat = { method: Method; readActionRef: string; variable: string;
  schema: Extract<ValueSchema, { type: "array" }>; mode: RepeatAdvanceMode }

/** WHY：模型只引用已经发生的读取和翻页；宿主重新证明证据、动态绑定和唯一控制图。 */
export function validateNaturalRepeats(input: Input): ValidatedNaturalRepeat[] {
  const methods = input.compilation.repeatMethods ?? []
  const facts = input.request.trace.observations.flatMap((observation) => observation.facts).filter((fact) => fact.kind === "repeat_method")
  if (facts.length !== methods.length) fail("source_count_mismatch")
  return methods.map((method) => {
    const matches = input.request.trace.observations.flatMap((observation) => observation.facts
      .filter((fact) => fact.id === method.sourceRef && fact.kind === "repeat_method")
      .map((fact) => ({ observation, fact })))
    if (matches.length !== 1) fail("source_missing")
    const { observation, fact } = matches[0]!
    input.assertFact(fact, observation.id)
    const value = repeatEvidenceSchema.parse(fact.value)
    if (value.requirementDigest !== input.request.requirement.sourceDigest
      || !isDeepStrictEqual(value.outputPath, method.outputPath)
      || !isDeepStrictEqual(value.stableKeyPath, method.stableKeyPath)
      || !isDeepStrictEqual(fact.sourceRefs, method.proofRefs)) fail("source_mismatch")
    const first = value.iterations[0]!, last = value.iterations.at(-1)!
    if (method.id !== `repeat-${first.readActionRef}` || !first.advanceActionRef || last.advanceActionRef !== null
      || value.iterations.slice(0, -1).some((item) => item.advanceActionRef === null)) fail("iterations_invalid")
    const source = readEvidence(input, first.readActionRef), query = readEvidence(input, first.continuationActionRef)
    const mode = repeatAdvanceMode(input.request.trace, first.advanceActionRef)
    assertSegments(input.compilation, method, first, source, query, mode)
    assertSamples(input, method, value.iterations, source, query, mode)
    if (mode === "same_page") assertInPageSamples({ ...input, method, iterations: value.iterations,
      read: (ref) => readEvidence(input, ref), sameDocument: (left, right) => assertSameDocument(input, left, right) })
    assertGraph(input.compilation, method)
    const schema = schemaAt(input.outputSchema, method.outputPath)
    const readSchema = schemaAt(source.specification.outputSchema, method.readPath)
    if (schema?.type !== "array" || readSchema?.type !== "array"
      || !isDeepStrictEqual(schema.items, readSchema.items)) fail("output_schema_mismatch")
    const key = schemaAt(schema.items, method.stableKeyPath)
    if (!key || !["string", "integer", "number", "boolean"].includes(key.type)) fail("stable_key_required")
    const selected = input.compilation.outputAssembly?.fields.filter((field) =>
      isDeepStrictEqual(field.path, method.outputPath) && field.binding.source === "node"
      && field.binding.nodeId === first.readActionRef && isDeepStrictEqual(field.binding.path, method.readPath))
    if (selected?.length !== 1 || input.compilation.resultBranches?.length) fail("result_binding_mismatch")
    return { method, readActionRef: first.readActionRef, variable: `items-${method.id}`, schema, mode }
  })
}

function readEvidence(input: Input, actionRef: string) {
  const action = input.request.trace.actions.find((item) => item.id === actionRef)
  if (!action || action.status !== "succeeded") fail("action_invalid")
  const matches = input.request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "verified_natural_read" && fact.value && typeof fact.value === "object"
      && !Array.isArray(fact.value) && fact.value.actionRef === actionRef).map((fact) => ({ observation, fact })))
  if (matches.length !== 1 || ![action.preObservationRef, action.postObservationRef].includes(matches[0]!.observation.id)) {
    fail("read_evidence_missing")
  }
  const { observation, fact } = matches[0]!
  input.assertFact(fact, observation.id)
  const value = readEvidenceSchema.parse(fact.value)
  // WHY：成熟读取器的 includeOrdinal 同样禁止超过 maxItems 的截断；保留原来源 ReadSpec 摘要。
  if (!value.specification.requireComplete && !value.specification.includeOrdinal) fail("read_incomplete")
  const before = input.request.trace.observations.find((item) => item.id === action.preObservationRef)
  const after = input.request.trace.observations.find((item) => item.id === action.postObservationRef)
  const result = z.object({ digest: z.string() }).passthrough().safeParse(action.resultRef)
  if (!before || !after || before.url !== after.url || before.tabId !== after.tabId
    || before.tabId !== value.targetId || typeof before.url !== "string"
    || digestRuntimeUrl(before.url) !== value.urlDigest || !result.success || result.data.digest !== value.resultDigest) {
    fail("read_identity_mismatch")
  }
  parseTaskValue(contract("repeat-read-evidence", value.specification.outputSchema), value.output)
  return value
}

function assertSegments(compilation: Compilation, method: Method,
  first: z.infer<typeof repeatEvidenceSchema>["iterations"][number],
  read: z.infer<typeof readEvidenceSchema>, query: z.infer<typeof readEvidenceSchema>, mode: RepeatAdvanceMode) {
  const ids = [method.readSegmentId, method.continuationSegmentId, method.advanceSegmentId]
  const actions = [first.readActionRef, first.continuationActionRef, first.advanceActionRef]
  const segments = ids.map((id) => compilation.segments.find((segment) => segment.id === id))
  if (!isDeepStrictEqual(compilation.segments.slice(-3).map((segment) => segment.id), ids)) fail("tail_required")
  for (let index = 0; index < ids.length; index++) {
    const row = compilation.coverage.find((item) => item.actionRef === actions[index])
    if (row?.disposition !== "compiled" || row.ownerSegmentId !== ids[index]) fail("coverage_mismatch")
  }
  const [source, continuation, advance] = segments
  if (source?.kind !== "deterministic" || source.operation.name !== "browser.read-fields"
    || continuation?.kind !== "deterministic" || continuation.operation.name !== "browser.read-fields"
    || advance?.kind !== "deterministic" || advance.operation.name !== "browser.workflow-step"
    || !isDeepStrictEqual(source.operation.specification, normalizedSpec(read.specification))
    || !isDeepStrictEqual(continuation.operation.specification, normalizedSpec(query.specification))
    || !isDeepStrictEqual(read.readPath, method.readPath) || !isDeepStrictEqual(read.outputPath, method.outputPath)) {
    fail("segments_mismatch")
  }
  if (mode === "same_page") return assertInPageSegment(advance, method, read, query)
  if (advance.operation.actionName !== "navigate" || advance.target !== null) fail("segments_mismatch")
  const url = advance.bindings.filter((binding) => binding.argumentPath === "url")
  const href = Object.entries(query.specification.fields).filter(([, field]) => field.attribute === "href")
  // WHY：同 tab 的原生参数仍由普通绑定证据门验正，不能因显式 false 而拒绝合法推进。
  const sameTab = advance.bindings.filter((binding) => binding.argumentPath === "new_tab"
    && binding.kind === "authorized_constant" && "binding" in binding
    && binding.binding?.source === "constant" && binding.binding.value === false)
  if (href.length !== 1 || query.specification.outputSchema.type !== "array" || query.readPath.length
    || sameTab.length > 1 || advance.bindings.length !== 1 + sameTab.length || url.length !== 1 || !("binding" in url[0]!)
    || url[0]!.binding?.source !== "node" || url[0]!.binding.nodeId !== first.continuationActionRef
    || !isDeepStrictEqual(url[0]!.binding.path, [0, href[0]![0]])) fail("advance_binding_invalid")
}

function assertSamples(input: Input, method: Method, iterations: z.infer<typeof repeatEvidenceSchema>["iterations"],
  source: z.infer<typeof readEvidenceSchema>, query: z.infer<typeof readEvidenceSchema>, mode: RepeatAdvanceMode) {
  const refs: string[] = [], actions = input.request.trace.actions
  let previous = -1
  for (let index = 0; index < iterations.length; index++) {
    const iteration = iterations[index]!, read = readEvidence(input, iteration.readActionRef)
    const condition = readEvidence(input, iteration.continuationActionRef)
    if (actions.find((action) => action.id === iteration.readActionRef)?.name !== "bat_read_fields") fail("read_kind_invalid")
    const indexes = [iteration.readActionRef, iteration.continuationActionRef, iteration.advanceActionRef]
      .filter((ref): ref is string => ref !== null).map((ref) => actions.findIndex((action) => action.id === ref))
    if (indexes.some((position, offset) => position < 0 || (offset > 0 && position <= indexes[offset - 1]!))
      || indexes[0]! <= previous || read.targetId !== condition.targetId || read.urlDigest !== condition.urlDigest
      || !isDeepStrictEqual(read.specification, source.specification)
      || !isDeepStrictEqual(read.readPath, source.readPath) || !isDeepStrictEqual(read.outputPath, source.outputPath)
      || !sameQueryMethod(input, query, condition)
      || !isDeepStrictEqual(condition.readPath, query.readPath)) fail("sample_method_mismatch")
    if (Array.isArray(condition.output) && condition.output.length > query.specification.maxItems) fail("first_query_budget_insufficient")
    assertContinuation(input, iteration, condition, mode)
    assertSampleKeys(read, method.stableKeyPath)
    const iterationRefs = [iteration.readActionRef, iteration.continuationActionRef, iteration.advanceActionRef]
      .filter((ref): ref is string => ref !== null)
    refs.push(...iterationRefs)
    if (index > 0) iterationRefs.forEach((ref, offset) => assertSupporting(input.compilation, ref,
      [method.readSegmentId, method.continuationSegmentId, method.advanceSegmentId][offset]!))
    previous = indexes.at(-1)!
  }
  while (actions[previous + 1]?.name === "wait") previous++
  const samples = actions.slice(actions.findIndex((action) => action.id === refs[0]), previous + 1)
  const extras = samples.filter((action) => !refs.includes(action.id)), lookups = new Set<string>()
  const probes = extras.filter((action) => !["find_elements", "bat_validate_selection", "wait"].includes(String(action.name)))
  if (probes.length > 1) fail("sample_gap")
  for (const action of extras) {
    if (action.name === "bat_validate_selection") {
      const receipt = assertRepeatDispatch(input, action)
      if (receipt.intentTarget !== null || !isDeepStrictEqual(receipt.eventCapture,
        { status: "not_applicable", eventExpectation: "none", eventCount: 0, limitations: [] })) fail("selection_validation_effect_invalid")
      const row = input.compilation.coverage.find((item) => item.actionRef === action.id)
      if (action.effect !== "none" || !["succeeded", "failed"].includes(String(action.status)) || !action.resultRef
        || row?.disposition !== "agent_internal" || row.ownerSegmentId !== null
        || row.exclusionRule !== "preparation_selection_validation/v1"
        || !isDeepStrictEqual(row.evidenceRefs, [action.resultRef])) fail("selection_validation_invalid")
      const before = input.request.trace.observations.find((item) => item.id === action.preObservationRef)!
      const after = input.request.trace.observations.find((item) => item.id === action.postObservationRef)!
      assertSameDocument(input, before, after); lookups.add(action.id)
      continue
    }
    if (action.name === "wait") {
      assertPassiveRepeatWait({ ...input, sameDocument: (left, right) => assertSameDocument(input, left, right) }, action)
      lookups.add(action.id)
    } else if (action.name === "find_elements") { assertCompleteQuery(input, action, true); lookups.add(action.id) }
    else {
      const terminal = actions.find((item) => item.id === iterations.at(-1)!.readActionRef)!
      if (actions.indexOf(action) <= actions.findIndex((item) => item.id === iterations.at(-2)!.advanceActionRef)
        || actions.indexOf(action) >= actions.indexOf(terminal)) fail("sample_gap")
      assertProbe(input, action, terminal)
    }
    assertSupporting(input.compilation, action.id, method.continuationSegmentId)
    const row = input.compilation.coverage.find((item) => item.actionRef === action.id)!
    if (!action.resultRef || !isDeepStrictEqual(row.evidenceRefs, [action.resultRef, ...method.proofRefs])) fail("sample_proof_mismatch")
  }
  if (!isDeepStrictEqual(samples.map((action) => action.id), method.sampleActionRefs) || new Set(refs).size !== refs.length
    || actions.slice(previous + 1).some((action) => action.name !== "done")) fail("sample_refs_mismatch")
  for (let index = 1; index < samples.length; index++) {
    const left = samples[index - 1]!, right = samples[index]!
    const after = input.request.trace.observations.find((observation) => observation.id === left.postObservationRef)
    const before = input.request.trace.observations.find((observation) => observation.id === right.preObservationRef)
    if (!after || !before || after.url !== before.url || after.tabId !== before.tabId) fail("sample_discontinuous")
    if (lookups.has(left.id) || lookups.has(right.id)) assertSameDocument(input, after, before)
  }
}

function assertCompleteQuery(input: Input, action: Request["trace"]["actions"][number], sameDocument = false) {
  const read = readEvidence(input, action.id)
  const before = input.request.trace.observations.find((item) => item.id === action.preObservationRef)!
  const after = input.request.trace.observations.find((item) => item.id === action.postObservationRef)!
  const facts = after.facts.filter((fact) => fact.kind === "dom_query" && fact.value && typeof fact.value === "object"
    && !Array.isArray(fact.value) && fact.value.actionRef === action.id)
  const verified = after.facts.some((fact) => fact.kind === "verified_natural_read" && fact.value
    && typeof fact.value === "object" && !Array.isArray(fact.value) && fact.value.actionRef === action.id)
  if (action.effect !== "read" || !verified || facts.length !== 1 || read.outputPath.length || read.readPath.length) fail("lookup_invalid")
  input.assertFact(facts[0]!, after.id)
  const dom = z.object({ schemaVersion: z.literal("bat.dom-query/v1"), complete: z.literal(true),
    includeText: z.literal(true), truncated: z.literal(false), total: z.number().int().nonnegative(),
    showing: z.number().int().nonnegative(), limitations: z.array(z.string()), requestedAttributes: z.array(z.string()),
    query: z.object({ kind: z.literal("css"), value: z.string() }), maxResults: z.number().int().min(1).max(300),
    scope: z.object({ url: z.string(), urlDigest: z.string(), tabId: z.string(), frameId: z.null() }).passthrough()
  }).passthrough().parse(facts[0]!.value)
  const args = z.object({ selector: z.string(), include_text: z.boolean().default(true),
    attributes: z.array(z.string()).nullable().optional(), max_results: z.number().int().min(1).max(300).default(50)
  }).strict().parse(action.args)
  if (!args.include_text || dom.query.value !== args.selector || dom.maxResults !== args.max_results
    || dom.total !== dom.showing || dom.total > dom.maxResults || dom.limitations.includes("query_selector_redacted")
    || !Array.isArray(read.output) || read.output.length !== dom.total || dom.scope.url !== before.url
    || dom.scope.tabId !== read.targetId || dom.scope.urlDigest !== read.urlDigest
    || !isDeepStrictEqual(dom.requestedAttributes, [...new Set(args.attributes ?? [])].sort())) fail("lookup_query_mismatch")
  const fields: Record<string, unknown> = { text: { selector: ":scope", attribute: null,
    valueType: "string", textSource: "textContent", normalizeWhitespace: true } }
  const properties: Record<string, unknown> = { text: { type: "string" },
    ordinal: { type: "integer", minimum: 1, maximum: dom.maxResults } }
  for (const attribute of dom.requestedAttributes) {
    fields[`attribute_${attribute}`] = { selector: ":scope", attribute, valueType: "string", optionalAttribute: true,
      ...(["href", "src"].includes(attribute) ? { resolveUrl: true } : {}) }
    properties[`attribute_${attribute}`] = { type: "string" }
  }
  const expected = readSpecificationSchema.parse({ container: args.selector, fields, maxItems: dom.maxResults,
    includeOrdinal: true, outputSchema: { type: "array", minItems: 0, maxItems: dom.maxResults,
      items: { type: "object", properties, required: ["text", "ordinal"], additionalProperties: false } } })
  if (!isDeepStrictEqual(read.specification, expected)) fail("lookup_read_mismatch")
  if (sameDocument) assertSameDocument(input, before, after)
}

function sameQueryMethod(input: Input, first: z.infer<typeof readEvidenceSchema>, current: typeof first) {
  if (isDeepStrictEqual(first.specification, current.specification)) return true
  // WHY：预算差异只在两份原始 args/spec 各自完整验正后比较，原规格及来源摘要保持不变。
  for (const read of [first, current]) {
    assertCompleteQuery(input, input.request.trace.actions.find((action) => action.id === read.actionRef)!)
  }
  return isDeepStrictEqual(queryMethod(first.specification), queryMethod(current.specification))
}

function queryMethod(specification: z.infer<typeof readSpecificationSchema>) {
  const value = structuredClone(specification)
  if (value.outputSchema.type !== "array" || value.outputSchema.items.type !== "object") fail("query_method_schema_invalid")
  const ordinal = value.outputSchema.items.properties.ordinal
  if (ordinal?.type !== "integer") fail("query_method_schema_invalid")
  value.maxItems = 1; value.outputSchema.maxItems = 1; ordinal.maximum = 1
  return value
}

function assertSameDocument(input: Input, left: Request["trace"]["observations"][number], right: typeof left) {
  const values = [left, right].map((observation) => {
    const facts = observation.facts.filter((fact) => fact.kind === "document_identity")
    const tabId = observation.tabId
    if (facts.length !== 1 || typeof tabId !== "string" || !tabId) fail("lookup_document_missing")
    input.assertFact(facts[0]!, observation.id)
    return z.object({ targetId: z.literal(tabId), documentDigest: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict().parse(facts[0]!.value)
  })
  if (!isDeepStrictEqual(values[0], values[1])) fail("lookup_document_changed")
}

function assertSampleKeys(read: z.infer<typeof readEvidenceSchema>, path: Array<string | number>) {
  const items = jsonValueAtPath(read.output, read.readPath)
  if (!Array.isArray(items) || !items.length) fail("representative_missing")
  const keys = items.map((item) => jsonValueAtPath(item, path))
  if (keys.some((key) => !["string", "number", "boolean"].includes(typeof key) || key === "")
    || new Set(keys).size !== keys.length) fail("sample_key_invalid")
}

function assertContinuation(input: Input, iteration: z.infer<typeof repeatEvidenceSchema>["iterations"][number],
  query: z.infer<typeof readEvidenceSchema>, mode: RepeatAdvanceMode) {
  if (mode === "same_page") assertCompleteQuery(input, input.request.trace.actions.find((item) => item.id === iteration.continuationActionRef)!)
  const queries = input.request.trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "dom_query" && fact.value && typeof fact.value === "object"
      && !Array.isArray(fact.value) && fact.value.actionRef === iteration.continuationActionRef)
    .map((fact) => ({ observation, fact })))
  if (queries.length !== 1) fail("continuation_evidence_missing")
  const { observation, fact } = queries[0]!
  input.assertFact(fact, observation.id)
  const dom = z.object({ complete: z.literal(true), total: z.number().int().nonnegative(),
    query: z.object({ kind: z.literal("css"), value: z.string() }).strict(), maxResults: z.number().int().min(1).max(300),
    requestedAttributes: z.array(z.string()), scope: z.object({ url: z.string(), urlDigest: z.string(),
      tabId: z.string(), frameId: z.null() }).passthrough() }).passthrough().parse(fact.value)
  const action = input.request.trace.actions.find((item) => item.id === iteration.continuationActionRef)!
  const args = z.object({ selector: z.string(), attributes: z.array(z.string()).nullable().optional(),
    max_results: z.number().int().min(1).max(300).default(50) }).passthrough().parse(action.args)
  if (!Array.isArray(query.output) || query.output.length !== dom.total || dom.query.value !== query.specification.container
    || (iteration.advanceActionRef !== null && dom.total < 1) || action.name !== "find_elements"
    || dom.maxResults !== args.max_results || dom.maxResults !== query.specification.maxItems
    || action.postObservationRef !== observation.id || dom.scope.url !== observation.url
    || dom.scope.urlDigest !== query.urlDigest || dom.scope.tabId !== query.targetId
    || dom.query.value !== args.selector
    || !isDeepStrictEqual(dom.requestedAttributes, [...new Set(args.attributes ?? [])].sort())) fail("continuation_evidence_invalid")
  if (mode === "same_page") {
    if (dom.total > 1) fail("continuation_control_ambiguous")
    return
  }
  if (!dom.requestedAttributes.includes("href")) fail("continuation_evidence_invalid")
  // WHY：最后一个代表查询可仍有 Next；只有完整空查询证明已观察终页，null 不声明业务完成。
  if (!iteration.advanceActionRef && dom.total === 0) return
  const href = Object.entries(query.specification.fields).find(([, field]) => field.attribute === "href")?.[0]
  const destinations = query.output.map((item) => href ? jsonValueAtPath(item, [href]) : undefined)
  if (destinations.some((value) => typeof value !== "string" || !/^https?:\/\//.test(value)) || new Set(destinations).size !== 1) {
    fail("continuation_destination_ambiguous")
  }
  if (!iteration.advanceActionRef) return
  const advance = input.request.trace.actions.find((item) => item.id === iteration.advanceActionRef)
  if (!advance || advance.status !== "succeeded" || !["click", "navigate"].includes(String(advance.name))) {
    fail("advance_action_invalid")
  }
  const destination = destinations[0]
  const before = input.request.trace.observations.find((item) => item.id === advance.preObservationRef)
  const after = input.request.trace.observations.find((item) => item.id === advance.postObservationRef)
  if (typeof destination !== "string" || before?.tabId !== query.targetId || after?.tabId !== query.targetId
    || after?.url !== destination || before.url === after.url) fail("advance_lineage_invalid")
  if (advance.name === "navigate" && z.object({ url: z.string() }).passthrough().parse(advance.args).url !== destination) {
    fail("advance_argument_mismatch")
  }
}

function assertProbe(input: Input, probe: Request["trace"]["actions"][number], next: Request["trace"]["actions"][number]) {
  const after = input.request.trace.observations.find((item) => item.id === probe.postObservationRef)
  const before = input.request.trace.observations.find((item) => item.id === probe.preObservationRef)
  const read = input.request.trace.observations.find((item) => item.id === next.preObservationRef)
  const args = z.object({ url: z.string() }).passthrough().safeParse(probe.args)
  if (probe.name !== "navigate" || probe.effect !== "navigation" || probe.status !== "succeeded" || !probe.resultRef
    || !args.success || !after || !before || !read
    || before.tabId !== after.tabId || after.tabId !== read.tabId || after.url !== read.url || after.url !== args.data.url) {
    fail("terminal_probe_invalid")
  }
}

function assertSupporting(compilation: Compilation, actionRef: string, owner: string) {
  const row = compilation.coverage.find((item) => item.actionRef === actionRef)
  if (row?.disposition !== "supporting" || row.ownerSegmentId !== owner
    || row.exclusionRule !== "repeat_method_sample/v1") fail("sample_coverage_mismatch")
}

function assertGraph(compilation: Compilation, method: Method) {
  const loop = `loop-${method.id}`, first = `first-${method.id}`
  const expected = new Map([
    [`${loop}:body`, first], [`${loop}:done`, "completed"], [`${loop}:limit`, "failed"],
    [`${loop}:failed`, "failed"],
    [`${first}:true`, method.readSegmentId], [`${first}:false`, method.advanceSegmentId], [`${first}:failed`, "failed"],
    [`${method.advanceSegmentId}:success`, method.readSegmentId],
    [`${method.readSegmentId}:success`, method.continuationSegmentId], [`${method.continuationSegmentId}:success`, loop],
  ])
  const owned = new Set([loop, first, method.readSegmentId, method.continuationSegmentId, method.advanceSegmentId])
  const seen = new Set<string>()
  for (const edge of compilation.controlGraph.edges) {
    const key = `${edge.from}:${edge.outcome}`
    if (expected.has(key)) {
      if (seen.has(key) || expected.get(key) !== edge.to) fail("graph_mismatch")
      seen.add(key); continue
    }
    if (owned.has(edge.from) && ([loop, first].includes(edge.from) || !requiredNodeOutcomes.capability.includes(edge.outcome as never)
      || edge.outcome === "success" || edge.to !== edge.outcome)) fail("graph_extra_edge")
    if (owned.has(edge.to) && edge.to !== loop) fail("graph_external_body_entry")
  }
  if (seen.size !== expected.size || (owned.has(compilation.controlGraph.entry) && compilation.controlGraph.entry !== loop)) {
    fail("graph_incomplete")
  }
}

export function materializeNaturalRepeats(repeats: ValidatedNaturalRepeat[], input: { plan: TaskPlan; step: TaskPlanStep;
  nodes: Array<StableChainNode | StableChainNodeV2>; variables: Record<string, TaskDataContract>; compilation: HybridCompilation;
  edges: Array<{ from: string; outcome: string; to: string }> }) {
  const branches: StableChainNode[] = []
  const initializers = new Map<string, StableChainNode>()
  const loops: Loop[] = repeats.map(({ method, variable, schema, mode }) => {
    const prefix = input.nodes.length - 3
    const commands = Math.min(input.plan.budget.maxBrowserCommands, input.step.budget.maxBrowserCommands)
    const transitions = Math.min(input.plan.budget.maxTransitions, input.step.budget.maxTransitions)
    const prefixCommands = input.nodes.slice(0, prefix).reduce((sum, node) => sum + browserCost(node), 0)
    const advance = input.nodes.find((node) => node.id === method.advanceSegmentId)!
    applyRepeatScopes(method, input, mode)
    // WHY：read/query 各有实际 scope observe；浏览器预算必须包含这些命令及翻页 readiness。
    const iterationCommands = 4 + browserCost(advance)
    const maxIterations = Math.min(10000, Math.floor((commands - prefixCommands) / iterationCommands),
      Math.floor((transitions - prefix - 8) / 6))
    if (maxIterations < 1) fail("budget_insufficient")
    const cursorVariable = `cursor-${method.id}`
    const { minItems: _minimum, ...accumulatorSchema } = schema
    input.variables[variable] = contract(variable, accumulatorSchema)
    input.variables[cursorVariable] = contract(cursorVariable, { type: "integer", minimum: 0, maximum: maxIterations })
    const continuation = bindContinuationVariable(method, mode, input)
    initializers.set(`loop-${method.id}`, continuation.initializer)
    branches.push({ id: `first-${method.id}`, label: "读取本页或进入下一页", kind: "branch", writes: [],
      outputContract: unit, outcomes: [...requiredNodeOutcomes.branch], predicate: { operator: "equals",
        left: { source: "variable", name: cursorVariable, path: [] }, right: { source: "constant", value: 0 } } })
    return { id: `loop-${method.id}`, label: "逐页读取并累积", kind: "loop", writes: [], outputContract: unit,
      outcomes: [...requiredNodeOutcomes.loop], cursorVariable, maxIterations,
      body: { entry: `first-${method.id}`, exits: [continuation.deduplicateId] },
      iteration: { mode: "while", condition: { operator: "equals", left: { source: "constant", value: true },
        right: { source: "constant", value: true } }, repeatCondition: { operator: "array_length_at_least",
        value: { source: "variable", name: `next-${method.id}`, path: [] }, minimum: { source: "constant", value: 1 } } },
      accumulators: [{ variable, initial: { source: "constant", value: [] },
        next: { source: "node", nodeId: method.readSegmentId, path: method.readPath },
        operation: "append_unique", stableKeyPath: method.stableKeyPath }] }
  })
  return { loops, branches, initializers }
}


function applyRepeatScopes(method: Method, input: { nodes: Array<StableChainNode | StableChainNodeV2>; compilation: HybridCompilation }, mode: RepeatAdvanceMode) {
  const loop = `loop-${method.id}`
  const incoming = input.compilation.controlGraph.edges.filter((edge) => edge.to === loop && edge.from !== method.continuationSegmentId)
  if (incoming.length !== 1 || incoming[0]!.outcome !== "success") fail("initial_page_predecessor_missing")
  const predecessor = input.nodes.find((node) => node.id === incoming[0]!.from)
  if (predecessor?.kind !== "capability" || !predecessor.capability.name.startsWith("browser.")) fail("initial_page_predecessor_invalid")
  const scopes: Array<[string, string | string[]]> = [[method.readSegmentId, [predecessor.id, method.advanceSegmentId]],
    [method.continuationSegmentId, method.readSegmentId]]
  if (mode === "same_page") scopes.push([method.advanceSegmentId, method.continuationSegmentId])
  for (const [id, marker] of scopes) {
    const node = input.nodes.find((item) => item.id === id)
    if (node?.kind !== "capability") fail("read_capability_missing")
    const config = z.record(z.string(), jsonValueSchema).parse(node.config)
    const scope = z.object({ url: z.string().min(1) }).passthrough().safeParse(config.scope)
    if (!scope.success && id !== method.advanceSegmentId) fail("read_scope_missing")
    node.config = { ...config, [RUNTIME_SCOPE_FROM]: typeof marker === "string" ? marker : [...marker],
      ...(mode === "same_page" && id === method.advanceSegmentId ? { [RUNTIME_SCOPE_SAME_DOCUMENT]: true } : {}) }
  }
}

export function repeatForBinding(repeats: ValidatedNaturalRepeat[], binding: ValueBinding) {
  return repeats.find(({ readActionRef, method }) => binding.source === "node" && binding.nodeId === readActionRef
    && isDeepStrictEqual(binding.path, method.readPath))
}

export function assertRepeatAwareBinding(raw: unknown, segmentId: string, repeats: ValidatedNaturalRepeat[],
  request: Request, payload: ReturnType<typeof naturalPayloadContext>) {
  const marker = z.object({ derivation: z.string().optional() }).passthrough().parse(raw)
  if (marker.derivation !== "repeat_destination") return assertNaturalBinding(raw, request.trace, payload)
  const decision = z.object({ actionRef: z.string(), argumentPath: z.literal("url"), kind: z.literal("prior_output"),
    derivation: z.literal("repeat_destination"), sourceRef: z.string(), binding: valueBindingSchema,
    proofRefs: z.array(z.object({ ref: z.string(), digest: z.string() }).strict()) }).passthrough().parse(raw)
  const repeat = repeats.find(({ method }) => method.advanceSegmentId === segmentId)
  if (!repeat || decision.sourceRef !== repeat.method.sourceRef || `s-${decision.actionRef}` !== repeat.method.advanceSegmentId
    || decision.binding.source !== "node" || `s-${decision.binding.nodeId}` !== repeat.method.continuationSegmentId
    || !isDeepStrictEqual(decision.binding.path, [0, "attribute_href"])) fail("destination_binding_mismatch")
  const facts = request.trace.observations.flatMap((observation) => observation.facts.map((fact) => ({ observation, fact })))
  const methodFacts = facts.filter(({ fact }) => fact.id === decision.sourceRef && fact.kind === "repeat_method")
  const queryFacts = facts.filter(({ fact }) => fact.kind === "verified_natural_read" && fact.value
    && typeof fact.value === "object" && !Array.isArray(fact.value) && `s-${fact.value.actionRef}` === repeat.method.continuationSegmentId)
  if (methodFacts.length !== 1 || queryFacts.length !== 1) fail("destination_evidence_missing")
  for (const { fact, observation } of [...methodFacts, ...queryFacts]) payload.assertFact(fact, observation.id)
  const query = readEvidenceSchema.parse(queryFacts[0]!.fact.value)
  const destinations = Array.isArray(query.output) ? query.output.map((item) => jsonValueAtPath(item, ["attribute_href"])) : []
  const refs = [...new Map([...methodFacts[0]!.fact.sourceRefs, ...queryFacts[0]!.fact.sourceRefs]
    .map((ref) => [`${ref.ref}\0${ref.digest}`, ref])).values()]
  if (!destinations.length || destinations.some((value) => typeof value !== "string" || !value.trim())
    || new Set(destinations).size !== 1 || !isDeepStrictEqual(refs, decision.proofRefs)) fail("destination_proof_mismatch")
  // WHY：此专属派生由 repeat 完整证据授权，普通 prior_verified_read 的唯一路径规则保持不变。
  return decision.binding
}

function schemaAt(schema: ValueSchema, path: Array<string | number>): ValueSchema | undefined {
  let current: ValueSchema | undefined = schema
  for (const key of path) {
    current = typeof key === "string" && current?.type === "object" ? current.properties[key]
      : typeof key === "number" && current?.type === "array" ? current.items : undefined
  }
  return current
}

function normalizedSpec(spec: z.infer<typeof readSpecificationSchema>) {
  return { ...spec, maxInputBytes: spec.maxInputBytes ?? 128000 }
}

function browserCost(node: StableChainNode | StableChainNodeV2) {
  if (node.kind !== "capability" || !node.capability.name.startsWith("browser.")) return 0
  const config = z.record(z.string(), jsonValueSchema).parse(node.config)
  const conditions = z.array(z.object({ kind: z.string() }).passthrough()).safeParse(config.postconditions)
  return 1 + (config[RUNTIME_SCOPE_FROM] === undefined ? 0 : 1)
    + (conditions.success && conditions.data.some((condition) => condition.kind === "read_fields") ? 1 : 0)
}

function fail(reason: string): never { throw new Error(`hybrid_repeat_${reason}`) }
