import { z } from "zod"
import { contractVersionSchema, identitySchema, taskIdentitySchema, textSchema, versionReferenceSchema } from "./common.js"
import { taskDataContractSchema } from "./value.js"

export const taskRequirementSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("requirement"),
  id: identitySchema, taskId: taskIdentitySchema, version: z.number().int().positive(),
  revision: z.number().int().nonnegative(), goal: textSchema, scope: textSchema,
  definition: z.object({ format: z.literal("markdown"), body: z.string().trim().min(1).max(30_000) }).strict(),
  inputContract: taskDataContractSchema, outputContract: taskDataContractSchema,
  constraints: z.array(textSchema), completionCriteria: z.array(textSchema).min(1),
  authorization: z.object({ scope: textSchema, risks: z.array(textSchema), requiredApprovals: z.array(textSchema) }).strict(),
  confirmation: z.object({ confirmedAt: z.string().datetime(), requestId: identitySchema }).strict().nullable(),
}).strict()
// 需求引用含摘要与 revision，旧确认不能授权新内容。
export const requirementReferenceSchema = versionReferenceSchema.extend({ revision: z.number().int().nonnegative() }).strict()
export type TaskRequirement = z.infer<typeof taskRequirementSchema>
