import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, type JsonValue } from "@browser-capture/contracts"
import { hybridCompilerResponseSchema, hybridNaturalRequestSchema } from "./hybrid-schema.js"

type Envelope = z.infer<typeof hybridCompilerResponseSchema>
type NaturalRequest = z.infer<typeof hybridNaturalRequestSchema>
type NaturalFact = NaturalRequest["trace"]["observations"][number]["facts"][number]
type RawJSONValue = { rawJSON: string }
const rawApi = JSON as typeof JSON & {
  rawJSON(value: string): RawJSONValue
  isRawJSON(value: unknown): boolean
}
const parseWithSource = JSON.parse as (text: string,
  reviver: (key: string, value: unknown, context: { source: string }) => unknown) => unknown
const evidenceKinds = new Set(["dom_structure", "dom_query", "natural_binding", "native_extraction",
  "native_action_dispatch", "native_action_result", "native_dom_event", "browser_context",
  "url_digest", "verified_natural_read", "verified_target_scroll", "verified_visible_wait",
  "verified_natural_summary", "verified_output_assembly"])

/** WHY：sourcePayloads 是 Python canonical bytes 的唯一词法锚；普通 request 仍负责结构和业务语义。 */
export function naturalPayloadContext(envelope: Envelope, request: Record<string, JsonValue>) {
  validateHybridRequestSources(envelope, request)
  if (envelope.compilation.compilerVersion !== "bat-hybrid/2") throw new Error("hybrid_natural_source_payloads_missing")
  const ordinary = hybridNaturalRequestSchema.parse(request)
  const rawSources = envelope.sourcePayloads.slice(0, 4).map(parseRawPayload)
  const rawTrace = record(rawSources[2], "hybrid_natural_trace_payload_invalid")
  const transportRequest = { compilerVersion: ordinary.compilerVersion,
    actionRegistryVersion: ordinary.actionRegistryVersion,
    requirement: { ...record(rawSources[0], "hybrid_natural_requirement_payload_invalid"), digest: ordinary.requirement.digest },
    plan: { ...record(rawSources[1], "hybrid_natural_plan_payload_invalid"), digest: ordinary.plan.digest },
    runtimeInputSchema: rawSources[3], trace: { ...rawTrace, digest: ordinary.trace.digest } }
  const semantic = hybridNaturalRequestSchema.parse(plainValue(transportRequest))
  if (!isDeepStrictEqual(semantic, ordinary)) throw new Error("hybrid_natural_payload_semantic_mismatch")
  const assertFact = (fact: NaturalFact, observationId: string) => assertRawFact(rawTrace, fact, observationId)
  const assertTraceEvidence = () => {
    for (const observation of ordinary.trace.observations) for (const fact of observation.facts) {
      if (evidenceKinds.has(fact.kind)) assertFact(fact, observation.id)
    }
  }
  return { ordinary, transportRequest, assertFact, assertTraceEvidence }
}

export function validateHybridRequestSources(envelope: Envelope, request: Record<string, JsonValue>) {
  const withoutDigest = (value: unknown) => {
    const { digest: _digest, ...body } = z.record(z.string(), jsonValueSchema).parse(value)
    return body
  }
  const sources = envelope.compilation.compilerVersion === "bat-hybrid/2"
    ? [withoutDigest(request.requirement), withoutDigest(request.plan), withoutDigest(request.trace), request.runtimeInputSchema, []]
    : [withoutDigest(request.requirement), withoutDigest(request.plan), withoutDigest(request.trace),
      request.control, request.acceptedAnnotations]
  if (request.actionRegistryVersion !== envelope.compilation.sourceDigests[5]) throw new Error("hybrid_registry_mismatch")
  envelope.sourcePayloads.forEach((payload, index) => {
    if (createHash("sha256").update(payload).digest("hex") !== envelope.compilation.sourceDigests[index]
      || !isDeepStrictEqual(JSON.parse(payload), sources[index])) throw new Error("hybrid_source_mismatch")
  })
}

export function digestNaturalPayload(payload: string) {
  return createHash("sha256").update(canonicalRaw(parseRawPayload(payload))).digest("hex")
}

function assertRawFact(rawTrace: Record<string, unknown>, fact: NaturalFact, observationId: string) {
  const observations = array(rawTrace.observations, "hybrid_natural_trace_payload_invalid")
  const rawObservations = observations.filter((item) => record(item, "hybrid_natural_trace_payload_invalid").id === observationId)
  if (rawObservations.length !== 1) throw new Error("hybrid_natural_observation_payload_missing")
  const matches = array(record(rawObservations[0], "hybrid_natural_trace_payload_invalid").facts,
    "hybrid_natural_trace_payload_invalid").filter((item) => {
      const value = record(item, "hybrid_natural_trace_payload_invalid")
      return value.id === fact.id && value.kind === fact.kind
    })
  if (!matches.length) throw new Error("hybrid_natural_fact_payload_missing")
  const rawFacts = matches.map((item) => record(item, "hybrid_natural_fact_payload_invalid"))
  if (rawFacts.some((item) => !isDeepStrictEqual(plainValue(item), fact))) {
    throw new Error("hybrid_natural_fact_payload_mismatch")
  }
  for (const rawFact of rawFacts) {
    // WHY：capture.fact 的 url_digest 与 monotonic_ms 基础事实摘要固定覆盖 {kind,value}；其他验证事实仍只覆盖 value。
    const digestSource = fact.kind === "url_digest" || fact.kind === "monotonic_ms"
      ? { kind: rawFact.kind, value: rawFact.value } : rawFact.value
    const digest = createHash("sha256").update(canonicalRaw(digestSource)).digest("hex")
    if (fact.sourceRefs.some((reference) => reference.digest !== digest)) {
      throw new Error("hybrid_natural_fact_digest_mismatch")
    }
  }
}

function parseRawPayload(payload: string) {
  return parseWithSource(payload, (_key, value, context) => typeof value === "number" ? rawApi.rawJSON(context.source) : value)
}

function canonicalRaw(value: unknown): string {
  if (rawApi.isRawJSON(value)) return (value as RawJSONValue).rawJSON
  if (Array.isArray(value)) return `[${value.map(canonicalRaw).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map((key) => `${JSON.stringify(key)}:${canonicalRaw((value as Record<string, unknown>)[key])}`).join(",")}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error("hybrid_natural_payload_invalid")
  return encoded
}

function plainValue(value: unknown) { return JSON.parse(JSON.stringify(value)) as unknown }
function record(value: unknown, error: string) {
  if (!value || typeof value !== "object" || Array.isArray(value) || rawApi.isRawJSON(value)) throw new Error(error)
  return value as Record<string, unknown>
}
function array(value: unknown, error: string) { if (!Array.isArray(value)) throw new Error(error); return value }
