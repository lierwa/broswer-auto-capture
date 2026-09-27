import { z } from "zod"
import { contractVersionSchema, identitySchema, taskIdentitySchema, textSchema, versionReferenceSchema } from "./common.js"
import { taskDataContractSchema } from "./value.js"

export const taskRequirementSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("requirement"),
  id: identitySchema, taskId: taskIdentitySchema, version: z.number().int().positive(),
  revision: z.number().int().nonnegative(), goal: textSchema, scope: textSchema,
  definition: z.object({ format: z.literal("markdown"), body: z.string().trim().min(1).max(30_000) }).strict(),
  // WHY：需求确认只固定业务事实；精确值合同由后续 TaskPlan 依据代表输入生成，不能先写开放 schema 冒充已经确认。
  inputContract: taskDataContractSchema.nullable(), outputContract: taskDataContractSchema.nullable(),
  constraints: z.array(textSchema), completionCriteria: z.array(textSchema).min(1),
  authorization: z.object({ scope: textSchema, risks: z.array(textSchema), requiredApprovals: z.array(textSchema) }).strict(),
  confirmation: z.object({ confirmedAt: z.string().datetime(), requestId: identitySchema }).strict().nullable(),
  confirmationFacts: z.object({
    decisions: z.array(z.object({ id: identitySchema, kind: z.enum(["option", "free_text"]), text: textSchema,
      createdAt: z.string().datetime() }).strict()),
    sources: z.array(z.object({ resolutionId: identitySchema, label: textSchema, url: z.string().url(),
      origin: z.string().url(), domain: textSchema, provider: textSchema,
      query: textSchema }).strict()),
    // WHY：旧确认记录没有入口事实；optional 保持历史 digest 原样，新草案的确认门强制非空。
    entries: z.array(z.object({ url: z.string().url(), resolutionId: identitySchema }).strict()).optional(),
    resultExpectation: textSchema, unresolvedItemCount: z.literal(0),
  }).strict().nullable().optional(),
}).strict()
// 需求引用含摘要与 revision，旧确认不能授权新内容。
export const requirementReferenceSchema = versionReferenceSchema.extend({ revision: z.number().int().nonnegative() }).strict()
export type TaskRequirement = z.infer<typeof taskRequirementSchema>
