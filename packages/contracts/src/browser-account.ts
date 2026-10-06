import { z } from "zod"
import { taskChainSchema } from "./task-chain/chain.js"

const id = z.uuid()
const stamp = z.iso.datetime()
export const accountUrlSchema = z.url().max(2048).refine(value => {
  const url = new URL(value)
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash
}, "只接受不含凭据或片段的网站地址")
export const browserIdentitySchema = z.object({ id, kind: z.enum(["daily", "dedicated"]),
  name: z.string().min(1).max(120), binding: z.string().min(1).max(128), createdAt: stamp }).strict()
export const accountEntryInputSchema = z.object({ url: accountUrlSchema, name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).default(""), expectedIdentity: z.string().trim().max(120).default("") }).strict()
export const accountEntrySchema = accountEntryInputSchema.extend({ id, browserIdentityId: id,
  revision: z.number().int().nonnegative(), methodId: id.nullable(), deletedAt: stamp.nullable(), createdAt: stamp }).strict()
export const identityResultSchema = z.object({ outcome: z.enum(["verified", "unauthenticated", "inconclusive"]),
  identityConfirmed: z.boolean(), displayIdentity: z.string().trim().min(1).max(120).nullable(),
  reason: z.enum(["identity_observed", "login_required", "challenge", "evidence_missing", "page_changed", "network_error",
    "runtime_failed", "cancelled", "window_closed", "interrupted", "invalid_output"]) }).strict().superRefine((value, ctx) => {
  if ((value.outcome === "verified") !== value.identityConfirmed
    || value.outcome === "verified" && value.reason !== "identity_observed"
    || value.outcome === "unauthenticated" && value.reason !== "login_required"
    || value.outcome === "inconclusive" && ["identity_observed", "login_required"].includes(value.reason)
    || !value.identityConfirmed && value.displayIdentity !== null) ctx.addIssue({ code: "custom", message: "identity_result_inconsistent" })
})
export const accountCheckSchema = z.object({ id, entryId: id, entryRevision: z.number().int(), browserIdentityId: id,
  methodId: id, chainId: id, chainVersion: z.number().int().positive(), chainDigest: z.string().length(64), runId: id,
  startedAt: stamp, finishedAt: stamp.nullable(), result: identityResultSchema.nullable(),
  expectedIdentity: z.string(), identityChanged: z.boolean(),
  runStatus: z.string(), modelCalls: z.number().int().nonnegative(), auditComplete: z.boolean(),
  // WHY：只保存必要审计摘要；节点输出、页面、Cookie 和原认证响应不进入账号库。
  nodeEvents: z.array(z.object({ nodeId: z.string(), status: z.string() }).strict()) }).strict()
export const accountMaintenanceSchema = z.object({ id, browserIdentityId: id, entryId: id.nullable(),
  headless: z.boolean().optional(),
  ownerId: id, leaseId: id, status: z.enum(["opening", "open", "recognizing", "checking", "establishing", "closing", "cleanup_required", "closed"]),
  createdAt: stamp, updatedAt: stamp, reason: z.string().nullable() }).strict()
export const accountMethodSchema = z.object({ id, entryId: id, entryRevision: z.number().int(), url: accountUrlSchema,
  chain: taskChainSchema.nullable(), state: z.enum(["building", "candidate", "failed"]),
  compilation: z.array(z.object({ sequence: z.number().int().positive(), digest: z.string().length(64),
    sourceDigest: z.string().length(64), phase: z.enum(["prefix", "final"]), nodes: z.number().int().nonnegative(),
    gaps: z.array(z.string()) }).strict()).default([]),
  sourceDigest: z.string().nullable(), modelCalls: z.number().int().nonnegative(), modelAuditComplete: z.boolean().default(false), reason: z.string().nullable(),
  createdAt: stamp }).strict()
export const accountBlockerSchema = z.object({ reason: z.enum(["running_task", "retained_window", "profile_window"]),
  message: z.string(), taskId: id.nullable() }).strict()
export const accountAvailabilitySchema = z.object({ daily: accountBlockerSchema.nullable(), dedicated: accountBlockerSchema.nullable() })
export const accountSnapshotSchema = z.object({ identities: z.array(browserIdentitySchema),
  entries: z.array(accountEntrySchema), checks: z.array(accountCheckSchema), maintenance: accountMaintenanceSchema.nullable(),
  notice: z.string().nullable().default(null),
  availability: accountAvailabilitySchema.default({ daily: null, dedicated: null }),
  methods: z.array(accountMethodSchema.omit({ chain: true }).extend({ usable: z.boolean() })) }).strict()
export const accountCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("identify"), kind: z.enum(["daily", "dedicated"]) }).strict(),
  z.object({ type: z.literal("browse"), browserIdentityId: id }).strict(),
  z.object({ type: z.literal("capture"), sessionId: id }).strict(),
  z.object({ type: z.literal("verify_availability"), kind: z.enum(["daily", "dedicated"]) }).strict(),
  z.object({ type: z.literal("add"), browserIdentityId: id, entry: accountEntryInputSchema }).strict(),
  z.object({ type: z.literal("edit"), entryId: id, revision: z.number().int(), entry: accountEntryInputSchema }).strict(),
  z.object({ type: z.literal("remove"), entryId: id, revision: z.number().int() }).strict(),
  z.object({ type: z.enum(["open", "check", "refresh", "establish"]), entryId: id, revision: z.number().int() }).strict(),
  z.object({ type: z.enum(["finish", "cancel"]), sessionId: id }).strict(),
])
export type BrowserIdentity = z.infer<typeof browserIdentitySchema>
export type AccountEntry = z.infer<typeof accountEntrySchema>
export type AccountCheck = z.infer<typeof accountCheckSchema>
export type AccountMaintenance = z.infer<typeof accountMaintenanceSchema>
export type AccountMethod = z.infer<typeof accountMethodSchema>
export type IdentityResult = z.infer<typeof identityResultSchema>
export type AccountSnapshot = z.infer<typeof accountSnapshotSchema>
