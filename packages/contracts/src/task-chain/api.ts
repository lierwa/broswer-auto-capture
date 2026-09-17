import { z } from "zod"
import { aiEventSchema } from "../ai.js"
import { humanWaitpointSchema } from "../browser.js"
import { consumptionSchema, contractVersionSchema, digestSchema, identitySchema, keySchema, taskIdentitySchema, textSchema, versionReferenceSchema } from "./common.js"
import { taskChainSchema } from "./chain.js"
import { taskPlanSchema } from "./plan.js"
import { requirementReferenceSchema, taskRequirementSchema } from "./requirement.js"
import { taskRunModeSchema, taskRunSchema } from "./run.js"
import { jsonValueSchema, taskOutputSchema } from "./value.js"

export const authoringAuditSchema = z.object({
  // 旧 chain_compilation 只用于读取迁移期间已落库的终态 job；新链路生成写入完整探索与编译用途。
  purpose: z.enum(["plan_creation", "chain_compilation", "chain_exploration_and_compilation"]), model: textSchema, effort: textSchema,
  status: z.enum(["intended", "completed", "failed", "interrupted"]),
  reportedInvocations: z.number().int().nonnegative().nullable(), events: z.array(aiEventSchema),
  escalations: z.array(z.object({ model: textSchema, effort: textSchema, reason: textSchema }).strict()).default([]),
}).strict()

export const authoringProgressEventSchema = z.object({
  sequence: z.number().int().positive(),
  source: z.enum(["browser", "model"]),
  phase: z.enum(["author", "before_action", "after_step", "dispatch", "model"]),
  status: z.enum(["started", "completed", "failed", "cancelled"]),
  occurredAt: z.string().datetime(),
  actionName: textSchema.optional(), stepNumber: z.number().int().nonnegative().optional(),
  selector: z.string().min(1).max(2000).optional(),
  queryOutcome: z.enum(["matched", "no_match", "invalid_selector", "error", "unavailable"]).optional(),
  matchCount: z.number().int().nonnegative().optional(),
  contextOutcome: z.enum(["enriched", "failed"]).optional(),
  contextCount: z.number().int().nonnegative().max(20).optional(),
  outputPath: z.array(z.union([z.string().min(1).max(2000), z.number().int().nonnegative()])).max(32).optional(),
  container: z.string().min(1).max(2000).optional(),
  readOutcome: z.enum(["succeeded", "failed", "unavailable"]).optional(),
  readError: z.string().min(1).max(2000).optional(),
  callId: identitySchema.optional(), purpose: z.enum(["agent", "judge", "extract", "semantic_annotation"]).optional(),
}).strict().superRefine((event, context) => {
  if ((event.actionName === undefined) !== (event.stepNumber === undefined)) {
    context.addIssue({ code: "custom", message: "action metadata must be complete" })
  }
  if (event.source === "browser" && (event.phase === "model" || event.callId || event.purpose)) {
    context.addIssue({ code: "custom", message: "browser progress contains model metadata" })
  }
  if ((event.selector !== undefined || event.queryOutcome !== undefined || event.matchCount !== undefined
    || event.contextOutcome !== undefined || event.contextCount !== undefined)
    && event.actionName !== "find_elements") {
    context.addIssue({ code: "custom", message: "query metadata belongs to find_elements" })
  }
  if (event.contextCount !== undefined && event.contextOutcome !== "enriched") {
    context.addIssue({ code: "custom", message: "context count requires enriched outcome" })
  }
  if ((event.outputPath !== undefined || event.container !== undefined || event.readOutcome !== undefined
    || event.readError !== undefined) && event.actionName !== "bat_read_fields") {
    context.addIssue({ code: "custom", message: "read metadata belongs to bat_read_fields" })
  }
  if (event.readError !== undefined && event.readOutcome !== "failed") {
    context.addIssue({ code: "custom", message: "read error requires failed outcome" })
  }
  if (event.queryOutcome === "no_match" && event.matchCount !== 0
    || event.queryOutcome === "matched" && (!event.matchCount || event.matchCount < 1)) {
    context.addIssue({ code: "custom", message: "query outcome and match count disagree" })
  }
  if (event.source === "model" && (event.phase !== "model" || !event.callId || !event.purpose
    || event.actionName !== undefined || event.stepNumber !== undefined)) {
    context.addIssue({ code: "custom", message: "model progress metadata is incomplete" })
  }
})

export const authoringProgressSchema = z.object({
  // WHY：只保留有界尾部，既让轮询不会漏掉瞬时阶段，也避免长探索无限放大 job 行。
  events: z.array(authoringProgressEventSchema).max(50),
  actionsStarted: z.number().int().nonnegative(), modelCallsStarted: z.number().int().nonnegative(),
}).strict()

export const taskAuthoringJobSchema = z.object({
  id: identitySchema, taskId: taskIdentitySchema, type: z.enum(["plan", "chain"]), key: textSchema,
  status: z.enum(["queued", "running", "waiting_for_human", "completed", "failed", "interrupted"]), sequence: z.number().int().nonnegative(),
  reason: textSchema.nullable(), resultId: identitySchema.nullable(), browserRunId: identitySchema.nullable().default(null),
  waitpoint: humanWaitpointSchema.nullable().default(null),
  audit: authoringAuditSchema.nullable(),
  authoring: z.object({
    stage: z.enum(["planning", "exploring", "explored", "compiling", "compiled"]),
    level: z.enum(["E0", "E1", "E2", "E3", "E4"]), failureLayer: z.string().nullable(),
    exploration: jsonValueSchema.nullable(), annotations: jsonValueSchema.nullable(),
    compiledChain: versionReferenceSchema.optional(),
    compiledChains: z.array(versionReferenceSchema).optional(),
    progress: authoringProgressSchema.optional(),
    consumption: z.object({ explorationToolCalls: z.number().int().nonnegative(), explorationSessions: z.number().int().nonnegative(),
      compilationCalls: z.number().int().nonnegative(), providerInvocations: z.number().int().nonnegative().nullable() }).strict(),
  }).strict().optional(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict()

export const taskExecutionStepSchema = z.object({
  stepId: keySchema, chain: versionReferenceSchema, invocationIds: z.array(identitySchema), runIds: z.array(identitySchema),
  consumed: consumptionSchema.default({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }),
  status: z.enum(["pending", "running", "completed", "partial", "waiting_for_human", "paused", "blocked", "failed", "cancelled"]),
  output: jsonValueSchema.nullable(), reason: textSchema.nullable(),
}).strict()

export const taskExecutionSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("execution"), id: identitySchema, taskId: taskIdentitySchema,
  authorizationId: identitySchema, plan: versionReferenceSchema, requirement: requirementReferenceSchema,
  // WHY：验证与正式执行复用同一计划运行事实；历史未标用途的记录仍是正式复跑。
  mode: taskRunModeSchema.optional(),
  validationRecovery: z.object({ parentExecutionId: identitySchema, attempt: z.literal(1),
    verificationInput: jsonValueSchema.optional() }).strict().optional(),
  input: jsonValueSchema, inputDigest: digestSchema,
  consumed: consumptionSchema.default({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }),
  status: z.enum(["queued", "running", "completed", "partial", "waiting_for_human", "paused", "blocked", "failed", "cancelled", "stale"]),
  sequence: z.number().int().nonnegative(), currentStepId: keySchema.nullable(), currentRunId: identitySchema.nullable(),
  steps: z.array(taskExecutionStepSchema), output: taskOutputSchema.nullable(), reason: textSchema,
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict()

export const legacyContractSummarySchema = z.object({
  source: z.enum(["plans", "chains", "executions"]), id: textSchema,
  status: z.enum(["legacy_read_only", "unsupported_version", "invalid"]), reason: textSchema,
}).strict()

export const staleVersionSchema = z.object({
  kind: z.enum(["plan", "chain"]), id: identitySchema, version: z.number().int().positive(),
}).strict()

export const taskChainStateSchema = z.object({
  contractVersion: contractVersionSchema, taskId: taskIdentitySchema, taskSequence: z.number().int().nonnegative(),
  stateSequence: z.number().int().nonnegative(),
  requirement: taskRequirementSchema.nullable(), requirements: z.array(taskRequirementSchema), plans: z.array(taskPlanSchema),
  chains: z.array(taskChainSchema), runs: z.array(taskRunSchema), executions: z.array(taskExecutionSchema),
  jobs: z.array(taskAuthoringJobSchema), staleIds: z.array(identitySchema), staleVersions: z.array(staleVersionSchema),
  legacy: z.array(legacyContractSummarySchema),
}).strict()

const request = { requestId: identitySchema }
export const taskChainCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cancel_authoring"), jobId: identitySchema }).strict(),
  z.object({ type: z.literal("resume_validation"), ...request, runId: identitySchema, expectedSequence: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("generate_plan"), ...request, requirementVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("author_task"), ...request, requirementVersion: z.number().int().positive(),
    input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("generate_chain"), ...request, plan: versionReferenceSchema,
    stepId: keySchema, input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("generate_task_chains"), ...request, plan: versionReferenceSchema,
    input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("validate_chain"), ...request, chain: versionReferenceSchema,
    mode: taskRunModeSchema.extract(["sample", "verification"]), input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("validate_plan"), ...request, plan: versionReferenceSchema,
    mode: taskRunModeSchema.extract(["sample", "verification"]), input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("authorize_plan"), ...request, plan: versionReferenceSchema, input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("resume_execution"), ...request, executionId: identitySchema,
    expectedSequence: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("cancel_execution"), executionId: identitySchema }).strict(),
])

export type AuthoringAudit = z.infer<typeof authoringAuditSchema>
export type AuthoringProgressEvent = z.infer<typeof authoringProgressEventSchema>
export type AuthoringProgress = z.infer<typeof authoringProgressSchema>
export type TaskAuthoringJob = z.infer<typeof taskAuthoringJobSchema>
export type TaskExecutionStep = z.infer<typeof taskExecutionStepSchema>
export type TaskExecution = z.infer<typeof taskExecutionSchema>
export type TaskChainState = z.infer<typeof taskChainStateSchema>
export type TaskChainCommand = z.infer<typeof taskChainCommandSchema>
