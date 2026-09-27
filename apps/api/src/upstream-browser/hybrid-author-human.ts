import { z } from "zod"
import { humanWaitReasonSchema } from "@browser-capture/contracts/browser"

export const authoringHumanWaitSchema = z.object({
  id: z.uuid(), reason: humanWaitReasonSchema,
  prompt: z.string().trim().min(1).max(500), origin: z.string().url().nullable(),
}).strict()
export type AuthoringHumanWait = z.infer<typeof authoringHumanWaitSchema>
export type AuthoringHumanHandlers = {
  onHumanWait?: (wait: AuthoringHumanWait, resume: () => Promise<void>) => void
}
export const authoringHumanEventSchema = z.object({
  id: z.uuid(), event: z.literal("human_wait"), wait: authoringHumanWaitSchema,
}).strict()
export const hybridAuthorResumeRequestSchema = z.object({
  id: z.uuid(), type: z.literal("hybrid_author_resume"), authorRequestId: z.uuid(), waitpointId: z.uuid(),
}).strict()
export const authoringHumanResumeResultSchema = z.object({ resumed: z.literal(true) }).strict()
