import { z } from "zod"
import { artifactReferenceSchema, budgetSchema, consumptionSchema, contractVersionSchema, digestSchema,
  identitySchema, keySchema, taskIdentitySchema, textSchema, versionReferenceSchema } from "./common.js"
import { observationConditionSchema } from "./binding.js"
import { modelCallPurposeSchema, nodeOutcomeSchema, terminalStatusSchema } from "./node.js"
import { jsonValueSchema, taskOutputSchema } from "./value.js"

export const runBindingSchema = z.object({
  runId: identitySchema, invocationId: identitySchema, taskId: taskIdentitySchema,
  authorizationId: identitySchema, plan: versionReferenceSchema, chain: versionReferenceSchema,
  inputDigest: digestSchema,
}).strict()
export const taskRunModeSchema = z.enum(["sample", "verification", "replay"])
/** WHY：start 只接受运行身份与动态输入；游标、累计消耗和审计不能来自启动请求。 */
export const taskRunRequestSchema = z.object({
  contractVersion: contractVersionSchema, requestId: identitySchema,
  binding: runBindingSchema, mode: taskRunModeSchema, input: jsonValueSchema,
}).strict()
export const taskResumeRequestSchema = z.object({
  contractVersion: contractVersionSchema, requestId: identitySchema,
  binding: runBindingSchema, checkpointId: identitySchema, expectedSequence: z.number().int().nonnegative(),
}).strict()
export const browserStateSummarySchema = z.object({
  sessionId: textSchema, tabId: textSchema, url: textSchema,
  observationDigest: digestSchema, observedAt: z.string().datetime(),
}).strict()
const originSchema = z.string().url().refine((value) => new URL(value).origin === value, "origin_required")
export const externalFailureSchema = z.object({
  category: z.enum(["authentication", "verification", "rate_limited", "access_denied", "transient"]),
  code: textSchema, origin: originSchema.nullable(), observedOrigin: originSchema.nullable(),
  httpStatus: z.number().int().min(100).max(599).nullable(), retryAt: z.string().datetime().nullable(),
}).strict()
export const nodeCapabilityResultSchema = z.object({
  outcome: nodeOutcomeSchema, output: jsonValueSchema.optional(), artifacts: z.array(artifactReferenceSchema).optional(),
  browser: browserStateSummarySchema.optional(), reason: textSchema.optional(), externalFailure: externalFailureSchema.optional(),
}).strict().refine((result) => !result.externalFailure || !["success", "true", "false", "body", "done"].includes(result.outcome),
  "external_failure_requires_failure_outcome")
export const llmNodeCapabilityResultSchema = nodeCapabilityResultSchema.safeExtend({
  reportedInvocations: z.number().int().nonnegative().nullable(),
  reportedBrowserCommands: z.number().int().nonnegative().optional(),
}).strict()
export const nodeExecutionEventSchema = z.object({
  sequence: z.number().int().nonnegative(), at: z.string().datetime(), invocationId: identitySchema,
  nodeId: keySchema, status: z.enum(["planned", "started", "finished"]),
  outcome: nodeOutcomeSchema.nullable(), idempotencyKey: textSchema, stableKey: textSchema.nullable(),
}).strict().refine((event) => (event.status === "finished") === (event.outcome !== null), "只有完成事件携带出口")
export const modelCallAuditSchema = z.object({
  callId: identitySchema, invocationId: identitySchema, nodeId: keySchema, purpose: modelCallPurposeSchema,
  model: textSchema, intendedAt: z.string().datetime(), status: z.enum(["intended", "completed", "failed", "interrupted"]),
  reportedInvocations: z.number().int().nonnegative().nullable(),
}).strict().refine((audit) => audit.status !== "intended" || audit.reportedInvocations === null, "意图不能伪造已回报调用数")
export const invocationProgressSchema = z.object({
  invocationId: identitySchema, chain: versionReferenceSchema, stableKey: textSchema,
  inputDigest: digestSchema, status: z.enum(["pending", "running", "completed", "partial", "paused", "failed", "cancelled"]),
  output: taskOutputSchema.nullable(), checkpointId: identitySchema.nullable(), reason: textSchema.nullable(),
}).strict()
export const taskCheckpointSchema = z.object({
  contractVersion: contractVersionSchema, id: identitySchema, binding: runBindingSchema,
  mode: taskRunModeSchema, sequence: z.number().int().nonnegative(), cursor: keySchema,
  resumeWhen: observationConditionSchema.nullable(),
  input: jsonValueSchema, nodeOutputs: z.record(keySchema, jsonValueSchema), variables: z.record(keySchema, jsonValueSchema),
  loops: z.record(keySchema, z.object({ index: z.number().int().nonnegative(), completedStableKeys: z.array(textSchema),
    activeStableKey: textSchema.nullable().default(null) }).strict()),
  invocations: z.array(invocationProgressSchema), outputs: z.record(keySchema, taskOutputSchema),
  artifacts: z.array(artifactReferenceSchema), browser: browserStateSummarySchema.nullable(),
  consumed: consumptionSchema, events: z.array(nodeExecutionEventSchema), modelCalls: z.array(modelCallAuditSchema),
  auditComplete: z.boolean(),
  externalFailure: externalFailureSchema.nullable().optional(),
  pendingEffect: z.object({ kind: z.enum(["capability", "browser", "llm", "invoke"]), nodeId: keySchema,
    stableKey: textSchema, idempotencyKey: textSchema,
    status: z.enum(["planned", "started", "uncertain"]) }).strict().nullable(),
}).strict().superRefine((checkpoint, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message })
  for (const loop of Object.values(checkpoint.loops)) {
    if (new Set(loop.completedStableKeys).size !== loop.completedStableKeys.length) issue("duplicate_stable_key")
  }
  if (new Set(checkpoint.invocations.map((call) => call.invocationId)).size !== checkpoint.invocations.length) {
    issue("duplicate_invocation")
  }
  if (new Set(checkpoint.events.map((event) => event.sequence)).size !== checkpoint.events.length
    || checkpoint.events.some((event, index) => event.sequence > checkpoint.sequence
      || (index > 0 && event.sequence <= checkpoint.events[index - 1]!.sequence))) issue("event_sequence")
  if (new Set(checkpoint.modelCalls.map((audit) => audit.callId)).size !== checkpoint.modelCalls.length) issue("duplicate_model_call")
  if (checkpoint.consumed.llmCalls !== modelCallSummary(checkpoint.modelCalls, checkpoint.auditComplete).reportedInvocations) {
    issue("model_count_mismatch")
  }
})
const outcomeBase = z.object({ reason: textSchema, evidence: z.array(artifactReferenceSchema) }).strict()
export const taskRunOutcomeSchema = z.discriminatedUnion("status", [
  outcomeBase.extend({ status: z.literal("completed"), completionEvidence: z.array(keySchema).min(1) }).strict(),
  outcomeBase.extend({ status: z.literal("partial"), remaining: z.array(textSchema).min(1) }).strict(),
  outcomeBase.extend({ status: z.literal("blocked"), code: textSchema }).strict(),
  outcomeBase.extend({ status: z.literal("failed"), code: textSchema }).strict(),
  outcomeBase.extend({ status: z.literal("cancelled") }).strict(),
  outcomeBase.extend({ status: z.literal("waiting_for_human"), waitpointId: identitySchema, checkpointId: identitySchema }).strict(),
  outcomeBase.extend({ status: z.literal("paused"), checkpointId: identitySchema,
    cause: z.enum(["drift", "budget", "interrupted", "requested"]) }).strict(),
])
export const invokeChainResultSchema = z.object({
  outcome: taskRunOutcomeSchema, output: taskOutputSchema.nullable(), checkpointId: identitySchema.optional(),
  externalFailure: externalFailureSchema.nullable().optional(),
}).strict()
export const resumeVerificationResultSchema = z.object({
  ok: z.boolean(), browser: browserStateSummarySchema.optional(), observation: jsonValueSchema.optional(), reason: textSchema.optional(),
}).strict()
export const taskRunSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("run"), binding: runBindingSchema,
  mode: taskRunModeSchema, input: jsonValueSchema, budget: budgetSchema,
  sequence: z.number().int().nonnegative(), status: z.enum(["queued", "running", ...taskRunOutcomeSchema.options.map((item) => item.shape.status.value)]),
  outputs: z.record(keySchema, taskOutputSchema), checkpoint: taskCheckpointSchema.nullable(),
  consumed: consumptionSchema, outcome: taskRunOutcomeSchema.nullable(),
  events: z.array(nodeExecutionEventSchema), modelCalls: z.array(modelCallAuditSchema), auditComplete: z.boolean(),
  externalFailure: externalFailureSchema.nullable().optional(),
}).strict().superRefine((run, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message })
  if ((run.status === "queued" || run.status === "running") ? run.outcome !== null : run.outcome?.status !== run.status) issue("run_outcome_mismatch")
  if (new Set(run.events.map((event) => event.sequence)).size !== run.events.length
    || run.events.some((event, index) => event.sequence > run.sequence || (index > 0 && event.sequence <= run.events[index - 1]!.sequence))) issue("event_sequence")
  if (new Set(run.modelCalls.map((audit) => audit.callId)).size !== run.modelCalls.length) issue("duplicate_model_call")
  const summary = modelCallSummary(run.modelCalls, run.auditComplete)
  if (run.consumed.llmCalls !== summary.reportedInvocations) issue("model_count_mismatch")
  if (!run.checkpoint) {
    if (run.status === "paused" || run.status === "waiting_for_human") issue("checkpoint_required")
    return
  }
  if (!sameRunBinding(run.binding, run.checkpoint.binding) || run.checkpoint.sequence > run.sequence) issue("checkpoint_binding")
  if ((run.outcome?.status === "paused" || run.outcome?.status === "waiting_for_human")
    && run.outcome.checkpointId !== run.checkpoint.id) issue("checkpoint_identity")
})

export type TaskRun = z.infer<typeof taskRunSchema>
export type TaskRunMode = z.infer<typeof taskRunModeSchema>
export type TaskRunRequest = z.infer<typeof taskRunRequestSchema>
export type TaskRunOutcome = z.infer<typeof taskRunOutcomeSchema>
export type TaskCheckpoint = z.infer<typeof taskCheckpointSchema>
export type RunBinding = z.infer<typeof runBindingSchema>
export type NodeCapabilityResult = z.infer<typeof nodeCapabilityResultSchema>
export type InvokeChainResult = z.infer<typeof invokeChainResultSchema>
export type ResumeVerificationResult = z.infer<typeof resumeVerificationResultSchema>

export function sameRunBinding(left: RunBinding, right: RunBinding): boolean {
  const referenceEqual = (a: RunBinding["chain"], b: RunBinding["chain"]) => a.id === b.id && a.version === b.version && a.digest === b.digest
  return left.runId === right.runId && left.invocationId === right.invocationId && left.taskId === right.taskId
    && left.authorizationId === right.authorizationId && left.inputDigest === right.inputDigest
    && referenceEqual(left.plan, right.plan) && referenceEqual(left.chain, right.chain)
}

// WHY：审计不完整或任意供应商回报未知时，实际调用数保持 null；空数组本身不证明零调用。
export function modelCallSummary(audits: z.infer<typeof modelCallAuditSchema>[], auditComplete: boolean) {
  return { intents: audits.length, reportedInvocations: auditComplete && audits.every((audit) => audit.reportedInvocations !== null)
    ? audits.reduce((sum, audit) => sum + audit.reportedInvocations!, 0) : null }
}

export { terminalStatusSchema }
