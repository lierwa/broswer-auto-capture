import { z } from "zod"
import { modelRoutes } from "./routes.js"

export const PRODUCT_MODEL_ID = "gpt-5.6-terra" as const
export const PRODUCT_REASONING_EFFORT = "medium" as const

export const conversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(100_000),
})

export const modelConversationInputSchema = z.object({
  conversation: z.array(conversationMessageSchema).max(500),
  requirement: z.string().trim().min(1).max(100_000),
})

export const draftPlanStepSchema = z.object({
  goal: z.string().trim().min(1).max(2_000),
  completionCriteria: z.array(z.string().trim().min(1).max(2_000)).min(1).max(20),
  sourceScope: z.array(z.string().trim().min(1).max(2_000)).min(1).max(20),
})

export const draftPlanSchema = z.object({
  steps: z.array(draftPlanStepSchema).max(100),
})

export const modelConversationResultSchema = z.object({
  assistantText: z.string().trim().min(1).max(100_000),
  draftPlan: draftPlanSchema,
  needsClarification: z.boolean(),
})

export const accountProjectionSchema = z.object({
  loggedIn: z.boolean(),
  type: z.string().trim().min(1).max(80).nullable(),
})

export const modelInvocationAuditSchema = z.object({
  invocationCount: z.union([z.literal(0), z.literal(1)]),
  requestedModel: z.enum(["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"]),
  requestedEffort: z.enum(["medium", "high"]),
  reportedModel: z.enum(["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"]).nullable(),
  reportedEffort: z.enum(["medium", "high"]).nullable(),
}).refine((value) => Object.values(modelRoutes).some((route) => route.model === value.requestedModel && route.effort === value.requestedEffort)
  && (!value.reportedModel || value.reportedModel === value.requestedModel) && (!value.reportedEffort || value.reportedEffort === value.requestedEffort), "模型路由不一致")

export type ModelConversationInput = z.output<typeof modelConversationInputSchema>
export type ModelConversationResult = z.output<typeof modelConversationResultSchema>
export type AccountProjection = z.output<typeof accountProjectionSchema>
export type ModelInvocationAudit = z.output<typeof modelInvocationAuditSchema>

export const modelRuntimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("commentary_delta"), delta: z.string().min(1) }),
  z.object({
    type: z.literal("item_lifecycle"),
    itemId: z.string().min(1).max(240),
    itemType: z.string().min(1).max(240),
    status: z.enum(["started", "completed"]),
  }),
  z.object({ type: z.literal("interrupted"), audit: modelInvocationAuditSchema }),
  z.object({
    type: z.literal("completed"),
    result: modelConversationResultSchema,
    audit: modelInvocationAuditSchema,
  }),
])

export type ModelRuntimeEvent = z.output<typeof modelRuntimeEventSchema>

const unsupportedOutputKeywords = [
  "format",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minItems",
  "maxItems",
] as const

export const modelConversationOutputJsonSchema: Record<string, unknown> = outputJsonSchema()

function outputJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(modelConversationResultSchema, {
    target: "draft-7",
    override: (context) => {
      for (const keyword of unsupportedOutputKeywords) delete context.jsonSchema[keyword]
    },
  })
  const { $schema: _schemaVersion, ...schema } = generated
  return schema
}
