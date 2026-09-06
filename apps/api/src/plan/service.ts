import { randomUUID } from "node:crypto"
import { confirmedRequirement } from "@browser-capture/contracts/interview"
import { planCommandSchema, planStateSchema, type PlanRecord, type PlanCommand, type ExecutionRecord } from "@browser-capture/contracts/plan"
import { taskIdSchema, type TaskSummary } from "@browser-capture/contracts/task"
import type { ResearchService } from "../research/service.js"
import type { BrowserService } from "../browser/service.js"
import type { ModelSessionFactory } from "../interview/modelSession.js"
import { digest, type ProductStore } from "../database/store.js"
import { conflict } from "../errors.js"
import { PlanRepository } from "./repository.js"
import { generatePlan } from "./model.js"
import { planDigest } from "./validation.js"
import { ExecutionQueue, pendingExecution, type PlanExecutor } from "./queue.js"

export class PlanService {
  private repository: PlanRepository
  readonly queue: ExecutionQueue
  private jobs = new Map<string, { record: PlanRecord; controller: AbortController; done: Promise<void> }>()
  private closing = false
  constructor(private store: ProductStore, private research: ResearchService, private browser: BrowserService, private factory: ModelSessionFactory, executor?: PlanExecutor) {
    this.repository = new PlanRepository(store)
    this.queue = new ExecutionQueue(this.repository, browser, (plan) => this.valid(plan), executor)
  }
  isActive(taskId: string) { return this.jobs.has(taskId) || this.repository.executions().some((item) => item.taskId === taskId && pendingExecution(item)) }
  projectTasks(tasks: TaskSummary[]): TaskSummary[] {
    return tasks.map((task) => {
      if (task.status === "running") return task
      const plan = this.repository.plans().find((item) => item.taskId === task.id)
      const run = this.repository.executions().filter((item) => item.taskId === task.id).at(-1)
      const status = this.browser.owner()?.taskId === task.id ? "executing" : this.jobs.has(task.id) ? "planning"
        : run?.status === "queued" ? "queued" : run && pendingExecution(run) ? "review"
        : plan && (!this.valid(plan) || plan.status === "blocked") ? "review" : plan?.status === "ready" && run?.planId !== plan.id ? "plan_ready" : task.status
      return { ...task, status }
    })
  }
  private valid(plan: PlanRecord) {
    const requirement = confirmedRequirement(plan.taskId, this.store.snapshot(plan.taskId)), source = this.research.snapshot(plan.taskId).records[0]
    return !this.store.task(plan.taskId).archived && Boolean(requirement && source && source.status !== "running"
      && requirement.draftVersion === plan.requirementVersion && requirement.revision === plan.requirementRevision
      && source.id === plan.sourceId && source.version === plan.sourceVersion && digest(source) === plan.sourceDigest)
  }
  snapshot(raw: string) {
    const taskId = taskIdSchema.parse(raw), task = this.store.task(taskId), state = this.store.snapshot(taskId)
    const requirement = confirmedRequirement(taskId, state), source = this.research.snapshot(taskId).records[0]
    const records = this.repository.plans().filter((item) => item.taskId === taskId), executions = this.repository.executions().filter((item) => item.taskId === taskId)
    const blocked = task.archived ? "恢复任务后可以制定计划。" : !requirement ? "请先确认当前结构化需求。"
      : !source || source.requirementVersion !== requirement.draftVersion || source.requirementRevision !== requirement.revision ? "请先完成当前需求的真实来源调研。"
      : !["completed", "partial"].includes(source.status) ? "来源调研尚未形成可规划的终态，请查看来源状态。" : null
    const owner = this.browser.owner()
    return planStateSchema.parse({ taskId, taskSequence: state.sequence, sequence: records.reduce((n, item) => n + item.sequence, 0) + executions.reduce((n, item) => n + item.sequence, 0),
      records, executions, staleIds: records.filter((item) => !this.valid(item)).map((item) => item.id), eligible: !blocked && !this.isActive(taskId), blocked,
      source: source ? { id: source.id, version: source.version, requirementVersion: source.requirementVersion } : null, generating: this.jobs.has(taskId),
      browserOwner: owner ? { taskId: owner.taskId, title: this.store.list().find((item) => item.id === owner.taskId)?.title ?? "浏览器任务" } : null,
      executorAvailable: this.queue.available() })
  }
  dispatch(taskId: string, raw: unknown) {
    const command = planCommandSchema.parse(raw), state = this.snapshot(taskId)
    if (this.closing) conflict("服务正在关闭，请稍后恢复。")
    if (command.type === "cancel_generation") {
      if (!state.records.some((item) => item.id === command.planId)) conflict("计划不属于当前任务。")
      const job = this.jobs.get(taskId); if (job?.record.id === command.planId) job.controller.abort()
    } else if (command.type === "cancel_execution") {
      const record = state.executions.find((item) => item.id === command.executionId)
      if (!record) conflict("运行不属于当前任务。")
      this.queue.cancel(record)
    } else {
      if (this.store.operation(`plan:${taskId}`, command.requestId, command)) return this.snapshot(taskId)
      if (command.type === "generate") this.generate(taskId, command)
      else this.start(taskId, command)
    }
    return this.snapshot(taskId)
  }
  private generate(taskId: string, command: Extract<PlanCommand, { type: "generate" }>) {
    const state = this.snapshot(taskId), source = this.research.snapshot(taskId).records[0], requirement = confirmedRequirement(taskId, this.store.snapshot(taskId))
    if (!state.eligible || !source || !requirement) conflict(state.blocked ?? "当前任务有待处理的计划或授权运行。")
    if (source.id !== command.sourceId || source.version !== command.sourceVersion || requirement.draftVersion !== command.requirementVersion) conflict("需求或来源已更新，请刷新后重新生成。")
    const at = new Date().toISOString()
    const record: PlanRecord = { id: randomUUID(), taskId, version: (state.records[0]?.version ?? 0) + 1, requirementVersion: requirement.draftVersion, requirementRevision: requirement.revision,
      sourceId: source.id, sourceVersion: source.version, sourceDigest: digest(source), requirement: requirement.brief,
      sources: source.observations.filter((item) => !item.queryId && item.assessment?.adopted && item.assessment.access === "normal"), sourceGaps: source.gaps.map((item) => item.description),
      status: "generating", sequence: 0, createdAt: at, updatedAt: at, proposal: null, digest: null, reason: null,
      audit: { purpose: "plan_creation", model: "gpt-5.6-terra", effort: "medium", invocations: null, status: "intended", reportedModel: null, reportedEffort: null } }
    this.store.db.transaction(() => { this.repository.savePlan(record); this.store.recordOperation(`plan:${taskId}`, command.requestId, command, record.id) })
    const job = { record, controller: new AbortController(), done: Promise.resolve() }; this.jobs.set(taskId, job)
    job.done = generatePlan(record, source, this.factory, AbortSignal.any([job.controller.signal, AbortSignal.timeout(190000)]), () => this.repository.savePlan(record),
      () => { if (!this.valid(record)) conflict("计划绑定已失效。") }).finally(() => { if (this.jobs.get(taskId) === job) this.jobs.delete(taskId) })
    void job.done.catch(() => { this.closing = true })
  }
  private start(taskId: string, command: Extract<PlanCommand, { type: "start" }>) {
    this.store.db.transaction(() => {
      const state = this.snapshot(taskId), plan = state.records.find((item) => item.id === command.planId)
      if (!plan || plan !== state.records[0] || state.generating || plan.status !== "ready" || !plan.proposal || !plan.digest || !this.valid(plan)) conflict("请复核最新有效计划后再启动。")
      if (plan.digest !== command.planDigest || planDigest(plan) !== command.planDigest) conflict("计划内容已变更，请重新审阅。")
      const previous = state.executions.find((item) => item.planId === plan.id)
      if (previous) { this.store.recordOperation(`plan:${taskId}`, command.requestId, command, previous.id); return }
      if (state.executions.some(pendingExecution)) conflict("当前任务已有授权运行，请先处理。")
      const budget = plan.proposal.steps.reduce((sum, step) => ({ maxCommands: sum.maxCommands + step.budget.maxCommands, timeoutMs: sum.timeoutMs + step.budget.timeoutMs, maxModelCalls: sum.maxModelCalls + step.budget.maxModelCalls }), { maxCommands: 0, timeoutMs: 0, maxModelCalls: 0 })
      const at = new Date().toISOString(), record: ExecutionRecord = { id: randomUUID(), taskId, planId: plan.id, planVersion: plan.version, planDigest: plan.digest,
        requirementVersion: plan.requirementVersion, requirementRevision: plan.requirementRevision, sourceId: plan.sourceId, sourceVersion: plan.sourceVersion,
        authorizedAt: at, requestId: command.requestId, budget: { ...budget, maxLlmCalls: plan.proposal.steps.reduce((sum, step) => sum + (step.budget.maxLlmCalls ?? 0), 0) }, status: "queued", sequence: 0, updatedAt: at,
        reason: this.queue.available() ? "已授权，等待单浏览器执行位置。" : "已授权并持久排队，等待探索执行器接入；尚未开始抓取。" }
      this.repository.saveExecution(record); this.store.recordOperation(`plan:${taskId}`, command.requestId, command, record.id)
    })
  }
  async close() { this.closing = true; for (const job of this.jobs.values()) job.controller.abort(); await Promise.allSettled([...this.jobs.values()].map((job) => job.done)); await this.queue.close() }
}
