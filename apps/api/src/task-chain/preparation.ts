import {
  parseTaskValue, taskInputRequiresVariation,
  type JsonValue, type TaskAuthoringJob, type TaskChainCommand,
  type TaskDraft, type TaskExecution, type TaskPlan,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { ProductStore } from "../database/store.js"
import { conflict, DomainError } from "../errors.js"
import type { TaskChainAuthoring } from "./authoring.js"
import { authoringFailureMessage } from "./authoring.js"
import { createTaskDraft, draftReference, recordDraftTrial, releaseReference } from "./chain-revision.js"
import { projectPreparationPlan } from "./preparation-plan-projection.js"
import type { TaskContractRepository } from "./repository.js"
import { syncConfirmedRequirement } from "./requirement.js"

type WorkStarter = (job: TaskAuthoringJob, run: (signal: AbortSignal) => Promise<unknown>) => void
type ValidationEnqueuer = (requestId: string, draft: TaskDraft, input: JsonValue,
  mode: "sample" | "verification") => TaskExecution

export class TaskPreparationCoordinator {
  constructor(private readonly store: ProductStore, private readonly repository: TaskContractRepository,
    private readonly authoring: TaskChainAuthoring, private readonly enqueueValidation: ValidationEnqueuer,
    private readonly schedule: () => void) {}

  start(taskId: string, command: Extract<TaskChainCommand, { type: "prepare_task" }>, startWork: WorkStarter) {
    if (this.store.operation("task-product:prepare", command.requestId, command)) return
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || requirement.version !== command.requirementVersion) conflict("只能准备当前已确认需求。")
    if (this.repository.jobs(taskId).some((job) => job.type === "prepare"
      && ["queued", "running", "waiting_for_human"].includes(job.status))) conflict("当前草稿生成尚未结束。")
    const now = new Date().toISOString(), job = this.repository.saveJob({ id: stableUuid(command.requestId, "prepare"),
      taskId, type: "prepare", key: `${requirement.id}:${requirement.version}:prepare`, status: "queued", sequence: 0,
      reason: "正在生成任务草稿。", resultId: null, browserRunId: null, waitpoint: null, audit: null,
      preparation: { phase: "forming_plan", plan: null, chains: [], candidatePlan: null, draft: null,
        planCandidates: [],
        representativeInput: null, verificationInput: null, inputRequest: null, requirementReturn: null,
        validationExecutionIds: [], priorAudits: [] }, createdAt: now, updatedAt: now })
    this.store.recordOperation("task-product:prepare", command.requestId, command, job.id)
    startWork(job, async (signal) => {
      // WHY：每次准备只投影当前确认草案；旧失败 job 的候选计划仅供历史查看。
      const plan = await this.authoring.plan(job, requirement, signal)
      const current = this.repository.job(taskId, job.id)
      current.preparation = { phase: "forming_plan", plan: planReference(plan), chains: [], candidatePlan: plan, draft: null,
        planCandidates: [],
        recoveredFromJobId: null, resumedFromJobId: null,
        representativeInput: null, verificationInput: null, inputRequest: null, requirementReturn: null,
        validationExecutionIds: [], priorAudits: current.audit ? [structuredClone(current.audit)] : [] }
      const initial = safeInitialInput(plan)
      if (initial === undefined) { this.requestInput(current, plan, "representative"); return }
      await this.authorChains(current, requirement, plan, initial, signal)
    })
  }

  compilationRecovery(taskId: string, job: TaskAuthoringJob | null) {
    if (!job || job.type !== "prepare" || job.status !== "failed"
      || job.preparation?.phase !== "preexecuting") return null
    // WHY：离线恢复只检查本次明确指定的 job，不搜索更早失败任务。
    const sourceJobId = job.id
    if (!["compiling", "compiled"].includes(job.authoring?.stage ?? "")) {
      return { sourceJobId, available: false,
        reason: "代表试做尚未形成完整可复用来源；请先处理浏览器试做的失败原因。" }
    }
    try {
      if (job.preparation.requirementReturn) conflict("试做发现新的业务歧义，请返回需求对话确认。")
      if (this.repository.draft(taskId)) conflict("当前已有活动草稿，请先查看或处理该草稿。")
      const { requirement, plan, input } = this.recoveryContext(taskId, job)
      const probe = { ...job, id: stableUuid(job.id, "recovery-probe") }
      this.authoring.assertReusableSources(probe, requirement, plan, input, sourceJobId)
      return { sourceJobId, available: true,
        reason: "已核验本次明确指定的代表试做来源；可只用编译器恢复，不重新操作浏览器。" }
    } catch (error) {
      return { sourceJobId, available: false, reason: error instanceof DomainError
        ? error.message : authoringFailureMessage(error) }
    }
  }

  recoverCompilation(taskId: string,
    command: Extract<TaskChainCommand, { type: "recover_preparation_compilation" }>, startWork: WorkStarter) {
    if (this.store.operation("task-product:recover-compilation", command.requestId, command)) return
    const failed = this.repository.job(taskId, command.jobId)
    if (failed.sequence !== command.expectedSequence) conflict("编译失败记录已变化，请刷新后重试。")
    const recovery = this.compilationRecovery(taskId, failed)
    if (!recovery?.available) conflict(recovery?.reason ?? "本次失败不属于可离线恢复的编译阶段。")
    const { requirement, plan, input } = this.recoveryContext(taskId, failed)
    const now = new Date().toISOString()
    // WHY：新 job 只承载本次编译尝试；旧浏览器来源、失败审计和原 job 始终只读保留。
    const job: TaskAuthoringJob = { id: stableUuid(command.requestId, "offline-compilation"), taskId,
      type: "prepare", key: failed.key, status: "queued", sequence: 0,
      reason: "正在使用已保存的代表试做来源离线编译。", resultId: null, browserRunId: null,
      waitpoint: null, audit: null, preparation: {
        phase: "preexecuting", plan: planReference(plan), chains: [], candidatePlan: plan, draft: null,
        planCandidates: [], recoveredFromJobId: recovery.sourceJobId, resumedFromJobId: null,
        representativeInput: input, verificationInput: null, inputRequest: null, requirementReturn: null,
        validationExecutionIds: [], priorAudits: [],
      }, createdAt: now, updatedAt: now }
    this.authoring.assertReusableSources(job, requirement, plan, input, recovery.sourceJobId)
    this.repository.saveJob(job)
    this.store.recordOperation("task-product:recover-compilation", command.requestId, command, job.id)
    startWork(job, (signal) => this.authorChains(job, requirement, plan, input, signal, recovery.sourceJobId))
  }

  private recoveryContext(taskId: string, job: TaskAuthoringJob) {
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    const preparation = job.preparation, reference = preparation?.plan
    if (!requirement || !preparation || !reference) conflict("原需求或方案引用已不可用，不能离线恢复。")
    // WHY：恢复方案必须重新从当前同版确认草案确定投影；历史候选与旧来源只供查看。
    const plan = projectPreparationPlan(requirement, reference.version)
    if (plan.id !== reference.id || digestJson(plan) !== reference.digest || !sameRequirement(plan, requirement)) {
      conflict("原方案与当前已确认需求不一致，不能离线恢复。")
    }
    const input = parseTaskValue(plan.inputContract, preparation.representativeInput)
    return { requirement, plan, input }
  }

  continue(taskId: string, command: Extract<TaskChainCommand, { type: "continue_preparation" }>, startWork: WorkStarter) {
    if (this.store.operation("task-product:continue-preparation", command.requestId, command)) return
    const job = this.repository.job(taskId, command.jobId), preparation = job.preparation
    if (job.type !== "prepare" || job.status !== "waiting_for_human" || !preparation?.inputRequest
      || job.sequence !== command.expectedSequence || !preparation.candidatePlan) conflict("草稿生成状态已变化，请刷新后重试。")
    const plan = preparation.candidatePlan, input = parseTaskValue(plan.inputContract, command.input)
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || !sameRequirement(plan, requirement)) conflict("草稿所属需求已变化。")
    if (preparation.inputRequest.purpose === "verification") {
      if (taskInputRequiresVariation(plan.inputContract)
        && digestJson(input) === digestJson(preparation.representativeInput)) conflict("复用边界验证需要另一组不同的业务输入。")
      const draft = requireJobDraft(this.repository, job)
      const record = this.enqueueValidation(stableUuid(command.requestId, "verification"), draft, input, "verification")
      preparation.verificationInput = input; preparation.inputRequest = null
      preparation.phase = "validating_verification"; job.status = "running"; job.reason = "正在复验当前草稿。"
      preparation.validationExecutionIds.push(record.id); this.touch(job)
      this.store.recordOperation("task-product:continue-preparation", command.requestId, command, job.id)
      this.schedule(); return
    }
    preparation.inputRequest = null
    startWork(job, (signal) => this.authorChains(job, requirement, plan, input, signal))
    this.store.recordOperation("task-product:continue-preparation", command.requestId, command, job.id)
  }

  async resumeHuman(taskId: string, command: Extract<TaskChainCommand, { type: "resume_preparation_human" }>) {
    if (this.store.operation("task-product:resume-human", command.requestId, command)) return
    const job = this.repository.job(taskId, command.jobId), plan = job.preparation?.candidatePlan
    if (job.type !== "prepare" || job.preparation?.phase !== "preexecuting" || !plan
      || job.authoring?.stage !== "exploring" || job.sequence !== command.expectedSequence) {
      conflict("当前准备任务不在可恢复的人工等待阶段。")
    }
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || !sameRequirement(plan, requirement) || job.preparation.plan?.digest !== digestJson(plan)) {
      conflict("准备任务所属需求或方案已变化，不能继续原人工等待。")
    }
    await this.authoring.resumeHuman(taskId, job.id, command.expectedSequence, command.waitpointId)
    this.store.recordOperation("task-product:resume-human", command.requestId, command, job.id)
  }

  onExecutionSettled(record: TaskExecution) {
    const job = this.repository.jobs(record.taskId).findLast((candidate) => candidate.type === "prepare"
      && candidate.preparation?.validationExecutionIds.includes(record.id))
    if (!job?.preparation || ["completed", "failed", "interrupted"].includes(job.status)
      || job.preparation.validationExecutionIds.at(-1) !== record.id || ["queued", "running"].includes(record.status)) return
    if (["paused", "waiting_for_human", "cleanup_required"].includes(record.status)) {
      job.status = "waiting_for_human"; job.reason = record.reason; this.touch(job); return
    }
    if (record.status !== "completed") {
      job.status = "failed"; job.reason = `草稿试跑未完成：${record.reason}`; this.touch(job); return
    }
    try {
      const plan = job.preparation.candidatePlan
      if (!plan) throw new Error("preparation_plan_missing")
      const draft = recordDraftTrial(requireJobDraft(this.repository, job), record)
      this.repository.saveDraft(draft)
      if (record.mode === "sample") {
        if (!taskInputRequiresVariation(plan.inputContract)) {
          job.preparation.verificationInput = structuredClone(job.preparation.representativeInput)
          job.preparation.phase = "validating_verification"; job.status = "running"; job.reason = "正在独立复验当前草稿。"
          const verification = this.enqueueValidation(stableUuid(job.id, "singleton-verification"), draft,
            job.preparation.verificationInput, "verification")
          job.preparation.validationExecutionIds.push(verification.id); this.touch(job); this.schedule(); return
        }
        this.requestInput(job, plan, "verification"); return
      }
      if (record.mode !== "verification") throw new Error("preparation_validation_phase_invalid")
      job.preparation.phase = "ready"; job.status = "completed"; job.resultId = draft.id
      job.reason = "草稿已完成试跑检查；请在链路画布确认后手动发布。"
      job.preparation.inputRequest = null; this.touch(job)
    } catch (error) {
      job.status = "failed"; job.reason = `草稿验证记录失败：${error instanceof Error ? error.message : "draft_validation_failed"}`
      this.touch(job)
    }
  }

  private async authorChains(job: TaskAuthoringJob, requirement: NonNullable<ReturnType<typeof syncConfirmedRequirement>>,
    plan: TaskPlan, input: JsonValue, signal: AbortSignal, recoverySourceJobId?: string) {
    if (!job.preparation) throw new Error("preparation_state_missing")
    job.preparation.phase = "preexecuting"; job.preparation.representativeInput = input
    job.status = "queued"; job.reason = "正在用代表输入生成可复跑草稿。"; this.touch(job)
    const result = await this.authoring.task(job, requirement, plan, input, signal, recoverySourceJobId)
    const current = this.repository.job(job.taskId, job.id)
    if (!current.preparation) throw new Error("preparation_state_missing")
    const base = currentReleaseForRequirement(this.repository, job.taskId, requirement)
    const draft = createTaskDraft({ taskId: job.taskId, requirement, baseRelease: base ? releaseReference(base) : null,
      plan, chains: result.chains, presentations: result.presentations, current: this.repository.draft(job.taskId) })
    this.repository.saveDraft(draft)
    current.preparation.candidatePlan = plan; current.preparation.plan = planReference(plan)
    current.preparation.chains = draft.content.steps.map((step) => ({ id: step.chain.id, version: step.chain.version,
      digest: executableChainDigest(step.chain) }))
    current.preparation.draft = draftReference(draft)
    current.preparation.phase = "validating_sample"; current.status = "running"; current.reason = "正在试跑当前草稿。"
    const record = this.enqueueValidation(stableUuid(job.id, "sample-validation"), draft, input, "sample")
    current.preparation.validationExecutionIds.push(record.id); this.touch(current); this.schedule()
  }

  private requestInput(job: TaskAuthoringJob, plan: TaskPlan, purpose: "representative" | "verification") {
    if (!job.preparation) throw new Error("preparation_state_missing")
    job.preparation.phase = purpose === "representative" ? "awaiting_representative_input" : "awaiting_verification_input"
    job.preparation.inputRequest = { purpose, contract: plan.inputContract,
      prompt: purpose === "representative" ? "请提供本任务生成草稿所需的业务输入。" : "请提供另一组业务输入，用于复验当前草稿。",
      distinctFromDigest: purpose === "verification" && job.preparation.representativeInput !== null
        ? digestJson(job.preparation.representativeInput) : null }
    job.status = "waiting_for_human"; job.reason = job.preparation.inputRequest.prompt; this.touch(job)
  }

  private touch(job: TaskAuthoringJob) {
    job.sequence++; job.updatedAt = new Date().toISOString(); this.repository.saveJob(job)
  }
}

function safeInitialInput(plan: TaskPlan): JsonValue | undefined {
  const schema = plan.inputContract.schema
  if (schema.type === "null") return null
  if (schema.type === "object" && schema.required.length === 0) return parseTaskValue(plan.inputContract, {})
  return undefined
}

function requireJobDraft(repository: TaskContractRepository, job: TaskAuthoringJob) {
  const current = repository.draft(job.taskId), reference = job.preparation?.draft
  if (!current || !reference || current.id !== reference.id || current.revision !== reference.revision
    || current.checksum !== reference.checksum) throw new Error("preparation_draft_changed")
  return current
}

function currentReleaseForRequirement(repository: TaskContractRepository, taskId: string,
  requirement: NonNullable<ReturnType<typeof syncConfirmedRequirement>>) {
  return repository.releases(taskId).filter((release) => release.requirement.id === requirement.id
    && release.requirement.version === requirement.version && release.requirement.revision === requirement.revision
    && release.requirement.digest === digestJson(requirement)).at(-1) ?? null
}

function sameRequirement(plan: TaskPlan, requirement: NonNullable<ReturnType<typeof syncConfirmedRequirement>>) {
  return plan.requirement.id === requirement.id && plan.requirement.version === requirement.version
    && plan.requirement.revision === requirement.revision && plan.requirement.digest === digestJson(requirement)
}

function planReference(plan: TaskPlan) { return { id: plan.id, version: plan.version, digest: digestJson(plan) } }
