import {
  parseTaskValue, taskInputRequiresVariation, taskPlanExecutionIssues,
  type JsonValue, type TaskAuthoringJob, type TaskChainCommand,
  type TaskDraft, type TaskExecution, type TaskPlan,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { ProductStore } from "../database/store.js"
import { conflict, DomainError } from "../errors.js"
import type { TaskChainAuthoring } from "./authoring.js"
import { authoringFailureMessage, planCandidatesForJob } from "./authoring.js"
import { createTaskDraft, draftReference, recordDraftTrial, releaseReference } from "./chain-revision.js"
import type { TaskContractRepository } from "./repository.js"
import { syncConfirmedRequirement } from "./requirement.js"
import { canRecollectHybridSources } from "./hybrid-source-reuse.js"

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
      const plan = reusableCompilationPlan(this.repository, taskId, requirement)
        ?? await this.authoring.plan(job, requirement, signal)
      const current = this.repository.job(taskId, job.id)
      current.preparation = { phase: "forming_plan", plan: planReference(plan), chains: [], candidatePlan: plan, draft: null,
        planCandidates: current.preparation?.planCandidates ?? [],
        recoveredFromJobId: null, resumedFromJobId: null,
        representativeInput: null, verificationInput: null, inputRequest: null, requirementReturn: null,
        validationExecutionIds: [], priorAudits: current.audit ? [structuredClone(current.audit)] : [] }
      const initial = safeInitialInput(plan)
      if (initial === undefined) { this.requestInput(current, plan, "representative"); return }
      await this.authorChains(current, requirement, plan, initial, signal)
    })
  }

  correctPlan(taskId: string, command: Extract<TaskChainCommand, { type: "correct_preparation_plan" }>,
    startWork: WorkStarter) {
    if (this.store.operation("task-product:correct-plan", command.requestId, command)) return
    const job = this.repository.job(taskId, command.jobId), preparation = job.preparation
    if (job.type !== "prepare" || !preparation || preparation.phase !== "forming_plan"
      || !["failed", "interrupted"].includes(job.status) || job.sequence !== command.expectedSequence
      || job.browserRunId) conflict("方案状态已变化，请重新查看当前诊断。")
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement) conflict("当前任务没有已确认需求。")
    const candidates = planCandidatesForJob(job, requirement)
    const source = candidates.at(-1)
    if (!source || !source.issues.length) conflict("没有可据以纠正的完整失败候选。")
    if (candidates.length >= 4) conflict("方案已达到本轮有界纠正上限，请先检查需求或失败证据。")
    // WHY：原 job 保留所有候选和审计；恢复只纠正最后一份失败候选，且暂不启动浏览器。
    preparation.planCandidates = candidates
    job.status = "queued"; job.reason = "正在根据已保存候选纠正预执行方案。"; this.touch(job)
    this.store.recordOperation("task-product:correct-plan", command.requestId, command, job.id)
    startWork(job, async (signal) => {
      const plan = await this.authoring.correctPlan(job, requirement, source, signal)
      const current = this.repository.job(taskId, job.id)
      if (!current.preparation) throw new Error("preparation_state_missing")
      current.preparation.plan = planReference(plan); current.preparation.candidatePlan = plan
      this.requestInput(current, plan, "representative")
      current.reason = "方案合同已通过；请继续代表试做。"
      this.touch(current)
    })
  }

  compilationRecovery(taskId: string, job: TaskAuthoringJob | null) {
    if (!job || job.type !== "prepare" || job.status !== "failed"
      || job.preparation?.phase !== "preexecuting") return null
    let sourceJobId = hasSavedSources(job) ? job.id : job.preparation.recoveredFromJobId ?? job.id
    if (!["compiling", "compiled"].includes(job.authoring?.stage ?? "")) {
      return { sourceJobId, available: false,
        reason: "代表试做尚未形成完整可复用来源；请先处理浏览器试做的失败原因。" }
    }
    try {
      if (job.preparation.requirementReturn) conflict("试做发现新的业务歧义，请返回需求对话确认。")
      if (this.repository.draft(taskId)) conflict("当前已有活动草稿，请先查看或处理该草稿。")
      const { requirement, plan, input } = this.recoveryContext(taskId, job)
      const probe = { ...job, id: stableUuid(job.id, "recovery-probe") }
      const recollectible = (candidate: TaskAuthoringJob) => {
        try { return canRecollectHybridSources(this.repository, candidate) }
        catch { return false }
      }
      const jobs = this.repository.jobs(taskId), index = jobs.findIndex((candidate) => candidate.id === job.id)
      const earlier = hasSavedSources(job) && !recollectible(job) && index >= 0
        ? jobs.slice(0, index).toReversed().find((candidate) => {
          if (candidate.key !== job.key || candidate.status !== "failed"
            || candidate.preparation?.plan?.digest !== job.preparation?.plan?.digest
            || !recollectible(candidate)) return false
          try {
            this.authoring.assertReusableSources(probe, requirement, plan, input, candidate.id)
            return true
          } catch { return false }
        }) : undefined
      sourceJobId = earlier?.id ?? sourceJobId
      if (!earlier) this.authoring.assertReusableSources(probe, requirement, plan, input, sourceJobId)
      return { sourceJobId, available: true, reason: earlier
        ? "本次试做的派生程序无效；可复用更早的完整浏览器来源离线编译，旧记录保留。"
        : "已核验完整代表试做来源；可只用编译器恢复，不重新操作浏览器。" }
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

  planRecovery(taskId: string, job: TaskAuthoringJob | null) {
    if (!job || job.type !== "prepare" || job.status !== "failed"
      || job.preparation?.phase !== "preexecuting") return null
    const sourceJobId = job.id
    try {
      const recollect = canRecollectHybridSources(this.repository, job)
        && job.preparation?.chains.length === 0 && job.preparation.draft === null
      if (!canResumeSavedPlan(job) && !recollect) conflict("本次失败不能沿保存方案安全续做。")
      if (job.preparation.requirementReturn) conflict("试做发现新的业务歧义，请返回需求对话确认。")
      if (this.repository.draft(taskId)) conflict("当前已有活动草稿，请先查看或处理该草稿。")
      if (this.repository.jobs(taskId).some((other) => other.id !== job.id && other.type === "prepare"
        && ["queued", "running", "waiting_for_human"].includes(other.status))) conflict("当前已有进行中的草稿生成。")
      const { plan } = this.recoveryContext(taskId, job)
      if (taskPlanExecutionIssues(plan).length) conflict("保存的方案不再满足执行合同，不能续接。")
      return { sourceJobId, available: true,
        reason: recollect
          ? "旧试做缺少可编译的页面证据；可沿已保存方案重新采集，旧来源和失败记录保留。"
          : "受管源码已修复后，可沿已保存的合法方案重新开始代表试做；不会重新生成方案。" }
    } catch (error) {
      return { sourceJobId, available: false, reason: error instanceof DomainError
        ? error.message : authoringFailureMessage(error) }
    }
  }

  resumePlan(taskId: string, command: Extract<TaskChainCommand, { type: "resume_preparation_from_plan" }>,
    startWork: WorkStarter) {
    if (this.store.operation("task-product:resume-plan", command.requestId, command)) return
    const failed = this.repository.job(taskId, command.jobId)
    if (failed.sequence !== command.expectedSequence) conflict("方案失败记录已变化，请刷新后重试。")
    const recovery = this.planRecovery(taskId, failed)
    if (!recovery?.available) conflict(recovery?.reason ?? "本次失败不能从已保存方案续接。")
    const { requirement, plan, input } = this.recoveryContext(taskId, failed)
    const now = new Date().toISOString()
    // WHY：旧失败 job 与审计保留；新 job 只复用已验证方案和业务输入，受管源码预检后才准备模型或浏览器。
    const job: TaskAuthoringJob = { id: stableUuid(command.requestId, "resume-plan"), taskId,
      type: "prepare", key: failed.key, status: "queued", sequence: 0,
      reason: "正在核验受管源码，并从已保存方案继续代表试做。", resultId: null, browserRunId: null,
      waitpoint: null, audit: null, preparation: {
        phase: "preexecuting", plan: planReference(plan), chains: [], candidatePlan: plan, draft: null,
        planCandidates: [], recoveredFromJobId: null, resumedFromJobId: failed.id,
        representativeInput: input, verificationInput: null, inputRequest: null, requirementReturn: null,
        validationExecutionIds: [], priorAudits: failed.audit ? [structuredClone(failed.audit)] : [],
      }, createdAt: now, updatedAt: now }
    this.repository.saveJob(job)
    this.store.recordOperation("task-product:resume-plan", command.requestId, command, job.id)
    startWork(job, (signal) => this.authorChains(job, requirement, plan, input, signal, undefined, true))
  }

  private recoveryContext(taskId: string, job: TaskAuthoringJob) {
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    const preparation = job.preparation, reference = preparation?.plan
    if (!requirement || !preparation || !reference) conflict("原需求或方案引用已不可用，不能离线恢复。")
    const plan = preparation.candidatePlan ?? this.repository.plan(taskId,
      reference.id, reference.version, reference.digest)
    if (digestJson(plan) !== reference.digest || !sameRequirement(plan, requirement)) {
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
    plan: TaskPlan, input: JsonValue, signal: AbortSignal, recoverySourceJobId?: string, verifySourceFirst = false) {
    if (!job.preparation) throw new Error("preparation_state_missing")
    job.preparation.phase = "preexecuting"; job.preparation.representativeInput = input
    job.status = "queued"; job.reason = "正在用代表输入生成可复跑草稿。"; this.touch(job)
    const result = await this.authoring.task(job, requirement, plan, input, signal, recoverySourceJobId, verifySourceFirst)
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

export function reusableCompilationPlan(repository: TaskContractRepository, taskId: string,
  requirement: NonNullable<ReturnType<typeof syncConfirmedRequirement>>) {
  const jobs = repository.jobs(taskId)
  for (let index = jobs.length - 1; index >= 0; index--) {
    const candidate = jobs[index], plan = candidate?.preparation?.candidatePlan
    if (candidate?.type !== "prepare" || candidate.status !== "failed"
      || !["compiling", "compiled"].includes(candidate.authoring?.stage ?? "")
      || !plan || candidate.preparation?.requirementReturn) continue
    if (sameRequirement(plan, requirement)) return plan
  }
  return undefined
}

function hasSavedSources(job: TaskAuthoringJob) {
  const exploration = job.authoring?.exploration
  if (!exploration || typeof exploration !== "object" || Array.isArray(exploration)) return false
  return Array.isArray(exploration.sources) && exploration.sources.length > 0
}

export function canResumeSavedPlan(job: TaskAuthoringJob) {
  const authoring = job.authoring, preparation = job.preparation
  const exploration = authoring?.exploration
  return authoring?.stage === "exploring" && authoring.failureLayer === "workflow-use 受管源码校验"
    && authoring.progress?.actionsStarted === 0 && authoring.progress?.modelCallsStarted === 0
    && authoring.consumption.explorationToolCalls === 0 && authoring.consumption.compilationCalls === 0
    && (!exploration || (typeof exploration === "object" && !Array.isArray(exploration)
      && Array.isArray(exploration.sources) && exploration.sources.length === 0))
    && preparation?.chains.length === 0 && preparation.draft === null
    && Boolean(preparation.plan && preparation.candidatePlan)
}
