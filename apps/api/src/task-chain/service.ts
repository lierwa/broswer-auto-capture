import {
  DEFAULT_TASK_EXECUTION_BROWSER, acceptedTaskExecutionSchema, parseTaskValue, taskChainCommandSchema, taskExecutionCandidateSchema,
  taskExecutionEventBatchSchema, taskWorkspaceDiagnosticsSchema, taskWorkspaceHistoryPageSchema,
  type AcceptedTaskExecution, type JsonValue, type TaskAuthoringJob, type TaskChainCommand,
  type TaskChainDispatchResponse, type TaskDraft, type TaskExecution, type TaskWorkspaceSnapshot,
} from "@browser-capture/contracts"
import type { TaskSummary } from "@browser-capture/contracts/task"
import type { BrowserTargetSelectionCommand } from "@browser-capture/contracts/browser-profile"
import { digestJson, stableUuid } from "@browser-capture/runtime"
import type { AIModelProvider } from "../ai/model.js"
import type { BrowserService } from "../browser/service.js"
import type { ProductStore } from "../database/store.js"
import { conflict, DomainError } from "../errors.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { executionCleanupAuditSchema } from "../upstream-browser/cleanup.js"
import { assertExecutionBrowserSupported } from "../upstream-browser/retirement.js"
import { planCandidatesForJob, TaskChainAuthoring } from "./authoring.js"
import { assertDraftToken, draftReference, updateTaskDraft } from "./chain-revision.js"
import { TaskAdjustmentService } from "./adjustment.js"
import { capabilityDescriptor, capabilityDescriptors } from "./capability-descriptors.js"
import { appendExecutionReview } from "./execution-review.js"
import { projectExecutionResult } from "./execution-result.js"
import { ExecutionPacingController } from "./execution-pacing.js"
import { TaskPlanExecutor } from "./plan-executor.js"
import { recordPlanValidation } from "./plan-validation.js"
import { TaskPreparationCoordinator } from "./preparation.js"
import { TaskProductService } from "./product.js"
import { queuedDraftExecution, queuedExecution } from "./queued-runs.js"
import { TaskContractRepository } from "./repository.js"
import { syncConfirmedRequirement } from "./requirement.js"
import { TaskRuntimeHost, type RuntimeCapabilityFactory } from "./runtime-host.js"
import { projectTaskSummary, releaseReference, targetSelectionStartUrl, workspaceSnapshot } from "./workspace-projection.js"

type QueueItem = { taskId: string; id: string; resume: boolean }

export class TaskChainService {
  readonly repository: TaskContractRepository
  readonly product: TaskProductService
  private readonly adjustment: TaskAdjustmentService
  private readonly preparation: TaskPreparationCoordinator
  private readonly authoring: TaskChainAuthoring
  private readonly executor: TaskPlanExecutor
  private readonly host: TaskRuntimeHost
  private readonly activeWork = new Set<Promise<unknown>>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly queue: QueueItem[] = []
  private drainWork: Promise<void> | null = null
  private draining = false
  private closing = false

  constructor(private readonly store: ProductStore, private readonly browser: BrowserService,
    ai: AIModelProvider, upstream: UpstreamBrowserRuntime, capabilityFactory?: RuntimeCapabilityFactory) {
    this.repository = new TaskContractRepository(store)
    this.product = new TaskProductService(store, this.repository)
    this.host = new TaskRuntimeHost(this.repository, browser, ai, capabilityFactory, upstream)
    this.adjustment = new TaskAdjustmentService(store, this.repository, this.product, ai,
      (taskId, chains) => { this.host.assertExecutable(taskId, chains) })
    this.authoring = new TaskChainAuthoring(this.repository, ai, upstream)
    this.executor = new TaskPlanExecutor(store, this.repository, this.host)
    this.preparation = new TaskPreparationCoordinator(store, this.repository, this.authoring,
      (requestId, draft, input, mode) => this.enqueueDraftTrial(requestId, draft, input, mode),
      () => this.scheduleDrain())
  }

  snapshot(taskId: string) {
    return workspaceSnapshot(this.store, this.repository, this.product, taskId)
  }

  history(taskId: string, kind: "releases" | "executions", offset: number, limit: number) {
    const values = kind === "releases" ? this.repository.releaseHistory(taskId, offset, limit + 1)
      : this.repository.executionHistory(taskId, offset, limit + 1)
    const items = values.slice(0, limit), nextOffset = values.length > limit ? offset + limit : null
    return taskWorkspaceHistoryPageSchema.parse({ kind, items, nextOffset })
  }

  diagnostics(taskId: string) {
    this.store.task(taskId)
    const job = this.repository.latestPreparationJob(taskId)
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    const candidates = job && requirement ? planCandidatesForJob(job, requirement) : []
    return taskWorkspaceDiagnosticsSchema.parse({ capabilityDescriptors: capabilityDescriptors(),
      legacy: this.repository.legacy(taskId),
      adjustmentRecovery: this.adjustment.recovery(taskId, this.repository.latestAdjustmentJob(taskId)),
      preparation: job?.preparation ? {
        jobId: job.id, phase: job.preparation.phase === "preexecuting"
          && ["compiling", "compiled"].includes(job.authoring?.stage ?? "") ? "compiling" : job.preparation.phase,
        status: job.status, reason: job.reason,
        planCandidates: candidates.map(({ attempt, digest, issues }) => ({ attempt, digest, issues })),
        compilationRecovery: this.preparation.compilationRecovery(taskId, job),
        planRecovery: this.preparation.planRecovery(taskId, job),
      } : null })
  }

  dispatch(taskId: string, raw: unknown): TaskWorkspaceSnapshot
  dispatch(taskId: string, raw: unknown, includeReceipt: true): TaskChainDispatchResponse
  dispatch(taskId: string, raw: unknown, includeReceipt = false): TaskWorkspaceSnapshot | TaskChainDispatchResponse {
    const command = taskChainCommandSchema.parse(raw)
    let acceptedExecution: AcceptedTaskExecution | null = null
    this.store.task(taskId)
    if (command.type === "cancel_authoring") this.cancelAuthoring(taskId, command.jobId)
    else if (command.type === "prepare_task") this.preparation.start(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "continue_preparation") this.preparation.continue(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "correct_preparation_plan") this.preparation.correctPlan(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "recover_preparation_compilation") this.preparation.recoverCompilation(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "resume_preparation_from_plan") this.preparation.resumePlan(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "save_task_draft") this.saveDraft(taskId, command)
    else if (command.type === "trial_task_draft") acceptedExecution = this.trialDraft(taskId, command)
    else if (command.type === "publish_task_draft") this.publishDraft(taskId, command)
    else if (command.type === "review_execution") this.reviewExecution(taskId, command)
    else if (command.type === "request_chain_adjustment") {
      const job = this.adjustment.request(taskId, command)
      if (job) this.startAuthoring(taskId, job, (signal) => this.adjustment.generate(taskId, job.id, signal))
    }
    else if (command.type === "recover_chain_adjustment") this.adjustment.recover(taskId, command)
    else if (command.type === "accept_chain_adjustment") this.adjustment.accept(taskId, command)
    else if (command.type === "reject_chain_adjustment" || command.type === "cancel_chain_adjustment") {
      this.adjustment.decline(taskId, command)
      if (command.type === "cancel_chain_adjustment") this.controllers.get(`${taskId}:${command.jobId}`)?.abort()
    }
    else if (command.type === "run_task") acceptedExecution = this.runTask(taskId, command)
    else if (command.type === "resume_execution") this.resumeExecution(taskId, command)
    else if (command.type === "cleanup_execution") this.cleanupExecution(taskId, command)
    else this.cancelExecution(taskId, command.executionId)
    const snapshot = this.snapshot(taskId)
    return includeReceipt ? { snapshot, acceptedExecution } : snapshot
  }

  executionEvents(taskId: string, executionId: string, after: number) {
    const execution = this.repository.execution(taskId, executionId)
    let sequence = 0
    const events = execution.steps.flatMap((step) => step.runIds.flatMap((runId) => {
      const run = this.repository.run(taskId, runId)
      return run.events.map((event) => ({ executionId, sequence: ++sequence, stepId: step.stepId,
        runId, runSequence: run.sequence, event }))
    })).filter((event) => event.sequence > after).slice(0, 500)
    return taskExecutionEventBatchSchema.parse({ executionId, executionSequence: execution.sequence,
      status: execution.status, after, next: events.at(-1)?.sequence ?? after, events })
  }

  projectTasks(tasks: TaskSummary[]) {
    return tasks.map((task) => projectTaskSummary(task, this.store, this.repository, this.product))
  }

  isActive(taskId: string) {
    return [...this.controllers.keys()].some((key) => key.startsWith(`${taskId}:`))
      || this.queue.some((item) => item.taskId === taskId)
  }
  isAnyActive() { return this.controllers.size > 0 || this.queue.length > 0 || this.activeWork.size > 0 || this.draining }

  legacyOriginal(taskId: string, source: "plans" | "chains" | "executions", id: string) {
    return this.repository.legacyOriginal(taskId, source, id)
  }

  targetSelectionContext(taskId: string, command: Extract<BrowserTargetSelectionCommand, { type: "start" }>) {
    const draft = this.requireDraft(taskId)
    assertDraftToken(draft, command.expectedRevision, command.expectedChecksum)
    const step = draft.content.steps.find((item) => item.chain.id === command.chainId)
    if (!step) throw new DomainError("draft_chain_not_found", "草稿链路不存在。", 404)
    const node = step.chain.nodes.find((item) => item.id === command.nodeId)
    if (!node) throw new DomainError("chain_node_not_found", "节点不存在。", 404)
    if (node.kind !== "capability") conflict("只有 capability 动作可以选择浏览器目标。")
    const descriptor = capabilityDescriptor(node.capability.name, node.capability.version)
    if (!descriptor || descriptor.targetMode !== "live_browser_picker"
      || !descriptor.editableFields.some((field) => field.control === "browser_target")) {
      conflict("当前动作没有可用的浏览器目标选择器。")
    }
    return { startUrl: targetSelectionStartUrl(step.chain, node.id) }
  }

  async close() {
    this.closing = true
    for (const controller of this.controllers.values()) controller.abort()
    await Promise.allSettled([...this.activeWork, ...(this.drainWork ? [this.drainWork] : [])])
  }

  private cancelAuthoring(taskId: string, jobId: string) {
    this.repository.job(taskId, jobId)
    this.controllers.get(`${taskId}:${jobId}`)?.abort()
  }

  private saveDraft(taskId: string, command: Extract<TaskChainCommand, { type: "save_task_draft" }>) {
    if (this.store.operation("task-draft:save", command.requestId, command)) return
    const current = this.requireDraft(taskId)
    this.assertDraftIdentity(current, command.draftId)
    const updated = updateTaskDraft(current, command.expectedRevision, command.expectedChecksum,
      command.chainId, command.operations, this.repository.nextChainVersion(taskId, command.chainId))
    this.host.assertExecutable(taskId, updated.content.steps.map((step) => step.chain))
    this.repository.saveDraft(updated)
    this.store.recordOperation("task-draft:save", command.requestId, command, updated.id)
  }

  private trialDraft(taskId: string, command: Extract<TaskChainCommand, { type: "trial_task_draft" }>) {
    const previous = this.store.operation("task-draft:trial", command.requestId, command)
    if (previous) return this.acceptedExecution(command.requestId, this.repository.execution(taskId, previous))
    this.assertDirectRunAvailable(taskId)
    const draft = this.requireDraft(taskId)
    this.assertDraftIdentity(draft, command.draftId)
    assertDraftToken(draft, command.expectedRevision, command.expectedChecksum)
    const input = parseTaskValue(draft.content.plan.inputContract, command.input)
    const mode = this.product.nextTrialMode(draft, input)
    const record = this.enqueueDraftTrial(command.requestId, draft, input, mode)
    this.store.recordOperation("task-draft:trial", command.requestId, command, record.id)
    this.scheduleDrain()
    return this.acceptedExecution(command.requestId, record)
  }

  private enqueueDraftTrial(requestId: string, draft: TaskDraft, input: JsonValue,
    mode: "sample" | "verification") {
    this.host.assertExecutable(draft.taskId, draft.content.steps.map((step) => step.chain))
    const record = queuedDraftExecution(draft.taskId, requestId, draft, input, { nodeDelayMs: 0 }, mode)
    this.repository.saveExecution(record)
    this.repository.saveCandidate(taskExecutionCandidateSchema.parse({ executionId: record.id, taskId: draft.taskId,
      draft: draftReference(draft), content: structuredClone(draft.content), createdAt: record.createdAt }))
    this.queue.push({ taskId: draft.taskId, id: record.id, resume: false })
    return record
  }

  private publishDraft(taskId: string, command: Extract<TaskChainCommand, { type: "publish_task_draft" }>) {
    if (this.store.operation("task-draft:publish", command.requestId, command)) return
    this.assertDirectRunAvailable(taskId)
    const draft = this.requireDraft(taskId)
    this.assertDraftIdentity(draft, command.draftId)
    assertDraftToken(draft, command.expectedRevision, command.expectedChecksum)
    this.host.assertExecutable(taskId, draft.content.steps.map((step) => step.chain))
    const release = this.product.publishDraft(taskId, draft)
    this.store.recordOperation("task-draft:publish", command.requestId, command, release.id)
  }

  private reviewExecution(taskId: string, command: Extract<TaskChainCommand, { type: "review_execution" }>) {
    if (this.store.operation("task-execution:review", command.requestId, command)) return
    const reviewed = appendExecutionReview(this.repository.execution(taskId, command.executionId), command)
    this.repository.saveExecution(reviewed)
    this.store.recordOperation("task-execution:review", command.requestId, command, reviewed.reviews.at(-1)!.id)
  }

  private runTask(taskId: string, command: Extract<TaskChainCommand, { type: "run_task" }>) {
    const previous = this.store.operation("task-execution:run", command.requestId, command)
    if (previous) return this.acceptedExecution(command.requestId, this.repository.execution(taskId, previous))
    this.assertDirectRunAvailable(taskId)
    const release = this.product.requireCurrentRelease(taskId, command.release)
    const input = this.product.resolveRunInput(taskId, release, command.input)
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement) conflict("只能运行当前已确认需求。")
    const closure = this.host.assertExecutable(taskId, release.content.steps.map((step) => step.chain))
    const browser = command.browser ?? DEFAULT_TASK_EXECUTION_BROWSER
    assertExecutionBrowserSupported(closure, browser.headless)
    const record = queuedExecution(taskId, command.requestId, release.content.plan, requirement,
      release, input, command.pacing ?? { nodeDelayMs: 0 }, browser)
    this.repository.saveExecution(record)
    this.store.recordOperation("task-execution:run", command.requestId, command, record.id)
    this.queue.push({ taskId, id: record.id, resume: false }); this.scheduleDrain()
    return this.acceptedExecution(command.requestId, record)
  }

  private acceptedExecution(requestId: string, record: TaskExecution) {
    const source = record.release ? { kind: "release" as const, release: record.release }
      : record.draft ? { kind: "draft" as const, draft: record.draft } : null
    if (!source) throw new Error("accepted_execution_source_missing")
    const content = record.release
      ? this.repository.release(record.taskId, record.release.id, record.release.version, record.release.digest).content
      : this.repository.candidate(record.taskId, record.id)?.content
    if (!content) throw new Error("accepted_execution_content_missing")
    return acceptedTaskExecutionSchema.parse({ status: "accepted", taskId: record.taskId, requestId,
      executionId: record.id, executionSequence: record.sequence, acceptedAt: record.createdAt,
      source, plan: record.plan, chains: content.steps.map((step) => ({ stepId: step.stepId,
        chain: record.steps.find((item) => item.stepId === step.stepId)?.chain ?? step.chain })) })
  }

  private resumeExecution(taskId: string, command: Extract<TaskChainCommand, { type: "resume_execution" }>) {
    if (this.store.operation("task-execution:resume", command.requestId, command)) return
    this.assertDirectRunAvailable(taskId)
    const record = this.repository.execution(taskId, command.executionId)
    if (record.sequence !== command.expectedSequence) conflict("运行状态已变化，请刷新后重试。")
    if (!["paused", "waiting_for_human"].includes(record.status)) conflict("当前运行不在可恢复状态。")
    record.status = "queued"; record.reason = "恢复请求已排队；执行前会核验检查点和浏览器现场。"
    record.result = projectExecutionResult(this.repository, record)
    record.sequence++; record.updatedAt = new Date().toISOString(); this.repository.saveExecution(record)
    this.store.recordOperation("task-execution:resume", command.requestId, command, record.id)
    this.queue.push({ taskId, id: record.id, resume: true }); this.scheduleDrain()
  }

  private cleanupExecution(taskId: string, command: Extract<TaskChainCommand, { type: "cleanup_execution" }>) {
    if (this.store.operation("task-execution:cleanup", command.requestId, command)) return
    const record = this.repository.execution(taskId, command.executionId)
    if (record.sequence !== command.expectedSequence) conflict("运行状态已变化，请刷新后重试。")
    if (record.status !== "cleanup_required" || !["pending", "unconfirmed"].includes(record.cleanup.status)) {
      conflict("当前运行不需要资源清理。")
    }
    const prior = this.repository.cleanupAudits(taskId, record.id).at(-1)
    const pending = this.repository.updateExecutionCleanup(taskId, record.id, record.sequence, {
      status: "pending", attempt: record.cleanup.attempt + 1, code: null, evidenceDigest: null,
      updatedAt: new Date().toISOString(),
    }, "cleanup_required")
    const confirmed = prior?.activeResources === false && pending.cleanupResume !== null
    const code = confirmed ? null : "cleanup_owner_verification_unavailable"
    const facts = { executionId: record.id, ownerId: prior?.ownerId ?? stableUuid(record.id, "cleanup-owner"),
      attempt: pending.cleanup.attempt, status: confirmed ? "confirmed" as const : "unconfirmed" as const,
      code, activeResources: confirmed ? false : null, stages: [] }
    const evidenceDigest = digestJson(facts)
    this.repository.saveCleanupAudit(executionCleanupAuditSchema.parse({ id: stableUuid(record.id, "cleanup-audit",
      String(pending.cleanup.attempt)), taskId, ...facts, source: "owner_verification", evidenceDigest,
      createdAt: new Date().toISOString() }))
    if (confirmed) {
      const resume = pending.cleanupResume!
      const settled = this.repository.updateExecutionCleanup(taskId, record.id, pending.sequence, { status: "confirmed",
        attempt: pending.cleanup.attempt, code: null, evidenceDigest, updatedAt: new Date().toISOString() }, {
        status: resume.status, reason: resume.reason, result: resume.result, cleanupResume: null,
      })
      recordPlanValidation(this.repository, settled); this.preparation.onExecutionSettled(settled)
    } else {
      this.repository.updateExecutionCleanup(taskId, record.id, pending.sequence, { status: "unconfirmed",
        attempt: pending.cleanup.attempt, code, evidenceDigest, updatedAt: new Date().toISOString() }, "cleanup_required")
    }
    this.store.recordOperation("task-execution:cleanup", command.requestId, command, record.id)
  }

  private cancelExecution(taskId: string, executionId: string) {
    const record = this.repository.execution(taskId, executionId)
    this.controllers.get(`${taskId}:${executionId}`)?.abort()
    const pending = this.queue.findIndex((item) => item.id === executionId)
    if (pending >= 0) this.queue.splice(pending, 1)
    if (["completed", "partial", "blocked", "failed", "cancelled", "stale"].includes(record.status)) return
    record.status = "cancelled"; record.reason = "运行已取消；已有运行和产物记录保留。"; record.sequence++
    record.result = projectExecutionResult(this.repository, record,
      { classification: "cancelled", code: "execution_cancelled", repairable: false })
    record.updatedAt = new Date().toISOString(); this.repository.saveExecution(record)
  }

  private assertDirectRunAvailable(taskId: string) {
    const cleanupRequired = this.repository.executions(taskId).some((record) => record.status === "cleanup_required"
      || ["pending", "unconfirmed"].includes(record.cleanup.status))
    if (cleanupRequired) conflict("原运行的资源清理尚未确认，请先完成清理。")
    if (this.browser.owner() || this.draining || this.queue.length || this.controllers.size) {
      conflict("另一项浏览器工作正在进行，请等待完成后再运行。")
    }
  }

  private requireDraft(taskId: string) {
    const draft = this.repository.draft(taskId)
    if (!draft) throw new DomainError("task_draft_not_found", "当前任务没有活动草稿。", 404)
    return draft
  }

  private assertDraftIdentity(draft: TaskDraft, expectedId: string) {
    if (draft.id !== expectedId) throw new DomainError("task_draft_stale", "任务草稿已变化，请刷新后继续。", 409)
  }

  private startAuthoring(taskId: string, job: TaskAuthoringJob, run: (signal: AbortSignal) => Promise<unknown>) {
    const controller = new AbortController(), key = `${taskId}:${job.id}`; this.controllers.set(key, controller)
    let work!: Promise<unknown>
    work = Promise.resolve().then(() => run(controller.signal)).catch(() => {}).finally(() => {
      this.controllers.delete(key); this.activeWork.delete(work)
    })
    this.activeWork.add(work)
  }

  private scheduleDrain() {
    if (this.drainWork || this.closing) return
    const work = this.drain().finally(() => { if (this.drainWork === work) this.drainWork = null })
    this.drainWork = work
  }

  private async drain() {
    if (this.draining || this.closing) return
    this.draining = true
    try {
      while (this.queue.length && !this.closing) {
        const item = this.queue.shift()!, controller = new AbortController(), key = `${item.taskId}:${item.id}`
        this.controllers.set(key, controller)
        try {
          const record = this.repository.execution(item.taskId, item.id)
          const pacing = new ExecutionPacingController(record.pacing)
          await this.executor.execute(record, controller.signal, item.resume, pacing)
          recordPlanValidation(this.repository, record)
          this.preparation.onExecutionSettled(record)
        } finally { this.controllers.delete(key) }
      }
    } finally { this.draining = false }
  }
}
