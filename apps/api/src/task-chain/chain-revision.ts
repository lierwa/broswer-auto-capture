import {
  CONTRACT_VERSION, taskDraftSchema, taskDraftContentSchema,
  type ChainPresentation, type RunnableTaskRelease, type TaskChain, type TaskDraft,
  type TaskDraftContent, type TaskExecution, type TaskPlan, type TaskRequirement, type VersionReference,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import { createChainPresentation, validateChainPresentation } from "./presentation.js"

export function createTaskDraft(input: {
  taskId: string; requirement: TaskRequirement; baseRelease: VersionReference | null;
  plan: TaskPlan; chains: TaskChain[]; presentations?: ChainPresentation[]; current?: TaskDraft | null;
}) {
  const now = new Date().toISOString()
  const content = taskDraftContentSchema.parse({ plan: input.plan, steps: input.plan.steps.map((step) => {
    const chain = input.chains.find((candidate) => candidate.stepId === step.id)
    if (!chain) throw new DomainError("draft_chain_missing", `步骤“${step.title}”缺少链路。`, 409)
    const existing = input.presentations?.find((item) => item.chain.id === chain.id
      && item.chain.version === chain.version && item.chain.digest === executableChainDigest(chain))
    return { stepId: step.id, chain, presentation: existing
      ? validateChainPresentation(chain, existing) : createChainPresentation(chain) }
  }) })
  const requirement = input.plan.requirement
  const checksum = draftChecksum(requirement, input.baseRelease, content)
  return taskDraftSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "task_draft",
    id: input.current?.id ?? stableUuid(input.taskId, "task-draft"), taskId: input.taskId,
    revision: input.current ? input.current.revision + 1 : 0, requirement, baseRelease: input.baseRelease,
    content, checksum, validation: { records: [] },
    createdAt: input.current?.createdAt ?? now, updatedAt: now })
}

export function recordDraftTrial(draft: TaskDraft, execution: TaskExecution) {
  if (execution.status !== "completed" || !execution.draft || execution.draft.id !== draft.id
    || execution.draft.revision !== draft.revision || execution.draft.checksum !== draft.checksum
    || !executionMatchesDraft(execution, draft)) return draft
  const record = { executionId: execution.id, revision: draft.revision, checksum: draft.checksum,
    inputDigest: execution.inputDigest, completedAt: execution.updatedAt }
  return taskDraftSchema.parse({ ...draft,
    validation: { records: [...draft.validation.records.filter((item) => item.executionId !== execution.id), record].slice(-20) },
    updatedAt: new Date().toISOString() })
}

export function assertDraftToken(draft: TaskDraft, revision: number, checksum: string) {
  if (draft.revision !== revision || draft.checksum !== checksum) {
    throw new DomainError("task_draft_stale", "任务草稿已变化，请刷新后继续。", 409)
  }
}

export function releaseReference(release: RunnableTaskRelease) {
  return { id: release.id, version: release.version, digest: digestJson(release) }
}

export function draftReference(draft: TaskDraft) {
  return { id: draft.id, revision: draft.revision, checksum: draft.checksum }
}

function executionMatchesDraft(execution: TaskExecution, draft: TaskDraft) {
  return execution.plan.id === draft.content.plan.id && execution.plan.version === draft.content.plan.version
    && execution.plan.digest === digestJson(draft.content.plan) && execution.steps.length === draft.content.steps.length
    && execution.steps.every((step) => {
      const current = draft.content.steps.find((item) => item.stepId === step.stepId)
      return current && step.chain.id === current.chain.id && step.chain.version === current.chain.version
        && step.chain.digest === executableChainDigest(current.chain)
    })
}

function draftChecksum(requirement: TaskDraft["requirement"], baseRelease: VersionReference | null,
  content: TaskDraftContent) {
  return digestJson({ requirement, baseRelease, content })
}
