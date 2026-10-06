import { z } from "zod"
import { jsonValueSchema, resultSpecSchema } from "@browser-capture/contracts"
import { hybridTargetSchema, readSpecificationSchema, targetScopeSchema, requiredReadPathsSchema,
  hybridOrdinaryActionNameSchema } from "./hybrid-schema.js"
import { valueSchemaSchema } from "@browser-capture/contracts"
import { hybridCompilerResponseSchema, compilationGapSchema } from "./hybrid-schema.js"
import { hybridVerifiedChildSchema } from "./hybrid-invoke.js"
import { runnerOwnershipSchema } from "./runner-ownership.js"
import { hybridAuthorResumeRequestSchema } from "./hybrid-author-human.js"
import { compilationAckSchema } from "./hybrid-compilation-checkpoint.js"
import { pythonCleanupResultSchema } from "./cleanup.js"

const id = z.uuid()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const executionStorageSchema = z.object({ cookies: z.array(z.object({ name: z.string(), value: z.string(),
  domain: z.string(), path: z.string(), expires: z.number(), httpOnly: z.boolean(), secure: z.boolean(),
  sameSite: z.enum(["Strict", "Lax", "None"]) }).strict()), origins: z.array(z.object({ origin: z.url(),
    localStorage: z.array(z.object({ name: z.string(), value: z.string() }).strict()) }).strict()) }).strict()
export const hybridStartRequestSchema = z.object({ id, type: z.literal("hybrid_start"), config: z.object({
  headless: z.boolean(), profilePath: z.string().min(1),
  storageState: executionStorageSchema.optional(),
  connectionOwnerId: id.optional(),
  allowedOrigins: z.array(z.string().url()).min(1).max(32),
  allowedSites: z.array(z.object({ scheme: z.enum(["http", "https"]), domain: z.string().min(1).max(253),
    port: z.number().int().min(1).max(65_535).nullable(), includeSubdomains: z.boolean() }).strict()).min(1).max(32),
  managedWindow: z.object({ ownerId: id, resume: z.boolean(), releasedOwners: z.array(id).optional() }).strict().optional(),
  existingBrowser: z.object({ ownerId: id, resume: z.boolean(), releasedOwners: z.array(id).optional(),
    cdpUrl: z.url().refine((value) => {
      const url = new URL(value)
      return url.protocol === "ws:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
        && !url.username && !url.password && !url.search && !url.hash
        && url.pathname.startsWith("/devtools/browser/")
    }, "existing_browser_local_endpoint_required"),
  }).strict().optional(),
}).strict().refine((value) => !(value.managedWindow && value.existingBrowser),
  "browser_connection_owner_conflict").refine(value => !value.connectionOwnerId
    || Boolean(value.existingBrowser && !value.existingBrowser.resume),
  "hybrid_attached_window_connection_requires_new_operation") }).strict()
export const hybridProfileStartRequestSchema = z.object({ id, type: z.literal("profile_start"), config: z.object({
  profilePath: z.string().min(1), headless: z.boolean().default(false), ownerId: id,
}).strict() }).strict()
export const profileOwnerRequestSchema = z.object({ id, type: z.literal("profile_owner"), ownerId: id,
  launcherPid: z.number().int().positive() }).strict()
export const profileRecoverRequestSchema = z.object({ id, type: z.literal("profile_recover"),
  profilePath: z.string().min(1), ownerId: id, leaseId: id, runner: runnerOwnershipSchema }).strict()
export const hybridCommandSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("browser.workflow-step"), version: z.literal(2),
    actionName: hybridOrdinaryActionNameSchema,
    args: z.record(z.string(), jsonValueSchema), target: hybridTargetSchema.nullable(),
    postconditions: z.array(z.record(z.string(), jsonValueSchema)) }).strict(),
  z.object({ name: z.literal("browser.read-fields"), version: z.literal(2), specification: readSpecificationSchema,
    scope: targetScopeSchema.optional(), requiredPaths: requiredReadPathsSchema.optional(), inherited: jsonValueSchema.optional() }).strict(),
  z.object({ name: z.literal("browser.target-readiness"), version: z.literal(1),
    actionName: z.enum(["click", "input", "dropdown_options", "select_dropdown"]), target: hybridTargetSchema }).strict(),
])
export const hybridExecuteRequestSchema = z.object({ id, type: z.literal("hybrid_execute"),
  actionRef: z.string().min(1).max(256).optional(), command: hybridCommandSchema }).strict()
export const hybridObserveRequestSchema = z.object({ id, type: z.literal("hybrid_observe") }).strict()
export const hybridReleaseRequestSchema = z.object({ id, type: z.literal("hybrid_release"), connectionOwnerId: id }).strict()
export const hybridReleaseResultSchema = pythonCleanupResultSchema.safeExtend({
  retainedConnectionOwnerId: id.nullable(),
}).superRefine((value, context) => {
  if (!value.closed && value.retainedConnectionOwnerId !== null) {
    context.addIssue({ code: "custom", message: "unconfirmed resources cannot retain connection" })
  }
})
export const hybridHandoffRequestSchema = z.object({ id, type: z.literal("hybrid_handoff") }).strict()
export const hybridManagedWindowRequestSchema = z.object({ id, type: z.literal("hybrid_managed_window"),
  action: z.enum(["focus", "inspect", "page", "end", "verify_closed"]), profilePath: z.string().min(1), ownerId: id, leaseId: id,
  cdpUrl: z.url().optional(), legacyEndpointVerified: z.boolean().optional(), controllerReleased: z.boolean().optional(),
  browserMode: z.enum(["daily", "dedicated-visible", "dedicated-headless"]).optional() }).strict()
export const accountSessionRequestSchema = z.object({ id, type: z.literal("hybrid_account_session"),
  action: z.enum(["open_page", "check", "observe", "auth_read", "auth_prepare", "auth_write", "auth_restore", "auth_abandon", "pick_marker", "clear_marker"]),
  profilePath: z.string().min(1), ownerId: id, leaseId: id, kind: z.enum(["daily", "dedicated"]),
  cdpUrl: z.url().optional(), legacyEndpointVerified: z.boolean().optional(),
  platformId: z.string().min(1).max(120), catalogVersion: z.string(), evidenceSha256: hash,
  payload: jsonValueSchema.default(null) }).strict()
export const hybridManagedWindowResultSchema = z.object({ leaseId: id, ownerId: id,
  targetDigest: hash.nullable(), active: z.boolean(), reason: z.string().max(100).nullable(),
  page: z.object({ url: z.string().max(8192) }).strict().optional() }).strict()
export const hybridWindowLeaseSchema = hybridManagedWindowResultSchema.extend({
  targetDigest: hash, active: z.literal(true), reason: z.null(),
}).strict()
export const hybridBrowserStateSchema = z.object({ sessionId: z.string().min(1), tabId: z.string().min(1),
  documentId: z.string().min(1).optional(),
  url: z.string().min(1), observationDigest: z.string().regex(/^[a-f0-9]{64}$/), observedAt: z.string().datetime() }).strict()
export const hybridExecuteResultSchema = z.object({ output: jsonValueSchema, browser: hybridBrowserStateSchema,
  browserCommands: z.number().int().nonnegative(), modelCalls: z.literal(0) }).strict()
export type HybridRunnerRequest = z.infer<typeof hybridStartRequestSchema> | z.infer<typeof hybridProfileStartRequestSchema>
  | z.infer<typeof accountSessionRequestSchema>
  | z.infer<typeof profileOwnerRequestSchema> | z.infer<typeof profileRecoverRequestSchema>
  | z.infer<typeof hybridExecuteRequestSchema>
  | z.infer<typeof hybridObserveRequestSchema> | z.infer<typeof hybridHandoffRequestSchema>
  | z.infer<typeof hybridReleaseRequestSchema>
  | z.infer<typeof hybridManagedWindowRequestSchema> | z.infer<typeof hybridAuthorRequestSchema> | z.infer<typeof hybridCompileRequestSchema>
  | z.infer<typeof hybridAnnotateRequestSchema>
  | z.infer<typeof hybridAuthorResumeRequestSchema>
  | z.infer<typeof compilationAckSchema>

export const hybridCompileRequestSchema = z.object({ id, type: z.literal("hybrid_compile"), request: jsonValueSchema,
  outputSchema: valueSchemaSchema, sourceGaps: z.array(compilationGapSchema),
  verifiedChildren: z.array(hybridVerifiedChildSchema).max(100).default([]) }).strict()

export const hybridAuthorSourceSchema = z.object({ task: z.string().min(1).max(100000), input: jsonValueSchema,
  readOnly: z.boolean().optional(),
  inputSchema: valueSchemaSchema, outputSchema: valueSchemaSchema, resultSpec: resultSpecSchema,
  requirementId: z.string(), requirementVersion: z.number().int().positive(),
  planId: z.string(), planVersion: z.number().int().positive(), stepId: z.string(), callMode: z.enum(["once", "each", "batch"]),
  requirementText: z.string().min(1).max(100000), requirementDigest: hash, planDigest: hash,
  entryUrls: z.array(z.url()).max(32),
  maxSteps: z.number().int().min(1).max(100) }).strict()
export const hybridAuthorRequestSchema = z.object({ id, type: z.literal("hybrid_author"), source: hybridAuthorSourceSchema,
  onlineCompilation: z.boolean().default(false),
  model: z.object({ model: z.string().min(1), endpoint: z.url(), token: z.string().min(1) }).strict() }).strict()
export const hybridAnnotateRequestSchema = hybridCompileRequestSchema.extend({ type: z.literal("hybrid_annotate"),
  model: hybridAuthorRequestSchema.shape.model }).strict()
export const hybridAnnotateResultSchema = z.object({ request: jsonValueSchema,
  response: hybridCompilerResponseSchema }).strict()
export const hybridAuthorResultSchema = z.object({ output: jsonValueSchema,
  canonicalRequest: z.string().min(1), sourceGaps: z.array(compilationGapSchema) }).strict()
