import { isDeepStrictEqual as equal } from "node:util"
import { z } from "zod"
import { digestNaturalPayload, type naturalPayloadContext } from "./hybrid-natural-payload.js"
import { hybridNaturalRequestSchema, readSpecificationSchema, type HybridCompilation } from "./hybrid-schema.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
type AssertFact = ReturnType<typeof naturalPayloadContext>["assertFact"]
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const query = z.object({ kind: z.literal("css"), value: z.string().min(1) }).strict()
const targetSchema = z.object({ strategy: z.literal("structure"), container: query, items: query,
  ordinal: z.number().int().positive(), withinItem: query.nullable(), readActionRef: z.string() }).strict()
const candidateSchema = targetSchema.omit({ strategy: true, ordinal: true }).extend({ complete: z.literal(true),
  matchedItemOrdinal: z.number().int().positive(), targetRef: z.string(),
  scope: z.object({ kind: z.literal("document"), tabId: z.string(), frameId: z.null() }).strict() }).strict()
const valueSchema = z.object({ actionRef: z.string(), targetRef: z.string(), target: targetSchema,
  read: z.object({ actionRef: z.string(), specification: readSpecificationSchema,
    output: z.array(z.object({ text: z.string(), ordinal: z.number().int().positive() }).strict()).min(2).max(300),
    outputPath: z.tuple([]), readPath: z.tuple([]), resultDigest: hash, urlDigest: hash,
    targetId: z.string(), containerIdsDigest: hash, stable: z.literal(true),
    readRef: z.null(), coverage: z.null(), documentRootId: z.null() }).strict() }).strict()
const digest = (value: unknown) => digestNaturalPayload(JSON.stringify(value))

/** WHY：宿主读取归属同一次原生点击，不伪造 find_elements 动作，也不豁免来源/页面/绑定检查。 */
export function assertHostCollection(request: Request, compilation: HybridCompilation,
  assertFact: AssertFact, factId: string) {
  const matches = request.trace.observations.flatMap(owner => owner.facts
    .filter(fact => fact.id === factId && fact.kind === "host_collection_read").map(fact => ({ owner, fact })))
  if (matches.length !== 1) throw Error("hybrid_host_collection_source_missing")
  const { owner, fact } = matches[0]!, value = valueSchema.parse(fact.value), { read, target } = value
  assertFact(fact, owner.id)
  const action = request.trace.actions.find(item => item.id === value.actionRef)
  const structures = owner.facts.filter(item => item.kind === "dom_structure" && item.value
    && typeof item.value === "object" && !Array.isArray(item.value) && item.value.actionRef === value.actionRef)
  const structure = z.object({ targetRef: z.string(), queryCandidate: candidateSchema })
    .passthrough().parse(structures[0]?.value)
  const { complete: _complete, matchedItemOrdinal, targetRef, scope, ...candidate } = structure.queryCandidate
  const { readActionRef, ...selectionTarget } = target
  if (!action || action.name !== "click" || action.status !== "succeeded" || action.preObservationRef !== owner.id
    || read.actionRef !== action.id || readActionRef !== action.id || structures.length !== 1
    || structure.targetRef !== value.targetRef || targetRef !== value.targetRef || scope.tabId !== owner.tabId
    || !equal(target, { ...candidate, strategy: "structure", ordinal: matchedItemOrdinal })
    || read.targetId !== owner.tabId || read.urlDigest !== digest(owner.url) || read.resultDigest !== digest(read.output)
    || target.container.value !== "html" || target.ordinal > read.output.length
    || read.output.some((row, index) => row.ordinal !== index + 1)) throw Error("hybrid_host_collection_source_mismatch")
  assertFact(structures[0]!, owner.id)
  assertSpecification(read.specification, target.items.value)
  const nodeId = `collection-${action.id}`, consumerId = `s-${action.id}`
  const coverage = compilation.coverage.filter(row => row.actionRef === action.id)
  const segment = compilation.segments.find(item => item.id === nodeId)
  const consumer = compilation.segments.find(item => item.id === consumerId)
  if (coverage.length !== 1 || coverage[0]?.disposition !== "compiled" || coverage[0].ownerSegmentId !== consumerId
    || segment?.kind !== "deterministic" || segment.operation.name !== "browser.read-fields"
    || !equal(segment.operation.specification, read.specification) || segment.bindings.length
    || !equal(segment.target, { strategy: "css", value: target.items.value, scope: { url: owner.url, urlDigest: read.urlDigest } })
    || !equal(segment.outputs, [{ schema: read.specification.outputSchema, sourceRef: fact.id }])
    || !equal(segment.proofRefs, fact.sourceRefs) || !equal(segment.expectedEffect, { kind: "read" })
    || !equal(segment.preconditions, [{ kind: "source_observation", evidenceRef: owner.id }])
    || !equal(segment.postconditions, [{ kind: "output_schema", schemaDigest: digest(read.specification.outputSchema) }])
    || consumer?.kind !== "deterministic" || consumer.operation.name !== "browser.workflow-step"
    || consumer.operation.actionName !== "click" || !equal(consumer.target, { ...selectionTarget,
      scope: { url: owner.url, urlDigest: read.urlDigest },
      ordinalBinding: { source: "node", nodeId: `selection-${action.id}`, path: [] } })) {
    throw Error("hybrid_host_collection_binding_mismatch")
  }
  return { read, action, owner, fact, nodeId }
}

function assertSpecification(specification: z.infer<typeof readSpecificationSchema>, container: string) {
  const expected = { container, fields: { text: { selector: ":scope", attribute: null,
    valueType: "string", normalizeWhitespace: true } }, maxItems: 300, maxInputBytes: 128000, includeOrdinal: true,
    outputSchema: { type: "array", minItems: 0, maxItems: 300, items: { type: "object",
      properties: { text: { type: "string" }, ordinal: { type: "integer", minimum: 1, maximum: 300 } },
      required: ["text", "ordinal"], additionalProperties: false } } }
  if (!equal(specification, expected)) throw Error("hybrid_host_collection_specification_mismatch")
}
