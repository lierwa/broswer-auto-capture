import { createHash } from "node:crypto"
import { z } from "zod"
import type { JsonValue, TaskCheckpoint } from "@browser-capture/contracts"

export const RUNTIME_SCOPE_FROM = "runtimeScopeFrom"

type EvidenceReference = { ref: string; digest: string }
type NaturalFact = { id: string; kind: string; value: JsonValue; sourceRefs: EvidenceReference[] }
type NaturalObservation = { id: string; sequence?: unknown; url?: unknown; tabId?: unknown;
  sourceRefs?: EvidenceReference[]; facts: NaturalFact[] }
type NaturalAction = { id: string; name?: unknown; status?: unknown; effect?: unknown;
  actionIndex?: unknown; args?: unknown; resultRef?: EvidenceReference | null;
  preObservationRef: string | null; postObservationRef: string | null }
type NaturalTrace = { actions: NaturalAction[]; observations: NaturalObservation[] }
type Compilation = {
  compilerVersion: string
  segments: Array<{ id: string; kind: string; operation?: { name: string; actionName?: string }; target?: unknown;
    postconditions?: Array<Record<string, JsonValue>>; proofRefs?: EvidenceReference[] }>
  controlGraph: { edges: Array<{ from: string; outcome: string; to: string }> }
  coverage: Array<{ actionRef: string; disposition: string; ownerSegmentId: string | null;
    exclusionRule: string | null; evidenceRefs?: EvidenceReference[] }>
}
type AssertFact = (fact: NaturalFact, observationId: string) => void

export type RuntimeScopeDecision = Readonly<{ segmentId: string; runtimeScopeFrom?: string; limitation?: string }>

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const browserOperations = new Set(["browser.workflow-step", "browser.read-fields"])

/** WHY：marker 只能来自完整源证据；这里不修改 Python 编译产物，也不推断站点语义。 */
export function classifyRuntimeScopeDecisions(input: { compilation: Compilation; trace: NaturalTrace; assertFact: AssertFact }) {
  if (input.compilation.compilerVersion !== "bat-hybrid/2") return [] as RuntimeScopeDecision[]
  const result: RuntimeScopeDecision[] = []
  for (const segment of input.compilation.segments) {
    if (!browserOperations.has(segment.operation?.name ?? "") || !segmentScope(segment)) continue
    result.push(classifySegment(segment.id, input))
  }
  return result
}

function classifySegment(segmentId: string, input: { compilation: Compilation; trace: NaturalTrace; assertFact: AssertFact }): RuntimeScopeDecision {
  const { compilation, trace, assertFact } = input
  const incoming = compilation.controlGraph.edges.filter((edge) => edge.to === segmentId)
  if (incoming.length !== 1 || incoming[0]!.outcome !== "success") return limited(segmentId, "runtime_scope_direct_predecessor_unproven")
  const predecessorId = incoming[0]!.from
  const predecessor = compilation.segments.find((item) => item.id === predecessorId)
  if (!predecessor || predecessor.kind !== "deterministic" || !browserOperations.has(predecessor.operation?.name ?? "")) {
    return limited(segmentId, "runtime_scope_predecessor_not_browser")
  }
  const previousOwner = ownerAction(compilation, predecessorId), currentOwner = ownerAction(compilation, segmentId)
  if (!previousOwner || !currentOwner) return limited(segmentId, "runtime_scope_owner_action_unproven")
  const previousIndex = trace.actions.findIndex((action) => action.id === previousOwner)
  const currentIndex = trace.actions.findIndex((action) => action.id === currentOwner)
  if (previousIndex < 0 || currentIndex <= previousIndex) return limited(segmentId, "runtime_scope_source_order_unproven")
  const previousAction = trace.actions[previousIndex]!, currentAction = trace.actions[currentIndex]!
  if (previousAction.status !== "succeeded" || !previousAction.postObservationRef || !currentAction.preObservationRef) {
    return limited(segmentId, "runtime_scope_successful_boundary_missing")
  }
  const observations = new Map(trace.observations.map((observation) => [observation.id, observation]))
  let boundary = observations.get(previousAction.postObservationRef)
  if (!boundary) return limited(segmentId, "runtime_scope_predecessor_post_missing")
  const intermediate = trace.actions.slice(previousIndex + 1, currentIndex)
  for (const action of intermediate) {
    const row = compilation.coverage.find((item) => item.actionRef === action.id)
    if (!row) return limited(segmentId, "runtime_scope_intermediate_coverage_missing")
    if (row.disposition === "supporting" && row.ownerSegmentId === predecessorId) {
      boundary = advanceReadOnlyBoundary(boundary, action, observations, assertFact, "wait")
      if (!boundary) return limited(segmentId, "runtime_scope_supporting_wait_discontinuous")
      continue
    }
    if (row.disposition === "agent_internal"
      && (row.exclusionRule === "native_dom_lookup_observation/v1"
        || row.exclusionRule === "native_text_lookup_observation/v1")) {
      boundary = advanceReadOnlyBoundary(boundary, action, observations, assertFact, "read")
      if (!boundary) return limited(segmentId, "runtime_scope_read_exclusion_discontinuous")
      continue
    }
    if (row.disposition === "agent_internal"
      && row.exclusionRule === "failed_native_dom_lookup_observation/v1") {
      boundary = advanceFailedLookupBoundary(boundary, action, row, observations, assertFact)
      if (!boundary) return limited(segmentId, "runtime_scope_failed_lookup_discontinuous")
      continue
    }
    if (row.disposition === "agent_internal" && row.exclusionRule === "native_action_not_dispatched/v1") {
      if (!assertNotDispatched(action, trace.observations, boundary, observations, assertFact)) {
        return limited(segmentId, "runtime_scope_not_dispatched_unproven")
      }
      continue
    }
    return limited(segmentId, "runtime_scope_intermediate_action_unsafe")
  }
  const before = observations.get(currentAction.preObservationRef)
  if (!before || !sameUrlIdentity(boundary, before, assertFact)) return limited(segmentId, "runtime_scope_source_boundary_changed")
  const scope = segmentScope(compilation.segments.find((item) => item.id === segmentId)!)
  const sourceDigest = urlIdentity(before, assertFact)?.urlDigest
  if (!scope?.urlDigest || scope.urlDigest !== sourceDigest) return limited(segmentId, "runtime_scope_static_scope_unproven")
  return { segmentId, runtimeScopeFrom: predecessorId }
}

function ownerAction(compilation: Compilation, segmentId: string) {
  const rows = compilation.coverage.filter((row) => row.ownerSegmentId === segmentId && row.disposition === "compiled")
  return rows.length === 1 ? rows[0]!.actionRef : null
}

function advanceReadOnlyBoundary(boundary: NaturalObservation, action: NaturalAction,
  observations: Map<string, NaturalObservation>, assertFact: AssertFact, kind: "read" | "wait") {
  const admitted = action.status === "succeeded" && (kind === "read" ? action.effect === "read"
    : action.effect === "none" && action.name === "wait")
  if (!admitted || !action.preObservationRef || !action.postObservationRef) return undefined
  const before = observations.get(action.preObservationRef), after = observations.get(action.postObservationRef)
  if (!before || !after || !sameUrlIdentity(boundary, before, assertFact)
    || !sameUrlIdentity(before, after, assertFact)) return undefined
  return after
}

function advanceFailedLookupBoundary(boundary: NaturalObservation, action: NaturalAction,
  row: Compilation["coverage"][number], observations: Map<string, NaturalObservation>, assertFact: AssertFact) {
  if (action.name !== "find_elements" || action.effect !== "read" || action.status !== "failed"
    || !action.resultRef || !action.preObservationRef || !action.postObservationRef) return undefined
  const args = findElementsArgs(action.args)
  const before = observations.get(action.preObservationRef), after = observations.get(action.postObservationRef)
  if (!args || !before || !after || !sameUrlIdentity(boundary, before, assertFact)
    || !sameUrlIdentity(before, after, assertFact)
    || typeof before.url !== "string" || before.url !== after.url) return undefined
  const beforeUrl = soleFact(before, "url_digest"), afterUrl = soleFact(after, "url_digest")
  const queries = after.facts.filter((fact) => fact.kind === "dom_query")
  if (!beforeUrl || !afterUrl || queries.length !== 1 || !queries[0]!.sourceRefs.length) return undefined
  const fact = queries[0]!, value = fact.value
  if (!isRecord(value) || value.schemaVersion !== "bat.dom-query/v1" || value.actionRef !== action.id
    || value.complete !== false || !Array.isArray(value.limitations)
    || !value.limitations.includes("query_action_failed") || !isRecord(value.query)
    || value.query.kind !== "css" || value.query.value !== args.selector
    || value.includeText !== args.includeText || !Number.isInteger(value.maxResults)
    || Number(value.maxResults) < 1 || value.maxResults !== args.maxResults
    || !isRecord(value.scope) || value.scope.tabId !== before.tabId || value.scope.frameId !== null
    || value.scope.url !== before.url || value.scope.urlDigest !== beforeUrl.value) return undefined
  assertFact(fact, after.id)
  const required = uniqueReferences([action.resultRef, ...(before.sourceRefs ?? []), ...(after.sourceRefs ?? []),
    ...beforeUrl.sourceRefs, ...afterUrl.sourceRefs, ...fact.sourceRefs])
  if (!sameReferenceSet(row.evidenceRefs ?? [], required)) return undefined
  return after
}

function findElementsArgs(value: unknown) {
  if (!isRecord(value) || typeof value.selector !== "string" || !value.selector
    || (value.include_text !== undefined && typeof value.include_text !== "boolean")
    || (value.max_results !== undefined && !Number.isInteger(value.max_results))
    || (value.attributes !== undefined && value.attributes !== null && (!Array.isArray(value.attributes)
      || !value.attributes.every((item) => typeof item === "string")))) return null
  const allowed = new Set(["selector", "include_text", "max_results", "attributes"])
  if (Object.keys(value).some((key) => !allowed.has(key))) return null
  return { selector: value.selector, includeText: value.include_text === undefined ? true : value.include_text,
    maxResults: value.max_results === undefined ? 50 : Number(value.max_results) }
}

function assertNotDispatched(action: NaturalAction, all: NaturalObservation[], boundary: NaturalObservation,
  observations: Map<string, NaturalObservation>, assertFact: AssertFact) {
  if (action.status !== "failed") return false
  const matches = all.flatMap((observation) => observation.facts
    .filter((fact) => fact.kind === "native_action_dispatch" && isRecord(fact.value)
      && fact.value.actionRef === action.id && fact.value.entered === false)
    .map((fact) => ({ observation, fact })))
  if (matches.length !== 1) return false
  assertFact(matches[0]!.fact, matches[0]!.observation.id)
  const before = action.preObservationRef ? observations.get(action.preObservationRef) : boundary
  if (!before || !sameUrlIdentity(boundary, before, assertFact)) return false
  if (!action.postObservationRef) return true
  const after = observations.get(action.postObservationRef)
  return Boolean(after && sameUrlIdentity(before, after, assertFact))
}

function soleFact(observation: NaturalObservation, kind: string) {
  const facts = observation.facts.filter((fact) => fact.kind === kind)
  return facts.length === 1 ? facts[0] : undefined
}

function hasProofRefs(haystack: EvidenceReference[], needles: Array<EvidenceReference | null | undefined>) {
  return needles.every((needle) => Boolean(needle && haystack.some((item) => sameReference(item, needle))))
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

function segmentScope(segment: Compilation["segments"][number]) {
  if (!segment.target || typeof segment.target !== "object" || Array.isArray(segment.target)) return null
  const scope = (segment.target as Record<string, unknown>).scope
  if (!isRecord(scope) || typeof scope.url !== "string") return null
  return { url: scope.url, ...(typeof scope.urlDigest === "string" ? { urlDigest: scope.urlDigest } : {}) }
}

function sameUrlIdentity(left: NaturalObservation, right: NaturalObservation, assertFact: AssertFact) {
  const a = urlIdentity(left, assertFact), b = urlIdentity(right, assertFact)
  return Boolean(a && b && a.tabId === b.tabId && a.urlDigest === b.urlDigest)
}

function urlIdentity(observation: NaturalObservation, assertFact: AssertFact) {
  if (typeof observation.tabId !== "string" || !observation.tabId) return null
  const facts = observation.facts.filter((fact) => fact.kind === "url_digest")
  if (facts.length !== 1) return null
  assertFact(facts[0]!, observation.id)
  const parsed = hash.safeParse(facts[0]!.value)
  return parsed.success ? { tabId: observation.tabId, urlDigest: parsed.data } : null
}

function limited(segmentId: string, limitation: string): RuntimeScopeDecision { return { segmentId, limitation } }
function isRecord(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export type HybridBrowserState = Readonly<{ sessionId: string; tabId: string; url: string;
  observationDigest: string; observedAt: string }>

/** 当前运行 scope 只存在于一个 capability 闭包内；失败会清空，实例之间不会共享。 */
export class HybridRuntimeScopeState {
  private previous: { nodeId: string; browser: HybridBrowserState } | null = null

  async commandConfig(name: string, config: Record<string, unknown>, observe: () => Promise<HybridBrowserState>) {
    try { return await this.resolveCommandConfig(name, config, observe) }
    catch (error) { this.clear(); throw error }
  }

  private async resolveCommandConfig(name: string, config: Record<string, unknown>, observe: () => Promise<HybridBrowserState>) {
    const marker = config[RUNTIME_SCOPE_FROM]
    const { [RUNTIME_SCOPE_FROM]: _marker, ...plain } = config
    if (marker === undefined) return plain
    if (typeof marker !== "string" || !marker) throw new Error("hybrid_runtime_scope_marker_invalid")
    if (!browserOperations.has(name)) throw new Error("hybrid_runtime_scope_command_unsupported")
    if (!this.previous) throw new Error("hybrid_runtime_scope_predecessor_missing")
    if (this.previous.nodeId !== marker) throw new Error("hybrid_runtime_scope_predecessor_mismatch")
    assertExistingScope(name, plain)
    const browser = await observe()
    if (!sameBrowserPage(this.previous.browser, browser)) throw new Error("hybrid_runtime_scope_page_changed")
    return replaceScope(name, plain, { url: browser.url, urlDigest: digestRuntimeUrl(browser.url) })
  }

  succeed(nodeId: string, browser: HybridBrowserState) { this.previous = { nodeId, browser } }
  clear() { this.previous = null }

  restore(checkpoint: TaskCheckpoint, browser: HybridBrowserState) {
    this.clear()
    if (checkpoint.pendingEffect || checkpoint.resumeWhen || !checkpoint.browser
      || !sameCheckpointBrowser(checkpoint.browser, browser)) return false
    const last = checkpoint.events.at(-1)
    if (!last || last.status !== "finished" || last.outcome !== "success") return false
    this.succeed(last.nodeId, browser)
    return true
  }
}

function assertExistingScope(name: string, config: Record<string, unknown>) {
  const scope = name === "browser.read-fields" ? config.scope
    : isRecord(config.target) ? config.target.scope : undefined
  if (!isRecord(scope) || typeof scope.url !== "string" || !scope.url) {
    throw new Error("hybrid_runtime_scope_static_scope_missing")
  }
}

function replaceScope(name: string, config: Record<string, unknown>, scope: { url: string; urlDigest: string }) {
  if (name === "browser.read-fields") return { ...config, scope }
  const target = config.target as Record<string, unknown>
  return { ...config, target: { ...target, scope } }
}

function sameBrowserPage(left: HybridBrowserState, right: HybridBrowserState) {
  return left.sessionId === right.sessionId && left.tabId === right.tabId && left.url === right.url
}

function sameCheckpointBrowser(left: HybridBrowserState, right: HybridBrowserState) {
  return sameBrowserPage(left, right) && left.observationDigest === right.observationDigest
}

export function digestRuntimeUrl(url: string) {
  return createHash("sha256").update(JSON.stringify(url)).digest("hex")
}

export async function withinHybridSignal<R>(signal: AbortSignal, owner: AbortController,
  operation: () => Promise<R>): Promise<R> {
  signal.throwIfAborted()
  const cancel = () => owner.abort(signal.reason)
  signal.addEventListener("abort", cancel, { once: true })
  try { const result = await operation(); signal.throwIfAborted(); return result }
  finally { signal.removeEventListener("abort", cancel) }
}
