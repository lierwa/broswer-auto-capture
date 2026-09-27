import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema } from "@browser-capture/contracts"
import { hybridNaturalRequestSchema, type HybridCompilation } from "./hybrid-schema.js"
import { digestNaturalFactField, naturalPayloadContext } from "./hybrid-natural-payload.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
type Action = Request["trace"]["actions"][number]
type Observation = Request["trace"]["observations"][number]
type Fact = Observation["facts"][number]
type Payload = ReturnType<typeof naturalPayloadContext>
type Reference = Fact["sourceRefs"][number]
type Coverage = HybridCompilation["coverage"][number]
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const reference = z.object({ ref: z.string().min(1), digest: hash }).strict()
const documentIdentity = z.object({ targetId: z.string().min(1), documentDigest: hash }).strict()
const argsSchema = z.object({ selector: z.string().min(1), include_text: z.boolean().default(true),
  max_results: z.number().int().positive().default(50), attributes: z.array(z.string()).nullable().optional() }).strict()
const querySchema = z.object({ schemaVersion: z.literal("bat.dom-query/v1"), actionRef: z.string().regex(/^a-\d{4,}$/),
  scope: z.object({ url: z.string().nullable(), urlDigest: hash, tabId: z.string().nullable(),
    targetId: z.string().nullable(), frameId: z.null(), document: z.object({ kind: z.literal("ancestor_root"),
      rootNodeId: z.number().int().nullable(), rootBackendNodeId: z.number().int().nullable(), complete: z.boolean() }).strict().nullable() }).strict(),
  query: z.object({ kind: z.literal("css"), value: z.string().min(1) }).strict(),
  requestedAttributes: z.array(z.string()), includeText: z.literal(true), maxResults: z.number().int().positive(),
  total: z.number().int().nonnegative(), showing: z.number().int().nonnegative(), truncated: z.literal(false),
  complete: z.literal(true), limitations: z.array(z.string()) }).strict()
const dispatchSchema = z.object({ schemaVersion: z.literal("bat.native-action-dispatch/v3"),
  nativeStepNumber: z.number().int().positive(), nativeActionIndex: z.number().int(), actionRef: z.string(),
  actionName: z.literal("find_elements"), intentTarget: z.null(), resultRef: reference,
  entered: z.literal(true), resultReceived: z.literal(true), eventCapture: z.object({ status: z.literal("not_applicable"),
    eventExpectation: z.literal("none"), eventCount: z.literal(0), limitations: z.array(z.string()).length(0) }).strict() }).strict()
const resultSchema = z.object({ schemaVersion: z.literal("bat.native-action-result/v1"), actionRef: z.string(),
  resultRef: reference, receivedFromToolsAct: z.literal(true), result: z.record(z.string(), jsonValueSchema) }).strict()
const consumerKinds = new Set(["natural_binding", "dom_structure", "selection_function", "verified_output_assembly"])

/** WHY：准备探查的排除必须由不可变来源独立证明；不能信任编译器的覆盖行或补造业务读取。 */
export function assertNaturalDiscoveryExclusions(input: { compilation: HybridCompilation; request: Request; payload: Payload }) {
  const { compilation, request, payload } = input
  const proven = new Set<string>(), consumed = consumedQueries(request, compilation)
  const actions = new Map(request.trace.actions.map((action) => [action.id, action]))
  const observations = new Map(request.trace.observations.map((observation) => [observation.id, observation]))
  for (const row of compilation.coverage) {
    if (row.exclusionRule !== "native_dom_lookup_observation/v1") continue
    const action = actions.get(row.actionRef)
    if (!action || action.name !== "find_elements") fail("action_missing")
    const after = observations.get(action.postObservationRef ?? "")
    if (!after) fail("observation_missing")
    if (actionFacts(after, "verified_natural_read", action.id).length) continue
    const query = soleActionFact(after, "dom_query", action.id)
    if (!isRecord(query.value) || query.value.complete !== true || query.value.includeText !== true) continue
    if (consumed.has(action.id)) fail("query_consumed")
    assertDiscovery(row, action, observations, query, payload)
    proven.add(action.id)
  }
  return proven
}

export function isCompleteDiscovery(action: { id: string; name?: unknown }, observation: { facts: Fact[] } | undefined) {
  if (action.name !== "find_elements" || !observation || actionFacts(observation, "verified_natural_read", action.id).length) return false
  return actionFacts(observation, "dom_query", action.id).some((fact) => isRecord(fact.value)
    && fact.value.complete === true && fact.value.includeText === true)
}

function assertDiscovery(row: Coverage, action: Action, observations: Map<string, Observation>, queryFact: Fact, payload: Payload) {
  const before = observations.get(action.preObservationRef ?? ""), after = observations.get(action.postObservationRef ?? "")
  if (!before || !after || row.disposition !== "agent_internal" || row.ownerSegmentId !== null
    || action.status !== "succeeded" || action.effect !== "read" || typeof before.tabId !== "string"
    || !before.tabId || before.tabId !== after.tabId || before.url !== after.url) fail("boundary_invalid")
  const resultRef = reference.parse(action.resultRef), args = argsSchema.parse(action.args), query = querySchema.parse(queryFact.value)
  const beforeUrl = soleFact(before, "url_digest"), afterUrl = soleFact(after, "url_digest")
  payload.assertFact(beforeUrl, before.id); payload.assertFact(afterUrl, after.id)
  const urlDigest = hash.parse(beforeUrl.value)
  if (afterUrl.value !== urlDigest || query.actionRef !== action.id || query.query.value !== args.selector
    || query.includeText !== args.include_text || query.maxResults !== args.max_results
    || !isDeepStrictEqual(query.requestedAttributes, [...new Set(args.attributes ?? [])].sort())
    || query.scope.tabId !== before.tabId || query.scope.url !== before.url || query.scope.urlDigest !== urlDigest
    || query.total !== query.showing || query.total > query.maxResults) fail("query_mismatch")
  assertValueFact(queryFact, after, payload)
  const receipts = discoveryReceipts(action, before, after, resultRef, query.total, payload)
  const required = uniqueReferences([resultRef, ...z.array(reference).parse(before.sourceRefs),
    ...z.array(reference).parse(after.sourceRefs), ...beforeUrl.sourceRefs, ...afterUrl.sourceRefs,
    ...queryFact.sourceRefs, ...receipts])
  if (!sameReferences(row.evidenceRefs, required)) fail("coverage_mismatch")
}

function discoveryReceipts(action: Action, before: Observation, after: Observation, resultRef: Reference, total: number, payload: Payload) {
  const beforeDoc = soleFact(before, "document_identity"), afterDoc = soleFact(after, "document_identity")
  const dispatch = soleActionFact(before, "native_action_dispatch", action.id)
  const result = soleActionFact(before, "native_action_result", action.id)
  for (const fact of [beforeDoc, dispatch, result]) assertValueFact(fact, before, payload)
  assertValueFact(afterDoc, after, payload)
  const identity = documentIdentity.parse(beforeDoc.value)
  if (identity.targetId !== before.tabId || !isDeepStrictEqual(identity, documentIdentity.parse(afterDoc.value))) fail("document_mismatch")
  const sent = dispatchSchema.parse(dispatch.value), received = resultSchema.parse(result.value)
  if (sent.nativeActionIndex !== action.actionIndex || !isDeepStrictEqual(sent.resultRef, resultRef)
    || !isDeepStrictEqual(received.resultRef, resultRef) || received.result.error != null
    || digestNaturalFactField(payload, result, before.id, "result") !== resultRef.digest) fail("receipt_mismatch")
  const memory = received.result.long_term_memory
  const count = typeof memory === "string" ? /^Found (\d+) elements? matching ".*?"\.(?:\s|$)/s.exec(memory) : null
  if (!count || Number(count[1]) !== total) fail("result_count_mismatch")
  return [beforeDoc, afterDoc, dispatch, result].flatMap((fact) => fact.sourceRefs)
}

function assertValueFact(fact: Fact, observation: Observation, payload: Payload) {
  payload.assertFact(fact, observation.id)
  const digest = digestNaturalFactField(payload, fact, observation.id)
  if (!fact.sourceRefs.length || fact.sourceRefs.some((ref) => ref.digest !== digest)) fail("fact_digest_mismatch")
}

function consumedQueries(request: Request, compilation: HybridCompilation) {
  const found = new Set<string>(), facts = request.trace.observations.flatMap((observation) => observation.facts)
  const factActions = new Map(facts.filter((fact) => isRecord(fact.value)).map((fact) => [fact.id, (fact.value as Record<string, unknown>).actionRef]))
  for (const segment of compilation.segments) {
    const record = segment as unknown as Record<string, unknown>
    for (const key of ["bindings", "target", "inputBindings"]) collectReferences(record[key], found)
  }
  for (const fact of facts) {
    if (consumerKinds.has(fact.kind)) collectReferences(fact.value, found, factActions)
    if (fact.kind === "repeat_method") collectRepeatReferences(fact.value, found)
  }
  return new Set([...found].map((ref) => ref.startsWith("s-") ? ref.slice(2) : ref))
}

function collectReferences(value: unknown, found: Set<string>, factActions?: Map<string, unknown>) {
  if (Array.isArray(value)) { for (const item of value) collectReferences(item, found, factActions); return }
  if (!isRecord(value)) return
  if (value.source === "node" && typeof value.nodeId === "string") found.add(value.nodeId)
  if (factActions) collectSourceReferences(value, found, factActions)
  for (const child of Object.values(value)) collectReferences(child, found, factActions)
}

function collectSourceReferences(value: Record<string, unknown>, found: Set<string>, factActions: Map<string, unknown>) {
  for (const key of ["readActionRef", "queryActionRef"]) if (typeof value[key] === "string") found.add(value[key])
  for (const key of ["sourceReadRef", "readFactRef"]) {
    const action = typeof value[key] === "string" ? factActions.get(value[key]) : undefined
    if (typeof action === "string") found.add(action)
  }
}

function collectRepeatReferences(value: unknown, found: Set<string>) {
  if (!isRecord(value) || !Array.isArray(value.iterations)) return
  for (const row of value.iterations) {
    if (!isRecord(row)) continue
    for (const key of ["readActionRef", "continuationActionRef", "advanceActionRef"]) if (typeof row[key] === "string") found.add(row[key])
  }
}

function actionFacts(observation: { facts: Fact[] }, kind: string, actionRef: string) {
  return observation.facts.filter((fact) => fact.kind === kind && isRecord(fact.value) && fact.value.actionRef === actionRef)
}
function soleActionFact(observation: Observation, kind: string, actionRef: string) {
  const facts = actionFacts(observation, kind, actionRef)
  if (facts.length !== 1) fail("action_fact_missing")
  return facts[0]!
}
function soleFact(observation: Observation, kind: string) {
  const facts = observation.facts.filter((fact) => fact.kind === kind)
  if (facts.length !== 1) fail("identity_fact_missing")
  return facts[0]!
}
function uniqueReferences(refs: Reference[]) {
  return [...new Map(refs.map((ref) => [`${ref.ref}\u0000${ref.digest}`, ref])).values()]
}
function sameReferences(left: Reference[], right: Reference[]) {
  return left.length === right.length && left.every((ref) => right.some((item) => isDeepStrictEqual(item, ref)))
    && right.every((ref) => left.some((item) => isDeepStrictEqual(item, ref)))
}
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)) }
function fail(reason: string): never { throw new Error(`hybrid_discovery_${reason}`) }
