import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, valueBindingSchema, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { hybridNaturalRequestSchema, naturalBindingFactValueSchema, readSpecificationSchema,
  type HybridCompilation, type HybridSegment } from "./hybrid-schema.js"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { jsonValueAtPath } from "./hybrid-json-path.js"
import { assertSelectionValueBinding } from "./hybrid-selection.js"

type NaturalContext = { version: 2; request: z.infer<typeof hybridNaturalRequestSchema>;
  payload: ReturnType<typeof naturalPayloadContext> }

export function assertNaturalBinding(raw: unknown, trace: z.infer<typeof hybridNaturalRequestSchema>["trace"],
  payload: ReturnType<typeof naturalPayloadContext>): ValueBinding {
  const decision = z.object({ actionRef: z.string(), argumentPath: z.string(), sourceRef: z.string(),
    binding: valueBindingSchema, proofRefs: z.array(z.object({ ref: z.string(),
      digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()),
    derivation: z.enum(["anchor_navigation", "prior_verified_read", "selection_function"]).optional() }).passthrough().parse(raw)
  if (decision.derivation === "selection_function") return assertSelectionValueBinding(decision, trace, payload.assertFact)
  if (decision.derivation === "anchor_navigation") {
    return assertAnchorNavigationBinding(decision, trace, payload)
  }
  if (decision.derivation === "prior_verified_read") {
    return assertDerivedPriorReadBinding(decision, trace, payload)
  }
  const matches = trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.id === decision.sourceRef && fact.kind === "natural_binding")
    .map((fact) => ({ observation, fact })))
  if (matches.length !== 1) throw new Error("hybrid_natural_binding_fact_missing")
  const { observation, fact } = matches[0]!
  payload.assertFact(fact, observation.id)
  const action = trace.actions.find((item) => item.id === decision.actionRef)
  if (!action || ![action.preObservationRef, action.postObservationRef].includes(observation.id)) {
    throw new Error("hybrid_natural_binding_observation_mismatch")
  }
  const value = naturalBindingFactValueSchema.parse(fact.value)
  if (value.actionRef !== decision.actionRef || value.argumentPath !== decision.argumentPath
    || !isDeepStrictEqual(value.binding, decision.binding)) {
    throw new Error("hybrid_natural_binding_mismatch")
  }
  const proofRefs = value.provenance === "node_output"
    ? assertNaturalNodeBinding(value, fact.sourceRefs, action, trace, payload)
    : fact.sourceRefs
  if (!isDeepStrictEqual(proofRefs, decision.proofRefs)) throw new Error("hybrid_natural_binding_proof_mismatch")
  return value.binding
}

function assertDerivedPriorReadBinding(decision: { actionRef: string; argumentPath: string; sourceRef: string;
  binding: ValueBinding; proofRefs: Array<{ ref: string; digest: string }> },
  trace: z.infer<typeof hybridNaturalRequestSchema>["trace"], payload: ReturnType<typeof naturalPayloadContext>) {
  const actionIndex = trace.actions.findIndex((item) => item.id === decision.actionRef)
  const action = trace.actions[actionIndex]
  if (!action || actionIndex < 1 || decision.binding.source !== "node") {
    throw new Error("hybrid_prior_read_derivation_invalid")
  }
  const pre = trace.observations.find((item) => item.id === action.preObservationRef)
  if (!pre || pre.facts.some((fact) => {
    if (fact.kind !== "natural_binding") return false
    const value = z.object({ actionRef: z.string(), argumentPath: z.string() }).passthrough().safeParse(fact.value)
    return value.success && value.data.actionRef === action.id && value.data.argumentPath === decision.argumentPath
  })) throw new Error("hybrid_prior_read_derivation_conflict")
  const args = z.record(z.string(), jsonValueSchema).parse(action.args)
  if (!Object.hasOwn(args, decision.argumentPath)) throw new Error("hybrid_prior_read_argument_missing")
  const reads = trace.actions.slice(0, actionIndex).flatMap((source) => {
    const post = trace.observations.find((item) => item.id === source.postObservationRef)
    return (post?.facts ?? []).filter((fact) => fact.kind === "verified_natural_read")
      .map((fact) => ({ source, post, fact }))
  })
  const matched = reads.filter(({ fact }) => fact.id === decision.sourceRef)
  if (matched.length !== 1) throw new Error("hybrid_prior_read_source_missing")
  const latest = reads.toReversed().find(({ fact }) => {
    const candidate = z.object({ output: jsonValueSchema, stable: z.literal(true) }).passthrough().safeParse(fact.value)
    return candidate.success && pathsForValue(candidate.data.output, args[decision.argumentPath]).length > 0
  })
  if (latest?.fact.id !== decision.sourceRef) throw new Error("hybrid_prior_read_source_mismatch")
  const { source, post, fact } = matched[0]!
  payload.assertFact(fact, post!.id)
  const read = z.object({ actionRef: z.string(), output: jsonValueSchema, stable: z.literal(true) })
    .passthrough().parse(fact.value)
  if (read.actionRef !== source.id || decision.binding.nodeId !== source.id
    || !isDeepStrictEqual(jsonValueAtPath(read.output, decision.binding.path), args[decision.argumentPath])) {
    throw new Error("hybrid_prior_read_source_mismatch")
  }
  const matches = pathsForValue(read.output, args[decision.argumentPath])
  const refs = [...new Map(fact.sourceRefs.map((item) => [`${item.ref}\0${item.digest}`, item])).values()]
  if (matches.length !== 1 || !isDeepStrictEqual(matches[0], decision.binding.path)
    || !isDeepStrictEqual(refs, decision.proofRefs)) {
    throw new Error("hybrid_prior_read_path_ambiguous")
  }
  return decision.binding
}

function pathsForValue(value: unknown, expected: unknown, path: Array<string | number> = [],
  found: Array<Array<string | number>> = []): Array<Array<string | number>> {
  if (isDeepStrictEqual(value, expected)) found.push(path)
  if (path.length >= 40 || found.length > 1) return found
  if (Array.isArray(value)) value.forEach((item, index) => pathsForValue(item, expected, [...path, index], found))
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => {
    if (!["__proto__", "constructor", "prototype"].includes(key)) pathsForValue(item, expected, [...path, key], found)
  })
  return found
}

function assertAnchorNavigationBinding(decision: { actionRef: string; argumentPath: string; sourceRef: string;
  binding: ValueBinding; proofRefs: Array<{ ref: string; digest: string }> },
  trace: z.infer<typeof hybridNaturalRequestSchema>["trace"], payload: ReturnType<typeof naturalPayloadContext>) {
  const action = trace.actions.find((item) => item.id === decision.actionRef)
  const parsedAction = z.object({ id: z.string(), name: z.string(), preObservationRef: z.string().nullable(),
    postObservationRef: z.string().nullable() }).passthrough().safeParse(action)
  if (!parsedAction.success || parsedAction.data.name !== "click" || decision.argumentPath !== "url"
    || decision.binding.source !== "node") throw new Error("hybrid_anchor_navigation_action_invalid")
  const nodeBinding = decision.binding
  const pre = trace.observations.find((item) => item.id === parsedAction.data.preObservationRef)
  const post = trace.observations.find((item) => item.id === parsedAction.data.postObservationRef)
  const domMatches = pre?.facts.filter((fact) => fact.id === decision.sourceRef && fact.kind === "dom_structure") ?? []
  const urlMatches = post?.facts.filter((fact) => fact.kind === "url" && typeof fact.value === "string") ?? []
  if (domMatches.length !== 1 || urlMatches.length !== 1) throw new Error("hybrid_anchor_navigation_evidence_missing")
  const dom = domMatches[0]!, url = urlMatches[0]!
  payload.assertFact(dom, pre!.id); payload.assertFact(url, post!.id)
  const structure = z.object({ actionRef: z.string(), targetRef: z.string(),
    historyTarget: z.object({ nodeName: z.string(), xPath: z.string() }).passthrough(),
    nodes: z.array(z.object({ id: z.string(), tag: z.string(), xpath: z.string().nullable() }).passthrough()),
  }).passthrough().parse(dom.value)
  const targetNodes = structure.nodes.filter((item) => item.id === structure.targetRef)
  if (structure.actionRef !== decision.actionRef || structure.historyTarget.nodeName !== "a"
    || targetNodes.length !== 1 || targetNodes[0]!.tag !== "a"
    || targetNodes[0]!.xpath !== structure.historyTarget.xPath) {
    throw new Error("hybrid_anchor_navigation_target_invalid")
  }
  const readMatches = trace.observations.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "verified_natural_read")
    .map((fact) => ({ observation, fact }))).filter(({ fact }) => {
      const value = z.object({ actionRef: z.string(), output: jsonValueSchema }).passthrough().safeParse(fact.value)
      return value.success && value.data.actionRef === nodeBinding.nodeId
    })
  if (readMatches.length !== 1) throw new Error("hybrid_anchor_navigation_read_missing")
  const read = readMatches[0]!, readValue = z.object({ actionRef: z.string(), output: jsonValueSchema }).passthrough().parse(read.fact.value)
  payload.assertFact(read.fact, read.observation.id)
  const sourceAction = trace.actions.find((item) => item.id === readValue.actionRef)
  const sourceIndex = trace.actions.findIndex((item) => item.id === readValue.actionRef)
  const actionIndex = trace.actions.findIndex((item) => item.id === decision.actionRef)
  if (!sourceAction || sourceIndex < 0 || sourceIndex >= actionIndex
    || ![sourceAction.preObservationRef, sourceAction.postObservationRef].includes(read.observation.id)
    || !isDeepStrictEqual(jsonValueAtPath(readValue.output, nodeBinding.path), url.value)) {
    throw new Error("hybrid_anchor_navigation_read_mismatch")
  }
  const unique = new Map([...dom.sourceRefs, ...url.sourceRefs, ...read.fact.sourceRefs]
    .map((item) => [`${item.ref}\0${item.digest}`, item]))
  if (!isDeepStrictEqual([...unique.values()], decision.proofRefs)) {
    throw new Error("hybrid_anchor_navigation_proof_mismatch")
  }
  return decision.binding
}

export function assertResultDataSegment(segment: Extract<HybridSegment, { kind: "deterministic" }>,
  context: NaturalContext, compilation: HybridCompilation) {
  const operation = segment.operation, spec = context.request.plan.resultSpec
  const derivation = spec.mode === "data" ? spec.derivations.find((item) =>
    `result-${item.producerRef}` === segment.id) : undefined
  if (!derivation) throw new Error("hybrid_result_derivation_invalid")
  const target = derivation && spec.mode === "data"
    ? spec.fields.filter((field) => field.producerRef === derivation.producerRef) : []
  const sourceOwner = derivation && spec.mode === "data" ? spec.fields.filter((field) =>
    field.producerRef === derivation.sourceProducerRef && isDeepStrictEqual(field.path, derivation.sourcePath)) : []
  const assembly = compilation.compilerVersion === "bat-hybrid/2" ? compilation.outputAssembly : undefined
  const sources = derivation && assembly ? assembly.fields.filter((field) =>
    isDeepStrictEqual(field.path, derivation.sourcePath)) : []
  const decision = segment.bindings[0], parsed = valueBindingSchema.safeParse(
    decision && "binding" in decision ? decision.binding : undefined)
  const targetSchema = target.length === 1 ? schemaAtPath(context.request.plan.resultSpec.mode === "data"
    ? context.request.plan.resultSpec.schema : { type: "null" }, target[0]!.path) : null
  if (operation.name !== "data.transform" || operation.dataOperation !== "count" || !derivation
    || segment.target !== null || segment.bindings.length !== 1 || segment.outputs.length !== 1
    || segment.expectedEffect.kind !== "read" || target.length !== 1 || sourceOwner.length !== 1 || sources.length !== 1
    || !parsed.success || decision?.argumentPath !== "source" || decision.kind === "sample_evidence"
    || !isDeepStrictEqual(parsed.data, sources[0]!.binding) || decision.sourceRef !== assembly?.sourceRef
    || !isDeepStrictEqual(decision.proofRefs, assembly?.proofRefs) || !isDeepStrictEqual(segment.proofRefs, assembly?.proofRefs)
    || segment.outputs[0]!.sourceRef !== assembly?.sourceRef || !targetSchema
    || !isDeepStrictEqual(segment.outputs[0]!.schema, targetSchema)) {
    throw new Error("hybrid_result_derivation_invalid")
  }
  return parsed.data
}

function assertNaturalNodeBinding(value: z.infer<typeof naturalBindingFactValueSchema>, directRefs: Array<{ ref: string; digest: string }>,
  action: z.infer<typeof hybridNaturalRequestSchema>["trace"]["actions"][number],
  trace: z.infer<typeof hybridNaturalRequestSchema>["trace"], payload: ReturnType<typeof naturalPayloadContext>) {
  if (value.binding.source !== "node" || !value.sourceReadRef) throw new Error("hybrid_natural_node_binding_source_missing")
  const matches = trace.observations.flatMap((observation) => observation.facts
    .filter((candidate) => candidate.id === value.sourceReadRef && candidate.kind === "verified_natural_read")
    .map((candidate) => ({ observation, candidate })))
  if (matches.length !== 1) throw new Error("hybrid_natural_node_binding_source_missing")
  const { observation, candidate } = matches[0]!
  payload.assertFact(candidate, observation.id)
  const source = z.object({ actionRef: z.string(), output: jsonValueSchema }).passthrough().parse(candidate.value)
  const sourceAction = trace.actions.find((item) => item.id === source.actionRef)
  const sourceIndex = trace.actions.findIndex((item) => item.id === source.actionRef)
  const actionIndex = trace.actions.findIndex((item) => item.id === action.id)
  const args = z.record(z.string(), jsonValueSchema).parse(action.args)
  if (source.actionRef !== value.binding.nodeId || !sourceAction || sourceIndex < 0 || sourceIndex >= actionIndex
    || ![sourceAction.preObservationRef, sourceAction.postObservationRef].includes(observation.id)
    || !isDeepStrictEqual(jsonValueAtPath(source.output, value.binding.path), args[value.argumentPath])) {
    throw new Error("hybrid_natural_node_binding_mismatch")
  }
  const unique = new Map([...directRefs, ...candidate.sourceRefs].map((item) => [`${item.ref}\0${item.digest}`, item]))
  return [...unique.values()]
}

export function assertNaturalReadSegment(segment: Extract<HybridSegment, { kind: "deterministic" }>,
  context: NaturalContext, compilation: HybridCompilation) {
  if (segment.operation.name !== "browser.read-fields") throw new Error("hybrid_natural_read_operation_mismatch")
  const coverage = compilation.coverage.filter((item) => item.ownerSegmentId === segment.id && item.disposition === "compiled")
  if (coverage.length !== 1 || segment.outputs.length === 0
    || new Set(segment.outputs.map((item) => item.sourceRef)).size !== segment.outputs.length) {
    throw new Error("hybrid_natural_read_coverage_mismatch")
  }
  const actionRef = coverage[0]!.actionRef
  const action = context.request.trace.actions.find((item) => item.id === actionRef)
  for (const output of segment.outputs) {
    const matches = context.request.trace.observations.flatMap((observation) => observation.facts
      .filter((fact) => fact.id === output.sourceRef && fact.kind === "verified_natural_read")
      .map((fact) => ({ observation, fact })))
    if (matches.length !== 1) throw new Error("hybrid_natural_read_fact_missing")
    const { observation, fact } = matches[0]!
    if (!action || ![action.preObservationRef, action.postObservationRef].includes(observation.id)) {
      throw new Error("hybrid_natural_read_observation_mismatch")
    }
    context.payload.assertFact(fact, observation.id)
    const value = z.object({ actionRef: z.string(), specification: readSpecificationSchema }).passthrough().parse(fact.value)
    if (value.actionRef !== actionRef || !isDeepStrictEqual(
      { ...value.specification, maxInputBytes: value.specification.maxInputBytes ?? 128000 }, segment.operation.specification)
      || !isDeepStrictEqual(output.schema, value.specification.outputSchema)) {
      throw new Error("hybrid_natural_read_mismatch")
    }
  }
}

function schemaAtPath(schema: ValueSchema, path: Array<string | number>): ValueSchema | null {
  let current: ValueSchema | undefined = schema
  for (const part of path) {
    if (typeof part === "string" && current.type === "object") current = current.properties[part]
    else if (typeof part === "number" && current.type === "array") current = current.items
    else return null
    if (!current) return null
  }
  return current
}
