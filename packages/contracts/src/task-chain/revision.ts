import { z } from "zod"
import { taskChainSchema } from "./chain.js"
import {
  contractVersionSchema, digestSchema, identitySchema, keySchema, taskIdentitySchema, versionReferenceSchema,
} from "./common.js"
import { taskPlanSchema } from "./plan.js"
import { chainPresentationSchema } from "./presentation.js"
import { requirementReferenceSchema } from "./requirement.js"

export const taskDraftStepSchema = z.object({
  stepId: keySchema, chain: taskChainSchema, presentation: chainPresentationSchema,
}).strict().superRefine((step, context) => {
  if (step.chain.stepId !== step.stepId) context.addIssue({ code: "custom", message: "draft_step_chain_mismatch" })
  if (step.presentation.chain.id !== step.chain.id || step.presentation.chain.version !== step.chain.version) {
    context.addIssue({ code: "custom", message: "draft_step_presentation_mismatch" })
  }
})

export const taskDraftContentSchema = z.object({
  plan: taskPlanSchema,
  steps: z.array(taskDraftStepSchema).min(1).max(100),
}).strict().superRefine((content, context) => {
  const planStepIds = content.plan.steps.map((step) => step.id)
  const draftStepIds = content.steps.map((step) => step.stepId)
  if (new Set(draftStepIds).size !== draftStepIds.length
    || planStepIds.length !== draftStepIds.length
    || planStepIds.some((stepId) => !draftStepIds.includes(stepId))) {
    context.addIssue({ code: "custom", message: "draft_plan_steps_mismatch" })
  }
  for (const step of content.steps) {
    if (step.chain.taskId !== content.plan.taskId || step.chain.plan.id !== content.plan.id
      || step.chain.plan.version !== content.plan.version) {
      context.addIssue({ code: "custom", message: "draft_chain_plan_mismatch" })
    }
  }
})

export const taskDraftReferenceSchema = z.object({
  id: identitySchema, revision: z.number().int().nonnegative(), checksum: digestSchema,
}).strict()

export const taskDraftValidationSchema = z.object({
  records: z.array(z.object({
    executionId: identitySchema, revision: z.number().int().nonnegative(), checksum: digestSchema,
    inputDigest: digestSchema, completedAt: z.string().datetime(),
  }).strict()).max(20),
}).strict()

export const taskDraftSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("task_draft"),
  id: identitySchema, taskId: taskIdentitySchema, revision: z.number().int().nonnegative(),
  requirement: requirementReferenceSchema, baseRelease: versionReferenceSchema.nullable(),
  content: taskDraftContentSchema, checksum: digestSchema, validation: taskDraftValidationSchema,
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().superRefine((draft, context) => {
  if (draft.content.plan.taskId !== draft.taskId
    || draft.content.plan.requirement.id !== draft.requirement.id
    || draft.content.plan.requirement.version !== draft.requirement.version
    || draft.content.plan.requirement.revision !== draft.requirement.revision
    || draft.content.plan.requirement.digest !== draft.requirement.digest) {
    context.addIssue({ code: "custom", message: "draft_requirement_mismatch" })
  }
})

export const taskExecutionCandidateSchema = z.object({
  executionId: identitySchema, taskId: taskIdentitySchema, draft: taskDraftReferenceSchema,
  content: taskDraftContentSchema, createdAt: z.string().datetime(),
}).strict()

export type TaskDraftStep = z.infer<typeof taskDraftStepSchema>
export type TaskDraftContent = z.infer<typeof taskDraftContentSchema>
export type TaskDraftReference = z.infer<typeof taskDraftReferenceSchema>
export type TaskDraftValidation = z.infer<typeof taskDraftValidationSchema>
export type TaskDraft = z.infer<typeof taskDraftSchema>
export type TaskExecutionCandidate = z.infer<typeof taskExecutionCandidateSchema>
