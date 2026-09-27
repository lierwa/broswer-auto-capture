import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import type { HybridCompilation, HybridSegment, hybridNaturalRequestSchema } from "./hybrid-schema.js"
import { digestNaturalPayload } from "./hybrid-natural-payload.js"

type Request = z.infer<typeof hybridNaturalRequestSchema>
type Fact = Request["trace"]["observations"][number]["facts"][number]
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const identity = z.object({ sessionId: z.string().min(1), tabId: z.string().min(1), url: z.string().url() }).strict()
const params = z.object({ reason: z.enum(["login", "captcha", "confirmation", "access"]),
  prompt: z.string().min(1).max(500), resumeUrl: z.string().url().max(2048) }).strict()
const proofSchema = z.object({ schemaVersion: z.literal("bat.human-resume/v1"),
  actionRef: z.string().min(1), waitpointId: z.uuid(), params, argsDigest: hash,
  before: identity, after: identity, resumed: z.literal(true), resultDigest: hash }).strict()
const resultReference = z.object({ ref: z.string().min(1), digest: hash }).strict()

/** WHY：人工步骤必须来自原准备进程核验过的现场；模型声明或拼装一个 human operation 不构成来源证据。 */
export function assertNaturalHumanSegment(segment: HybridSegment, request: Request, compilation: HybridCompilation,
  assertFact: (fact: Fact, observationId: string) => void) {
  if (segment.kind !== "deterministic" || segment.operation.name !== "browser.wait-for-human") {
    throw new Error("hybrid_human_segment_invalid")
  }
  const rows = compilation.coverage.filter((row) => row.ownerSegmentId === segment.id)
  const action = rows.length === 1 && rows[0]!.disposition === "compiled"
    ? request.trace.actions.find((item) => item.id === rows[0]!.actionRef) : undefined
  const pre = request.trace.observations.find((item) => item.id === action?.preObservationRef)
  const post = request.trace.observations.find((item) => item.id === action?.postObservationRef)
  if (!action || action.name !== "bat_request_human" || action.status !== "succeeded" || action.effect !== "read"
    || !pre || !post || segment.target !== null || segment.bindings.length || segment.outputs.length
    || segment.expectedEffect.kind !== "read") throw new Error("hybrid_human_source_invalid")
  const facts = post.facts.filter((fact) => fact.kind === "verified_human_resume"
    && fact.value && typeof fact.value === "object" && !Array.isArray(fact.value) && fact.value.actionRef === action.id)
  if (facts.length !== 1) throw new Error("hybrid_human_resume_evidence_missing")
  const fact = facts[0]!, proof = proofSchema.parse(fact.value), result = resultReference.parse(action.resultRef)
  assertFact(fact, post.id)
  if (!isDeepStrictEqual(proof.params, action.args)
    || digestNaturalPayload(JSON.stringify(proof.params)) !== proof.argsDigest
    || proof.resultDigest !== result.digest || proof.before.sessionId !== proof.after.sessionId
    || proof.before.tabId !== proof.after.tabId || proof.before.tabId !== pre.tabId || proof.after.tabId !== post.tabId
    || proof.before.url !== pre.url || proof.after.url !== post.url || proof.after.url !== proof.params.resumeUrl) {
    throw new Error("hybrid_human_resume_evidence_mismatch")
  }
  const human = { reason: proof.params.reason === "access" ? "access_restriction" as const : proof.params.reason,
    prompt: proof.params.prompt, resumeWhen: { operator: "equals" as const, path: ["url"],
      expected: { source: "constant" as const, value: proof.params.resumeUrl } } }
  const conditions = [{ kind: "url", equals: proof.params.resumeUrl, clauseRef: fact.id }]
  const required = [result, ...fact.sourceRefs]
  if (!isDeepStrictEqual(segment.operation.human, human) || !isDeepStrictEqual(segment.postconditions, conditions)
    || required.some((ref) => !segment.proofRefs.some((item) => item.ref === ref.ref && item.digest === ref.digest))) {
    throw new Error("hybrid_human_contract_mismatch")
  }
  return human
}
