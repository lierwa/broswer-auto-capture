import { createHash } from "node:crypto"
import { z } from "zod"
import type { JsonValue, TaskCheckpoint } from "@browser-capture/contracts"
import { checkpointBrowserReceipt } from "@browser-capture/runtime"
import { isCompleteDiscovery } from "./hybrid-discovery.js"

export const RUNTIME_SCOPE_FROM = "runtimeScopeFrom"
export const RUNTIME_SCOPE_READ_ONLY = "runtimeScopeReadOnlySameDocument"
export const RUNTIME_SCOPE_SAME_DOCUMENT = "runtimeScopeSameDocument"

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
    proofRefs?: EvidenceReference[] }>
  controlGraph: { edges: Array<{ from: string; outcome: string; to: string }> }
  coverage: Array<{ actionRef: string; disposition: string; ownerSegmentId: string | null;
    exclusionRule: string | null; evidenceRefs?: EvidenceReference[] }>
}
type AssertFact = (fact: NaturalFact, observationId: string) => void

export type RuntimeScopeDecision = Readonly<{ segmentId: string; runtimeScopeFrom?: string;
  readOnlySameDocument?: true; limitation?: string }>

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const browserOperations = new Set(["browser.workflow-step", "browser.read-fields"])

/** WHY：marker 只能来自完整源证据；这里不修改 Python 编译产物，也不推断站点语义。 */
export function classifyRuntimeScopeDecisions(input: { compilation: Compilation; trace: NaturalTrace; assertFact: AssertFact; discoveries?: ReadonlySet<string> }) {
  if (input.compilation.compilerVersion !== "bat-hybrid/2") return [] as RuntimeScopeDecision[]
  const result: RuntimeScopeDecision[] = []
  for (const segment of input.compilation.segments) {
    if (!browserOperations.has(segment.operation?.name ?? "") || !segmentScope(segment)) continue
    result.push(classifySegment(segment.id, input))
  }
  return result
}

function classifySegment(segmentId: string, input: { compilation: Compilation; trace: NaturalTrace; assertFact: AssertFact; discoveries?: ReadonlySet<string> }): RuntimeScopeDecision {
  const { compilation, trace, assertFact } = input
  const incoming = compilation.controlGraph.edges.filter((edge) => edge.to === segmentId)
  if (incoming.length !== 1 || incoming[0]!.outcome !== "success") return limited(segmentId, "runtime_scope_direct_predecessor_unproven")
  const predecessorId = browserPredecessor(incoming[0]!.from, compilation)
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
  const predecessorBoundary = boundary
  let intermediateReadOnlyDrift = false
  let failedFieldReadProbe = false
  let preparationValidationProbe = false
  let discoveryProbe = false
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
        || row.exclusionRule === "native_text_lookup_observation/v1"
        || row.exclusionRule === "dom_node_inspection_observation/v1")) {
      const discovery = isCompleteDiscovery(action, observations.get(action.postObservationRef ?? ""))
      if (discovery && !input.discoveries?.has(action.id)) return limited(segmentId, "runtime_scope_discovery_unproven")
      const next = advanceReadOnlyBoundary(boundary, action, observations, assertFact, discovery ? "discovery" : "read")
      if (!next) return limited(segmentId, "runtime_scope_read_exclusion_discontinuous")
      discoveryProbe ||= discovery
      if (!sameUrlIdentity(boundary, next, assertFact)) intermediateReadOnlyDrift = true
      boundary = next
      continue
    }
    if (row.disposition === "agent_internal"
      && row.exclusionRule === "failed_native_dom_lookup_observation/v1") {
      boundary = advanceFailedLookupBoundary(boundary, action, row, observations, assertFact)
      if (!boundary) return limited(segmentId, "runtime_scope_failed_lookup_discontinuous")
      continue
    }
    if (row.disposition === "agent_internal" && row.exclusionRule === "failed_bat_field_read_probe/v1") {
      boundary = advanceFailedFieldReadBoundary(boundary, action, row, observations, assertFact)
      if (!boundary) return limited(segmentId, "runtime_scope_failed_field_read_discontinuous")
      failedFieldReadProbe = true
      continue
    }
    if (row.disposition === "agent_internal" && row.exclusionRule === "preparation_selection_validation/v1") {
      boundary = advancePreparationValidationBoundary(boundary, action, row, observations, assertFact)
      if (!boundary) return limited(segmentId, "runtime_scope_selection_validation_discontinuous")
      preparationValidationProbe = true
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
  if (!before) return limited(segmentId, "runtime_scope_source_boundary_changed")
  const finalReadOnlyDrift = !sameUrlIdentity(boundary, before, assertFact)
  if (finalReadOnlyDrift && !sameDocumentReadBoundary(boundary, before, currentAction, assertFact)) {
    return limited(segmentId, "runtime_scope_source_boundary_changed")
  }
  if ((intermediateReadOnlyDrift || failedFieldReadProbe || preparationValidationProbe || discoveryProbe)
    && !sameDocumentIdentity(predecessorBoundary, before, assertFact)) {
    return limited(segmentId, "runtime_scope_source_boundary_changed")
  }
  // WHY：跨 URL 的中间只读刷新只授权读取；点击等动作不能借此绕过原精确页面边界。
  if (intermediateReadOnlyDrift && compilation.segments.find((item) => item.id === segmentId)?.operation?.name !== "browser.read-fields") {
    return limited(segmentId, "runtime_scope_read_only_target_required")
  }
  const readOnlySameDocument = intermediateReadOnlyDrift || finalReadOnlyDrift
  const scope = segmentScope(compilation.segments.find((item) => item.id === segmentId)!)
  const sourceDigest = urlIdentity(before, assertFact)?.urlDigest
  if (!scope?.urlDigest || scope.urlDigest !== sourceDigest) return limited(segmentId, "runtime_scope_static_scope_unproven")
  return { segmentId, runtimeScopeFrom: predecessorId, ...(readOnlySameDocument ? { readOnlySameDocument: true } : {}) }
}

function sameDocumentReadBoundary(previous: NaturalObservation, current: NaturalObservation,
  action: NaturalAction, assertFact: AssertFact) {
  if (action.name !== "find_elements" || action.effect !== "read" || action.status !== "succeeded"
    || !sameDocumentIdentity(previous, current, assertFact)) return false
  const identity = z.object({ targetId: z.string().min(1), documentDigest: hash }).strict()
  const left = soleFact(previous, "document_identity"), right = soleFact(current, "document_identity")
  if (!left || !right) return false
  const a = identity.safeParse(left.value), b = identity.safeParse(right.value)
  if (!a.success || !b.success) return false
  const matches = current.facts.filter((fact) => fact.kind === "observation_diagnostic" && isRecord(fact.value)
    && fact.value.actionRef === action.id && fact.value.phase === "before_action_read_refresh"
    && fact.value.outcome === "readonly_observation_refreshed")
  if (matches.length !== 1) return false
  const fact = matches[0]!
  assertFact(fact, current.id)
  const sample = z.object({ targetId: z.string(), documentDigest: hash, urlDigest: hash, stable: z.literal(true) }).passthrough()
  const parsed = z.object({ baseline: sample, current: sample }).passthrough().safeParse(fact.value)
  if (!parsed.success) return false
  const { baseline, current: refreshed } = parsed.data
  // WHY：只读重新观察必须有同文档因果证据；不能把样本 URL 固化，也不能授权点击跨页。
  return baseline.targetId === a.data.targetId && refreshed.targetId === b.data.targetId
    && baseline.documentDigest === a.data.documentDigest && refreshed.documentDigest === b.data.documentDigest
    && baseline.urlDigest === urlIdentity(previous, assertFact)?.urlDigest
    && refreshed.urlDigest === urlIdentity(current, assertFact)?.urlDigest
}

function sameDocumentIdentity(previous: NaturalObservation, current: NaturalObservation, assertFact: AssertFact) {
  if (!previous.tabId || previous.tabId !== current.tabId) return false
  const left = soleFact(previous, "document_identity"), right = soleFact(current, "document_identity")
  if (!left || !right) return false
  assertFact(left, previous.id); assertFact(right, current.id)
  const identity = z.object({ targetId: z.string().min(1), documentDigest: hash }).strict()
  const a = identity.safeParse(left.value), b = identity.safeParse(right.value)
  return a.success && b.success && a.data.targetId === previous.tabId
    && b.data.targetId === current.tabId && a.data.documentDigest === b.data.documentDigest
}

function browserPredecessor(initial: string, compilation: Compilation) {
  let current = initial
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    const segment = compilation.segments.find((item) => item.id === current)
    if (segment?.kind !== "function" && segment?.operation?.name !== "data.transform") return current
    // WHY：纯 JSON 计算不改变浏览器页面；来源仍由前一实际浏览器动作和原轨迹边界证明。
    const incoming = compilation.controlGraph.edges.filter((edge) => edge.to === current)
    if (incoming.length !== 1 || incoming[0]!.outcome !== "success") return current
    current = incoming[0]!.from
  }
  return current
}

function ownerAction(compilation: Compilation, segmentId: string) {
  const rows = compilation.coverage.filter((row) => row.ownerSegmentId === segmentId && row.disposition === "compiled")
  return rows.length === 1 ? rows[0]!.actionRef : null
}

function advanceReadOnlyBoundary(boundary: NaturalObservation, action: NaturalAction,
  observations: Map<string, NaturalObservation>, assertFact: AssertFact, kind: "read" | "wait" | "discovery") {
  const admitted = action.status === "succeeded" && (kind !== "wait" ? action.effect === "read"
    : action.effect === "none" && action.name === "wait")
  if (!admitted || !action.preObservationRef || !action.postObservationRef) return undefined
  const before = observations.get(action.preObservationRef), after = observations.get(action.postObservationRef)
  if (!before || !after || !(sameUrlIdentity(boundary, before, assertFact)
      || kind !== "wait" && sameDocumentReadBoundary(boundary, before, action, assertFact))
    || !sameUrlIdentity(before, after, assertFact)) return undefined
  // WHY：完整探查须先通过全局消费/回执核验，且不可用同 URL 穿透不同文档。
  if (kind === "discovery" && (!sameDocumentIdentity(boundary, before, assertFact)
    || !sameDocumentIdentity(before, after, assertFact))) return undefined
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

function advanceFailedFieldReadBoundary(boundary: NaturalObservation, action: NaturalAction,
  row: Compilation["coverage"][number], observations: Map<string, NaturalObservation>, assertFact: AssertFact) {
  if (action.name !== "bat_read_fields" || action.effect !== "read" || action.status !== "failed"
    || !action.resultRef || !action.preObservationRef || !action.postObservationRef
    || row.ownerSegmentId !== null || !sameReferenceSet(row.evidenceRefs ?? [], [action.resultRef])) return undefined
  const before = observations.get(action.preObservationRef), after = observations.get(action.postObservationRef)
  // WHY：失败字段探查不产生读取方法；仅完整证据证明未换页、未换文档时才能从控制流排除。
  if (!before || !after || !sameUrlIdentity(boundary, before, assertFact)
    || !sameUrlIdentity(before, after, assertFact) || typeof boundary.url !== "string"
    || boundary.url !== before.url || before.url !== after.url
    || !sameDocumentIdentity(boundary, before, assertFact)
    || !sameDocumentIdentity(before, after, assertFact)) return undefined
  return after
}

function advancePreparationValidationBoundary(boundary: NaturalObservation, action: NaturalAction,
  row: Compilation["coverage"][number], observations: Map<string, NaturalObservation>, assertFact: AssertFact) {
  if (action.name !== "bat_validate_selection" || action.effect !== "none"
    || (action.status !== "succeeded" && action.status !== "failed")
    || !action.resultRef || !action.preObservationRef || !action.postObservationRef
    || row.ownerSegmentId !== null || !sameReferenceSet(row.evidenceRefs ?? [], [action.resultRef])) return undefined
  const before = observations.get(action.preObservationRef), after = observations.get(action.postObservationRef)
  // WHY：仅有工具名称不足以穿透页面边界；纯计算也须有同页同文档、同 tab 的前后证据。
  if (!before || !after || !sameUrlIdentity(boundary, before, assertFact)
    || !sameUrlIdentity(before, after, assertFact) || typeof boundary.url !== "string"
    || boundary.url !== before.url || before.url !== after.url
    || !sameDocumentIdentity(boundary, before, assertFact)
    || !sameDocumentIdentity(before, after, assertFact)) return undefined
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
  documentId?: string | undefined; observationDigest: string; observedAt: string }>

/** 当前运行 scope 只存在于一个 capability 闭包内；失败会清空，实例之间不会共享。 */
export class HybridRuntimeScopeState {
  private previous: { nodeId: string; browser: HybridBrowserState } | null = null
  private resumed: { nodeId: string; browser: HybridBrowserState } | null = null
  private pendingDocument: HybridBrowserState | null = null

  async commandConfig(name: string, config: Record<string, unknown>, observe: () => Promise<HybridBrowserState>, nodeId?: string) {
    this.pendingDocument = null
    try {
      if (this.resumed && this.resumed.nodeId === nodeId && config[RUNTIME_SCOPE_FROM] !== undefined) {
        scopePredecessors(name, config)
        assertExistingScope(name, config)
        const browser = await observe()
        if (!sameBrowserPage(this.resumed.browser, browser) || !this.resumed.browser.documentId
          || this.resumed.browser.documentId !== browser.documentId) throw new Error("hybrid_runtime_scope_page_changed")
        // WHY：人工恢复授权只归当前节点；新鲜现场替换旧作用域，不能伪造一个已成功的前驱动作。
        const { [RUNTIME_SCOPE_FROM]: _marker, [RUNTIME_SCOPE_READ_ONLY]: _mode,
          [RUNTIME_SCOPE_SAME_DOCUMENT]: _document, ...plain } = config
        if (config[RUNTIME_SCOPE_SAME_DOCUMENT] === true) this.pendingDocument = browser
        return replaceScope(name, plain, { url: browser.url, urlDigest: digestRuntimeUrl(browser.url) })
      }
      return await this.resolveCommandConfig(name, config, observe)
    }
    catch (error) { this.clear(); throw error }
  }

  private async resolveCommandConfig(name: string, config: Record<string, unknown>, observe: () => Promise<HybridBrowserState>) {
    const readOnlySameDocument = config[RUNTIME_SCOPE_READ_ONLY]
    const { [RUNTIME_SCOPE_FROM]: _marker, [RUNTIME_SCOPE_READ_ONLY]: _mode,
      [RUNTIME_SCOPE_SAME_DOCUMENT]: _document, ...plain } = config
    const predecessors = scopePredecessors(name, config)
    if (!predecessors) return plain
    if (!this.previous) throw new Error("hybrid_runtime_scope_predecessor_missing")
    if (!predecessors.includes(this.previous.nodeId)) throw new Error("hybrid_runtime_scope_predecessor_mismatch")
    assertExistingScope(name, plain)
    const browser = await observe()
    const sameDocument = Boolean(this.previous.browser.documentId && browser.documentId
      && this.previous.browser.documentId === browser.documentId
      && this.previous.browser.sessionId === browser.sessionId && this.previous.browser.tabId === browser.tabId)
    if (readOnlySameDocument === true ? !sameDocument : !sameBrowserPage(this.previous.browser, browser)) {
      throw new Error("hybrid_runtime_scope_page_changed")
    }
    if (config[RUNTIME_SCOPE_SAME_DOCUMENT] === true && !sameDocument) throw new Error("hybrid_runtime_scope_document_changed")
    if (config[RUNTIME_SCOPE_SAME_DOCUMENT] === true) this.pendingDocument = browser
    return replaceScope(name, plain, { url: browser.url, urlDigest: digestRuntimeUrl(browser.url) })
  }

  succeed(nodeId: string, browser: HybridBrowserState) {
    const expected = this.pendingDocument
    // WHY：同页证明贯穿动作前后；先验正文档，再接纳成功，避免刷新同URL后覆盖原身份。
    if (expected && (!expected.documentId || expected.documentId !== browser.documentId
      || expected.sessionId !== browser.sessionId || expected.tabId !== browser.tabId)) {
      this.clear()
      throw new Error("hybrid_runtime_scope_document_changed")
    }
    this.pendingDocument = null; this.previous = { nodeId, browser }; this.resumed = null
  }
  clear() { this.previous = null; this.resumed = null; this.pendingDocument = null }

  resumeHuman(nodeId: string, browser: HybridBrowserState) { this.clear(); this.resumed = { nodeId, browser } }

  restore(checkpoint: TaskCheckpoint, browser: HybridBrowserState) {
    this.clear()
    if (checkpoint.pendingEffect || checkpoint.resumeWhen || !checkpoint.browser
      || !sameCheckpointBrowser(checkpoint.browser, browser)) return false
    const receipt = checkpointBrowserReceipt(checkpoint)
    if (!receipt || receipt.outcome !== "success") return false
    this.succeed(receipt.nodeId, browser)
    return true
  }
}

function scopePredecessors(name: string, config: Record<string, unknown>) {
  const marker = config[RUNTIME_SCOPE_FROM], mode = config[RUNTIME_SCOPE_READ_ONLY]
  if (config[RUNTIME_SCOPE_SAME_DOCUMENT] !== undefined
    && (config[RUNTIME_SCOPE_SAME_DOCUMENT] !== true || marker === undefined || !browserOperations.has(name))) {
    throw new Error("hybrid_runtime_scope_document_marker_invalid")
  }
  if (mode !== undefined && (mode !== true || name !== "browser.read-fields" || marker === undefined)) {
    throw new Error("hybrid_runtime_read_scope_invalid")
  }
  if (marker === undefined) return null
  const predecessors = typeof marker === "string" ? [marker] : marker
  if (!Array.isArray(predecessors) || predecessors.length < 1 || predecessors.length > 2
    || predecessors.some((item) => typeof item !== "string" || !item)
    || new Set(predecessors).size !== predecessors.length) throw new Error("hybrid_runtime_scope_marker_invalid")
  if (!browserOperations.has(name)) throw new Error("hybrid_runtime_scope_command_unsupported")
  return predecessors as string[]
}

function assertExistingScope(name: string, config: Record<string, unknown>) {
  const scope = name === "browser.read-fields" ? config.scope
    : isRecord(config.target) ? config.target.scope : scrollReadCondition(config)?.scope
  if (!isRecord(scope) || typeof scope.url !== "string" || !scope.url) {
    throw new Error("hybrid_runtime_scope_static_scope_missing")
  }
}

function replaceScope(name: string, config: Record<string, unknown>, scope: { url: string; urlDigest: string }) {
  if (name === "browser.read-fields") return { ...config, scope }
  if (scrollReadCondition(config)) return { ...config,
    postconditions: (config.postconditions as Record<string, unknown>[]).map((condition) =>
      condition.kind === "read_fields" ? { ...condition, scope } : condition) }
  const target = config.target as Record<string, unknown>
  const previous = isRecord(target.scope) ? target.scope.url : undefined
  const postconditions = Array.isArray(config.postconditions) ? config.postconditions.map((condition) =>
    isRecord(condition) && condition.kind === "read_fields" && condition.transition === true
      && isRecord(condition.scope) && condition.scope.url === previous ? { ...condition, scope } : condition)
    : config.postconditions
  // WHY：同页按钮的消费者读取也跟随当前运行URL；跨页消费者仍保留自己的目的地证明。
  return { ...config, target: { ...target, scope }, postconditions }
}

function scrollReadCondition(config: Record<string, unknown>) {
  if (config.actionName !== "scroll" || config.target !== null || !Array.isArray(config.postconditions)) return undefined
  const reads = config.postconditions.filter((item) => isRecord(item) && item.kind === "read_fields" && item.transition === true)
  // WHY：无元素目标的原生滚动，以已证明的消费者读取作为作用域；不虚构locator。
  return reads.length === 1 && isRecord(reads[0]) ? reads[0] : undefined
}

function sameBrowserPage(left: HybridBrowserState, right: HybridBrowserState) {
  return left.sessionId === right.sessionId && left.tabId === right.tabId && left.url === right.url
}

function sameCheckpointBrowser(left: HybridBrowserState, right: HybridBrowserState) {
  return sameBrowserPage(left, right) && left.observationDigest === right.observationDigest
    && (!left.documentId || left.documentId === right.documentId)
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
