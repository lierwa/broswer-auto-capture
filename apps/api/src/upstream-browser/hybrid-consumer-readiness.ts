import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { hybridNaturalRequestSchema, readSpecificationSchema, type HybridCompilation } from "./hybrid-schema.js"
import { digestNaturalPayload, type naturalPayloadContext } from "./hybrid-natural-payload.js"
import type { RuntimeScopeDecision } from "./hybrid-runtime-scope.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
type Observation = Request["trace"]["observations"][number]
type Segment = Extract<HybridCompilation["segments"][number], { kind: "deterministic" }>
type BrowserCondition = Exclude<Segment["postconditions"][number], { kind: "output_schema" }>
type Context = { request: Request; payload: ReturnType<typeof naturalPayloadContext> }
const readEvidence = z.object({ actionRef: z.string(), stable: z.literal(true), targetId: z.string(),
  urlDigest: z.string(), resultDigest: z.string(), specification: readSpecificationSchema }).passthrough()

/** WHY：动作结果 scope 仅实例化已有消费者证明；不能靠编译条件自己声明来源成立。 */
export function assertActionResultReadiness(context: Context, compilation: HybridCompilation,
  scopes: ReadonlyMap<string, RuntimeScopeDecision>) {
  for (const producer of compilation.segments) {
    if (producer.kind !== "deterministic" || producer.operation.name !== "browser.workflow-step"
      || !["click", "send_keys"].includes(producer.operation.actionName)) continue
    const urls = producer.postconditions.filter((condition): condition is BrowserCondition => condition.kind === "url" || condition.kind === "url_digest")
    const reads = producer.postconditions.filter((condition): condition is BrowserCondition => condition.kind === "read_fields" && condition.transition === true)
    if (!urls.some((condition) => condition.changed === true) || reads.length !== 1
      || urls.some((condition) => condition.equals != null || condition.bindingArgument != null)) continue
    assertReadinessSource(context, compilation, producer, reads[0]!, scopes)
  }
}

function assertReadinessSource(context: Context, compilation: HybridCompilation, producer: Segment,
  condition: BrowserCondition, scopes: ReadonlyMap<string, RuntimeScopeDecision>) {
  const consumer = compilation.segments.find((segment) => segment.id === condition.consumerRef)
  if (!consumer || consumer.kind !== "deterministic" || consumer.operation.name !== "browser.read-fields"
    || !condition.read || !condition.scope || !condition.settle
    || !isDeepStrictEqual(condition.read, consumer.operation.specification)) fail("consumer_mismatch")
  const producerAction = ownerAction(context, compilation, producer.id)
  const consumerAction = ownerAction(context, compilation, consumer.id)
  if (producer.operation.name !== "browser.workflow-step" || producerAction.name !== producer.operation.actionName
    || context.request.trace.actions.indexOf(consumerAction) <= context.request.trace.actions.indexOf(producerAction)
    || scopes.get(consumer.id)?.runtimeScopeFrom !== producer.id) fail("boundary_unproven")
  const before = observation(context, consumerAction.preObservationRef)
  const after = observation(context, consumerAction.postObservationRef)
  const facts = after.facts.filter((fact) => fact.id === condition.clauseRef && fact.kind === "verified_natural_read")
  if (facts.length !== 1) fail("read_fact_missing")
  const fact = facts[0]!
  context.payload.assertFact(fact, after.id)
  const read = readEvidence.parse(fact.value)
  const resultRef = z.object({ ref: z.string().min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(consumerAction.resultRef)
  const scope = condition.scope
  if (read.actionRef !== consumerAction.id || read.resultDigest !== resultRef.digest
    || read.targetId !== before.tabId || read.targetId !== after.tabId || before.url !== after.url
    || read.urlDigest !== urlFact(context, before).value || read.urlDigest !== urlFact(context, after).value
    || scope.url !== before.url || scope.urlDigest !== read.urlDigest
    || !isDeepStrictEqual({ ...read.specification, maxInputBytes: read.specification.maxInputBytes ?? 128000 }, condition.read)
    || !consumer.outputs.some((output) => output.sourceRef === fact.id)
    || !fact.sourceRefs.length || fact.sourceRefs.some((ref) => !producer.proofRefs.some((proof) => isDeepStrictEqual(proof, ref)))) {
    fail("read_source_mismatch")
  }
  assertChangedUrl(context, producer, producerAction)
}

function ownerAction(context: Context, compilation: HybridCompilation, segmentId: string) {
  const rows = compilation.coverage.filter((row) => row.ownerSegmentId === segmentId && row.disposition === "compiled")
  const action = rows.length === 1 ? context.request.trace.actions.find((item) => item.id === rows[0]!.actionRef) : undefined
  if (!action || action.status !== "succeeded" || !action.resultRef) fail("owner_missing")
  return action
}

function assertChangedUrl(context: Context, producer: Segment, action: Request["trace"]["actions"][number]) {
  const before = observation(context, action.preObservationRef), after = observation(context, action.postObservationRef)
  const previous = urlFact(context, before), current = urlFact(context, after)
  if (before.url === after.url || previous.value === current.value) fail("url_change_unproven")
  for (const condition of producer.postconditions) {
    if ((condition.kind === "url" || condition.kind === "url_digest") && condition.changed === true
      && (condition.clauseRef !== current.id || !current.sourceRefs.length
        || current.sourceRefs.some((ref) => !producer.proofRefs.some((proof) => isDeepStrictEqual(proof, ref))))) {
      fail("url_change_source_mismatch")
    }
  }
}

function observation(context: Context, id: string | null) {
  const matches = context.request.trace.observations.filter((item) => item.id === id)
  if (matches.length !== 1) fail("observation_missing")
  return matches[0]!
}

function urlFact(context: Context, observation: Observation) {
  const facts = observation.facts.filter((fact) => fact.kind === "url_digest")
  if (facts.length !== 1 || typeof observation.url !== "string") fail("url_fact_missing")
  const fact = facts[0]!
  context.payload.assertFact(fact, observation.id)
  if (fact.value !== digestNaturalPayload(JSON.stringify(observation.url))) fail("url_fact_mismatch")
  return fact
}

function fail(reason: string): never { throw new Error(`hybrid_consumer_readiness_${reason}`) }
