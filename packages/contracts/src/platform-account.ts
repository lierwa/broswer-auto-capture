import { z } from "zod"
import { browserIdentitySchema, accountEntrySchema, accountCheckSchema, accountMethodSchema,
  accountMaintenanceSchema, accountAvailabilitySchema, accountUrlSchema } from "./browser-account.js"
import { taskChainSchema } from "./task-chain/chain.js"
import { taskRunSchema } from "./task-chain/run.js"

const id = z.uuid(), stamp = z.iso.datetime(), kind = z.enum(["daily", "dedicated"])
export const platformSchema = z.object({ id: z.string().min(1).max(120), name: z.string().min(1),
  url: accountUrlSchema, scopeLabel: z.string(), origins: z.array(z.url()).min(1),
  cookieUrls: z.array(z.url()).min(1), cookieDomains: z.array(z.string()).min(1), sharedServices: z.array(z.string()),
  cookieNames: z.array(z.string().min(1)).default([]), localStorageKeys: z.record(z.url(), z.array(z.string())).default({}),
  source: z.object({ package: z.string(), file: z.string(), function: z.string() }).strict(),
  evidenceVersion: z.string(), engineeringState: z.enum(["candidate", "ready"]),
  transferReady: z.boolean(), transferReason: z.string().nullable(),
  host: z.url().optional(), envelope: z.string().optional() }).strict()
export const platformCatalogSchema = z.object({ schemaVersion: z.literal(1), version: z.string(),
  evidenceSha256: z.string().length(64), platforms: z.array(platformSchema) }).strict()
export const platformResultSchema = z.object({ status: z.enum(["authenticated", "unauthenticated", "inconclusive"]),
  reason: z.string().min(1).max(120), identityKey: z.string().length(64).nullable(),
  displayIdentity: z.string().max(120).nullable(), identityConfirmed: z.boolean(), evidence: z.array(z.string().max(120)),
  sources: z.array(z.object({ package: z.string(), commit: z.string(), file: z.string(), callable: z.string(),
    startLine: z.number().int(), endLine: z.number().int() }).strict()),
  modelCalls: z.literal(0), globalInitSuppressed: z.boolean() }).strict().superRefine((value, context) => {
    if (value.identityConfirmed !== Boolean(value.identityKey) || value.status !== "authenticated" && (value.identityKey || value.displayIdentity))
      context.addIssue({ code: "custom", message: "platform_result_identity_inconsistent" })
  })
export const platformCheckSchema = z.object({ schemaVersion: z.literal(1), id, requestId: id,
  browserIdentityId: id, platformId: z.string(), platformVersion: z.string(), startedAt: stamp,
  finishedAt: stamp.nullable(), status: z.enum(["running", "completed", "cancelled", "interrupted"]),
  result: platformResultSchema.nullable(), chain: taskChainSchema, run: taskRunSchema.nullable() }).strict()
export const platformMethodSchema = z.object({ schemaVersion: z.literal(1), id, platformId: z.string(),
  platformVersion: z.string(), sourceDigest: z.string().length(64), chain: taskChainSchema, createdAt: stamp }).strict()
export const customBindingSchema = z.object({ schemaVersion: z.literal(1), id, browserIdentityId: id,
  url: accountUrlSchema, name: z.string().min(1).max(120), revision: z.number().int().nonnegative(),
  chain: taskChainSchema.nullable(), createdAt: stamp, deletedAt: stamp.nullable() }).strict()
export const transferSchema = z.object({ schemaVersion: z.literal(1), id, requestId: id, platformId: z.string(),
  platformVersion: z.string(), sourceIdentityId: id, targetIdentityId: id,
  sourceWindowId: id.nullable().default(null), targetWindowId: id.nullable().default(null),
  status: z.enum(["preparing", "confirmation", "verifying", "rollback_ready", "write_started", "checking_target", "completed",
    "rolling_back", "rolled_back", "cancelled", "target_pending", "expired", "abandoned"]),
  sourceResult: platformResultSchema.nullable(), targetResult: platformResultSchema.nullable(),
  scope: z.array(z.string()), sharedServices: z.array(z.string()),
  confirmationRef: id.nullable(), expiresAt: stamp.nullable(), confirmedAt: stamp.nullable(),
  rollbackRef: id.nullable(), reason: z.string().nullable(), startedAt: stamp, updatedAt: stamp }).strict()
export const platformSnapshotSchema = z.object({ catalog: z.array(platformSchema), catalogVersion: z.string(),
  identities: z.array(browserIdentitySchema), checks: z.array(platformCheckSchema), bindings: z.array(customBindingSchema),
  currentIdentityIds: z.object({ daily: id.nullable(), dedicated: id.nullable() }).strict(),
  transfers: z.array(transferSchema), windows: z.array(accountMaintenanceSchema),
  availability: accountAvailabilitySchema, operation: z.object({ requestId: id, label: z.string(), startedAt: stamp }).nullable(),
  notice: z.string().nullable(),
  markerSelection: z.object({ reference: id, bindingId: id, revision: z.number().int(),
    meaning: z.enum(["account", "login"]), preview: z.string().max(120), expiresAt: stamp }).strict().nullable(),
  history: z.object({ entries: z.array(accountEntrySchema), checks: z.array(accountCheckSchema),
    methods: z.array(accountMethodSchema.omit({ chain: true })) }).strict() }).strict()
export const platformCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("initialize") }).strict(),
  z.object({ type: z.enum(["platform_check", "platform_login"]), requestId: id, platformId: z.string(), kind }).strict(),
  z.object({ type: z.literal("bind_current"), requestId: id, sessionId: id }).strict(),
  z.object({ type: z.literal("bind_chain"), bindingId: id, revision: z.number().int(), chainId: id, chainVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("remove_binding"), bindingId: id, revision: z.number().int() }).strict(),
  z.object({ type: z.literal("prepare_transfer"), requestId: id, platformId: z.string(), sourceKind: kind }).strict(),
  z.object({ type: z.literal("confirm_transfer"), transferId: id, confirmationRef: id }).strict(),
  z.object({ type: z.enum(["restore_transfer", "abandon_transfer"]), transferId: id, requestId: id }).strict(),
  z.object({ type: z.literal("cancel_operation"), requestId: id }).strict(),
  z.object({ type: z.literal("focus_window"), sessionId: id }).strict(),
  z.object({ type: z.literal("finish_window"), sessionId: id }).strict(),
  z.object({ type: z.literal("custom_browse"), requestId: id, kind }).strict(),
  z.object({ type: z.literal("custom_check"), requestId: id, bindingId: id }).strict(),
  z.object({ type: z.literal("pick_marker"), requestId: id, bindingId: id, revision: z.number().int(), meaning: z.enum(["account", "login"]) }).strict(),
  z.object({ type: z.literal("confirm_marker"), reference: id }).strict(),
  z.object({ type: z.literal("discard_marker") }).strict(),
])
export type Platform = z.infer<typeof platformSchema>
export type PlatformCheck = z.infer<typeof platformCheckSchema>
export type PlatformResult = z.infer<typeof platformResultSchema>
export type PlatformSnapshot = z.infer<typeof platformSnapshotSchema>
export type AccountTransfer = z.infer<typeof transferSchema>
export const platformOperationSchema = z.object({ id, label: z.string(), startedAt: stamp, finishedAt: stamp.nullable(),
  status: z.enum(["running", "completed", "failed", "cancelled", "interrupted"]), reason: z.string().nullable() }).strict()
