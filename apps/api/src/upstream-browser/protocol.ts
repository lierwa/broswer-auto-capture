import { z } from "zod"
import { jsonValueSchema, valueSchemaSchema } from "@browser-capture/contracts"
import { modelPurposeSchema } from "./model-bridge.js"

const identity = z.uuid()
const browser = z.object({ sessionId: z.string().min(1), tabId: z.string().min(1), url: z.string().url(),
  observationDigest: z.string().length(64), observedAt: z.string().datetime() }).strict()
const localArtifact = z.object({ localRef: z.string().min(1), digest: z.string().length(64) }).strict()
const common = z.object({ id: identity, browser }).strict()

export const runnerStartRequestSchema = z.object({ id: identity, type: z.literal("start"), config: z.object({
  model: z.string().min(1), endpoint: z.string().url(), token: z.string().min(1), artifactDirectory: z.string().min(1),
  headless: z.boolean(), executablePath: z.string().min(1).optional(),
}).strict() }).strict()
export const runnerAuthorRequestSchema = z.object({ id: identity, type: z.literal("author"), task: z.string().min(1),
  input: jsonValueSchema, inputSchema: valueSchemaSchema, outputSchema: valueSchemaSchema,
  workflowInputs: z.record(z.string().min(1), z.string().min(1)), artifactKey: z.string().min(1),
  maxSteps: z.number().int().positive().max(100) }).strict()
export const runnerReplayRequestSchema = z.object({ id: identity, type: z.literal("replay"), definition: jsonValueSchema,
  inputs: z.record(z.string().min(1), z.union([z.string(), z.number(), z.boolean()])),
  outputSchema: valueSchemaSchema, artifactKey: z.string().min(1) }).strict()
export const runnerCloseRequestSchema = z.object({ id: identity, type: z.literal("close") }).strict()

export const runnerAuthorResultSchema = common.extend({
  sourceSuccess: z.literal(true), sourceValidated: z.literal(true), output: jsonValueSchema,
  definition: jsonValueSchema, stepTypes: z.array(z.string().min(1)).min(1),
  workflowInputs: z.record(z.string().min(1), z.string().min(1)), browserCommands: z.number().int().nonnegative(),
  history: localArtifact, rawResult: localArtifact,
}).strict()
export const runnerReplayResultSchema = common.extend({ output: jsonValueSchema,
  stepCount: z.number().int().positive(), browserCommands: z.number().int().nonnegative(), rawResult: localArtifact }).strict()
export const runnerResponseSchema = z.discriminatedUnion("ok", [
  z.object({ id: identity, ok: z.literal(true), result: jsonValueSchema }).strict(),
  z.object({ id: identity, ok: z.literal(false), code: z.enum(["upstream_start_failed", "upstream_author_failed",
    "upstream_replay_failed", "upstream_human_required", "upstream_cancelled", "hybrid_runner_failed"]), diagnostic: localArtifact.optional(),
    reason: z.string().regex(/^[A-Za-z_][A-Za-z_0-9:]{0,159}$/).optional() }).strict(),
])

export type RunnerRequest = z.infer<typeof runnerStartRequestSchema> | z.infer<typeof runnerAuthorRequestSchema>
  | z.infer<typeof runnerReplayRequestSchema> | z.infer<typeof runnerCloseRequestSchema>
export type RunnerModelPurpose = z.infer<typeof modelPurposeSchema>
