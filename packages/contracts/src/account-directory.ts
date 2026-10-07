import { z } from "zod"
import { browserIdentitySchema } from "./browser-account.js"
import { platformSchema } from "./platform-account.js"

const id = z.uuid(), stamp = z.iso.datetime()
export const accountIntentSchema = z.enum(["add", "check", "relogin", "switch", "open", "remove", "custom_open", "custom_read", "custom_pick", "custom_confirm", "custom_check", "custom_add", "custom_attach"])
export const logicalAccountSchema = z.object({ id, platformId: z.string().min(1), revision: z.number().int().positive(),
  sourceIdentityId: id, sourceBinding: z.string().min(1), identityKey: z.string().length(64).nullable(),
  displayIdentity: z.string().max(120).nullable(), state: z.enum(["ready", "expired", "unconfirmed", "account_changed"]),
  checkId: id.nullable(), checkedAt: stamp.nullable(), platformVersion: z.string(), reason: z.string().nullable(),
  createdAt: stamp, deletedAt: stamp.nullable() }).strict()
export const directoryOperationSchema = z.object({ id, requestId: id, platformId: z.string(), intent: accountIntentSchema,
  logicalRevision: z.number().int().nonnegative(), sourceIdentityId: id.nullable(), sourceBinding: z.string().nullable(),
  ownerId: id.nullable(), leaseId: id.nullable(), startedAt: stamp, deadline: stamp, finishedAt: stamp.nullable(),
  phase: z.enum(["discovering", "opening", "waiting", "checking", "saving", "finished"]),
  status: z.enum(["running", "completed", "failed", "cancelled", "interrupted"]), reason: z.string().max(240).nullable() }).strict()
const publicAccount = logicalAccountSchema.pick({ id: true, revision: true, identityKey: true, displayIdentity: true,
  state: true, checkedAt: true, reason: true })
export const accountDirectorySchema = z.object({ items: z.array(z.object({ platform: platformSchema.pick({ id: true, name: true, url: true }),
  account: publicAccount.nullable(), revision: z.number().int().nonnegative(), custom: z.boolean() }).strict()),
  operation: directoryOperationSchema.omit({ sourceIdentityId: true, sourceBinding: true, ownerId: true, leaseId: true }).nullable(),
  marker: z.object({ reference: id, platformId: z.string(), preview: z.string().max(120) }).strict().nullable(),
  customPage: z.object({ bindingId: id, revision: z.number().int(), name: z.string().max(120), url: z.url(), hasChain: z.boolean() }).strict().nullable(),
  customWindow: z.boolean(), notice: z.string().nullable() }).strict()
const browser = { browserKind: browserIdentitySchema.shape.kind.optional() }
const command = { requestId: id, platformId: z.string().min(1), revision: z.number().int().nonnegative(), ...browser }
export const accountDirectoryCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["add", "check", "relogin", "switch", "open", "remove", "custom_check", "custom_add"]), ...command }).strict(),
  z.object({ type: z.literal("cancel"), requestId: id }).strict(),
  z.object({ type: z.enum(["custom_open", "custom_read"]), requestId: id, ...browser }).strict(),
  z.object({ type: z.literal("custom_pick"), ...command }).strict(),
  z.object({ type: z.literal("custom_confirm"), requestId: id, reference: id, ...browser }).strict(),
  z.object({ type: z.literal("custom_attach"), ...command, chainId: id, chainVersion: z.number().int().positive() }).strict(),
])
export type LogicalAccount = z.infer<typeof logicalAccountSchema>
export type DirectoryOperation = z.infer<typeof directoryOperationSchema>
export type AccountDirectory = z.infer<typeof accountDirectorySchema>
export type DirectoryCommand = z.infer<typeof accountDirectoryCommandSchema>
// WHY：Profile/授权仍是原身份合同；逻辑账号不是另一份 Cookie 或浏览器配置。
export type AccountSource = z.infer<typeof browserIdentitySchema>
export const logicalAccountRevisionSchema = z.object({ id, accountId: id, archivedAt: stamp, account: logicalAccountSchema }).strict()
