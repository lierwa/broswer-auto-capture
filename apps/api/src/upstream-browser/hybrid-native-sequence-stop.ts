import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import type { JsonValue } from "@browser-capture/contracts"

type Reference = { ref: string; digest: string }
type Fact = { id: string; kind: string; value: JsonValue; sourceRefs: Reference[] }
type Observation = { id: string; facts: Fact[] }
type Action = { id: string; name?: unknown; status?: unknown; stepIndex?: unknown; actionIndex?: unknown;
  preObservationRef: string | null; postObservationRef: string | null; resultRef?: Reference | null }
type Trace = { actions: Action[]; observations: Observation[] }
type AssertFact = (fact: Fact, observationId: string) => void
type Located = { fact: Fact; observation: Observation }
type Row = { disposition: string; ownerSegmentId: string | null; exclusionRule: string | null;
  evidenceRefs?: Reference[] }
export const NATIVE_SEQUENCE_STOP_RULE = "native_sequence_not_dispatched/v1"
const reference = z.object({ ref: z.string().min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const stopSchema = z.object({ schemaVersion: z.literal("bat.native-sequence-stop/v1"),
  nativeStepNumber: z.number().int().positive(), nativeActionIndex: z.number().int().nonnegative(),
  actionRef: z.string().min(1), causeActionRef: z.string().min(1), causeResultRef: reference,
  reason: z.enum(["tool_terminates_sequence", "action_error", "action_done", "page_changed",
    "native_stop", "native_pause", "done_requires_single_action", "admission_rejected"]), proof: z.record(z.string(), z.unknown()) }).strict()
const dispatchSchema = z.object({ schemaVersion: z.literal("bat.native-action-dispatch/v3"),
  nativeStepNumber: z.number().int().positive(), nativeActionIndex: z.number().int().nonnegative(),
  actionRef: z.string(), actionName: z.string(), intentTarget: z.unknown(), entered: z.boolean(),
  resultReceived: z.boolean(), resultRef: reference.nullable(), eventCapture: z.unknown() }).strict()
const resultSchema = z.object({ schemaVersion: z.literal("bat.native-action-result/v1"), actionRef: z.string(),
  resultRef: reference, receivedFromToolsAct: z.boolean(), result: z.record(z.string(), z.unknown()) }).strict()

/** WHY：内部停止事实独立于旧 dispatch/v3；只有真实已结束 cause 及未进入 act 的尾部可排除。 */
export function nativeSequenceStopCoverage(trace: Trace, action: Action, assertFact: AssertFact) {
  if (action.status !== "proposed" || action.resultRef != null || action.postObservationRef !== null
    || !Number.isInteger(action.stepIndex) || Number(action.stepIndex) < 0) return null
  const located = trace.observations.flatMap((observation) => observation.facts.map((fact) => ({ fact, observation })))
  const stop = sole(located, "native_sequence_stop", action.id)
  const parsed = stopSchema.safeParse(stop?.fact.value)
  if (!stop || !parsed.success || stop.observation.id !== action.preObservationRef) return null
  const value = parsed.data
  if (value.nativeActionIndex !== action.actionIndex) return null
  const cause = trace.actions.find((item) => item.id === value.causeActionRef)
  if (!cause || cause.stepIndex !== action.stepIndex || typeof cause.actionIndex !== "number"
    || typeof action.actionIndex !== "number" || cause.actionIndex >= action.actionIndex
    || !["succeeded", "failed", "cancelled"].includes(String(cause.status))
    || !cause.resultRef || !sameReference(cause.resultRef, value.causeResultRef)) return null
  const tailDispatch = sole(located, "native_action_dispatch", action.id)
  const causeDispatch = sole(located, "native_action_dispatch", cause.id)
  const result = sole(located, "native_action_result", cause.id)
  const received = resultSchema.safeParse(result?.fact.value)
  const rejected = value.reason === "admission_rejected"
  if (!tailDispatch || !causeDispatch || !result || !received.success
    || !validDispatch(tailDispatch, action, value.nativeStepNumber, false)
    || !validDispatch(causeDispatch, cause, value.nativeStepNumber, !rejected)
    || !uniqueDispatchPosition(located, tailDispatch) || !uniqueDispatchPosition(located, causeDispatch)
    || !sameReference(received.data.resultRef, cause.resultRef)
    || received.data.receivedFromToolsAct !== !rejected
    || typeof received.data.result.is_done !== "boolean"
    || received.data.result.error != null && typeof received.data.result.error !== "string"
    || !validReason(value, cause, received.data.result, trace)) return null
  const prefix = rejected ? rejectionPrefix(trace, located, cause, value.nativeStepNumber) : { references: [], facts: [], results: [] }
  if (!prefix) return null
  for (const item of trace.actions) {
    if (item.stepIndex !== action.stepIndex || typeof item.actionIndex !== "number"
      || item.actionIndex <= cause.actionIndex) continue
    const dispatch = sole(located, "native_action_dispatch", item.id)
    if (item.status !== "proposed" || item.resultRef != null || item.postObservationRef !== null || !dispatch
      || !validDispatch(dispatch, item, value.nativeStepNumber, false)) return null
  }
  for (const entry of [stop, tailDispatch, causeDispatch, result]) assertFact(entry.fact, entry.observation.id)
  for (const entry of prefix.facts) assertFact(entry.fact, entry.observation.id)
  return { references: uniqueRefs([...stop.fact.sourceRefs, ...tailDispatch.fact.sourceRefs,
    ...causeDispatch.fact.sourceRefs, cause.resultRef, ...result.fact.sourceRefs, ...prefix.references]),
    causeResult: result, prefixResults: prefix.results }
}

export function isNativeSequenceStopExclusion(trace: Trace, action: Action, row: Row, assertFact: AssertFact) {
  if (row.disposition !== "agent_internal" || row.ownerSegmentId !== null
    || row.exclusionRule !== NATIVE_SEQUENCE_STOP_RULE) return false
  const proof = nativeSequenceStopCoverage(trace, action, assertFact)
  return Boolean(proof && sameReferences(row.evidenceRefs ?? [], proof.references))
}

export function nativeNotDispatchedReferences(trace: Trace, action: Action, assertFact: AssertFact) {
  if (action.status !== "failed" || !action.resultRef) return null
  const located = trace.observations.flatMap(observation => observation.facts.map(fact => ({ fact, observation })))
  const found = sole(located, "native_action_dispatch", action.id)
  const parsed = dispatchSchema.safeParse(found?.fact.value)
  if (!found || !parsed.success) return null
  const value = parsed.data
  const capture = z.object({ status: z.literal("not_dispatched"), eventCount: z.literal(0),
    limitations: z.tuple([]), eventExpectation: z.enum(["none", "optional", "required"]) }).passthrough()
  if (value.entered || value.resultReceived || value.nativeActionIndex !== action.actionIndex
    || !value.resultRef || !sameReference(value.resultRef, action.resultRef)
    || !capture.safeParse(value.eventCapture).success || !found.fact.sourceRefs.length
    || !uniqueDispatchPosition(located, found)) return null
  assertFact(found.fact, found.observation.id)
  return uniqueRefs([action.resultRef, ...found.fact.sourceRefs])
}

export function assertNativeSequenceStops(trace: Trace, assertFact: AssertFact,
  digestResult: (fact: Fact, observationId: string) => string) {
  for (const observation of trace.observations) for (const fact of observation.facts) {
    if (fact.kind !== "native_sequence_stop") continue
    const parsed = stopSchema.safeParse(fact.value)
    const action = parsed.success ? trace.actions.find((item) => item.id === parsed.data.actionRef) : undefined
    const proof = action ? nativeSequenceStopCoverage(trace, action, assertFact) : null
    if (!proof || !parsed.success
      || digestResult(proof.causeResult.fact, proof.causeResult.observation.id) !== parsed.data.causeResultRef.digest) {
      throw new Error("hybrid_native_sequence_stop_unproven")
    }
    for (const entry of proof.prefixResults) {
      const result = resultSchema.parse(entry.fact.value)
      if (digestResult(entry.fact, entry.observation.id) !== result.resultRef.digest) {
        throw new Error("hybrid_native_sequence_stop_prefix_unproven")
      }
    }
  }
}

function validDispatch(located: Located, action: Action, nativeStep: number, entered: boolean) {
  if (!located.fact.value || typeof located.fact.value !== "object" || Array.isArray(located.fact.value)
    || !Object.hasOwn(located.fact.value, "intentTarget")) return false
  const parsed = dispatchSchema.safeParse(located.fact.value)
  if (!parsed.success) return false
  const value = parsed.data
  if (value.nativeStepNumber !== nativeStep || value.nativeActionIndex !== action.actionIndex
    || value.actionRef !== action.id || value.actionName !== action.name || value.entered !== entered
    || value.resultReceived !== entered || !isDeepStrictEqual(value.resultRef, action.resultRef ?? null)) return false
  if (entered) return true
  const capture = z.object({ status: z.literal("not_dispatched"), eventExpectation: z.enum(["none", "optional", "required"]),
    eventCount: z.literal(0), limitations: z.array(z.unknown()).length(0) }).strict()
  return capture.safeParse(value.eventCapture).success
}

function validReason(value: z.infer<typeof stopSchema>, cause: Action, result: Record<string, unknown>, trace: Trace) {
  const proof = value.proof
  if (value.reason === "admission_rejected") {
    return typeof cause.actionIndex === "number" && isDeepStrictEqual(proof,
      { nativeResultPrefixLength: cause.actionIndex + 1 }) && Boolean(result.error)
  }
  if (value.reason === "action_error" || value.reason === "action_done") {
    return !Object.keys(proof).length && Boolean(value.reason === "action_error" ? result.error : result.is_done)
  }
  if (value.reason === "tool_terminates_sequence") {
    return isDeepStrictEqual(proof, { actionName: cause.name, terminatesSequence: true })
  }
  if (value.reason === "native_stop" || value.reason === "native_pause") {
    return isDeepStrictEqual(proof, { [value.reason === "native_stop" ? "stopped" : "paused"]: true })
  }
  if (value.reason === "done_requires_single_action") {
    return Object.keys(proof).length === 1 && typeof cause.actionIndex === "number"
      && proof.blockedActionIndex === cause.actionIndex + 1 && trace.actions.some((item) =>
        item.stepIndex === cause.stepIndex && item.actionIndex === proof.blockedActionIndex && item.name === "done")
  }
  const changed = z.object({ beforeUrlDigest: z.string().regex(/^[a-f0-9]{64}$/),
    afterUrlDigest: z.string().regex(/^[a-f0-9]{64}$/), beforeTargetId: z.string().min(1), afterTargetId: z.string().min(1) }).strict()
  const parsed = changed.safeParse(proof)
  return parsed.success && (parsed.data.beforeUrlDigest !== parsed.data.afterUrlDigest
    || parsed.data.beforeTargetId !== parsed.data.afterTargetId)
}

function sole(located: Located[], kind: string, actionRef: string) {
  const matches = located.filter(({ fact }) => fact.kind === kind && fact.value && typeof fact.value === "object"
    && !Array.isArray(fact.value) && fact.value.actionRef === actionRef)
  return matches.length === 1 ? matches[0] : undefined
}
function sameReference(left: Reference, right: Reference) { return left.ref === right.ref && left.digest === right.digest }
function rejectionPrefix(trace: Trace, located: Located[], cause: Action, nativeStep: number) {
  if (cause.status !== "failed") return null
  const references: Reference[] = [], facts: Located[] = [], results: Located[] = []
  for (const action of trace.actions) {
    if (action.stepIndex !== cause.stepIndex || typeof action.actionIndex !== "number"
      || typeof cause.actionIndex !== "number" || action.actionIndex >= cause.actionIndex) continue
    const dispatch = sole(located, "native_action_dispatch", action.id)
    const result = sole(located, "native_action_result", action.id)
    const parsed = resultSchema.safeParse(result?.fact.value)
    if (!["succeeded", "failed"].includes(String(action.status))
      || !action.resultRef || !dispatch || !result || !parsed.success || !parsed.data.receivedFromToolsAct
      || !validDispatch(dispatch, action, nativeStep, true) || !uniqueDispatchPosition(located, dispatch)
      || !sameReference(parsed.data.resultRef, action.resultRef) || parsed.data.result.error
      || parsed.data.result.is_done !== false) return null
    references.push(action.resultRef, ...dispatch.fact.sourceRefs, ...result.fact.sourceRefs)
    facts.push(dispatch, result); results.push(result)
  }
  return { references, facts, results }
}
function uniqueDispatchPosition(located: Located[], target: Located) {
  const value = dispatchSchema.parse(target.fact.value)
  return located.filter(({ fact }) => fact.kind === "native_action_dispatch" && fact.value
    && typeof fact.value === "object" && !Array.isArray(fact.value)
    && fact.value.nativeStepNumber === value.nativeStepNumber
    && fact.value.nativeActionIndex === value.nativeActionIndex).length === 1
}
function uniqueRefs(refs: Reference[]) { return [...new Map(refs.map((ref) => [`${ref.ref}\u0000${ref.digest}`, ref])).values()] }
function sameReferences(left: Reference[], right: Reference[]) {
  return left.length === right.length && left.every((ref) => right.some((other) => sameReference(ref, other)))
}
