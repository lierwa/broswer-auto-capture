import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema } from "@browser-capture/contracts"
import { hybridNaturalRequestSchema, hybridTargetSchema, type HybridCompilation } from "./hybrid-schema.js"

type NaturalRequest = z.infer<typeof hybridNaturalRequestSchema>
type NaturalFact = NaturalRequest["trace"]["observations"][number]["facts"][number]
type NaturalCompilation = Extract<HybridCompilation, { compilerVersion: "bat-hybrid/2" }>
type AssertFact = (fact: NaturalFact, observationId: string) => void

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const reference = z.object({ ref: z.string().min(1), digest: hash }).strict()
const overlayFact = z.object({ kind: z.literal("visible_overlays"), value: hash,
  sourceRefs: z.array(reference).min(1) }).passthrough()
const dispatchFact = z.object({ kind: z.literal("native_action_dispatch"), value: z.object({
  actionRef: z.string(), actionName: z.literal("click"), entered: z.literal(true), resultReceived: z.literal(true),
  eventCapture: z.object({ eventCount: z.literal(1) }).passthrough(),
}).passthrough(), sourceRefs: z.array(reference).min(1) }).passthrough()
const structureFact = z.object({ kind: z.literal("dom_structure"), value: z.object({
  actionRef: z.string(), targetRef: z.string(), scope: z.object({
    urlDigest: hash, tabId: z.string().min(1), targetId: z.string().min(1), document: z.object({
      rootBackendNodeId: z.number().int().positive(),
    }).passthrough(),
  }).passthrough(),
  nodes: z.array(z.object({ id: z.string(), parentRef: z.string().nullable(),
    attributes: z.record(z.string(), jsonValueSchema) }).passthrough()).min(1),
}).passthrough(), sourceRefs: z.array(reference).min(1) }).passthrough()

export type NaturalPreparation = {
  preparation: { id: string; actionSegmentId: string; consumerSegmentId: string;
    proofRefs: Array<{ ref: string; digest: string }> }
  evidence: Array<Record<string, unknown>>
  consumer: { actionName: string; target: z.infer<typeof hybridTargetSchema> }
}

/** WHY：准备图只能由原始事实推出；模型没有“可选动作”声明权，站点文案/class 也不能成为平台规则。 */
export function detectNaturalPreparations(input: { compilation: NaturalCompilation; request: NaturalRequest;
  assertFact: AssertFact }): NaturalPreparation[] {
  const observations = new Map(input.request.trace.observations.map((item) => [item.id, item]))
  const actions = new Map(input.request.trace.actions.map((item) => [item.id, item]))
  const actionForSegment = new Map(input.compilation.coverage.flatMap((row) =>
    row.ownerSegmentId && row.disposition === "compiled" ? [[row.ownerSegmentId, row.actionRef] as const] : []))
  const segments = new Map(input.compilation.segments.map((item) => [item.id, item]))
  const found: NaturalPreparation[] = []
  for (const edge of input.compilation.controlGraph.edges) {
    if (edge.outcome !== "success") continue
    const actionSegment = segments.get(edge.from), consumerSegment = segments.get(edge.to)
    if (!actionSegment || actionSegment.kind !== "deterministic"
      || actionSegment.operation.name !== "browser.workflow-step" || actionSegment.operation.actionName !== "click"
      || !actionSegment.target || !consumerSegment || consumerSegment.kind !== "deterministic"
      || consumerSegment.operation.name !== "browser.workflow-step" || !consumerSegment.target) continue
    const actionRef = actionForSegment.get(actionSegment.id), consumerRef = actionForSegment.get(consumerSegment.id)
    const action = actionRef ? actions.get(actionRef) : null, consumer = consumerRef ? actions.get(consumerRef) : null
    if (!action || !consumer || action.name !== "click" || !action.preObservationRef || !action.postObservationRef
      || !consumer.preObservationRef) continue
    const before = observations.get(action.preObservationRef), after = observations.get(action.postObservationRef)
    const ready = observations.get(consumer.preObservationRef)
    if (!before || !after || !ready) continue
    const facts = preparationFacts(before.facts, after.facts, ready.facts, actionRef!, consumerRef!)
    if (!facts || !samePreparedDocument(facts.actionStructure.value.scope, facts.consumerStructure.value.scope)
      || !hasDialogAncestor(facts.actionStructure.value) || hasDialogAncestor(facts.consumerStructure.value)
      || facts.beforeOverlay.value === facts.afterOverlay.value
      || facts.afterOverlay.value !== facts.consumerOverlay.value) continue
    for (const [fact, observationId] of [
      [facts.actionStructure, before.id], [facts.beforeOverlay, before.id], [facts.dispatch, before.id],
      [facts.afterOverlay, after.id], [facts.consumerOverlay, ready.id], [facts.consumerStructure, ready.id],
    ] as const) input.assertFact(fact as NaturalFact, observationId)
    const proofRefs = uniqueReferences([facts.actionStructure, facts.beforeOverlay, facts.dispatch,
      facts.afterOverlay, facts.consumerOverlay, facts.consumerStructure])
    const documentId = `${facts.consumerStructure.value.scope.targetId}:${facts.consumerStructure.value.scope.document.rootBackendNodeId}`
    found.push({ preparation: { id: `optional-${actionRef}`, actionSegmentId: actionSegment.id,
      consumerSegmentId: consumerSegment.id, proofRefs }, evidence: [
      { phase: "before", ...referenceOf(facts.actionStructure), documentId, status: "blocked" },
      { phase: "dispatch", ...referenceOf(facts.dispatch), documentId, dispatches: 1 },
      { phase: "after", ...referenceOf(facts.consumerStructure), documentId, status: "ready", unique: true },
    ], consumer: { actionName: consumerSegment.operation.actionName, target: consumerSegment.target } })
  }
  const identities = found.flatMap((item) => [item.preparation.actionSegmentId, item.preparation.consumerSegmentId])
  if (new Set(identities).size !== identities.length) throw new Error("optional_preparation_overlap")
  return found
}

function preparationFacts(before: NaturalFact[], after: NaturalFact[], ready: NaturalFact[],
  actionRef: string, consumerRef: string) {
  const actionStructure = one(before, "dom_structure", structureFact, (item) => item.value.actionRef === actionRef)
  const consumerStructure = one(ready, "dom_structure", structureFact, (item) => item.value.actionRef === consumerRef)
  const beforeOverlay = one(before, "visible_overlays", overlayFact)
  const afterOverlay = one(after, "visible_overlays", overlayFact)
  const consumerOverlay = one(ready, "visible_overlays", overlayFact)
  const dispatch = one(before, "native_action_dispatch", dispatchFact, (item) => item.value.actionRef === actionRef)
  return actionStructure && consumerStructure && beforeOverlay && afterOverlay && consumerOverlay && dispatch
    ? { actionStructure, consumerStructure, beforeOverlay, afterOverlay, consumerOverlay, dispatch } : null
}

function one<T extends z.ZodTypeAny>(facts: NaturalFact[], kind: string, schema: T,
  predicate: (value: z.infer<T>) => boolean = () => true): z.infer<T> | null {
  const matches = facts.filter((fact) => fact.kind === kind).map((fact) => schema.safeParse(fact))
    .filter((result): result is z.ZodSafeParseSuccess<z.infer<T>> => result.success).map((result) => result.data)
    .filter(predicate)
  return matches.length === 1 ? matches[0]! : null
}

function hasDialogAncestor(structure: z.infer<typeof structureFact>["value"]) {
  const nodes = new Map(structure.nodes.map((item) => [item.id, item]))
  const visited = new Set<string>()
  let current = nodes.get(structure.targetRef)
  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    if (current.attributes.role === "dialog") return true
    current = current.parentRef ? nodes.get(current.parentRef) : undefined
  }
  return false
}

function samePreparedDocument(left: z.infer<typeof structureFact>["value"]["scope"],
  right: z.infer<typeof structureFact>["value"]["scope"]) {
  return isDeepStrictEqual({ urlDigest: left.urlDigest, tabId: left.tabId, targetId: left.targetId,
    rootBackendNodeId: left.document.rootBackendNodeId }, { urlDigest: right.urlDigest, tabId: right.tabId,
    targetId: right.targetId, rootBackendNodeId: right.document.rootBackendNodeId })
}

function referenceOf(fact: { sourceRefs: Array<{ ref: string; digest: string }> }) { return fact.sourceRefs[0]! }
function uniqueReferences(facts: Array<{ sourceRefs: Array<{ ref: string; digest: string }> }>) {
  const references = facts.flatMap((fact) => fact.sourceRefs)
  return references.filter((item, index) => references.findIndex((other) => isDeepStrictEqual(item, other)) === index)
}
