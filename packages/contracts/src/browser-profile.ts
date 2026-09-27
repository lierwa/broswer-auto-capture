import { z } from "zod"

export const browserProfileStatusSchema = z.enum(["closed", "opening", "open", "closing", "cleanup_required"])

export const browserProfileStateSchema = z.object({
  status: browserProfileStatusSchema,
  openedAt: z.string().datetime().nullable(),
}).strict()

export const browserProfileCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open") }).strict(),
  z.object({ type: z.literal("close") }).strict(),
  z.object({ type: z.literal("recover") }).strict(),
])

export type BrowserProfileState = z.infer<typeof browserProfileStateSchema>
export type BrowserProfileCommand = z.infer<typeof browserProfileCommandSchema>
