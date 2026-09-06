import { z } from "zod"
import { captureRowSchema, chainInputSchema, chainRecordSchema, nodeEvidenceSchema } from "./chain.js"

const count = z.number().int().nonnegative(), id = z.string().uuid()
const pageSchema = z.object({ url: z.string().url(), title: z.string(), text: z.string(), truncated: z.boolean(),
  links: z.array(z.object({ url: z.string().url(), title: z.string() }).strict()) }).strict()
export const captureCheckpointSchema = z.object({
  graphDigest: z.string().length(64), input: chainInputSchema, cursor: z.string(), rows: z.array(captureRowSchema),
  page: pageSchema.nullable(), loops: z.record(z.string(), count), transitions: count, checkpoints: count,
  termination: z.string().nullable(),
  pageDigest: z.string().length(64).nullable().default(null), pageChanged: z.boolean().nullable().default(null),
  linkDigest: z.string().length(64).nullable().default(null), linksChanged: z.boolean().nullable().default(null),
  linkFilter: z.object({ pathPrefix: z.string(), pathSuffix: z.string(), titleContains: z.string() }).strict().nullable().default(null),
  comparisonDigest: z.string().length(64).nullable().default(null),
}).strict()
export const captureStepSchema = z.object({
  stepId: z.string(), chainId: id.nullable(), status: z.enum(["pending", "running", "completed", "paused"]),
  inputs: z.array(chainInputSchema), inputIndex: count, rows: z.array(captureRowSchema),
  checkpoint: captureCheckpointSchema.nullable(), commands: count, elapsedMs: count,
  activeSince: z.string().datetime().nullable().default(null),
  explorationCalls: count, llmCalls: count, termination: z.string().nullable(),
  terminalDigest: z.string().length(64).nullable().optional(),
  events: z.array(nodeEvidenceSchema),
  audits: chainRecordSchema.shape.audits,
}).strict()
export const captureStateSchema = z.object({
  steps: z.array(captureStepSchema), coverage: z.enum(["pending", "partial", "completed"]),
  gaps: z.array(z.string()), resumeChecks: z.array(z.object({ at: z.string().datetime(), stepId: z.string(), matched: z.boolean() }).strict()),
}).strict()
export type CaptureCheckpoint = z.infer<typeof captureCheckpointSchema>
export type CaptureStep = z.infer<typeof captureStepSchema>
export type CaptureState = z.infer<typeof captureStateSchema>
