import { z } from "zod"
import { digestSchema, identitySchema, keySchema, taskIdentitySchema } from "./task-chain/common.js"
import { jsonValueSchema } from "./task-chain/value.js"

export const browserProfileStatusSchema = z.enum(["closed", "opening", "open", "closing"])

export const browserProfileStateSchema = z.object({
  status: browserProfileStatusSchema,
  openedAt: z.string().datetime().nullable(),
}).strict()

export const browserProfileCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }).strict(),
  z.object({ type: z.literal("close") }).strict(),
])

export const browserTargetSelectionStatusSchema = z.enum([
  "idle", "opening", "selecting", "selected", "failed", "cancelled",
])

export const browserTargetSelectionStateSchema = z.object({
  id: identitySchema.nullable(), status: browserTargetSelectionStatusSchema,
  requestId: identitySchema.nullable(), taskId: taskIdentitySchema.nullable(),
  draftId: identitySchema.nullable(), chainId: identitySchema.nullable(), nodeId: keySchema.nullable(),
  target: jsonValueSchema.nullable(), tag: z.string().min(1).max(64).nullable(),
  strategy: z.enum(["structure", "history"]).nullable(), error: z.enum([
    "target_selection_start_failed", "target_selection_failed", "target_selection_timeout",
    "target_selection_cancelled", "target_selection_cleanup_unconfirmed",
  ]).nullable(),
  startedAt: z.string().datetime().nullable(), updatedAt: z.string().datetime().nullable(),
}).strict()

export const browserTargetSelectionCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), requestId: identitySchema, draftId: identitySchema,
    chainId: identitySchema, nodeId: keySchema,
    expectedRevision: z.number().int().nonnegative(), expectedChecksum: digestSchema }).strict(),
  z.object({ type: z.literal("cancel"), requestId: identitySchema, selectionId: identitySchema }).strict(),
])

export type BrowserProfileState = z.infer<typeof browserProfileStateSchema>
export type BrowserProfileCommand = z.infer<typeof browserProfileCommandSchema>
export type BrowserTargetSelectionState = z.infer<typeof browserTargetSelectionStateSchema>
export type BrowserTargetSelectionCommand = z.infer<typeof browserTargetSelectionCommandSchema>
