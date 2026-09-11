import { z } from "zod"
import { aiEventSchema } from "./ai.js"

const text = z.string().trim().min(1).max(2000)
const id = z.string().uuid()

export const sourceUrlSchema = z.string().url().max(4000).refine((value) => {
  const url = new URL(value)
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
    && ![...url.searchParams.keys()].some((key) => /token|password|secret|session|auth|cookie|code/i.test(key))
})

const reference = z.object({ name: text, evidence: z.string().trim().min(1).max(200) }).strict()
export const sourceAssessmentSchema = z.object({
  observationId: id, adopted: z.boolean(), access: z.enum(["normal", "manual_required", "unavailable"]), reason: text,
  fields: z.array(reference).max(80), enumeration: reference.nullable(), limitations: z.array(text).max(20),
}).strict()
export const sourceGapSchema = z.object({ description: text, observationIds: z.array(id).max(20), requiresUser: z.boolean() }).strict()
export const planEvidenceDecisionSchema = z.object({
  action: z.enum(["search", "visit", "finish"]), query: text.nullable(), candidateId: id.nullable(), reason: text,
  assessment: sourceAssessmentSchema.nullable(), gaps: z.array(sourceGapSchema).max(30),
  coverage: z.array(z.object({ objective: text, observationIds: z.array(id).min(1).max(20), reason: text }).strict()).max(40),
}).strict()
export const sourceObservationSchema = z.object({
  id, candidateId: id.nullable(), queryId: id.nullable(), url: sourceUrlSchema, title: z.string().max(300), at: z.string().datetime(),
  digest: z.string().regex(/^[a-f0-9]{64}$/), truncated: z.boolean(), assessment: sourceAssessmentSchema.nullable(),
}).strict()
export const sourceCandidateSchema = z.object({
  id, url: sourceUrlSchema, title: z.string().max(300), discoveredAt: z.string().datetime(),
  provenance: z.enum(["provided", "page_link"]), discoveredOn: id.nullable(),
  status: z.enum(["candidate", "observed", "restricted", "unavailable"]), reason: z.string().max(2000),
}).strict()
export const planEvidenceSchema = z.object({
  reusedFromPlanId: id.nullable(),
  outcome: z.enum(["pending", "completed", "partial", "failed", "cancelled", "manual_required", "cleanup_required", "interrupted"]),
  queries: z.array(z.object({ id, intent: text, url: sourceUrlSchema, at: z.string().datetime(), observationId: id.nullable() }).strict()).max(5),
  candidates: z.array(sourceCandidateSchema).max(800), observations: z.array(sourceObservationSchema).max(15),
  gaps: z.array(sourceGapSchema).max(100), coverage: planEvidenceDecisionSchema.shape.coverage,
  audits: z.array(z.object({ id, purpose: z.literal("plan_evidence"), at: z.string().datetime(),
    model: z.string(), effort: z.string(), status: z.enum(["intended", "completed", "interrupted", "failed"]),
    invocations: z.number().int().min(0).nullable(), reportedModel: z.string().nullable(), reportedEffort: z.string().nullable(),
    aiEvents: z.array(aiEventSchema).max(5000).default([]),
  }).strict()).max(16),
}).strict()

export const emptyPlanEvidence = () => planEvidenceSchema.parse({
  reusedFromPlanId: null, outcome: "pending", queries: [], candidates: [], observations: [], gaps: [], coverage: [], audits: [],
})

export type PlanEvidence = z.infer<typeof planEvidenceSchema>
export type PlanEvidenceDecision = z.infer<typeof planEvidenceDecisionSchema>
export type SourceCandidate = z.infer<typeof sourceCandidateSchema>
export type SourceObservation = z.infer<typeof sourceObservationSchema>

export function adoptedPlanSources(evidence: PlanEvidence) {
  return evidence.observations.filter((item) => !item.queryId && item.assessment?.adopted && item.assessment.access === "normal")
}
