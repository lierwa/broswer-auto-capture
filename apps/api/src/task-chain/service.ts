import {
  DEFAULT_TASK_EXECUTION_BROWSER, acceptedTaskExecutionSchema, browserActionTitle, parseTaskValue,
  taskChainCommandSchema, taskExecutionCandidateSchema,
  taskExecutionEventBatchSchema, taskWorkspaceDiagnosticsSchema, taskWorkspaceHistoryPageSchema,
  type AcceptedTaskExecution, type ChainNode, type JsonValue, type TaskAuthoringJob, type TaskChainCommand,
  type TaskChainDispatchResponse, type TaskDraft, type TaskDraftContent, type TaskExecution, type TaskWorkspaceSnapshot,
} from "@browser-capture/contracts"
import type { TaskSummary } from "@browser-capture/contracts/task"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { z } from "zod"
import type { AIModelProvider } from "../ai/model.js"
import type { BrowserService } from "../browser/service.js"
import type { ProductStore } from "../database/store.js"
import { conflict, DomainError } from "../errors.js"
import { UpstreamProtocolError, type UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { executionCleanupAuditSchema, RUNNER_CLEANUP_STAGES, type ExecutionCleanupAudit } from "../upstream-browser/cleanup.js"
import { assertExecutionBrowserSupported } from "../upstream-browser/retirement.js"
import { TaskChainAuthoring } from "./authoring.js"
import { assertDraftToken, draftReference } from "./chain-revision.js"
import { capabilityDescriptors } from "./capability-descriptors.js"
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
import { projectTaskSummary, releaseReference, workspaceSnapshot } from "./workspace-projection.js"

type QueueItem = { taskId: string; id: string; resume: boolean }

export class TaskChainService {
  readonly repository: TaskContractRepository
  readonly product: TaskProductService
  private readonly preparation: TaskPreparationCoordinator
  private readonly authoring: TaskChainAuthoring
  private readonly executor: TaskPlanExecutor
  private readonly host: TaskRuntimeHost
  private readonly activeWork = new Set<Promise<unknown>>()
  private readonly cleanupInFlight = new Set<string>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly queue: QueueItem[] = []
  private drainWork: Promise<void> | null = null
  private draining = false
  private closing = false

  constructor(private readonly store: ProductStore, private readonly browser: BrowserService,
    ai: AIModelProvider, private readonly upstream: UpstreamBrowserRuntime, capabilityFactory?: RuntimeCapabilityFactory) {
    this.repository = new TaskContractRepository(store)
    this.product = new TaskProductService(store, this.repository)
    this.host = new TaskRuntimeHost(this.repository, browser, ai, capabilityFactory, upstream)
    this.authoring = new TaskChainAuthoring(this.repository, ai, upstream)
    this.executor = new TaskPlanExecutor(store, this.repository, this.host)
    this.preparation = new TaskPreparationCoordinator(store, this.repository, this.authoring,
      (requestId, draft, input, mode) => this.enqueueDraftTrial(requestId, draft, input, mode),
      () => this.scheduleDrain())
  }

  snapshot(taskId: string) {
    return workspaceSnapshot(this.store, this.repository, this.product, taskId)
  }

  async controlBrowserHandoff(taskId: string, raw: unknown) {
    const command = z.object({ requestId: z.uuid(), executionId: z.uuid(), expectedSequence: z.number().int().nonnegative(),
      action: z.enum(["inspect", "focus", "end"]) }).strict().parse(raw)
    this.store.task(taskId)
    if (this.store.operation("task-execution:browser-handoff", command.requestId, command)) return this.snapshot(taskId)
    const record = this.repository.execution(taskId, command.executionId)
    if (record.sequence !== command.expectedSequence) conflict("运行状态已变化，请刷新后重试。")
    if (["queued", "running"].includes(record.status)
      || this.controllers.has(`${taskId}:${record.id}`)) conflict("浏览器现场正在由运行器处理，请稍后重试。")
    const handoff = record.browserHandoff
    const ownerId = stableUuid(record.id, "managed-window")
    if (!(handoff.status === "active" || handoff.status === "unavailable" && command.action !== "focus"
      || handoff.status === "pending" && command.action === "inspect")
      || handoff.ownerId !== ownerId || handoff.leaseId !== ownerId) {
      conflict("原浏览器现场未被确认，请刷新后查看当前状态。")
    }
    if (!this.upstream.managedWindowAction) throw new DomainError("browser_handoff_unavailable", "浏览器现场控制不可用。", 503)
    const outcome = await this.upstream.managedWindowAction({ action: command.action, ownerId, leaseId: ownerId })
      .catch((error: unknown) => {
        // WHY：OS 前台限制不改变业务完成或原窗口租约；只投影已知固定错误。
        if (command.action === "focus" && error instanceof UpstreamProtocolError
          && error.code === "hybrid_runner_failed"
          && error.reason === "ValueError:hybrid_managed_window_foreground_denied") {
          throw new DomainError("browser_handoff_foreground_denied",
            "系统未允许自动切换到原窗口；窗口仍保留，请通过任务栏手动切换。", 409)
        }
        throw error
      })
    if (outcome.report.status !== "confirmed") throw new DomainError("browser_handoff_cleanup_unconfirmed",
      "浏览器现场操作的资源清理尚未确认，请刷新后重试。", 409)
    if (outcome.window.ownerId !== ownerId || outcome.window.leaseId !== ownerId) {
      throw new DomainError("browser_handoff_owner_changed", "浏览器现场归属无法核验。", 409)
    }
    const latest = this.repository.execution(taskId, command.executionId)
    if (!(latest.browserHandoff.status === "active" || latest.browserHandoff.status === "unavailable"
      && command.action !== "focus" || latest.browserHandoff.status === "pending"
      && command.action === "inspect") || latest.browserHandoff.leaseId !== ownerId) {
      conflict("运行状态已变化，请刷新后重试。")
    }
    const resumeStatus = latest.status === "cleanup_required" ? latest.cleanupResume?.status : latest.status
    latest.browserHandoff = { ...latest.browserHandoff,
      status: outcome.window.active ? "active" : command.action === "end" || command.action === "inspect"
        ? "ended" : "unavailable",
      purpose: outcome.window.active ? latest.browserHandoff.purpose
        ?? (["waiting_for_human", "paused"].includes(resumeStatus ?? "") ? "human_wait" : "delivery") : null,
      targetDigest: outcome.window.active ? outcome.window.targetDigest : null,
      reason: outcome.window.active ? null : outcome.window.reason ?? (command.action === "end" ? null : "window_not_active"),
      updatedAt: new Date().toISOString() }
    latest.sequence++; latest.updatedAt = new Date().toISOString(); this.repository.saveExecution(latest)
    this.store.recordOperation("task-execution:browser-handoff", command.requestId, command, record.id)
    return this.snapshot(taskId)
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
    return taskWorkspaceDiagnosticsSchema.parse({ capabilityDescriptors: capabilityDescriptors(),
      preparation: job?.preparation ? {
        jobId: job.id, phase: job.preparation.phase === "preexecuting"
          && ["compiling", "compiled"].includes(job.authoring?.stage ?? "") ? "compiling" : job.preparation.phase,
        status: job.status, reason: job.reason,
        compilationRecovery: this.preparation.compilationRecovery(taskId, job),
      } : null })
  }

  async dispatchAsync(taskId: string, raw: unknown): Promise<TaskChainDispatchResponse> {
    const command = taskChainCommandSchema.parse(raw)
    if (command.type === "cleanup_execution") {
      const key = `${taskId}:${command.executionId}`
      if (this.cleanupInFlight.has(key)) conflict("正在核验本次运行的资源清理，请等待结果。")
      this.cleanupInFlight.add(key)
      const work = this.cleanupExecution(taskId, command); this.activeWork.add(work)
      try { await work } finally { this.activeWork.delete(work); this.cleanupInFlight.delete(key) }
      return { snapshot: this.snapshot(taskId), acceptedExecution: null }
    }
    if (command.type !== "resume_preparation_human") return this.dispatch(taskId, command, true)
    this.store.task(taskId)
    await this.preparation.resumeHuman(taskId, command)
    return { snapshot: this.snapshot(taskId), acceptedExecution: null }
  }

  dispatch(taskId: string, raw: unknown): TaskWorkspaceSnapshot
  dispatch(taskId: string, raw: unknown, includeReceipt: true): TaskChainDispatchResponse
  dispatch(taskId: string, raw: unknown, includeReceipt = false): TaskWorkspaceSnapshot | TaskChainDispatchResponse {
    const command = taskChainCommandSchema.parse(raw)
    let acceptedExecution: AcceptedTaskExecution | null = null
    this.store.task(taskId)
    if (command.type === "cancel_authoring") this.cancelAuthoring(taskId, command.jobId)
    else if (command.type === "resume_preparation_human") conflict("人工恢复需要等待现场核验，请使用异步命令入口。")
    else if (command.type === "prepare_task") this.preparation.start(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "continue_preparation") this.preparation.continue(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "recover_preparation_compilation") this.preparation.recoverCompilation(taskId, command,
      (job, run) => this.startAuthoring(taskId, job, run))
    else if (command.type === "trial_task_draft") acceptedExecution = this.trialDraft(taskId, command)
    else if (command.type === "publish_task_draft") this.publishDraft(taskId, command)
    else if (command.type === "review_execution") this.reviewExecution(taskId, command)
    else if (command.type === "run_task") acceptedExecution = this.runTask(taskId, command)
    else if (command.type === "resume_execution") this.resumeExecution(taskId, command)
    else if (command.type === "cleanup_execution") conflict("资源清理需要等待现场核验，请使用异步命令入口。")
    else this.cancelExecution(taskId, command.executionId)
    const snapshot = this.snapshot(taskId)
    return includeReceipt ? { snapshot, acceptedExecution } : snapshot
  }

  executionEvents(taskId: string, executionId: string, after: number) {
    const execution = this.repository.execution(taskId, executionId)
    const frozen = this.frozenEventContent(taskId, execution)
    const stepTitles = new Map((frozen?.plan.steps ?? []).map((step) => [step.id, step.title] as const))
    const nodeTitles = new Map<string, Map<string, string>>()
    for (const step of execution.steps) {
      const source = frozen?.steps.find((item) => item.stepId === step.stepId)
      if (!source || source.chain.id !== step.chain.id || source.chain.version !== step.chain.version
        || executableChainDigest(source.chain) !== step.chain.digest) continue
      nodeTitles.set(step.stepId, new Map(source.chain.nodes.map((node) => [node.id, eventNodeTitle(node)] as const)))
    }
    let sequence = 0
    const events = execution.steps.flatMap((step) => step.runIds.flatMap((runId) => {
      const run = this.repository.run(taskId, runId)
      const sameRun = run.binding.taskId === taskId && run.binding.authorizationId === execution.authorizationId
        && run.binding.plan.id === execution.plan.id && run.binding.plan.version === execution.plan.version
        && run.binding.plan.digest === execution.plan.digest && run.binding.chain.id === step.chain.id
        && run.binding.chain.version === step.chain.version && run.binding.chain.digest === step.chain.digest
      return run.events.map((event) => ({ executionId, sequence: ++sequence, stepId: step.stepId,
        runId, runSequence: run.sequence, stepTitle: sameRun ? stepTitles.get(step.stepId) ?? null : null,
        nodeTitle: sameRun ? nodeTitles.get(step.stepId)?.get(event.nodeId) ?? null : null, event }))
    })).filter((event) => event.sequence > after).slice(0, 500)
    return taskExecutionEventBatchSchema.parse({ executionId, executionSequence: execution.sequence,
      status: execution.status, after, next: events.at(-1)?.sequence ?? after, events })
  }

  private frozenEventContent(taskId: string, execution: TaskExecution): TaskDraftContent | null {
    let content: TaskDraftContent | null = null
    if (execution.release) {
      try {
        const { id, version, digest } = execution.release
        content = this.repository.release(taskId, id, version, digest).content
      } catch (error) {
        if (error instanceof DomainError && ["release_not_found", "version_digest_mismatch"].includes(error.code)) return null
        throw error
      }
    } else if (execution.draft) {
      const candidate = this.repository.candidate(taskId, execution.id)
      if (!candidate || candidate.draft.id !== execution.draft.id
        || candidate.draft.revision !== execution.draft.revision
        || candidate.draft.checksum !== execution.draft.checksum) return null
      content = candidate.content
    }
    if (!content || content.plan.id !== execution.plan.id || content.plan.version !== execution.plan.version
      || digestJson(content.plan) !== execution.plan.digest) return null
    return content
  }

  projectTasks(tasks: TaskSummary[]) {
    return tasks.map((task) => projectTaskSummary(task, this.store, this.repository, this.product))
  }

  isActive(taskId: string) {
    return [...this.controllers.keys()].some((key) => key.startsWith(`${taskId}:`))
      || this.queue.some((item) => item.taskId === taskId)
  }
  isAnyActive() { return this.controllers.size > 0 || this.queue.length > 0 || this.activeWork.size > 0 || this.draining }

  async close() {
    this.closing = true
    for (const controller of this.controllers.values()) controller.abort()
    await Promise.allSettled([...this.activeWork, ...(this.drainWork ? [this.drainWork] : [])])
  }

  private cancelAuthoring(taskId: string, jobId: string) {
    this.repository.job(taskId, jobId)
    this.controllers.get(`${taskId}:${jobId}`)?.abort()
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
    this.product.publishDraft(taskId, draft, (releaseId) =>
      this.store.recordOperation("task-draft:publish", command.requestId, command, releaseId))
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
    if (release.content.plan.browserHandoff === "keep_open" && browser.headless) {
      conflict("发布版本要求交付原页面，请使用可见浏览器运行。")
    }
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
    const record = this.repository.execution(taskId, command.executionId)
    this.assertDirectRunAvailable(taskId, record.id)
    if (record.sequence !== command.expectedSequence) conflict("运行状态已变化，请刷新后重试。")
    if (!["paused", "waiting_for_human"].includes(record.status)) conflict("当前运行不在可恢复状态。")
    // WHY：正式可见运行只能从已确认的同一现场恢复；不能在丢失原窗口时静默重开来源页。
    if (record.release && record.browserHandoff.status !== "active") conflict("原浏览器现场不可用，不能继续本次运行。")
    record.status = "queued"; record.reason = "恢复请求已排队；执行前会核验检查点和浏览器现场。"
    record.result = projectExecutionResult(this.repository, record)
    record.sequence++; record.updatedAt = new Date().toISOString(); this.repository.saveExecution(record)
    this.store.recordOperation("task-execution:resume", command.requestId, command, record.id)
    this.queue.push({ taskId, id: record.id, resume: true }); this.scheduleDrain()
  }

  private async verifyClosedBrowser(record: TaskExecution, prior: ExecutionCleanupAudit | undefined) {
    const ownerId = stableUuid(record.id, "managed-window")
    if (!prior || prior.ownerId !== ownerId || !this.upstream.managedWindowAction
      || this.controllers.has(`${record.taskId}:${record.id}`)
      || prior.stages.length !== RUNNER_CLEANUP_STAGES.length
      || !RUNNER_CLEANUP_STAGES.every((name) => prior.stages.some((stage) => stage.stage === name
        && (name === "browser_close" || stage.status !== "unconfirmed")))
      || !prior.stages.some((stage) => stage.stage === "child_exit" && stage.status === "confirmed")) return false
    // WHY：退出证明来自同次运行审计；这里只核验其目标已消失，绝不关闭用户浏览器或别的运行。
    try {
      const result = await this.upstream.managedWindowAction({ action: "verify_closed", ownerId, leaseId: ownerId })
      return result.report.status === "confirmed" && result.window.ownerId === ownerId
        && result.window.leaseId === ownerId && result.window.active === false
    } catch { return false }
  }

  private async cleanupExecution(taskId: string, command: Extract<TaskChainCommand, { type: "cleanup_execution" }>) {
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
    const browserClosed = pending.cleanupResume !== null && prior?.activeResources !== false
      && await this.verifyClosedBrowser(record, prior)
    const confirmed = pending.cleanupResume !== null && (prior?.activeResources === false || browserClosed)
    const code = confirmed ? null : "cleanup_owner_verification_unavailable"
    const facts = { executionId: record.id, ownerId: prior?.ownerId ?? stableUuid(record.id, "cleanup-owner"),
      attempt: pending.cleanup.attempt, status: confirmed ? "confirmed" as const : "unconfirmed" as const,
      code, activeResources: confirmed ? false : null, stages: confirmed
        ? prior?.stages.map((stage) => stage.stage === "browser_close"
          ? { ...stage, status: "confirmed" as const, code: null } : stage) ?? [] : prior?.stages ?? [] }
    const evidenceDigest = digestJson(facts)
    this.repository.saveCleanupAudit(executionCleanupAuditSchema.parse({ id: stableUuid(record.id, "cleanup-audit",
      String(pending.cleanup.attempt)), taskId, ...facts, source: "owner_verification", evidenceDigest,
      createdAt: new Date().toISOString() }))
    if (confirmed) {
      const resume = pending.cleanupResume!
      const settled = this.repository.updateExecutionCleanup(taskId, record.id, pending.sequence, { status: "confirmed",
        attempt: pending.cleanup.attempt, code: null, evidenceDigest, updatedAt: new Date().toISOString() }, {
        status: resume.status, reason: resume.reason, result: resume.result, cleanupResume: null,
        ...(browserClosed ? { browserHandoff: { ...pending.browserHandoff, status: "ended" as const,
          purpose: null, targetDigest: null, reason: null, updatedAt: new Date().toISOString() } } : {}),
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
    if (record.status === "cleanup_required") conflict("请先完成本次运行的资源清理。")
    this.controllers.get(`${taskId}:${executionId}`)?.abort()
    const pending = this.queue.findIndex((item) => item.id === executionId)
    if (pending >= 0) this.queue.splice(pending, 1)
    if (["completed", "partial", "blocked", "failed", "cancelled", "stale"].includes(record.status)) return
    record.status = "cancelled"; record.reason = "运行已取消；已有运行和产物记录保留。"; record.sequence++
    record.result = projectExecutionResult(this.repository, record,
      { classification: "cancelled", code: "execution_cancelled", repairable: false })
    record.updatedAt = new Date().toISOString(); this.repository.saveExecution(record)
  }

  private assertDirectRunAvailable(taskId: string, resumingExecutionId?: string) {
    const cleanupRequired = this.repository.executions(taskId).some((record) => record.status === "cleanup_required"
      || ["pending", "unconfirmed"].includes(record.cleanup.status))
    if (cleanupRequired) conflict("原运行的资源清理尚未确认，请先完成清理。")
    if (this.store.activeBrowserWindowLease(resumingExecutionId)) {
      conflict("另一项运行的原浏览器窗口仍在使用，请先从该运行结束窗口。")
    }
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

const genericEventTitles: Record<ChainNode["kind"], string> = {
  capability: "执行通用能力", function: "计算结果", branch: "选择路线", browser: "浏览器动作",
  observe: "观察页面", data: "处理数据", condition: "判断条件", loop: "重复处理",
  invoke: "调用链路", human: "等待人工处理", llm: "调用模型", checkpoint: "保存检查点",
  emit: "输出结果", terminal: "结束运行",
}

function eventNodeTitle(node: ChainNode): string {
  if (node.label && node.label !== node.id) return node.label
  if (node.kind === "terminal") return node.status === "completed" ? "完成"
    : node.status === "cancelled" ? "已取消" : "结束运行"
  if (node.kind === "capability" && node.capability.name === "browser.read-fields") return "读取页面数据"
  const config = node.kind === "capability" && node.config && typeof node.config === "object"
    && !Array.isArray(node.config) ? node.config : null
  const action = node.kind === "browser" ? node.operation
    : config && typeof config.actionName === "string" ? config.actionName : null
  if (action) return browserActionTitle(action) ?? "浏览器动作"
  return genericEventTitles[node.kind]
}
