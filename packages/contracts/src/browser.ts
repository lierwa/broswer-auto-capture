import { z } from "zod"
import { taskIdSchema } from "./task.js"

export const browserRecordSchema = z.object({
  runId: z.string().uuid(), taskId: taskIdSchema, requirementVersion: z.number().int().positive(),
  purpose: z.enum(["source_research", "exploration", "verification", "replay", "repair"]),
  status: z.enum(["running", "succeeded", "failed", "cancelled", "manual_required", "cleanup_required", "interrupted"]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(), reason: z.string().nullable(),
}).strict()
export const browserStatusSchema = z.object({ taskId: taskIdSchema, record: browserRecordSchema.nullable(), busy: z.boolean(), cleanupRequired: z.boolean(), cleanupRunId: z.string().uuid().nullable() }).strict()
export const browserControlSchema = z.object({ type: z.enum(["cancel", "cleanup"]), runId: z.string().uuid() }).strict()
export type BrowserRecord = z.infer<typeof browserRecordSchema>
export type BrowserStatus = z.infer<typeof browserStatusSchema>
