import { z } from "zod"
import { taskIdSchema } from "./task.js"

const id = z.string().uuid()
export const humanWaitReasonSchema = z.enum(["login", "captcha", "confirmation", "access"])
export const humanWaitpointSchema = z.object({
  id,
  // 旧 plan_evidence waitpoint 只为历史 BrowserRecord 读取；新会话只写 execution_step。
  owner: z.enum(["plan_evidence", "authoring_job", "execution_step"]),
  ownerId: id,
  stepId: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/).nullable(),
  reason: humanWaitReasonSchema,
  status: z.enum(["waiting", "completed", "cancelled", "timed_out", "disabled", "failed"]),
  prompt: z.string().trim().min(1).max(500),
  origin: z.string().url().nullable(),
  requestedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
}).strict()
export const browserRecordSchema = z.object({
  runId: id, taskId: taskIdSchema, ownerId: id.nullable().default(null), requirementVersion: z.number().int().positive(),
  // 旧 plan_evidence/repair 值不能再授权新 grant，但必须保持 SQLite 浏览器历史可读。
  purpose: z.enum(["plan_evidence", "exploration", "verification", "replay", "repair"]),
  status: z.enum(["running", "waiting_human", "succeeded", "failed", "cancelled", "manual_required", "cleanup_required", "interrupted"]),
  waitpoint: humanWaitpointSchema.nullable().default(null),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), reason: z.string().nullable(),
}).strict()
export const browserStatusSchema = z.object({ taskId: taskIdSchema, record: browserRecordSchema.nullable(), busy: z.boolean(), cleanupRequired: z.boolean(), cleanupRunId: z.string().uuid().nullable() }).strict()
export const browserControlSchema = z.object({ type: z.enum(["cancel", "cleanup"]), runId: z.string().uuid() }).strict()
export type HumanWaitpoint = z.infer<typeof humanWaitpointSchema>
export type BrowserRecord = z.infer<typeof browserRecordSchema>
export type BrowserStatus = z.infer<typeof browserStatusSchema>
