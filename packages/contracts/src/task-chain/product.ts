import { z } from "zod"
import {
  contractVersionSchema, digestSchema, identitySchema, keySchema, taskIdentitySchema, versionReferenceSchema,
} from "./common.js"
import { requirementReferenceSchema } from "./requirement.js"
import { taskDraftContentSchema } from "./revision.js"
import { taskDataContractSchema, taskInputRequiresVariation } from "./value.js"

export const taskExecutionPacingSchema = z.object({
  nodeDelayMs: z.number().int().min(0).max(5000),
}).strict()
export const DEFAULT_TASK_EXECUTION_PACING = { nodeDelayMs: 0 } as const

export const taskExecutionBrowserSchema = z.object({ headless: z.boolean() }).strict()
export const DEFAULT_TASK_EXECUTION_BROWSER = { headless: false } as const

const releaseStepValidationSchema = z.object({
  stepId: keySchema, chain: versionReferenceSchema, runIds: z.array(identitySchema), outputDigest: digestSchema,
}).strict()

export const runnableReleaseValidationSchema = z.object({
  phase: z.enum(["sample", "verification"]), executionId: identitySchema.nullable(),
  inputDigest: digestSchema, steps: z.array(releaseStepValidationSchema).min(1),
  modelCalls: z.number().int().nonnegative().nullable(), completedAt: z.string().datetime(),
}).strict()

export const runnableTaskReleaseSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("release"), id: identitySchema,
  taskId: taskIdentitySchema, version: z.number().int().positive(), requirement: requirementReferenceSchema,
  content: taskDraftContentSchema,
  validation: z.array(runnableReleaseValidationSchema).min(1).max(20),
  createdAt: z.string().datetime(),
}).strict().superRefine((release, context) => {
  if (release.content.plan.taskId !== release.taskId
    || release.content.plan.requirement.id !== release.requirement.id
    || release.content.plan.requirement.version !== release.requirement.version
    || release.content.plan.requirement.revision !== release.requirement.revision
    || release.content.plan.requirement.digest !== release.requirement.digest) {
    context.addIssue({ code: "custom", message: "release_requirement_mismatch" })
  }
  for (const evidence of release.validation) {
    if (evidence.steps.length !== release.content.steps.length || evidence.steps.some((step) => {
      const frozen = release.content.steps.find((item) => item.stepId === step.stepId)
      return !frozen || frozen.chain.id !== step.chain.id || frozen.chain.version !== step.chain.version
    })) context.addIssue({ code: "custom", message: "release_validation_chain_mismatch" })
  }
  const sample = release.validation.find((item) => item.phase === "sample")
  const verification = release.validation.find((item) => item.phase === "verification")
  if (sample && verification && taskInputRequiresVariation(release.content.plan.inputContract)
    && sample.inputDigest === verification.inputDigest) {
    context.addIssue({ code: "custom", message: "release_distinct_validation_required" })
  }
})

const legacyReleaseResultSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("execution"), outputContract: taskDataContractSchema }).strict(),
  z.object({ mode: z.literal("data"), outputContract: taskDataContractSchema }).strict(),
])

/** 仅供一次性存储迁移读取；普通 API 和新写入绝不接受旧 Release 形状。 */
export const legacyRunnableTaskReleaseSchema = z.object({
  contractVersion: contractVersionSchema, kind: z.literal("release"), id: identitySchema,
  taskId: taskIdentitySchema, version: z.number().int().positive(), requirement: requirementReferenceSchema,
  plan: versionReferenceSchema,
  chains: z.array(z.object({ stepId: keySchema, chain: versionReferenceSchema }).strict()).min(1).max(100),
  inputContract: taskDataContractSchema, result: legacyReleaseResultSchema,
  validation: z.object({ sample: runnableReleaseValidationSchema, verification: runnableReleaseValidationSchema }).strict(),
  createdAt: z.string().datetime(),
}).strict()

export type RunnableReleaseValidation = z.infer<typeof runnableReleaseValidationSchema>
export type RunnableTaskRelease = z.infer<typeof runnableTaskReleaseSchema>
export type LegacyRunnableTaskRelease = z.infer<typeof legacyRunnableTaskReleaseSchema>
