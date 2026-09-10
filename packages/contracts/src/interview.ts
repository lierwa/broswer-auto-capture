import { z } from "zod"
import {
  parseClientUIProtocolCapabilities,
  sanitizeCommonCardBlock,
  commonChoiceQuestionDataSchema,
  commonFreeFormQuestionDataSchema,
  commonSurfaceReplyPayloadSchema,
  commonSurfaceSubmitPayloadSchema,
  type ClientUIProtocolCapabilitiesV1,
  type CommonCardBlock,
} from "@agent-platform/ai-connect/ui-contracts"
import { aiEventSchema } from "./ai.js"
import { requirementBriefSchema } from "./requirementBrief.js"
import { taskIdSchema } from "./task.js"
export { requirementBriefSchema, renderRequirementBrief, type RequirementBrief } from "./requirementBrief.js"

const text = z.string().trim().min(1).max(30_000)
// WHY：可靠 Question/Draft 自身就是可提交结果；模型无需为了满足正文非空而重复或编造展示文本。
const optionalAssistantText = z.string().trim().max(30_000)
const revision = z.number().int().nonnegative()
const userText = z.string().min(1).max(30_000).refine((value) => value.trim().length > 0, "请输入需求内容")
const clientUICapabilitiesSchema = publicContract(parseClientUIProtocolCapabilities)
const commonCardSchema = publicContract(sanitizeCommonCardBlock)
const legacyQuestionSchema = z.object({
  prompt: text,
  options: z.array(z.object({ label: text, description: text, recommended: z.boolean() })).max(3),
}).refine((value) => value.options.length === 0 || (value.options.length >= 2 && value.options.filter((item) => item.recommended).length === 1), "开放问题无选项；选择题需要两到三个选项且仅一个推荐项")
const commonQuestionSchema = z.discriminatedUnion("type", [
  z.object({ id: text, type: z.literal("choice"), data: commonChoiceQuestionDataSchema }).strict(),
  z.object({ id: text, type: z.literal("free_form"), data: commonFreeFormQuestionDataSchema }).strict(),
])
// WHY：公共 Question 是新记录的唯一事实源；旧压缩结构只为读取既有 SQLite 消息，不能再用于组装新题。
export const questionSchema = z.union([commonQuestionSchema, legacyQuestionSchema])
export const authoredQuestionSchema = commonQuestionSchema
export const interviewMessagePartSchema = z.discriminatedUnion("type", [
  z.object({ id: text, type: z.literal("text"), text: z.string() }).strict(),
  z.object({ id: text, type: z.literal("card"), card: commonCardSchema }).strict(),
])
export const interviewOutputSchema = z.object({
  assistantText: text, question: questionSchema.nullable(), draft: z.object({ title: text, markdown: text, brief: requirementBriefSchema.nullable().default(null) }).nullable(),
  parts: z.array(interviewMessagePartSchema).default([]),
}).refine((value) => !(value.question && value.draft), "有负责人问题时不得生成可确认草稿")
export const modelInterviewOutputSchema = z.object({
  assistantText: optionalAssistantText, question: authoredQuestionSchema.nullable(),
  draft: z.object({ title: text, brief: requirementBriefSchema }).nullable(),
}).strict()
  .refine((value) => !(value.question && value.draft), "有负责人问题时不得生成可确认草稿")
  .refine((value) => Boolean(value.assistantText || value.question || value.draft), "采访输出必须包含安全正文、问题或草稿")
export const draftSchema = z.object({ version: z.number().int().positive(), revision, title: text, markdown: text,
  brief: requirementBriefSchema.nullable().default(null),
})
export const messageSchema = z.object({
  id: text, role: z.enum(["user", "assistant"]), text: z.string(),
  status: z.enum(["complete", "running", "failed", "cancelled"]),
  question: questionSchema.nullable(), draftVersion: z.number().int().nullable(),
  aiEvents: z.array(aiEventSchema).default([]),
  parts: z.array(interviewMessagePartSchema).optional(),
  interactionReply: commonSurfaceReplyPayloadSchema.optional(),
})
export const auditSchema = z.object({ revision, model: text, effort: text, invocations: z.number().int().nonnegative() })
export const turnSchema = z.object({
  id: text, revision, userMessageId: text, assistantMessageId: text,
  status: z.enum(["running", "cancelling", "succeeded", "cancelled", "failed", "interrupted"]),
  reason: z.string().nullable(), createdAt: text, completedAt: text.nullable(),
})
export const decisionSchema = z.object({
  id: text, revision, kind: z.enum(["option", "free_text", "draft_confirmation"]), text,
  messageId: text.nullable(), questionId: text.nullable(), draftVersion: z.number().int().nullable(), createdAt: text,
})
export const unresolvedSchema = z.object({
  id: text, revision, question: questionSchema, status: z.enum(["open", "answered", "superseded", "resolved"]), answerMessageId: text.nullable(),
})
export const legacyInterviewStateSchema = z.object({
  revision, messages: z.array(messageSchema), drafts: z.array(draftSchema),
  confirmedVersion: z.number().int().nullable(), active: z.boolean(), audits: z.array(auditSchema),
})
export const interviewStateSchema = legacyInterviewStateSchema.extend({
  sequence: revision.default(0), activeTurnId: text.nullable().default(null), cancellationRequested: z.boolean().default(false),
  turns: z.array(turnSchema).default([]), decisions: z.array(decisionSchema).default([]), unresolved: z.array(unresolvedSchema).default([]),
})
// WHY：旧请求类型仅用于迁移前切片兼容；正式 API 必须携带幂等键或精确轮次。
export const interviewRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), text, expectedRevision: revision }),
  z.object({ type: z.literal("retry"), expectedRevision: revision }),
  z.object({ type: z.literal("confirm"), version: z.number().int().positive(), expectedRevision: revision }),
  z.object({ type: z.literal("cancel") }),
])
const operation = { requestId: z.string().uuid(), expectedRevision: revision }
export const choiceInterviewAnswerSchema = z.object({
  type: z.literal("choice"), questionId: text, label: text,
}).strict()
export const freeTextInterviewAnswerSchema = z.object({
  type: z.literal("free_text"), questionId: text, text: userText,
}).strict()
export const commonQuestionInterviewAnswerSchema = z.object({
  type: z.literal("common_question"), questionId: text, surfaceSubmit: commonSurfaceSubmitPayloadSchema,
}).strict()
const legacyChoiceInterviewAnswerSchema = z.object({ questionId: text, label: text }).strict()
  .transform((answer) => ({ type: "choice" as const, ...answer }))
export const interviewAnswerSchema = z.union([
  choiceInterviewAnswerSchema,
  freeTextInterviewAnswerSchema,
  commonQuestionInterviewAnswerSchema,
  legacyChoiceInterviewAnswerSchema,
])
export const interviewCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), text: userText, ...operation, answer: interviewAnswerSchema.optional(), ui: clientUICapabilitiesSchema.optional() }).strict(),
  z.object({ type: z.literal("retry"), ...operation, ui: clientUICapabilitiesSchema.optional() }).strict(),
  z.object({ type: z.literal("confirm"), version: z.number().int().positive(), ...operation }).strict(),
  z.object({ type: z.literal("cancel"), turnId: text }).strict(),
])
export type InterviewOutput = z.infer<typeof interviewOutputSchema>
export type InterviewState = z.infer<typeof interviewStateSchema>
export type InterviewMessage = z.infer<typeof messageSchema>
export type InterviewMessagePart = z.infer<typeof interviewMessagePartSchema>
export type InterviewRequest = z.infer<typeof interviewRequestSchema>
export type InterviewCommand = z.infer<typeof interviewCommandSchema>
export type InterviewTurn = z.infer<typeof turnSchema>
export const emptyInterview: InterviewState = interviewStateSchema.parse({ revision: 0, messages: [], drafts: [], confirmedVersion: null, active: false, audits: [] })

export function currentDraft(state: Pick<InterviewState, "drafts" | "revision">) {
  const last = state.drafts.at(-1)
  return last?.revision === state.revision ? last : undefined
}
export const requirementHandoffSchema = z.object({ taskId: taskIdSchema, draftVersion: z.number().int().positive(), revision, brief: requirementBriefSchema }).strict()
export function confirmedRequirement(taskId: string, state: InterviewState) {
  const draft = currentDraft(state)
  // WHY：后续阶段只能使用当前明确确认的结构需求；旧 Markdown 保留可读，不猜造交接数据。
  if (state.active || !draft?.brief || state.confirmedVersion !== draft.version) return null
  return requirementHandoffSchema.parse({ taskId, draftVersion: draft.version, revision: draft.revision, brief: draft.brief })
}

function publicContract<T extends ClientUIProtocolCapabilitiesV1 | CommonCardBlock>(parse: (input: unknown) => T) {
  return z.unknown().transform((input, context): T => {
    try { return parse(input) }
    catch {
      context.addIssue({ code: "custom", message: "公共 UI 协议无效" })
      return z.NEVER
    }
  })
}
