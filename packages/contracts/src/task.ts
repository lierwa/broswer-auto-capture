import { z } from "zod"

export const taskIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/)
export const taskMetaSchema = z.object({ id: taskIdSchema, title: z.string().trim().min(1).max(100), renamed: z.boolean(), archived: z.boolean(), updatedAt: z.string() })
export const taskSummarySchema = taskMetaSchema.extend({ status: z.enum(["new", "running", "answer", "draft", "confirmed", "failed"]), revision: z.number().int() })
export const taskListSchema = z.array(taskSummarySchema)
export const taskActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create") }),
  z.object({ type: z.literal("rename"), id: taskIdSchema, title: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("archive"), id: taskIdSchema, archived: z.boolean() }),
])
export const taskCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create"), requestId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("rename"), id: taskIdSchema, title: z.string().trim().min(1).max(100) }).strict(),
  z.object({ type: z.literal("archive"), id: taskIdSchema, archived: z.boolean() }).strict(),
])
export type TaskMeta = z.infer<typeof taskMetaSchema>
export type TaskSummary = z.infer<typeof taskSummarySchema>
export type TaskAction = z.infer<typeof taskActionSchema>
export type TaskCommand = z.infer<typeof taskCommandSchema>
export const taskStatusLabels: Record<TaskSummary["status"], string> = { new: "新需求", running: "正在处理", answer: "待回答", draft: "待确认草稿", confirmed: "需求已确认", failed: "本轮未完成" }
