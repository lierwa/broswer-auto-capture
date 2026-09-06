import { z } from "zod"
import { taskIdSchema } from "./task.js"
import { requirementBriefSchema } from "./requirementBrief.js"
import { sourceObservationSchema } from "./research.js"

const id = z.string().uuid(), text = z.string().trim().min(1).max(10000), index = z.number().int().nonnegative()
export const planBudgetSchema = z.object({ maxCommands: z.number().int().min(1).max(500), timeoutMs: z.number().int().min(1000).max(300000), maxModelCalls: z.number().int().min(0).max(12) }).strict()
const stepId = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/)
export const planProposalSchema = z.object({
  summary: text,
  steps: z.array(z.object({ id: stepId, title: text, goal: text, kind: z.enum(["enumerate", "collect", "derive"]),
    sourceIds: z.array(id).max(15), dependsOn: z.array(stepId).max(40), input: text, output: text,
    termination: text, budget: planBudgetSchema, risks: z.array(text).max(20),
  }).strict()).min(1).max(40),
  fields: z.array(z.object({ deliverable: index, field: index, stepId, mode: z.enum(["observed", "derived", "missing"]),
    sourceIds: z.array(id).max(15), ruleIndex: index.nullable(), explanation: text,
  }).strict()).max(800),
  objectives: z.array(z.object({ objective: text, sourceIds: z.array(id).min(1).max(15), stepIds: z.array(stepId).min(1).max(40), explanation: text }).strict()).max(40),
  gaps: z.array(z.object({ gapIndex: index, disposition: z.enum(["execution", "derived", "blocking"]), stepIds: z.array(stepId).max(40), explanation: text }).strict()).max(100),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>()
  for (const step of value.steps) {
    if (seen.has(step.id) || step.dependsOn.some((dep) => !seen.has(dep))) ctx.addIssue({ code: "custom", message: "步骤必须唯一且按依赖拓扑排序" })
    if (step.kind !== "derive" && !step.sourceIds.length) ctx.addIssue({ code: "custom", message: "浏览器步骤必须绑定来源" })
    seen.add(step.id)
  }
  for (const key of ["maxCommands", "timeoutMs", "maxModelCalls"] as const) {
    if (value.steps.reduce((sum, step) => sum + step.budget[key], 0) > ({ maxCommands: 500, timeoutMs: 300000, maxModelCalls: 12 })[key]) ctx.addIssue({ code: "custom", message: "步骤预算合计超出单次授权边界" })
  }
})
export const planRecordSchema = z.object({
  id, taskId: taskIdSchema, version: z.number().int().positive(), requirementVersion: z.number().int().positive(), requirementRevision: index,
  sourceId: id, sourceVersion: z.number().int().positive(), sourceDigest: z.string().length(64),
  requirement: requirementBriefSchema, sources: z.array(sourceObservationSchema).max(15), sourceGaps: z.array(text).max(100),
  status: z.enum(["generating", "ready", "blocked", "failed", "cancelled", "interrupted"]), sequence: index,
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), reason: text.nullable(),
  proposal: planProposalSchema.nullable(), digest: z.string().length(64).nullable(),
  audit: z.object({ purpose: z.literal("plan_creation"), model: text, effort: text, invocations: index.nullable(),
    status: z.enum(["intended", "completed", "failed", "interrupted"]), reportedModel: z.string().nullable(), reportedEffort: z.string().nullable(),
  }).strict(),
}).strict()
export const executionRecordSchema = z.object({
  id, taskId: taskIdSchema, planId: id, planVersion: z.number().int().positive(), planDigest: z.string().length(64),
  requirementVersion: z.number().int().positive(), requirementRevision: index, sourceId: id, sourceVersion: z.number().int().positive(),
  authorizedAt: z.string().datetime(), requestId: id, budget: planBudgetSchema,
  status: z.enum(["queued", "running", "awaiting_next_stage", "interrupted", "cancelled", "stale", "failed", "manual_required", "cleanup_required"]),
  sequence: index, updatedAt: z.string().datetime(), reason: text,
}).strict()
export const planStateSchema = z.object({ taskId: taskIdSchema, taskSequence: index, sequence: index,
  records: z.array(planRecordSchema), executions: z.array(executionRecordSchema), staleIds: z.array(id), eligible: z.boolean(), blocked: z.string().nullable(),
  source: z.object({ id, version: z.number().int().positive(), requirementVersion: z.number().int().positive() }).nullable(),
  generating: z.boolean(), browserOwner: z.object({ taskId: taskIdSchema, title: text }).nullable(), executorAvailable: z.boolean(),
}).strict()
export const planCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("generate"), requestId: id, requirementVersion: z.number().int().positive(), sourceId: id, sourceVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("cancel_generation"), planId: id }).strict(),
  z.object({ type: z.literal("start"), requestId: id, planId: id, planDigest: z.string().length(64) }).strict(),
  z.object({ type: z.literal("cancel_execution"), executionId: id }).strict(),
])
export type PlanProposal = z.infer<typeof planProposalSchema>
export type PlanRecord = z.infer<typeof planRecordSchema>
export type PlanState = z.infer<typeof planStateSchema>
export type ExecutionRecord = z.infer<typeof executionRecordSchema>
export type PlanCommand = z.infer<typeof planCommandSchema>
