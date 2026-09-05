import { z } from "zod"

export const runItemSchema = z.object({
  stableKey: z.string().min(1).max(240),
  value: z.string().max(20_000),
}).strict()
export type RunItem = z.infer<typeof runItemSchema>

/** WHY: 公共请求只包含运行身份与业务输入；游标、完成项和审计永远由运行时持有。 */
export const runRequestSchema = z.object({
  runId: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowVersion: z.number().int().positive(),
  inputs: z.array(runItemSchema).min(1).max(1_000),
}).strict()
export type RunRequest = z.infer<typeof runRequestSchema>

export const runBindingSchema = z.object({
  runId: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowVersion: z.number().int().positive(),
  inputsFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict()
export type RunBinding = z.infer<typeof runBindingSchema>

const eventBase = z.object({
  at: z.string().datetime(),
  nodeId: z.string().min(1),
}).strict()

export const executionEventSchema = z.discriminatedUnion("type", [
  eventBase.extend({
    type: z.literal("ordinary_adapter_planned"),
    stableKey: z.string().min(1),
    idempotencyKey: z.string().min(1),
  }).strict(),
  eventBase.extend({
    type: z.literal("ordinary_adapter_completed"),
    stableKey: z.string().min(1),
    idempotencyKey: z.string().min(1),
  }).strict(),
  eventBase.extend({
    type: z.literal("duplicate_skipped"),
    stableKey: z.string().min(1),
  }).strict(),
  eventBase.extend({
    type: z.literal("llm_gateway_call_intended"),
    model: z.string().min(1),
  }).strict(),
  eventBase.extend({
    type: z.literal("resume_verified"),
    detail: z.string().min(1),
  }).strict(),
])
export type ExecutionEvent = z.infer<typeof executionEventSchema>

const runAuditSourceSchema = z.object({
  runId: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowVersion: z.number().int().positive(),
  status: z.enum(["running", "paused", "cancelled", "completed", "failed"]),
  completedStableKeys: z.array(z.string()),
  events: z.array(executionEventSchema),
}).strict()

/** WHY: 意图次数从网关边界事件派生；命名不能把调用意图当作供应商实际调用或计费。 */
export const runAuditSchema = runAuditSourceSchema.transform((audit) => ({
  ...audit,
  modelInvocationIntents: audit.events.filter((event) => event.type === "llm_gateway_call_intended").length,
}))
export type RunAudit = z.infer<typeof runAuditSchema>
