import { z } from "zod"

export const CONTRACT_VERSION = "bat-task-chain/v1" as const
export const contractVersionSchema = z.literal(CONTRACT_VERSION)
export const identitySchema = z.string().uuid()
export const taskIdentitySchema = z.string().regex(/^[a-z0-9-]{1,64}$/)
export const keySchema = z.string().regex(/^[a-z][A-Za-z0-9_-]{0,63}$/)
  .refine((key) => !["constructor", "prototype", "__proto__"].includes(key), "保留键不可写入上下文")
export const textSchema = z.string().trim().min(1).max(10_000)
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const countSchema = z.number().int().nonnegative()
export const versionReferenceSchema = z.object({
  id: identitySchema, version: z.number().int().positive(), digest: digestSchema,
}).strict()
// WHY：Plan 先冻结链路 lineage，再由探索产生可执行 digest；双向 digest 会形成无法求值的哈希环。
export const entityVersionReferenceSchema = z.object({
  id: identitySchema, version: z.number().int().positive(),
}).strict()
export const budgetSchema = z.object({
  maxTransitions: z.number().int().positive(), maxBrowserCommands: countSchema,
  maxActiveMs: z.number().int().positive(), maxLlmCalls: countSchema,
  maxInvocations: z.number().int().positive(), maxDepth: z.number().int().positive(),
}).strict()
export const consumptionSchema = z.object({
  transitions: countSchema, browserCommands: countSchema, activeMs: countSchema,
  llmCalls: countSchema.nullable(), invocations: countSchema,
}).strict()
export const artifactReferenceSchema = z.object({
  artifactId: identitySchema, mediaType: textSchema, digest: digestSchema,
}).strict()
export type VersionReference = z.infer<typeof versionReferenceSchema>
export type EntityVersionReference = z.infer<typeof entityVersionReferenceSchema>
export type TaskBudget = z.infer<typeof budgetSchema>
export type TaskConsumption = z.infer<typeof consumptionSchema>
export type ArtifactReference = z.infer<typeof artifactReferenceSchema>
