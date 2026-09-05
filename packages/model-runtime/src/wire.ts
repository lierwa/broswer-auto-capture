import { z } from "zod"

export const rpcResponseSchema = z.object({
  id: z.union([z.number().int(), z.string()]),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
}).passthrough()

export const notificationSchema = z.object({
  method: z.string().min(1),
  params: z.unknown().optional(),
}).passthrough()

export const accountReadResultSchema = z.object({
  account: z.object({ type: z.string().min(1) }).passthrough().nullable(),
  requiresOpenaiAuth: z.boolean(),
}).passthrough()

export const threadStartResultSchema = z.object({
  thread: z.object({
    id: z.string().min(1),
    ephemeral: z.literal(true),
  }).passthrough(),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1).nullable(),
}).passthrough()

export const turnStartResultSchema = z.object({
  turn: z.object({ id: z.string().min(1) }).passthrough(),
}).passthrough()

export const threadItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  status: z.string().optional(),
  text: z.string().optional(),
  phase: z.enum(["commentary", "final_answer"]).nullable().optional(),
}).passthrough()

const scopeShape = {
  threadId: z.string().min(1),
  turnId: z.string().min(1),
}

export const itemNotificationParamsSchema = z.object({
  ...scopeShape,
  item: threadItemSchema,
}).passthrough()

export const agentDeltaParamsSchema = z.object({
  ...scopeShape,
  itemId: z.string().min(1),
  delta: z.string().min(1),
}).passthrough()

export const turnStartedParamsSchema = z.object({
  threadId: z.string().min(1),
  turn: z.object({ id: z.string().min(1) }).passthrough(),
}).passthrough()

export const turnCompletedParamsSchema = z.object({
  threadId: z.string().min(1),
  turn: z.object({
    id: z.string().min(1),
    status: z.enum(["completed", "interrupted", "failed", "inProgress"]),
    error: z.unknown().nullable().optional(),
    items: z.array(threadItemSchema).default([]),
  }).passthrough(),
}).passthrough()
