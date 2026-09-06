import { z } from "zod"
import { taskIdSchema } from "./task.js"

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
export const researchDecisionSchema = z.object({
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
export const researchRecordSchema = z.object({
  id, taskId: taskIdSchema, version: z.number().int().positive(), requirementVersion: z.number().int().positive(), requirementRevision: z.number().int().nonnegative(),
  status: z.enum(["running", "completed", "partial", "failed", "cancelled", "manual_required", "cleanup_required", "interrupted"]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), sequence: z.number().int().nonnegative(), current: text, reason: z.string().nullable(),
  queries: z.array(z.object({ id, intent: text, url: sourceUrlSchema, at: z.string().datetime(), observationId: id.nullable() }).strict()).max(5),
  candidates: z.array(sourceCandidateSchema).max(800), observations: z.array(sourceObservationSchema).max(15), gaps: z.array(sourceGapSchema).max(100),
  coverage: researchDecisionSchema.shape.coverage,
  audits: z.array(z.object({ id, purpose: z.literal("source_research"), at: z.string().datetime(),
    model: z.string(), effort: z.string(), status: z.enum(["intended", "completed", "interrupted", "failed"]),
    invocations: z.number().int().min(0).nullable(), reportedModel: z.string().nullable(), reportedEffort: z.string().nullable(),
  }).strict()).max(16),
}).strict()
export const researchStateSchema = z.object({ taskId: taskIdSchema, taskSequence: z.number().int().nonnegative().default(0), records: z.array(researchRecordSchema),
  eligible: z.boolean(), staleIds: z.array(id), busy: z.boolean(), blocked: z.string().nullable(),
}).strict()
export const researchCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), requestId: id, requirementVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("cancel"), researchId: id }).strict(),
  z.object({ type: z.literal("interview"), researchId: id, requestId: id, expectedRevision: z.number().int().nonnegative() }).strict(),
])
export type ResearchDecision = z.infer<typeof researchDecisionSchema>
export type ResearchRecord = z.infer<typeof researchRecordSchema>
export type ResearchState = z.infer<typeof researchStateSchema>
export type SourceCandidate = z.infer<typeof sourceCandidateSchema>
export type SourceObservation = z.infer<typeof sourceObservationSchema>
