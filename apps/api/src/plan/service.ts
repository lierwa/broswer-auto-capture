import { randomUUID } from "node:crypto"
import { confirmedRequirement } from "@browser-capture/contracts/interview"
import { adoptedPlanSources, emptyPlanEvidence, defaultPlanBudget, planCommandSchema, planStateSchema, type PlanRecord, type PlanCommand, type ExecutionRecord } from "@browser-capture/contracts/plan"
import { taskIdSchema, type TaskSummary } from "@browser-capture/contracts/task"
import { BrowserError, publicUrl } from "@browser-capture/browser"
import type { BrowserService } from "../browser/service.js"
import type { InterviewCoordinator } from "../interview/coordinator.js"
import type { AIModelProvider } from "../ai/model.js"
import type { ProductStore } from "../database/store.js"
import { conflict } from "../errors.js"
import { PlanRepository } from "./repository.js"
import { generatePlan } from "./model.js"
import { evidenceDigest, planDigest } from "./validation.js"
import { runPlanEvidence } from "./evidence-runner.js"
import { ExecutionQueue, pendingExecution, type PlanExecutor } from "./queue.js"
import { chains } from "../database/schema.js"

export class PlanService {
  private repository: PlanRepository
  readonly queue: ExecutionQueue
  private jobs = new Map<string, { record: PlanRecord; controller: AbortController; done: Promise<void> }>()
  private closing = false
  constructor(private store: ProductStore, private browser: BrowserService, private interview: InterviewCoordinator,
    executor: PlanExecutor | undefined, private aiModel: AIModelProvider) {
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
    const requirement = confirmedRequirement(plan.taskId, this.store.snapshot(plan.taskId))
    return !this.store.task(plan.taskId).archived && Boolean(requirement
      && requirement.draftVersion === plan.requirementVersion && requirement.revision === plan.requirementRevision
      && (!plan.evidenceDigest || plan.evidenceDigest === evidenceDigest(plan.evidence)))
  }
  snapshot(raw: string) {
    const taskId = taskIdSchema.parse(raw), task = this.store.task(taskId), state = this.store.snapshot(taskId)
    const requirement = confirmedRequirement(taskId, state)
    const records = this.repository.plans().filter((item) => item.taskId === taskId), executions = this.repository.executions().filter((item) => item.taskId === taskId)
    const blocked = task.archived ? "恢复任务后可以制定计划。" : !requirement ? "请先确认当前结构化需求。" : null
    const owner = this.browser.owner()
    return planStateSchema.parse({ taskId, taskSequence: state.sequence, sequence: records.reduce((n, item) => n + item.sequence, 0) + executions.reduce((n, item) => n + item.sequence, 0),
      records, executions, staleIds: records.filter((item) => !this.valid(item)).map((item) => item.id), eligible: !blocked && !this.isActive(taskId), blocked,
      generating: this.jobs.has(taskId),
      browserOwner: owner ? { taskId: owner.taskId, title: this.store.list().find((item) => item.id === owner.taskId)?.title ?? "浏览器任务" } : null,
      executorAvailable: this.queue.available() })
  }
  async dispatch(taskId: string, raw: unknown) {
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
      if (command.type === "generate") await this.generate(taskId, command)
      else if (command.type === "return_to_interview") this.returnToInterview(taskId, command)
      else if (command.type === "start") this.start(taskId, command)
      else this.lifecycle(taskId, command)
    }
    return this.snapshot(taskId)
  }
  private async generate(taskId: string, command: Extract<PlanCommand, { type: "generate" }>) {
    const initial = this.snapshot(taskId)
    if (!initial.eligible) conflict(initial.blocked ?? "当前任务有待处理的计划或授权运行。")
    const browser = await this.browser.snapshot(taskId)
    // WHY：读取 owner journal 后必须重验幂等和任务状态；并发请求不能各自创建计划或绕过待清理会话。
    if (this.store.operation(`plan:${taskId}`, command.requestId, command)) return
    const state = this.snapshot(taskId), requirement = confirmedRequirement(taskId, this.store.snapshot(taskId))
    if (!state.eligible || !requirement) conflict(state.blocked ?? "当前任务有待处理的计划或授权运行。")
    if (browser.busy || browser.cleanupRequired) conflict("浏览器正在使用或需要清理，请处理后再制定计划。")
    if (requirement.draftVersion !== command.requirementVersion) conflict("需求已更新，请刷新后重新生成。")
    const reusable = state.records.find((item) => reusableEvidence(item, requirement.draftVersion, requirement.revision))
    const evidence = reusable ? structuredClone(reusable.evidence) : emptyPlanEvidence()
    evidence.reusedFromPlanId = reusable?.id ?? null
    const at = new Date().toISOString()
    const record: PlanRecord = { id: randomUUID(), taskId, version: (state.records[0]?.version ?? 0) + 1, requirementVersion: requirement.draftVersion, requirementRevision: requirement.revision,
      requirement: requirement.brief, evidence, evidenceDigest: reusable?.evidenceDigest ?? null,
      stage: reusable ? "drafting" : "assessing", status: "generating", sequence: 0, createdAt: at, updatedAt: at,
      current: reusable ? "正在复用当前需求已验证的来源证据。" : "正在判断计划所需来源证据。", proposal: null, digest: null, reason: null,
      budgetCeiling: command.budgetCeiling ?? defaultPlanBudget,
      stepBudgetLimits: command.stepBudgetLimits ?? null,
      audit: null }
    if (!reusable) for (const rawUrl of requirement.brief.sourceStrategy.providedUrls) {
      const url = publicUrl(rawUrl)
      if (url) evidence.candidates.push({ id: randomUUID(), url, title: "需求提供的待核验入口", discoveredAt: at,
        provenance: "provided", discoveredOn: null, status: "candidate", reason: "等待实际页面观察" })
    }
    this.store.db.transaction(() => { this.repository.savePlan(record); this.store.recordOperation(`plan:${taskId}`, command.requestId, command, record.id) })
    const job = { record, controller: new AbortController(), done: Promise.resolve() }; this.jobs.set(taskId, job)
    job.done = this.runGeneration(job, Boolean(reusable))
      .finally(() => { if (this.jobs.get(taskId) === job) this.jobs.delete(taskId) })
    void job.done.catch(() => { this.closing = true })
  }
  private async runGeneration(job: { record: PlanRecord; controller: AbortController }, reused: boolean) {
    const { record } = job, validate = () => { if (!this.valid(record)) throw new BrowserError("permission_denied") }
    if (!reused) {
      record.stage = "source_evidence"; record.current = "正在核验计划所需的来源入口、字段与枚举依据。"; this.repository.savePlan(record)
      let work: Promise<"completed" | "partial"> | undefined
      try {
        const outcome = await this.browser.run({ taskId: record.taskId, runId: record.id, requirementVersion: record.requirementVersion,
          purpose: "plan_evidence", allowedOrigins: [...new Set(["https://www.bing.com", ...record.evidence.candidates.map((item) => new URL(item.url).origin)])],
          actions: ["navigate", "page", "follow"], maxCommands: 180, timeoutMs: 300_000 }, (browser, signal) => {
          work = runPlanEvidence({ record, brief: record.requirement, browser, signal, aiModel: this.aiModel,
            selection: this.aiModel.selection(), save: () => this.repository.savePlan(record), validate })
          return work
        }, job.controller.signal)
        validate(); record.evidence.outcome = outcome; record.evidenceDigest = evidenceDigest(record.evidence); this.repository.savePlan(record)
      } catch (error) {
        await work?.catch(() => {})
        const evidenceErrors = ["invalid_evidence_reference", "unsupported_evidence", "search_is_not_source", "unavailable_is_not_source", "invalid_gap_reference", "invalid_coverage_reference", "invalid_candidate"]
        const reason = error instanceof BrowserError ? error.code : error instanceof Error && evidenceErrors.includes(error.message) ? error.message : "invalid_model_output"
        const status = reason === "manual_required" || reason === "cleanup_required" || reason === "cancelled" ? reason : "failed"
        record.evidence.outcome = status
        if (reason === "cancelled" || reason === "permission_denied") {
          record.status = status; record.stage = "complete"; record.reason = reason
          record.current = reason === "cancelled" ? "计划生成已停止，已取得的证据保留。" : "需求已更新，本次计划停止在原版本。"
          this.repository.savePlan(record); return
        }
        const needsManual = reason === "manual_required" || reason === "cleanup_required"
        record.reason = reason
        record.current = needsManual ? "来源访问或浏览器会话需要先人工处理；计划仍会保留可审阅的步骤。"
          : "来源核验未完成；正在把未验证范围纳入计划步骤。"
        record.evidence.gaps.push({ description: record.current, observationIds: record.evidence.observations.map((item) => item.id), requiresUser: false })
        record.evidenceDigest = evidenceDigest(record.evidence)
        this.repository.savePlan(record)
      }
    }
    if (!draftable(record) && !record.evidence.gaps.length) {
      const hasSource = adoptedPlanSources(record.evidence).length > 0
      record.evidence.gaps.push({ description: hasSource ? "来源的覆盖或枚举方式尚未核验，将在对应计划步骤执行时验证。"
        : "尚无已核验的可授权来源；计划保留待核验步骤并阻止启动，请直接重新制定计划继续核验来源。",
        observationIds: record.evidence.observations.map((item) => item.id), requiresUser: false })
      record.evidenceDigest = evidenceDigest(record.evidence)
    }
    const hasSource = adoptedPlanSources(record.evidence).length > 0
    record.stage = "drafting"; record.current = draftable(record) ? "正在依据已验证来源证据生成计划草稿。"
      : hasSource ? "正在依据已确认需求编排计划，并明确标记待执行核验项。"
      : "正在依据已确认需求编排可查看计划；未核验来源的步骤将阻止启动。"
    this.repository.savePlan(record)
    await generatePlan(record, AbortSignal.any([job.controller.signal, AbortSignal.timeout(190_000)]),
      () => this.repository.savePlan(record), validate, this.aiModel)
  }
  private returnToInterview(taskId: string, command: Extract<PlanCommand, { type: "return_to_interview" }>) {
    const record = this.repository.plans().find((item) => item.id === command.planId && item.taskId === taskId)
    if (!record || record.status === "generating" || !record.evidence.gaps.length || this.jobs.has(taskId)) conflict("请等计划结束并读取证据缺口后再回到需求对话。")
    const text = [`请结合计划 v${record.version}（需求 v${record.requirementVersion}）的来源证据讨论以下缺口，保留原目标，不自动缩减范围：`,
      ...record.evidence.gaps.map((gap) => `- ${gap.description}`),
      ...record.evidence.observations.map((item) => `来源 ${item.id}：${item.url}，观察时间 ${item.at}`),
    ].join("\n").slice(0, 15000)
    this.store.db.transaction(() => {
      this.interview.dispatch(taskId, { type: "message", text, requestId: command.requestId, expectedRevision: command.expectedRevision })
      this.store.recordOperation(`plan:${taskId}`, command.requestId, command, record.id)
    })
  }
  private start(taskId: string, command: Extract<PlanCommand, { type: "start" }>) {
    this.store.db.transaction(() => {
      const state = this.snapshot(taskId), plan = state.records.find((item) => item.id === command.planId)
      const evidenceValid = Boolean(plan?.evidenceDigest && plan.evidenceDigest === evidenceDigest(plan.evidence))
      const blocked = plan?.proposal?.gaps.some((gap) => gap.disposition === "blocking") || plan?.evidence.gaps.some((gap) => gap.requiresUser)
      const unavailable = plan && ["manual_required", "cleanup_required"].includes(plan.evidence.outcome)
      if (!plan || plan !== state.records[0] || state.generating || plan.status !== "ready" || !plan.proposal || !plan.digest || !evidenceValid || blocked || unavailable || !this.valid(plan)) conflict("请复核最新有效计划后再启动。")
      if (plan.digest !== command.planDigest || planDigest(plan) !== command.planDigest) conflict("计划内容已变更，请重新审阅。")
      const previous = state.executions.find((item) => item.planId === plan.id)
      if (previous) { this.store.recordOperation(`plan:${taskId}`, command.requestId, command, previous.id); return }
      if (state.executions.some(pendingExecution)) conflict("当前任务已有授权运行，请先处理。")
      const budget = plan.proposal.steps.reduce((sum, step) => ({ maxCommands: sum.maxCommands + step.budget.maxCommands, timeoutMs: sum.timeoutMs + step.budget.timeoutMs, maxModelCalls: sum.maxModelCalls + step.budget.maxModelCalls }), { maxCommands: 0, timeoutMs: 0, maxModelCalls: 0 })
      const at = new Date().toISOString(), record: ExecutionRecord = { id: randomUUID(), taskId, planId: plan.id, planVersion: plan.version, planDigest: plan.digest,
        requirementVersion: plan.requirementVersion, requirementRevision: plan.requirementRevision,
        authorizedAt: at, requestId: command.requestId, budget: { ...budget, maxLlmCalls: plan.proposal.steps.reduce((sum, step) => sum + (step.budget.maxLlmCalls ?? 0), 0) }, status: "queued", sequence: 0, updatedAt: at,
        reason: this.queue.available() ? "已授权，等待单浏览器执行位置。" : "已授权并持久排队，等待探索执行器接入；尚未开始抓取。",
        mode: "initial", parentExecutionId: null, attempt: 0, resumeRequested: false, repairStepId: null, capture: null, browserRunId: null, resumeAuthorizations: [] }
      this.repository.saveExecution(record); this.store.recordOperation(`plan:${taskId}`, command.requestId, command, record.id)
    })
  }
  private lifecycle(taskId: string, command: Extract<PlanCommand, { type: "resume" | "replay" | "repair" }>) {
    this.store.db.transaction(() => {
      const state = this.snapshot(taskId), previous = state.executions.find((item) => item.id === command.executionId)
      const plan = state.records.find((item) => item.id === previous?.planId)
      if (!previous || !plan || !this.valid(plan) || !plan.proposal || !plan.digest) conflict("请先复核当前需求与计划绑定。")
      if (state.generating || state.executions.some((item) => item.id !== previous.id && pendingExecution(item))) conflict("当前任务已有待处理运行。")
      if (["running", "queued"].includes(previous.status)) conflict("请等待或停止当前运行。")
      if (command.type === "resume") {
        if (previous.sequence !== command.sequence || !previous.capture || previous.status === "completed") conflict("请读取最新可恢复运行。")
        const unfinished = previous.capture.steps.find((item) => item.status !== "completed")
        const step = plan.proposal.steps.find((item) => item.id === unfinished?.stepId)
        if (!unfinished || !step || unfinished.commands >= step.budget.maxCommands || unfinished.elapsedMs >= step.budget.timeoutMs) conflict("原步骤预算已用尽；请制定新计划并独立授权。")
        if (!unfinished.chainId) conflict("当前步骤尚无已验证链路，请发起修复或复核新计划。")
        previous.resumeRequested = true; previous.status = "queued"; previous.reason = "恢复已排队，将核验原运行的浏览器状态和检查点。"
        previous.resumeAuthorizations.push({ requestId: command.requestId, authorizedAt: new Date().toISOString(), fromSequence: command.sequence })
        this.repository.saveExecution(previous)
        this.store.recordOperation(`plan:${taskId}`, command.requestId, command, previous.id); return
      }
      if (command.planDigest !== plan.digest) conflict("计划已更新，请重新审阅。")
      if (command.type === "repair" && !plan.proposal.steps.some((step) => step.id === command.stepId)) conflict("修复步骤不属于计划。")
      const versions = this.store.db.select().from(chains).all().map((row) => row.body).filter((item) => item.taskId === taskId && item.planId === plan.id && item.planDigest === plan.digest && item.status === "verified")
      const bound = plan.proposal.steps.map((step) => {
        const previousId = previous.capture?.steps.find((item) => item.stepId === step.id)?.chainId
        const chain = previousId ? versions.find((item) => item.id === previousId) : versions.filter((item) => item.stepId === step.id).at(-1)
        const repairing = command.type === "repair" && command.stepId === step.id
        const followsRepair = command.type === "repair" && plan.proposal!.steps.findIndex((item) => item.id === step.id) > plan.proposal!.steps.findIndex((item) => item.id === command.stepId)
        if (!chain && !repairing && !followsRepair) conflict("前置步骤需先具备已验证版本；请复核计划或修复缺失步骤。")
        return { stepId: step.id, chainId: repairing ? null : chain?.id ?? null, status: "pending" as const, inputs: [], inputIndex: 0, rows: [], checkpoint: null,
          commands: 0, elapsedMs: 0, activeSince: null, explorationCalls: 0, llmCalls: 0, termination: null, events: [], audits: [] }
      })
      if (pendingExecution(previous)) this.queue.cancel(previous)
      const at = new Date().toISOString(), record: ExecutionRecord = { ...structuredClone(previous), id: randomUUID(), requestId: command.requestId,
        mode: command.type, parentExecutionId: previous.id, repairStepId: command.type === "repair" ? command.stepId : null,
        authorizedAt: at, updatedAt: at, sequence: 0, attempt: 0, browserRunId: null, resumeRequested: false, resumeAuthorizations: [], capture: { steps: bound, coverage: "pending", gaps: [], resumeChecks: [] },
        status: "queued", reason: command.type === "repair" ? "已授权修复指定步骤并验证新版本，原运行历史保留。" : "已授权独立复跑，等待浏览器位置。" }
      this.repository.saveExecution(record); this.store.recordOperation(`plan:${taskId}`, command.requestId, command, record.id)
    })
  }
  async close() { this.closing = true; for (const job of this.jobs.values()) job.controller.abort(); await Promise.allSettled([...this.jobs.values()].map((job) => job.done)); await this.queue.close() }
}

function draftable(record: PlanRecord) {
  const adopted = adoptedPlanSources(record.evidence)
  const objectives = [...record.requirement.discoveryTasks.map((item) => item.objective), ...record.requirement.deliverables.map((item) => item.entity)]
  return ["completed", "partial"].includes(record.evidence.outcome) && adopted.some((item) => item.assessment?.enumeration)
    && objectives.every((objective) => record.evidence.coverage.some((item) => item.objective === objective))
    && !record.evidence.gaps.some((item) => item.requiresUser)
}

function reusableEvidence(record: PlanRecord, requirementVersion: number, requirementRevision: number) {
  return record.status === "ready" && record.requirementVersion === requirementVersion && record.requirementRevision === requirementRevision
    && Boolean(record.evidenceDigest && record.evidenceDigest === evidenceDigest(record.evidence)) && draftable(record)
}
