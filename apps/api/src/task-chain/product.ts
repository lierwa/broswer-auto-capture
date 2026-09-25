import {
  CONTRACT_VERSION, parseTaskValue, runnableTaskReleaseSchema, taskInputRequiresVariation, taskPlanExecutionIssues,
  type JsonValue, type RunnableReleaseValidation, type RunnableTaskRelease, type TaskDraft,
  type TaskExecution, type TaskRequirement, type VersionReference,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { ProductStore } from "../database/store.js"
import { conflict, DomainError } from "../errors.js"
import type { TaskContractRepository } from "./repository.js"
import { syncConfirmedRequirement } from "./requirement.js"

export class TaskProductService {
  constructor(private readonly store: ProductStore, private readonly repository: TaskContractRepository) {}

  currentRelease(taskId: string, requirement = syncConfirmedRequirement(this.store, this.repository, taskId)) {
    const release = this.repository.currentRelease(taskId)
    return release && releaseMatchesRequirement(release, requirement) ? release : null
  }

  assertCurrentDraftRequirement(taskId: string, draft: TaskDraft) {
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || !draftMatchesRequirement(draft, requirement)) {
      throw new DomainError("adjustment_requirement_stale", "已确认需求发生变化，请返回需求对话并重新定位。", 409)
    }
  }

  publishDraft(taskId: string, draft: TaskDraft) {
    return this.store.db.transaction(() => {
      const current = this.repository.draft(taskId)
      if (!current || current.id !== draft.id || current.revision !== draft.revision || current.checksum !== draft.checksum) {
        conflict("只能发布当前活动草稿。")
      }
      const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
      if (!requirement || !draftMatchesRequirement(draft, requirement)) conflict("草稿所属需求已经变化。")
      if (taskPlanExecutionIssues(draft.content.plan).length) conflict("草稿计划不满足执行合同。")
      const validations = this.validatedDraftTrials(draft)
      // WHY：Release 只冻结能证明可复用的一对执行；其他试跑仍留在 Execution 历史中。
      const pair = independentTrialPair(validations, taskInputRequiresVariation(draft.content.plan.inputContract))
      if (!pair) {
        conflict("请先完成当前草稿的代表试跑和独立复验；可变输入须使用另一组业务输入。")
      }
      const now = new Date().toISOString(), version = this.repository.nextReleaseVersion(taskId)
      const release = runnableTaskReleaseSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "release",
        id: stableUuid(taskId, "runnable-release", String(version)), taskId, version,
        requirement: draft.requirement, content: structuredClone(draft.content), validation: pair, createdAt: now })
      this.repository.saveRelease(release)
      this.repository.deleteDraft(taskId, draft)
      return release
    })
  }

  nextTrialMode(draft: TaskDraft, input: JsonValue): "sample" | "verification" {
    const validations = this.validatedDraftTrials(draft)
    const sample = validations.findLast((item) => item.phase === "sample")
    if (!sample || independentTrialPair(validations, taskInputRequiresVariation(draft.content.plan.inputContract))) {
      return "sample"
    }
    if (taskInputRequiresVariation(draft.content.plan.inputContract) && sample.inputDigest === digestJson(input)) {
      conflict("独立复验需要另一组不同的业务输入。")
    }
    return "verification"
  }

  draftReadiness(draft: TaskDraft): { phase: "sample_needed" | "verification_needed" | "ready";
    distinctInputRequired: boolean } {
    const validations = this.validatedDraftTrials(draft)
    const varying = taskInputRequiresVariation(draft.content.plan.inputContract)
    if (independentTrialPair(validations, varying)) return { phase: "ready", distinctInputRequired: false }
    if (validations.some((item) => item.phase === "sample")) {
      return { phase: "verification_needed", distinctInputRequired: varying }
    }
    return { phase: "sample_needed", distinctInputRequired: false }
  }

  private validatedDraftTrials(draft: TaskDraft) {
    return draft.validation.records.map((record) => validationEvidence(this.repository, draft, record.executionId))
      .filter((record): record is RunnableReleaseValidation => Boolean(record))
  }

  requireCurrentRelease(taskId: string, reference: VersionReference) {
    const current = this.currentRelease(taskId)
    if (!current || current.id !== reference.id || current.version !== reference.version
      || digestJson(current) !== reference.digest) {
      throw new DomainError("task_release_stale", "发布记录已更新，请刷新后重试。", 409)
    }
    return current
  }

  recentInput(taskId: string, release: RunnableTaskRelease) {
    const digest = digestJson(release)
    return this.repository.executions(taskId).filter((execution) => execution.release?.id === release.id
      && execution.release.version === release.version && execution.release.digest === digest).at(-1)?.input
  }

  resolveRunInput(taskId: string, release: RunnableTaskRelease, raw: JsonValue | undefined) {
    if (raw !== undefined) return parseTaskValue(release.content.plan.inputContract, raw)
    const recent = this.recentInput(taskId, release)
    if (recent !== undefined) return parseTaskValue(release.content.plan.inputContract, recent)
    const schema = release.content.plan.inputContract.schema
    if (schema.type === "null") return null
    if (schema.type === "object" && schema.required.length === 0) {
      return parseTaskValue(release.content.plan.inputContract, {})
    }
    conflict("请确认本次运行输入。")
  }
}

function validationEvidence(repository: TaskContractRepository, draft: TaskDraft,
  executionId: string): RunnableReleaseValidation | null {
  const execution = optionalValidationFact(() => repository.execution(draft.taskId, executionId))
  if (!execution || execution.status !== "completed" || !execution.draft || execution.draft.id !== draft.id
    || execution.draft.revision !== draft.revision || execution.draft.checksum !== draft.checksum
    || !["sample", "verification"].includes(execution.mode ?? "")) return null
  const candidate = repository.candidate(draft.taskId, execution.id)
  if (!candidate || candidate.draft.id !== draft.id || candidate.draft.revision !== draft.revision
    || candidate.draft.checksum !== draft.checksum || digestJson(candidate.content) !== digestJson(draft.content)) return null
  for (const step of execution.steps) for (const runId of step.runIds) {
    const run = optionalValidationFact(() => repository.run(execution.taskId, runId))
    if (!run || run.status !== "completed" || !run.auditComplete || run.binding.plan.id !== execution.plan.id
      || run.binding.plan.version !== execution.plan.version || run.binding.plan.digest !== execution.plan.digest
      || run.binding.chain.id !== step.chain.id || run.binding.chain.version !== step.chain.version
      || run.binding.chain.digest !== step.chain.digest) return null
  }
  return { phase: execution.mode as "sample" | "verification", executionId: execution.id,
    inputDigest: execution.inputDigest, steps: execution.steps.map((step) => ({ stepId: step.stepId,
      chain: step.chain, runIds: step.runIds, outputDigest: digestJson(step.output) })),
    modelCalls: execution.consumed.llmCalls, completedAt: execution.updatedAt }
}

function optionalValidationFact<T>(read: () => T) {
  try { return read() }
  catch (error) {
    // WHY：缺失的历史执行或运行只能让验证失效，不能让工作台快照整体无法读取。
    if (error instanceof DomainError && ["execution_not_found", "run_not_found"].includes(error.code)) return null
    throw error
  }
}

function independentTrialPair(validations: RunnableReleaseValidation[], distinctInput: boolean) {
  // WHY：复验必须晚于样本；同一 execution 或可变输入的同值复跑均不足以证明复用边界。
  for (const [index, sample] of validations.entries()) for (const verification of validations.slice(index + 1)) {
    if (sample.phase === "sample" && verification.phase === "verification"
      && verification.executionId !== sample.executionId
      && (!distinctInput || verification.inputDigest !== sample.inputDigest)) {
      return [sample, verification]
    }
  }
  return null
}

function releaseMatchesRequirement(release: RunnableTaskRelease, requirement: TaskRequirement | null) {
  return Boolean(requirement && release.requirement.id === requirement.id
    && release.requirement.version === requirement.version && release.requirement.revision === requirement.revision
    && release.requirement.digest === digestJson(requirement))
}

function draftMatchesRequirement(draft: TaskDraft, requirement: TaskRequirement) {
  return draft.requirement.id === requirement.id && draft.requirement.version === requirement.version
    && draft.requirement.revision === requirement.revision && draft.requirement.digest === digestJson(requirement)
}
