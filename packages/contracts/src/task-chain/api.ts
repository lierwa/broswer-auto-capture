import { z } from "zod"
import { aiEventSchema } from "../ai.js"
import { humanWaitpointSchema } from "../browser.js"
import { artifactReferenceSchema, consumptionSchema, contractVersionSchema, digestSchema, identitySchema, keySchema, taskIdentitySchema, textSchema, versionReferenceSchema } from "./common.js"
import { taskPlanSchema } from "./plan.js"
import {
  DEFAULT_TASK_EXECUTION_PACING, runnableTaskReleaseSchema, taskExecutionBrowserSchema,
  taskExecutionPacingSchema,
} from "./product.js"
import { requirementReferenceSchema, taskRequirementSchema } from "./requirement.js"
import { taskDraftReferenceSchema, taskDraftSchema } from "./revision.js"
import { capabilityDescriptorSchema } from "./capability-descriptor.js"
import { nodeExecutionEventSchema, taskRunModeSchema, taskRunSchema } from "./run.js"
import { jsonValueSchema, taskOutputSchema } from "./value.js"
import { stableChainNodeV2Schema } from "./node.js"
import { chainEdgeV2Schema } from "./chain.js"
export { taskExecutionBrowserSchema, taskExecutionPacingSchema } from "./product.js"

export const authoringAuditSchema = z.object({
  // 旧 chain_compilation 只用于读取迁移期间已落库的终态 job；新链路生成写入完整探索与编译用途。
  purpose: z.enum(["plan_creation", "plan_projection", "plan_contract_revalidation", "chain_compilation",
    "chain_exploration_and_compilation", "chain_offline_compilation"]), model: textSchema, effort: textSchema,
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

export const taskExecutionStatusSchema = z.enum(["queued", "running", "completed", "partial", "waiting_for_human",
  "paused", "cleanup_required", "blocked", "failed", "cancelled", "stale"])
export const executionCleanupStatusSchema = z.enum(["not_recorded", "pending", "confirmed", "unconfirmed"])
export const taskExecutionBrowserHandoffSchema = z.object({
  status: z.enum(["not_requested", "pending", "active", "ended", "unavailable"]),
  purpose: z.enum(["delivery", "human_wait"]).nullable(),
  leaseId: identitySchema.nullable(), ownerId: identitySchema.nullable(), targetDigest: digestSchema.nullable(),
  reason: textSchema.nullable(), updatedAt: z.string().datetime().nullable(),
}).strict().superRefine((handoff, context) => {
  if (handoff.status === "active" && (!handoff.leaseId || !handoff.ownerId || !handoff.targetDigest)) {
    context.addIssue({ code: "custom", message: "active_browser_handoff_requires_owner_and_target" })
  }
})
export const UNRECORDED_BROWSER_HANDOFF = { status: "not_requested", purpose: null, leaseId: null,
  ownerId: null, targetDigest: null, reason: null, updatedAt: null } as const
export const executionCleanupSchema = z.object({
  status: executionCleanupStatusSchema, attempt: z.number().int().nonnegative(), code: textSchema.nullable(),
  evidenceDigest: digestSchema.nullable(), updatedAt: z.string().datetime().nullable(),
}).strict().superRefine((cleanup, context) => {
  if (cleanup.status === "not_recorded" && (cleanup.attempt !== 0 || cleanup.code !== null
    || cleanup.evidenceDigest !== null || cleanup.updatedAt !== null)) {
    context.addIssue({ code: "custom", message: "cleanup_not_recorded_must_be_empty" })
  }
  if (cleanup.status !== "not_recorded" && (cleanup.attempt < 1 || cleanup.updatedAt === null)) {
    context.addIssue({ code: "custom", message: "cleanup_attempt_metadata_required" })
  }
  if (cleanup.status === "pending" && cleanup.code !== null) {
    context.addIssue({ code: "custom", message: "cleanup_pending_cannot_have_error" })
  }
  if (["confirmed", "unconfirmed"].includes(cleanup.status) && cleanup.evidenceDigest === null) {
    context.addIssue({ code: "custom", message: "cleanup_terminal_evidence_required" })
  }
  if (cleanup.status === "unconfirmed" && cleanup.code === null) {
    context.addIssue({ code: "custom", message: "cleanup_unconfirmed_code_required" })
  }
})
export const UNRECORDED_EXECUTION_CLEANUP = {
  status: "not_recorded", attempt: 0, code: null, evidenceDigest: null, updatedAt: null,
} as const
export const taskExecutionFailureEvidenceSchema = z.object({
  classification: z.enum(["deterministic", "external", "version", "budget", "cancelled"]),
  code: textSchema, repairable: z.boolean(), executionId: identitySchema,
  stepId: keySchema.nullable(), runId: identitySchema.nullable(), runSequence: z.number().int().nonnegative().nullable(),
  checkpointId: identitySchema.nullable(), eventSequence: z.number().int().nonnegative().nullable(),
  reason: textSchema, digest: digestSchema,
}).strict()
export const taskExecutionResultSchema = z.object({
  status: taskExecutionStatusSchema, summary: textSchema,
  nextAction: z.enum(["view", "resume", "cleanup", "rerun", "none"]),
  payload: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("execution"), completedSteps: z.number().int().nonnegative(),
      totalSteps: z.number().int().nonnegative(), evidence: z.array(artifactReferenceSchema) }).strict(),
    z.object({ mode: z.literal("data"), output: taskOutputSchema.nullable() }).strict(),
  ]),
  failure: taskExecutionFailureEvidenceSchema.nullable(),
}).strict()

export const taskExecutionCleanupResumeSchema = z.object({
  status: taskExecutionStatusSchema.exclude(["cleanup_required"]), reason: textSchema,
  result: taskExecutionResultSchema.nullable(),
}).strict()

export const taskExecutionReviewSchema = z.object({
  id: identitySchema,
  decision: z.enum(["accepted", "requirement_revision"]),
  feedback: z.string().trim().min(1).max(2_000).nullable(),
  summary: z.string().trim().min(1).max(8_000),
  createdAt: z.string().datetime(),
}).strict()

export const planCandidateIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
  code: textSchema, message: textSchema,
}).strict()
export const planCandidateRecordSchema = z.object({
  attempt: z.number().int().positive(), candidate: jsonValueSchema, digest: digestSchema,
  issues: z.array(planCandidateIssueSchema).max(100),
}).strict()
export const preparationPhaseSchema = z.enum(["forming_plan", "awaiting_representative_input", "preexecuting", "compiling",
  "validating_sample", "awaiting_verification_input", "validating_verification", "publishing", "ready"])

export const taskAuthoringJobSchema = z.object({
  id: identitySchema, taskId: taskIdentitySchema, type: z.enum(["plan", "chain", "prepare", "repair"]), key: textSchema,
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
    // WHY：准备期唯一可变快照；没有入口、版本或运行权限，canonical 现场只留本地仓储。
    build: z.object({ authorRequestId: identitySchema, stepId: keySchema,
      sequence: z.number().int().min(1).max(202), digest: digestSchema, phase: z.enum(["prefix", "final"]),
      payload: z.string().min(1).max(8_000_000),
      nodes: z.array(stableChainNodeV2Schema).max(500), edges: z.array(chainEdgeV2Schema).max(5000),
    }).strict().optional(),
    consumption: z.object({ explorationToolCalls: z.number().int().nonnegative(), explorationSessions: z.number().int().nonnegative(),
      compilationCalls: z.number().int().nonnegative(), providerInvocations: z.number().int().nonnegative().nullable() }).strict(),
  }).strict().optional(),
  preparation: z.object({
    phase: preparationPhaseSchema,
    plan: versionReferenceSchema.nullable(), chains: z.array(versionReferenceSchema),
    candidatePlan: taskPlanSchema.nullable().default(null), draft: taskDraftReferenceSchema.nullable().default(null),
    planCandidates: z.array(planCandidateRecordSchema).max(10).default([]),
    recoveredFromJobId: identitySchema.nullable().default(null),
    resumedFromJobId: identitySchema.nullable().default(null),
    representativeInput: jsonValueSchema.nullable(), verificationInput: jsonValueSchema.nullable(),
    inputRequest: z.object({ purpose: z.enum(["representative", "verification"]),
      contract: taskPlanSchema.shape.inputContract, prompt: textSchema, distinctFromDigest: digestSchema.nullable() }).strict().nullable(),
    requirementReturn: z.object({ reason: textSchema, issues: z.array(z.object({
      code: textSchema, clauseRefs: z.array(textSchema),
    }).strict()).min(1) }).strict().nullable().default(null),
    validationExecutionIds: z.array(identitySchema), priorAudits: z.array(authoringAuditSchema),
  }).strict().optional(),
  repair: z.object({
    phase: z.enum(["authoring", "validating_sample", "validating_verification", "publishing", "ready"]),
    sourceExecutionId: identitySchema, sourceRelease: versionReferenceSchema,
    failure: taskExecutionFailureEvidenceSchema, plan: versionReferenceSchema,
    chains: z.array(versionReferenceSchema), sampleInput: jsonValueSchema, verificationInput: jsonValueSchema,
    validationExecutionIds: z.array(identitySchema),
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
  // 旧验证/执行记录没有发布引用；新正式运行必须由服务端执行门要求该字段并核对清单。
  release: versionReferenceSchema.optional(),
  // 草稿试跑冻结独立 candidate snapshot；后续草稿保存不能改变该 execution 的输入图。
  draft: taskDraftReferenceSchema.optional(),
  // WHY：验证与正式执行复用同一计划运行事实；历史未标用途的记录仍是正式复跑。
  mode: taskRunModeSchema.optional(),
  validationRecovery: z.object({ parentExecutionId: identitySchema, attempt: z.literal(1),
    verificationInput: jsonValueSchema.optional() }).strict().optional(),
  input: jsonValueSchema, inputDigest: digestSchema,
  // WHY：复跑节奏是本次授权的运行控制事实，不进入链版本，也不改变节点预算与语义。
  pacing: taskExecutionPacingSchema.default(DEFAULT_TASK_EXECUTION_PACING),
  // WHY：可见性由单次执行授权决定；旧记录与草稿试跑没有此字段，正式运行在接单时写入明确值。
  browser: taskExecutionBrowserSchema.optional(),
  // WHY：链路完成、自动化资源清理和用户继续使用原窗口是独立事实；旧记录缺失时不可推断窗口仍开放。
  browserHandoff: taskExecutionBrowserHandoffSchema.default(UNRECORDED_BROWSER_HANDOFF),
  consumed: consumptionSchema.default({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }),
  status: taskExecutionStatusSchema,
  sequence: z.number().int().nonnegative(), currentStepId: keySchema.nullable(), currentRunId: identitySchema.nullable(),
  steps: z.array(taskExecutionStepSchema), output: taskOutputSchema.nullable(), reason: textSchema,
  // WHY：旧记录只能视为没有清理事实；默认值用于只读兼容，新保存会把唯一事实写回 execution body。
  cleanup: executionCleanupSchema.default(UNRECORDED_EXECUTION_CLEANUP),
  // cleanup_required 是覆盖层；清理确认后必须恢复此前真实业务结论和下一步，不能重新猜测。
  cleanupResume: taskExecutionCleanupResumeSchema.nullable().default(null),
  result: taskExecutionResultSchema.optional(),
  // WHY：技术完成和用户是否满意是两个事实。验收按时间追加，不能改写运行结果或历史版本。
  reviews: z.array(taskExecutionReviewSchema).max(20).default([]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().superRefine((execution, context) => {
  if (execution.release && execution.draft) {
    context.addIssue({ code: "custom", message: "execution_source_ambiguous" })
  }
  if (execution.status === "cleanup_required" && !["pending", "unconfirmed"].includes(execution.cleanup.status)) {
    context.addIssue({ code: "custom", message: "cleanup_required_state_mismatch" })
  }
  if (execution.cleanup.status === "unconfirmed" && execution.status !== "cleanup_required") {
    context.addIssue({ code: "custom", message: "cleanup_unconfirmed_requires_lifecycle_state" })
  }
  if (execution.status !== "cleanup_required" && execution.cleanupResume !== null) {
    context.addIssue({ code: "custom", message: "cleanup_resume_requires_overlay" })
  }
  if (execution.cleanupResume?.result && execution.cleanupResume.result.status !== execution.cleanupResume.status) {
    context.addIssue({ code: "custom", message: "cleanup_resume_result_status_mismatch" })
  }
})

export const taskExecutionSummarySchema = z.object({
  id: identitySchema, mode: taskRunModeSchema.optional(), status: taskExecutionStatusSchema,
  sequence: z.number().int().nonnegative(), release: versionReferenceSchema.optional(), draft: taskDraftReferenceSchema.optional(),
  steps: z.array(z.object({ stepId: keySchema, chain: versionReferenceSchema,
    status: taskExecutionStepSchema.shape.status, reason: textSchema.nullable() }).strict()),
  result: taskExecutionResultSchema.optional(), cleanup: executionCleanupSchema,
  browserHandoff: taskExecutionBrowserHandoffSchema.default(UNRECORDED_BROWSER_HANDOFF),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict()

export const taskAuthoringActivitySchema = z.object({
  id: identitySchema, status: z.enum(["queued", "running", "waiting_for_human", "failed", "interrupted"]),
  phase: preparationPhaseSchema,
  build: taskAuthoringJobSchema.shape.authoring.unwrap().shape.build.unwrap()
    .omit({ payload: true, authorRequestId: true }).optional(),
  sequence: z.number().int().nonnegative(), reason: textSchema.nullable(),
  waitpoint: humanWaitpointSchema.nullable().default(null),
  inputRequest: z.object({ purpose: z.enum(["representative", "verification"]),
    contract: taskPlanSchema.shape.inputContract, prompt: textSchema,
    distinctFromDigest: digestSchema.nullable() }).strict().nullable(),
  updatedAt: z.string().datetime(),
}).strict()

export const taskWorkspaceReleaseSchema = z.object({
  reference: versionReferenceSchema, value: runnableTaskReleaseSchema,
}).strict()

export const taskWorkspaceSnapshotSchema = z.object({
  contractVersion: contractVersionSchema, taskId: taskIdentitySchema, taskSequence: z.number().int().nonnegative(),
  stateSequence: z.number().int().nonnegative(),
  requirement: taskRequirementSchema.nullable(), draft: taskDraftSchema.nullable(),
  release: taskWorkspaceReleaseSchema.nullable(), execution: taskExecutionSummarySchema.nullable(),
  activity: taskAuthoringActivitySchema.nullable(),
  draftReadiness: z.object({ phase: z.enum(["sample_needed", "verification_needed", "ready"]),
    distinctInputRequired: z.boolean() }).strict().nullable().default(null),
}).strict()

export const acceptedTaskExecutionSchema = z.object({
  status: z.literal("accepted"), taskId: taskIdentitySchema, requestId: identitySchema,
  executionId: identitySchema, executionSequence: z.number().int().nonnegative(), acceptedAt: z.string().datetime(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("release"), release: versionReferenceSchema }).strict(),
    z.object({ kind: z.literal("draft"), draft: taskDraftReferenceSchema }).strict(),
  ]),
  plan: versionReferenceSchema,
  chains: z.array(z.object({ stepId: keySchema, chain: versionReferenceSchema }).strict()).min(1).max(100),
}).strict()

export const taskChainDispatchResponseSchema = z.object({
  snapshot: taskWorkspaceSnapshotSchema, acceptedExecution: acceptedTaskExecutionSchema.nullable(),
}).strict()

export const taskReleaseHistoryPageSchema = z.object({
  kind: z.literal("releases"), items: z.array(runnableTaskReleaseSchema), nextOffset: z.number().int().nonnegative().nullable(),
}).strict()
export const taskExecutionHistoryPageSchema = z.object({
  kind: z.literal("executions"), items: z.array(taskExecutionSchema), nextOffset: z.number().int().nonnegative().nullable(),
}).strict()
export const taskWorkspaceHistoryPageSchema = z.discriminatedUnion("kind", [
  taskReleaseHistoryPageSchema, taskExecutionHistoryPageSchema,
])
export const taskWorkspaceDiagnosticsSchema = z.object({
  capabilityDescriptors: z.array(capabilityDescriptorSchema),
  preparation: z.object({ jobId: identitySchema, phase: preparationPhaseSchema,
    status: taskAuthoringJobSchema.shape.status, reason: textSchema.nullable(),
    compilationRecovery: z.object({ sourceJobId: identitySchema, available: z.boolean(), reason: textSchema }).strict().nullable(),
  }).strict().nullable(),
}).strict()

export const taskExecutionEventSchema = z.object({
  executionId: identitySchema, sequence: z.number().int().positive(), stepId: keySchema,
  runId: identitySchema, runSequence: z.number().int().nonnegative(), event: nodeExecutionEventSchema,
  // WHY：旧事件批次没有可读标题；读取时补投影，不改写持久化的原始节点事件。
  stepTitle: textSchema.nullable().default(null), nodeTitle: textSchema.nullable().default(null),
}).strict()
export const taskExecutionEventBatchSchema = z.object({
  executionId: identitySchema, executionSequence: z.number().int().nonnegative(),
  status: taskExecutionStatusSchema, after: z.number().int().nonnegative(), next: z.number().int().nonnegative(),
  events: z.array(taskExecutionEventSchema),
}).strict()

const request = { requestId: identitySchema }
export const taskChainCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cancel_authoring"), jobId: identitySchema }).strict(),
  z.object({ type: z.literal("prepare_task"), ...request, requirementVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("continue_preparation"), ...request, jobId: identitySchema,
    expectedSequence: z.number().int().nonnegative(), input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("resume_preparation_human"), ...request, jobId: identitySchema,
    expectedSequence: z.number().int().nonnegative(), waitpointId: identitySchema }).strict(),
  z.object({ type: z.literal("recover_preparation_compilation"), ...request, jobId: identitySchema,
    expectedSequence: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("trial_task_draft"), ...request, draftId: identitySchema,
    expectedRevision: z.number().int().nonnegative(), expectedChecksum: digestSchema, input: jsonValueSchema }).strict(),
  z.object({ type: z.literal("publish_task_draft"), ...request, draftId: identitySchema,
    expectedRevision: z.number().int().nonnegative(), expectedChecksum: digestSchema }).strict(),
  z.object({ type: z.literal("review_execution"), ...request, executionId: identitySchema,
    expectedSequence: z.number().int().nonnegative(),
    decision: z.enum(["accepted", "requirement_revision"]),
    feedback: z.string().trim().min(1).max(2_000).nullable() }).strict(),
  z.object({ type: z.literal("run_task"), ...request, release: versionReferenceSchema,
    input: jsonValueSchema.optional(), pacing: taskExecutionPacingSchema.optional(),
    browser: taskExecutionBrowserSchema.optional() }).strict(),
  z.object({ type: z.literal("resume_execution"), ...request, executionId: identitySchema,
    expectedSequence: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("cleanup_execution"), ...request, executionId: identitySchema,
    expectedSequence: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("cancel_execution"), executionId: identitySchema }).strict(),
])

export type AuthoringAudit = z.infer<typeof authoringAuditSchema>
export type AuthoringProgressEvent = z.infer<typeof authoringProgressEventSchema>
export type AuthoringProgress = z.infer<typeof authoringProgressSchema>
export type TaskAuthoringJob = z.infer<typeof taskAuthoringJobSchema>
export type TaskExecutionStep = z.infer<typeof taskExecutionStepSchema>
export type TaskExecution = z.infer<typeof taskExecutionSchema>
export type TaskExecutionCleanupResume = z.infer<typeof taskExecutionCleanupResumeSchema>
export type ExecutionCleanupStatus = z.infer<typeof executionCleanupStatusSchema>
export type ExecutionCleanup = z.infer<typeof executionCleanupSchema>
export type TaskExecutionBrowserHandoff = z.infer<typeof taskExecutionBrowserHandoffSchema>
export type TaskExecutionResult = z.infer<typeof taskExecutionResultSchema>
export type TaskExecutionReview = z.infer<typeof taskExecutionReviewSchema>
export type TaskExecutionFailureEvidence = z.infer<typeof taskExecutionFailureEvidenceSchema>
export type TaskExecutionSummary = z.infer<typeof taskExecutionSummarySchema>
export type TaskAuthoringActivity = z.infer<typeof taskAuthoringActivitySchema>
export type TaskWorkspaceSnapshot = z.infer<typeof taskWorkspaceSnapshotSchema>
export type TaskWorkspaceRelease = z.infer<typeof taskWorkspaceReleaseSchema>
export type AcceptedTaskExecution = z.infer<typeof acceptedTaskExecutionSchema>
export type TaskChainDispatchResponse = z.infer<typeof taskChainDispatchResponseSchema>
export type TaskWorkspaceHistoryPage = z.infer<typeof taskWorkspaceHistoryPageSchema>
export type TaskWorkspaceDiagnostics = z.infer<typeof taskWorkspaceDiagnosticsSchema>
export type TaskExecutionEvent = z.infer<typeof taskExecutionEventSchema>
export type TaskExecutionEventBatch = z.infer<typeof taskExecutionEventBatchSchema>
export type TaskChainCommand = z.infer<typeof taskChainCommandSchema>
