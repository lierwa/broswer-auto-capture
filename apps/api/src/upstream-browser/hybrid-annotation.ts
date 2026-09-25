import { isDeepStrictEqual } from "node:util"
import type { JsonValue } from "@browser-capture/contracts"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"

type Envelope = Parameters<typeof naturalPayloadContext>[0]
export function missingSelectionActions(response: Envelope) {
  return new Set(response.compilation.gaps.filter((gap) => gap.reason === "selection_function_evidence_required")
    .flatMap((gap) => gap.actionRefs))
}

/** WHY：离线注解只补齐指定动作的派生程序；浏览器来源、既有程序和已确认需求不可被模型重写。 */
export function assertAnnotationSource(before: Record<string, JsonValue>, after: Record<string, JsonValue>,
  source: Envelope, response: Envelope) {
  const original = naturalPayloadContext(source, before), next = naturalPayloadContext(response, after)
  original.assertTraceEvidence(); next.assertTraceEvidence()
  const allowed = missingSelectionActions(source), added = new Set<string>()
  const { trace: priorTrace, ...priorRequest } = original.ordinary
  const { trace: nextTrace, ...nextRequest } = next.ordinary
  if (!isDeepStrictEqual(priorRequest, nextRequest)
    || [0, 1, 3, 4].some((index) => source.sourcePayloads[index] !== response.sourcePayloads[index])) mismatch()
  const { digest: _priorDigest, observations: priorObservations, ...priorFacts } = priorTrace
  const { digest: _nextDigest, observations: nextObservations, ...nextFacts } = nextTrace
  if (!isDeepStrictEqual(priorFacts, nextFacts) || priorObservations.length !== nextObservations.length) mismatch()
  priorObservations.forEach((prior, index) => {
    const nextObservation = nextObservations[index]!
    const { facts: priorEvidence, ...priorMeta } = prior
    const { facts: nextEvidence, ...nextMeta } = nextObservation
    if (!isDeepStrictEqual(priorMeta, nextMeta)
      || !isDeepStrictEqual(priorEvidence, nextEvidence.slice(0, priorEvidence.length))) mismatch()
    for (const fact of nextEvidence.slice(priorEvidence.length)) {
      const actionRef = fact.value && typeof fact.value === "object" && !Array.isArray(fact.value)
        ? fact.value.actionRef : undefined
      const action = priorTrace.actions.find((item) => item.id === actionRef)
      if (fact.kind !== "selection_function" || typeof actionRef !== "string" || !allowed.has(actionRef)
        || added.has(actionRef) || fact.id !== `selection-${actionRef}` || action?.preObservationRef !== prior.id) mismatch()
      added.add(actionRef)
    }
  })
}

function mismatch(): never { throw new Error("hybrid_annotation_source_mismatch") }
