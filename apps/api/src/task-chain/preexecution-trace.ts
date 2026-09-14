import { z } from "zod"
import { jsonValueSchema } from "@browser-capture/contracts"
import { traceEventSchema } from "./exploration-trace.js"
import { outputFailureSchema, recordOutputInputSchema } from "./preexecution-output.js"

export const preexecutionFeedbackSchema = outputFailureSchema.omit({ ok: true }).extend({
  at: z.string().datetime(), category: z.enum(["repairable", "external", "terminal"]),
  tool: z.string(), callId: z.string().nullable(), modelRunId: z.string().nullable(),
}).strict()
export type PreexecutionFeedback = z.infer<typeof preexecutionFeedbackSchema>

export const outputWriteRevisionSchema = z.object({
  id: z.string(), at: z.string().datetime(), callId: z.string(), modelRunId: z.string(),
  operation: recordOutputInputSchema, browserEventIds: z.array(z.string()), currentUrl: z.string().nullable(),
}).strict()
export type OutputWriteRevision = z.infer<typeof outputWriteRevisionSchema>

export const preexecutionModelRunSchema = z.object({
  runId: z.string(), sessionId: z.string(), modelId: z.string(), reasoningEffort: z.string(),
  status: z.enum(["running", "completed", "failed", "cancelled"]), startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(), invocationIds: z.array(z.string()), errorCode: z.string().nullable(),
}).strict()
export type PreexecutionModelRun = z.infer<typeof preexecutionModelRunSchema>

export const preexecutionArtifactSchema = z.object({
  runId: z.string(), status: z.enum(["running", "waiting_for_human", "failed", "completed"]),
  input: jsonValueSchema, browserEvents: z.array(traceEventSchema), outputWrites: z.array(outputWriteRevisionSchema),
  feedback: z.array(preexecutionFeedbackSchema), output: jsonValueSchema.optional(), outputDigest: z.string().optional(),
  finishAccepted: z.boolean(), modelRuns: z.array(preexecutionModelRunSchema), browserRunId: z.string(), closed: z.boolean(),
}).strict()
export type PreexecutionArtifact = z.infer<typeof preexecutionArtifactSchema>

export function clonePreexecutionArtifact(artifact: PreexecutionArtifact) {
  return preexecutionArtifactSchema.parse(structuredClone(artifact))
}
