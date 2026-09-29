import { z } from "zod"
import type { JsonValue } from "@browser-capture/contracts"

type EvidenceReference = { ref: string; digest: string }
type NaturalFact = { id: string; kind: string; value: JsonValue; sourceRefs: EvidenceReference[] }
type NaturalObservation = { id: string; sequence?: unknown; url?: unknown; tabId?: unknown;
  sourceRefs?: EvidenceReference[]; facts: NaturalFact[] }
type NaturalAction = { name?: unknown; status?: unknown; effect?: unknown; resultRef?: EvidenceReference | null;
  preObservationRef: string | null; postObservationRef: string | null }
type CoverageRow = { exclusionRule: string | null; evidenceRefs?: EvidenceReference[] }
type Segment = { postconditions?: unknown; proofRefs?: EvidenceReference[] }
type AssertFact = (fact: NaturalFact, observationId: string) => void

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const delayedUrlChange = z.object({
  kind: z.enum(["url", "url_digest"]), changed: z.literal(true), clauseRef: z.string().min(1),
  settle: z.object({ maxMs: z.number().int().positive(), maxAttempts: z.number().int().positive(),
    intervalMs: z.number().int().positive() }).passthrough(),
}).passthrough()

/** WHY：导航可能在动作后快照失败后、紧邻的原生 wait 前完成；只复用编译器已归属的有界等待，不放宽普通跨页。 */
export function advanceBoundedNavigationWait(boundary: NaturalObservation, action: NaturalAction,
  row: CoverageRow, predecessor: Segment, observations: Map<string, NaturalObservation>,
  assertFact: AssertFact): NaturalObservation | undefined {
  if (row.exclusionRule !== "bounded_postcondition_wait/v1" || action.name !== "wait"
    || action.effect !== "none" || action.status !== "succeeded" || !action.resultRef
    || !action.preObservationRef || !action.postObservationRef
    || !sameReferenceSet(row.evidenceRefs ?? [], [action.resultRef])) return undefined
  const before = observations.get(action.preObservationRef), after = observations.get(action.postObservationRef)
  if (!before || !after || typeof boundary.url !== "string" || typeof before.url !== "string"
    || boundary.url === before.url || before.url !== after.url || boundary.tabId !== before.tabId
    || !sameUrlIdentity(before, after, assertFact) || !sameDocumentIdentity(before, after, assertFact)
    || !adjacentObservations(boundary, before, after)) return undefined
  const conditions = Array.isArray(predecessor.postconditions)
    ? predecessor.postconditions.map(value => delayedUrlChange.safeParse(value)).filter(result => result.success)
    : []
  if (conditions.length !== 1) return undefined
  const condition = conditions[0]!.data
  const start = monotonicTime(boundary, assertFact), middle = monotonicTime(before, assertFact)
  const end = monotonicTime(after, assertFact)
  if (start === null || middle === null || end === null || start > middle || middle > end
    || end - start > condition.settle.maxMs) return undefined
  const previous = conditionFact(boundary, condition.kind, assertFact)
  const current = conditionFact(before, condition.kind, assertFact)
  const stable = conditionFact(after, condition.kind, assertFact)
  if (!previous || !current || !stable || current.id !== condition.clauseRef || stable.id !== condition.clauseRef
    || previous.value === current.value || current.value !== stable.value) return undefined
  const required = uniqueReferences([action.resultRef, ...(before.sourceRefs ?? []), ...(after.sourceRefs ?? []),
    ...current.sourceRefs, ...stable.sourceRefs])
  return hasProofRefs(predecessor.proofRefs ?? [], required) ? after : undefined
}

export function sameDocumentIdentity(previous: NaturalObservation, current: NaturalObservation,
  assertFact: AssertFact) {
  if (!previous.tabId || previous.tabId !== current.tabId) return false
  const left = soleFact(previous, "document_identity"), right = soleFact(current, "document_identity")
  if (!left || !right) return false
  assertFact(left, previous.id); assertFact(right, current.id)
  const identity = z.object({ targetId: z.string().min(1), documentDigest: hash }).strict()
  const a = identity.safeParse(left.value), b = identity.safeParse(right.value)
  return a.success && b.success && a.data.targetId === previous.tabId
    && b.data.targetId === current.tabId && a.data.documentDigest === b.data.documentDigest
}

function adjacentObservations(previous: NaturalObservation, before: NaturalObservation, after: NaturalObservation) {
  const values = [previous.sequence, before.sequence, after.sequence]
  if (!values.every(value => Number.isInteger(value) && Number(value) >= 0)) return false
  const first = Number(previous.sequence), second = Number(before.sequence), third = Number(after.sequence)
  return (second === first || second === first + 1) && third === second + 1
}

function monotonicTime(observation: NaturalObservation, assertFact: AssertFact) {
  const fact = soleFact(observation, "monotonic_ms")
  if (!fact || !Number.isInteger(fact.value) || Number(fact.value) < 0) return null
  assertFact(fact, observation.id)
  return Number(fact.value)
}

function conditionFact(observation: NaturalObservation, kind: "url" | "url_digest", assertFact: AssertFact) {
  const fact = soleFact(observation, kind)
  if (!fact || (kind === "url" ? typeof fact.value !== "string" : !hash.safeParse(fact.value).success)) return undefined
  assertFact(fact, observation.id)
  return fact
}

function sameUrlIdentity(left: NaturalObservation, right: NaturalObservation, assertFact: AssertFact) {
  const a = urlIdentity(left, assertFact), b = urlIdentity(right, assertFact)
  return Boolean(a && b && a.tabId === b.tabId && a.urlDigest === b.urlDigest)
}

function urlIdentity(observation: NaturalObservation, assertFact: AssertFact) {
  if (typeof observation.tabId !== "string" || !observation.tabId) return null
  const fact = soleFact(observation, "url_digest")
  if (!fact) return null
  assertFact(fact, observation.id)
  const parsed = hash.safeParse(fact.value)
  return parsed.success ? { tabId: observation.tabId, urlDigest: parsed.data } : null
}

function soleFact(observation: NaturalObservation, kind: string) {
  const facts = observation.facts.filter((fact) => fact.kind === kind)
  return facts.length === 1 ? facts[0] : undefined
}

function hasProofRefs(haystack: EvidenceReference[], needles: EvidenceReference[]) {
  return needles.every((needle) => haystack.some((item) => sameReference(item, needle)))
}

function sameReferenceSet(left: EvidenceReference[], right: EvidenceReference[]) {
  return left.length === right.length && hasProofRefs(left, right) && hasProofRefs(right, left)
}

function uniqueReferences(refs: EvidenceReference[]) {
  return [...new Map(refs.map((ref) => [`${ref.ref}\u0000${ref.digest}`, ref])).values()]
}

function sameReference(value: unknown, expected: EvidenceReference) {
  return isRecord(value) && value.ref === expected.ref && value.digest === expected.digest
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
