import { z } from "zod"
import { jsonValueSchema, resultSpecSchema } from "@browser-capture/contracts"
import { hybridTargetSchema, readSpecificationSchema, targetScopeSchema } from "./hybrid-schema.js"
import { valueSchemaSchema } from "@browser-capture/contracts"
import { hybridCompilerResponseSchema } from "./hybrid-schema.js"
import { hybridVerifiedChildSchema } from "./hybrid-invoke.js"

const id = z.uuid()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const hybridStartRequestSchema = z.object({ id, type: z.literal("hybrid_start"), config: z.object({
  headless: z.boolean(), profilePath: z.string().min(1),
  allowedOrigins: z.array(z.string().url()).min(1).max(32),
  allowedSites: z.array(z.object({ scheme: z.enum(["http", "https"]), domain: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65_535).nullable(), includeSubdomains: z.boolean() }).strict()).min(1).max(32),
}).strict() }).strict()
export const hybridProfileStartRequestSchema = z.object({ id, type: z.literal("profile_start"), config: z.object({
  profilePath: z.string().min(1), headless: z.boolean().default(false), startUrl: z.url().optional(),
}).strict() }).strict()
export const hybridProfilePickTargetRequestSchema = z.object({ id, type: z.literal("profile_pick_target"),
  timeoutMs: z.number().int().min(10_000).max(300_000) }).strict()
export const hybridProfilePickTargetResultSchema = z.object({
  target: hybridTargetSchema, tag: z.string().min(1).max(64), strategy: z.enum(["structure", "history"]),
}).strict()
export const hybridCommandSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("browser.workflow-step"), version: z.literal(2),
    actionName: z.enum(["navigate", "go_back", "wait", "click", "input", "scroll", "send_keys", "dropdown_options", "select_dropdown", "bat_scroll_to", "bat_wait_for"]),
    args: z.record(z.string(), jsonValueSchema), target: hybridTargetSchema.nullable(),
    postconditions: z.array(z.record(z.string(), jsonValueSchema)).min(1) }).strict(),
  z.object({ name: z.literal("browser.read-fields"), version: z.literal(2), specification: readSpecificationSchema,
    scope: targetScopeSchema.optional() }).strict(),
  z.object({ name: z.literal("browser.target-readiness"), version: z.literal(1),
    actionName: z.enum(["click", "input", "dropdown_options", "select_dropdown"]), target: hybridTargetSchema }).strict(),
])
export const hybridExecuteRequestSchema = z.object({ id, type: z.literal("hybrid_execute"), command: hybridCommandSchema }).strict()
export const hybridObserveRequestSchema = z.object({ id, type: z.literal("hybrid_observe") }).strict()
export const hybridBrowserStateSchema = z.object({ sessionId: z.string().min(1), tabId: z.string().min(1),
  documentId: z.string().min(1).optional(),
  url: z.string().min(1), observationDigest: z.string().regex(/^[a-f0-9]{64}$/), observedAt: z.string().datetime() }).strict()
export const hybridExecuteResultSchema = z.object({ output: jsonValueSchema, browser: hybridBrowserStateSchema,
  browserCommands: z.number().int().nonnegative(), modelCalls: z.literal(0) }).strict()
export type HybridRunnerRequest = z.infer<typeof hybridStartRequestSchema> | z.infer<typeof hybridProfileStartRequestSchema>
  | z.infer<typeof hybridProfilePickTargetRequestSchema> | z.infer<typeof hybridExecuteRequestSchema>
  | z.infer<typeof hybridObserveRequestSchema> | z.infer<typeof hybridAuthorRequestSchema> | z.infer<typeof hybridCompileRequestSchema>
  | z.infer<typeof hybridAnnotateRequestSchema>

export const hybridCompileRequestSchema = z.object({ id, type: z.literal("hybrid_compile"), request: jsonValueSchema,
  outputSchema: valueSchemaSchema, verifiedChildren: z.array(hybridVerifiedChildSchema).max(100).default([]) }).strict()

export const hybridAuthorSourceSchema = z.object({ task: z.string().min(1).max(100000), input: jsonValueSchema,
  inputSchema: valueSchemaSchema, outputSchema: valueSchemaSchema, resultSpec: resultSpecSchema,
  requirementId: z.string(), requirementVersion: z.number().int().positive(),
  planId: z.string(), planVersion: z.number().int().positive(), stepId: z.string(), callMode: z.enum(["once", "each", "batch"]),
  requirementText: z.string().min(1).max(100000), requirementDigest: hash, planDigest: hash,
  entryUrls: z.array(z.url()).max(32),
  maxSteps: z.number().int().min(1).max(100),
  verifiedChildren: z.array(hybridVerifiedChildSchema).max(100).optional() }).strict()
export const hybridAuthorRequestSchema = z.object({ id, type: z.literal("hybrid_author"), source: hybridAuthorSourceSchema,
  model: z.object({ model: z.string().min(1), endpoint: z.url(), token: z.string().min(1) }).strict() }).strict()
export const hybridAnnotateRequestSchema = hybridCompileRequestSchema.extend({ type: z.literal("hybrid_annotate"),
  model: hybridAuthorRequestSchema.shape.model }).strict()
export const hybridAnnotateResultSchema = z.object({ request: jsonValueSchema,
  response: hybridCompilerResponseSchema }).strict()
const hybridAuthorResultBase = z.object({ output: jsonValueSchema, request: jsonValueSchema,
  response: hybridCompilerResponseSchema, history: z.object({ localRef: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  sourceSuccess: z.boolean(), browserCommands: z.number().int().nonnegative() })
// 旧 source/v2 只读兼容；新准备来源不再产生或消费全局 judge 结论。
export const hybridAuthorResultSchema = z.union([
  hybridAuthorResultBase.strict(),
  hybridAuthorResultBase.extend({ sourceValidated: z.boolean() }).strict(),
])
