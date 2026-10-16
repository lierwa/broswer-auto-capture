import { z } from "zod"
import { artifactReferenceSchema, identitySchema, keySchema, textSchema, versionReferenceSchema } from "./common.js"
import { taskDraftReferenceSchema } from "./revision.js"
import { jsonValueSchema } from "./value.js"

// WHY：修订固定原版本与真实来源；问题描述不能充当节点、图或浏览器授权。
export const taskMethodRevisionBaseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft"), reference: taskDraftReferenceSchema }).strict(),
  z.object({ kind: z.literal("release"), reference: versionReferenceSchema }).strict(),
])
export const taskMethodRevisionSourceSchema = z.object({
  sourceJobId: identitySchema, sourceSequence: z.number().int().nonnegative(), artifact: artifactReferenceSchema,
}).strict()
export const taskMethodRevisionFields = {
  base: taskMethodRevisionBaseSchema, stepId: keySchema,
  nodeIds: z.array(keySchema).min(1).max(500), source: taskMethodRevisionSourceSchema,
  problem: textSchema.max(2000), input: jsonValueSchema,
}
export const taskMethodRevisionContextSchema = z.object(taskMethodRevisionFields).extend({
  affectedStepIds: z.array(keySchema).min(1).max(100),
  // WHY：必要前缀由既有普通运行器执行并单独审计，不能把旧样本值当当前页面状态。
  prefixRunIds: z.array(identitySchema).max(100).default([]),
}).strict()
export const taskMethodRevisionOptionsSchema = z.object({
  base: taskMethodRevisionBaseSchema,
  steps: z.array(z.object({ stepId: keySchema, title: textSchema, nodeIds: z.array(keySchema).max(500),
    source: taskMethodRevisionSourceSchema.nullable(), available: z.boolean(), reason: textSchema.nullable(),
  }).strict()).max(100),
}).strict()
export type TaskMethodRevisionBase = z.infer<typeof taskMethodRevisionBaseSchema>
export type TaskMethodRevisionSource = z.infer<typeof taskMethodRevisionSourceSchema>
export type TaskMethodRevisionContext = z.infer<typeof taskMethodRevisionContextSchema>
export type TaskMethodRevisionOptions = z.infer<typeof taskMethodRevisionOptionsSchema>
