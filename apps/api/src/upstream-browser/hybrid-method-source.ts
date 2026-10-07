import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { functionDraftSchema, hybridNaturalRequestSchema, type HybridCompilation } from "./hybrid-schema.js"
import type { naturalPayloadContext } from "./hybrid-natural-payload.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
type Action = Request["trace"]["actions"][number]
type AssertFact = ReturnType<typeof naturalPayloadContext>["assertFact"]
const proposedAction = z.object({ navigate: z.object({ url: z.string().url() }).strict() }).strict()
const method = z.object({ actionRef: z.string(), readFactRef: z.string(), requirementDigest: z.string(),
  registryDigest: z.string(), action: proposedAction, dispatch: z.literal(false), intent: z.string() }).strict()
export const preparationMethodOutcomeSchema = z.enum(["recorded", "state_only", "unsupported"])
const receipt = z.object({ doneActionRef: z.string(), methodOutcome: preparationMethodOutcomeSchema,
  requirementDigest: z.string(), observedActionRefs: z.array(z.string()).max(500),
  inspectedMethodRefs: z.array(z.string()).max(500) }).strict()

export function selectionNavigationUrl(action: Action) {
  return action.name === "bat_inspect_action"
    ? z.object({ action: proposedAction }).strict().parse(action.args).action.navigate.url
    : z.object({ url: z.string() }).passthrough().parse(action.args).url
}

/** WHY：只读动作的成功仅证明检查完成；导航效果始终留给候选试运行验证。 */
export function assertInspectedMethod(request: Request, action: Action, assertFact: AssertFact) {
  if (request.compilerVersion !== "bat-hybrid/3" || action.name !== "bat_inspect_action"
    || action.status !== "succeeded" || action.effect !== "read") throw new Error("inspected_navigation_source_mismatch")
  const before = request.trace.observations.find(o => o.id === action.preObservationRef)
  const after = request.trace.observations.find(o => o.id === action.postObservationRef)
  const matches = before?.facts.filter(f => f.kind === "inspected_method"
    && method.safeParse(f.value).data?.actionRef === action.id) ?? []
  if (!before || !after || matches.length !== 1) throw new Error("inspected_navigation_evidence_required")
  const fact = matches[0]!, value = method.parse(fact.value)
  assertFact(fact, before.id)
  if (value.requirementDigest !== request.requirement.sourceDigest || value.registryDigest !== request.actionRegistryVersion
    || value.action.navigate.url !== selectionNavigationUrl(action)) throw new Error("inspected_navigation_source_mismatch")
  assertSameDocument(before, after)
  const prior = request.trace.observations.slice(0, request.trace.observations.indexOf(before)).toReversed()
  const owner = prior.find(o => o.facts.some(f => f.kind === "dom_query"))
  if (!owner) throw new Error("inspected_navigation_current_read_required")
  for (const observation of prior.slice(0, prior.indexOf(owner) + 1)) assertSameDocument(observation, before)
  const queries = owner.facts.filter(f => f.kind === "dom_query")
  const reads = owner.facts.filter(f => f.kind === "verified_natural_read" && f.id === value.readFactRef)
  const query = z.object({ actionRef: z.string(), complete: z.literal(true), truncated: z.literal(false) })
    .passthrough().parse(queries[0]?.value)
  const read = z.object({ actionRef: z.string(), stable: z.literal(true), targetId: z.string(),
    output: z.array(z.object({ attribute_href: z.string().nullable().optional() }).passthrough()) }).passthrough().parse(reads[0]?.value)
  if (queries.length !== 1 || reads.length !== 1 || query.actionRef !== read.actionRef || read.targetId !== before.tabId
    || !read.output.some(row => row.attribute_href === value.action.navigate.url)) {
    throw new Error("inspected_navigation_current_read_required")
  }
  assertFact(queries[0]!, owner.id); assertFact(reads[0]!, owner.id)
  return { fact, value }
}

function assertSameDocument(left: Request["trace"]["observations"][number], right: typeof left) {
  const documents = (o: typeof left) => o.facts.filter(f => f.kind === "document_identity")
  const a = documents(left), b = documents(right)
  if (!left.tabId || !left.url || left.tabId !== right.tabId || left.url !== right.url
    || a.length !== 1 || b.length !== 1 || !isDeepStrictEqual(a[0]!.value, b[0]!.value)) {
    throw new Error("inspected_navigation_document_changed")
  }
}

export function assertPreparationMethod(request: Request, compilation: HybridCompilation, assertFact: AssertFact) {
  if (request.compilerVersion !== "bat-hybrid/3") return
  const done = request.trace.actions.at(-1), args = z.object({ methodOutcome: receipt.shape.methodOutcome })
    .passthrough().safeParse(done?.args)
  const matches = request.trace.observations.flatMap(o => o.facts.filter(f => f.kind === "preparation_method_receipt")
    .map(f => ({ o, f })))
  if (!request.trace.completed || done?.name !== "done" || done.status !== "succeeded" || !args.success
    || matches.length !== 1 || matches[0]!.o.id !== done.postObservationRef) throw new Error("preparation_method_receipt_required")
  const { o, f } = matches[0]!, value = receipt.parse(f.value)
  assertFact(f, o.id)
  const expected = { doneActionRef: done.id, methodOutcome: args.data.methodOutcome,
    requirementDigest: request.requirement.sourceDigest,
    observedActionRefs: request.trace.actions.filter(a => a.status === "succeeded"
      && a.name !== "done" && a.name !== "bat_inspect_action").map(a => a.id),
    inspectedMethodRefs: request.trace.actions.filter(a => a.status === "succeeded" && a.name === "bat_inspect_action").map(a => a.id) }
  if (!isDeepStrictEqual(value, expected) || value.methodOutcome !== "recorded"
    || !value.observedActionRefs.length && !value.inspectedMethodRefs.length) throw new Error("preparation_reusable_method_required")
  for (const action of request.trace.actions.filter(a => a.name === "bat_inspect_action" && a.status === "succeeded")) {
    const method = assertInspectedMethod(request, action, assertFact)
    let segment = compilation.segments.find(s => s.id === `s-${action.id}`)
    if (!segment) segment = coalescedSegment(request, compilation, action, method.value.readFactRef, assertFact)
    else {
      const following = request.trace.actions.slice(request.trace.actions.indexOf(action) + 1)
      if (following.some(a => !["wait", "done"].includes(String(a.name)))) throw new Error("inspected_navigation_continuation_unsupported")
    }
    if (segment.kind !== "deterministic" || segment.operation.name !== "browser.workflow-step"
      || segment.operation.actionName !== "navigate" || segment.target !== null
      || !segment.postconditions.some(p => p.kind === "url" && p.bindingArgument === "url")) {
      throw new Error("inspected_navigation_postcondition_required")
    }
    assertRequiredOnCompletion(compilation, segment.id)
  }
}

function coalescedSegment(request: Request, compilation: HybridCompilation, inspected: Action,
  readFactRef: string, assertFact: AssertFact) {
  const trace = request.trace, actual = trace.actions[trace.actions.indexOf(inspected) + 1]
  const segment = compilation.segments.find(s => s.id === `s-${actual?.id}`)
  const row = compilation.coverage.find(r => r.actionRef === inspected.id)
  if (!actual || actual.name !== "navigate" || actual.status !== "succeeded" || !segment
    || selectionNavigationUrl(actual) !== selectionNavigationUrl(inspected)
    || row?.exclusionRule !== "coalesced_method_inspection/v1" || row.disposition !== "agent_internal"
    || !compilation.coverage.some(r => r.actionRef === actual.id && r.disposition === "compiled" && r.ownerSegmentId === segment.id)) {
    throw new Error("inspected_navigation_source_mismatch")
  }
  const before = trace.observations.find(o => o.id === inspected.preObservationRef)!
  const next = trace.observations.find(o => o.id === actual.preObservationRef)
  if (!next) throw new Error("inspected_navigation_source_mismatch")
  assertSameDocument(before, next)
  const facts = before.facts.filter(f => f.kind === "selection_function" && f.id === `selection-${inspected.id}`)
  const source = z.object({ methodRef: z.literal(inspected.id), readFactRef: z.literal(readFactRef),
    requirementDigest: z.literal(request.requirement.sourceDigest), draft: functionDraftSchema }).strict().parse(facts[0]?.value)
  const fn = compilation.segments.find(s => s.id === `selection-${actual.id}`)
  if (facts.length !== 1 || fn?.kind !== "function" || !isDeepStrictEqual(fn.draft, source.draft)
    || segment.kind !== "deterministic" || !segment.bindings.some(b => "derivation" in b
      && b.derivation === "selection_function" && b.argumentPath === "url" && b.sourceRef === fn.id
      && "binding" in b && isDeepStrictEqual(b.binding, { source: "node", nodeId: fn.id, path: [] }))) {
    throw new Error("inspected_navigation_source_mismatch")
  }
  assertFact(facts[0]!, before.id)
  return segment
}

function assertRequiredOnCompletion(compilation: HybridCompilation, required: string) {
  // WHY：每条成功路径都必须经过待试导航；复用既有 sample/verification 与节点后置条件，无全局 judge。
  const visited = new Set<string>(), queue = [compilation.controlGraph.entry]
  while (queue.length) {
    const id = queue.pop()!
    if (id === required || visited.has(id)) continue
    visited.add(id)
    if (compilation.controlGraph.terminals.some(t => t.id === id && t.status === "completed")) {
      throw new Error("inspected_navigation_trial_bypass")
    }
    queue.push(...compilation.controlGraph.edges.filter(e => e.from === id).map(e => e.to))
  }
}
