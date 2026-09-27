import { isDeepStrictEqual } from "node:util"
import type { JsonValue } from "@browser-capture/contracts"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { repeatEvidenceSchema, validateNaturalRepeats } from "./hybrid-natural-repeat.js"

type Envelope = Parameters<typeof naturalPayloadContext>[0]
export function missingSelectionActions(response: Envelope) {
  return new Set(response.compilation.gaps.filter((gap) => gap.reason === "selection_function_evidence_required")
    .flatMap((gap) => gap.actionRefs))
}

export function missingRepeatActions(response: Envelope) {
  const reasons = new Set(["repeat_method_evidence_invalid", "repeat_annotation_insufficient_evidence",
    "repeat_annotation_unavailable", "repeat_annotation_invalid_response"])
  return new Set(response.compilation.gaps.filter((gap) => gap.code === "missing_control_intent"
    && gap.resolution === "collect_evidence" && reasons.has(gap.reason)).flatMap((gap) => gap.actionRefs))
}

/** WHY：离线注解只补齐指定动作的派生程序；浏览器来源、既有程序和已确认需求不可被模型重写。 */
export function assertAnnotationSource(before: Record<string, JsonValue>, after: Record<string, JsonValue>,
  source: Envelope, response: Envelope) {
  const original = naturalPayloadContext(source, before), next = naturalPayloadContext(response, after)
  original.assertTraceEvidence(); next.assertTraceEvidence()
  const allowed = missingSelectionActions(source), added = new Set<string>()
  const repeatAllowed = missingRepeatActions(source)
  let repeatAdded = false
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
      if (fact.kind === "repeat_method") {
        const method = repeatEvidenceSchema.parse(fact.value), first = method.iterations[0]!
        const action = priorTrace.actions.find((item) => item.id === first.readActionRef)
        if (repeatAdded || priorObservations.some((item) => item.facts.some((value) => value.kind === "repeat_method"))
          || method.requirementDigest !== original.ordinary.requirement.sourceDigest
          || method.iterations.some((item) => !repeatAllowed.has(item.readActionRef))
          || action?.name !== "bat_read_fields" || action.status !== "succeeded"
          || fact.id !== `repeat-${first.readActionRef}` || action.postObservationRef !== prior.id) mismatch()
        repeatAdded = true
        continue
      }
      const actionRef = fact.value && typeof fact.value === "object" && !Array.isArray(fact.value)
        ? fact.value.actionRef : undefined
      const action = priorTrace.actions.find((item) => item.id === actionRef)
      if (fact.kind !== "selection_function" || typeof actionRef !== "string" || !allowed.has(actionRef)
        || added.has(actionRef) || fact.id !== `selection-${actionRef}` || action?.preObservationRef !== prior.id) mismatch()
      added.add(actionRef)
    }
  })
  if (repeatAdded && !response.compilation.gaps.length) {
    if (response.compilation.compilerVersion !== "bat-hybrid/2" || next.ordinary.plan.resultSpec.mode !== "data") mismatch()
    validateNaturalRepeats({ compilation: response.compilation, request: next.ordinary,
      assertFact: next.assertFact, outputSchema: next.ordinary.plan.resultSpec.schema })
  }
}

function mismatch(): never { throw new Error("hybrid_annotation_source_mismatch") }
