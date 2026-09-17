import { assertCommandRuntime } from "./command-retirement.js"
import { DomainError } from "../errors.js"
import {
  CONTRACT_VERSION, parseTaskValue, taskChainCommandSchema, taskChainStateSchema, taskPlanExecutionIssues,
  type JsonValue, type TaskAuthoringJob, type TaskChain, type TaskChainCommand, type TaskExecution,
  type TaskPlan, type TaskRun,
} from "@browser-capture/contracts"
import type { TaskSummary } from "@browser-capture/contracts/task"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { AIModelProvider } from "../ai/model.js"
import type { BrowserService } from "../browser/service.js"
import type { ProductStore } from "../database/store.js"
import { conflict } from "../errors.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { semanticPlanSchema, TaskChainAuthoring } from "./authoring.js"
import { reusablePlanCandidate } from "./authoring-recovery.js"
import { planPrompt } from "./authoring-prompts.js"
import { TaskPlanExecutor } from "./plan-executor.js"
import { TaskContractRepository } from "./repository.js"
import { syncConfirmedRequirement } from "./requirement.js"
import { TaskRuntimeHost, type RuntimeCapabilityFactory } from "./runtime-host.js"
import { matchingPlanValidations, planValidationPassed, queuedPlanValidation, recordChainValidation, recordPlanValidation } from "./plan-validation.js"
import { queuedValidationRun, validationRequest, queuedExecution } from "./queued-runs.js"
export { reusableExploration, reusableTaskExploration, reusableTaskAnnotations } from "./exploration-reuse.js"

type QueueItem = { type: "execution"; taskId: string; id: string; resume: boolean }
  | { type: "validation"; taskId: string; runId: string; resume?: boolean }

export class TaskChainService {
  readonly repository: TaskContractRepository
  private readonly authoring: TaskChainAuthoring
  private readonly executor: TaskPlanExecutor
  private readonly host: TaskRuntimeHost
  private readonly activeWork = new Set<Promise<unknown>>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly queue: QueueItem[] = []
  private drainWork: Promise<void> | null = null
  private draining = false
  private closing = false

  constructor(private readonly store: ProductStore, browser: BrowserService, private readonly ai: AIModelProvider,
    upstream: UpstreamBrowserRuntime, capabilityFactory?: RuntimeCapabilityFactory) {
    this.repository = new TaskContractRepository(store)
    this.host = new TaskRuntimeHost(this.repository, browser, ai, capabilityFactory, upstream)
    this.authoring = new TaskChainAuthoring(this.repository, ai, upstream)
    this.executor = new TaskPlanExecutor(store, this.repository, this.host)
  }

  snapshot(taskId: string) {
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    const task = this.store.task(taskId), requirements = this.repository.requirements(taskId), plans = this.repository.plans(taskId)
    const chains = this.repository.chains(taskId), runs = this.repository.runs(taskId), executions = this.repository.executions(taskId)
    const jobs = this.repository.jobs(taskId)
    const stale = staleState(requirement, plans, chains, runs, executions)
    return taskChainStateSchema.parse({ contractVersion: CONTRACT_VERSION, taskId, taskSequence: task.sequence,
      stateSequence: stateSequence(task.sequence, requirements, plans, chains, runs, executions, jobs),
      requirement, requirements, plans, chains, runs, executions, jobs,
      staleIds: stale.ids, staleVersions: stale.versions, legacy: this.repository.legacy(taskId) })
  }

  dispatch(taskId: string, raw: unknown) {
    const command = taskChainCommandSchema.parse(raw)
    this.store.task(taskId)
    if (["author_task", "generate_chain", "generate_task_chains"].includes(command.type)) syncConfirmedRequirement(this.store, this.repository, taskId)
    assertCommandRuntime(taskId, command, this.repository, this.host)
    if (command.type === "cancel_authoring") {
      this.repository.job(taskId, command.jobId)
      this.controllers.get(`${taskId}:${command.jobId}`)?.abort()
    }
    else if (command.type === "resume_validation") this.resumeValidation(taskId, command)
    else if (command.type === "generate_plan") this.generatePlan(taskId, command)
    else if (command.type === "author_task") this.authorTask(taskId, command)
    else if (command.type === "generate_task_chains") this.generateTaskChains(taskId, command)
    else if (command.type === "generate_chain") this.generateChain(taskId, command)
    else if (command.type === "validate_chain") this.validateChain(taskId, command)
    else if (command.type === "validate_plan") this.validatePlan(taskId, command)
    else if (command.type === "authorize_plan") this.authorizePlan(taskId, command)
    else if (command.type === "resume_execution") this.resumeExecution(taskId, command)
    else this.cancelExecution(taskId, command.executionId)
    return this.snapshot(taskId)
  }

  projectTasks(tasks: TaskSummary[]) {
    return tasks.map((task) => {
      const jobs = this.repository.jobs(task.id), executions = this.repository.executions(task.id)
      const activeJob = jobs.findLast((job) => ["queued", "running", "waiting_for_human"].includes(job.status))
      const activeRun = executions.findLast((run) => ["queued", "running", "waiting_for_human", "paused"].includes(run.status))
      const status: TaskSummary["status"] = activeRun?.status === "queued" ? "queued"
        : activeRun ? "executing" : activeJob ? "planning" : executions.length ? "review"
          : this.repository.plans(task.id).length ? "plan_ready" : task.status
      return { ...task, status }
    })
  }
  isActive(taskId: string) { return [...this.controllers.keys()].some((key) => key.startsWith(`${taskId}:`))
    || this.queue.some((item) => item.taskId === taskId) }

  legacyOriginal(taskId: string, source: "plans" | "chains" | "executions", id: string) {
    return this.repository.legacyOriginal(taskId, source, id)
  }

  async close() {
    this.closing = true
    for (const controller of this.controllers.values()) controller.abort()
    await Promise.allSettled([...this.activeWork, ...(this.drainWork ? [this.drainWork] : [])])
  }

  private generatePlan(taskId: string, command: Extract<TaskChainCommand, { type: "generate_plan" }>) {
    if (this.store.operation("task-chain:plan", command.requestId, command)) return
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || requirement.version !== command.requirementVersion) conflict("只能为当前已确认需求生成计划。")
    const job = this.newJob(taskId, command.requestId, "plan", `${requirement.id}:${requirement.version}`)
    this.store.recordOperation("task-chain:plan", command.requestId, command, job.id)
    this.startAuthoring(taskId, job, (signal) => this.authoring.plan(job, requirement, signal))
  }

  private authorTask(taskId: string, command: Extract<TaskChainCommand, { type: "author_task" }>) {
    if (this.store.operation("task-chain:author-task", command.requestId, command)) return
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || requirement.version !== command.requirementVersion) conflict("只能为当前已确认需求执行预执行。")
    const input = command.input
    // WHY：恢复候选必须绑定实际规划规则；prompt 改变后不能把旧语义计划带进新的浏览器探索。
    const key = `${requirement.id}:${requirement.version}:task-authoring:workflow-use-v2:${digestJson(planPrompt(requirement, input))}:${digestJson(input)}`
    const jobs = this.repository.jobs(taskId)
    const fromAudit = reusablePlanCandidate(jobs, key, (candidate) => semanticPlanSchema.safeParse(candidate).success)
    const job = this.newJob(taskId, command.requestId, "chain", key)
    this.store.recordOperation("task-chain:author-task", command.requestId, command, job.id)
    this.startAuthoring(taskId, job, async (signal) => {
      const { chains, samples } = await this.authoring.preexecute(job, requirement, input, signal, fromAudit)
      if (chains.length === 1) {
        const sample = samples[chains[0]!.stepId]
        if (sample === undefined) throw new Error(`exploration_step_result_missing:${chains[0]!.stepId}`)
        this.enqueueValidation(taskId, chains[0]!, "sample", sample,
          stableUuid(command.requestId, "sample-validation", chains[0]!.stepId))
      } else {
        const plan = this.repository.plan(taskId, chains[0]!.plan.id, chains[0]!.plan.version, chains[0]!.plan.digest)
        this.enqueuePlanValidation(taskId, stableUuid(command.requestId, "sample-plan"), plan, chains, input, "sample")
      }
      this.scheduleDrain()
    })
  }

  private generateChain(taskId: string, command: Extract<TaskChainCommand, { type: "generate_chain" }>) {
    if (this.store.operation("task-chain:chain", command.requestId, command)) return
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    const plan = this.repository.plan(taskId, command.plan.id, command.plan.version, command.plan.digest)
    requireExecutablePlan(plan)
    if (plan.steps.length !== 1) conflict("多步骤计划必须由一次跨步骤代表探索生成全部链路。")
    if (!requirement || !planMatchesRequirement(plan, requirement)) conflict("计划已被新的需求版本替代。")
    const step = plan.steps.find((item) => item.id === command.stepId)
    if (!step) conflict("计划步骤不存在。")
    const input = parseTaskValue(step.inputContract, command.input)
    const key = `${plan.id}:${plan.version}:${command.stepId}:${digestJson(input)}`
    const job = this.newJob(taskId, command.requestId, "chain", key)
    this.store.recordOperation("task-chain:chain", command.requestId, command, job.id)
    this.startAuthoring(taskId, job, (signal) => this.authoring.chain(job, requirement, plan, command.stepId, input, signal))
  }

  private generateTaskChains(taskId: string, command: Extract<TaskChainCommand, { type: "generate_task_chains" }>) {
    if (this.store.operation("task-chain:task-authoring", command.requestId, command)) return
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    const plan = this.repository.plan(taskId, command.plan.id, command.plan.version, command.plan.digest)
    requireExecutablePlan(plan)
    if (!requirement || !planMatchesRequirement(plan, requirement)) conflict("计划已被新的需求版本替代。")
    const input = parseTaskValue(plan.inputContract, command.input)
    const key = `${plan.id}:${plan.version}:task:${digestJson(input)}`
    const job = this.newJob(taskId, command.requestId, "chain", key)
    this.store.recordOperation("task-chain:task-authoring", command.requestId, command, job.id)
    this.startAuthoring(taskId, job, async (signal) => {
      const { chains } = await this.authoring.task(job, requirement, plan, input, signal)
      this.enqueuePlanValidation(taskId, stableUuid(command.requestId, "sample-plan"), plan, chains, input, "sample")
      this.scheduleDrain()
    })
  }

  private validatePlan(taskId: string, command: Extract<TaskChainCommand, { type: "validate_plan" }>) {
    if (this.store.operation("task-chain:plan-validation", command.requestId, command)) return
    const plan = this.repository.plan(taskId, command.plan.id, command.plan.version, command.plan.digest)
    requireExecutablePlan(plan)
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || !planMatchesRequirement(plan, requirement)) conflict("验证所属需求已失效。")
    const input = parseTaskValue(plan.inputContract, command.input)
    const chains = plan.steps.map((step) => {
      const chain = this.repository.latestChain(plan, step.id)
      if (!chain) conflict(`步骤“${step.title}”尚无候选链路。`)
      return chain
    })
    if (command.mode === "verification" && !matchingPlanValidations(this.repository, plan, chains)
      .some((record) => record.mode === "sample" && record.inputDigest !== digestJson(input))) {
      conflict("换输入验证需要当前全部链路版本先通过计划样本，且输入必须不同。")
    }
    const record = this.enqueuePlanValidation(taskId, command.requestId, plan, chains, input, command.mode)
    this.store.recordOperation("task-chain:plan-validation", command.requestId, command, record.id)
    this.scheduleDrain()
  }

  private enqueuePlanValidation(taskId: string, requestId: string, plan: TaskPlan, chains: TaskChain[],
    input: JsonValue, mode: "sample" | "verification") {
    const record = queuedPlanValidation(taskId, requestId, plan, chains, input, mode)
    this.repository.saveExecution(record)
    this.queue.push({ type: "execution", taskId, id: record.id, resume: false })
    return record
  }

  private validateChain(taskId: string, command: Extract<TaskChainCommand, { type: "validate_chain" }>) {
    if (this.store.operation("task-chain:validation", command.requestId, command)) return
    const chain = this.repository.chain(taskId, command.chain.id, command.chain.version, command.chain.digest)
    const plan = this.repository.plan(taskId, chain.plan.id, chain.plan.version, chain.plan.digest)
    requireExecutablePlan(plan)
    if (plan.steps.length > 1) conflict("多步骤链路必须从计划验证入口在同一浏览器会话内验证。")
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || !planMatchesRequirement(plan, requirement)) conflict("链路所属计划已失效。")
    const input = parseTaskValue(chain.inputContract, command.input)
    if (command.mode === "verification" && !chain.validation.evidence.some((item) => item.phase === "sample" && item.passed
      && item.inputDigest !== digestJson(input))) conflict("换输入验证需要与已通过样本不同的输入。")
    const run = queuedValidationRun(taskId, command.requestId, chain, input, command.mode)
    this.repository.saveRun(run); this.store.recordOperation("task-chain:validation", command.requestId, command, run.binding.runId)
    this.queue.push({ type: "validation", taskId, runId: run.binding.runId }); this.scheduleDrain()
  }
  private resumeValidation(taskId: string, command: Extract<TaskChainCommand, { type: "resume_validation" }>) {
    if (this.store.operation("task-chain:resume-validation", command.requestId, command)) return
    const run = this.repository.run(taskId, command.runId)
    if (this.repository.executions(taskId).some((record) => record.steps.some((step) => step.runIds.includes(command.runId)))) {
      conflict("该验证属于完整计划，请恢复原计划运行。")
    }
    if (run.mode === "replay" || !["paused", "waiting_for_human"].includes(run.status) || !run.checkpoint
      || run.sequence !== command.expectedSequence) conflict("验证运行不能从此状态恢复。")
    if (this.controllers.has(`${taskId}:${run.binding.runId}`) || this.queue.some((item) => item.type === "validation" && item.runId === run.binding.runId)) conflict("验证恢复已在执行。")
    const chain = this.repository.chain(taskId, run.binding.chain.id, run.binding.chain.version, run.binding.chain.digest)
    const plan = this.repository.plan(taskId, chain.plan.id, chain.plan.version, chain.plan.digest)
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || !planMatchesRequirement(plan, requirement)) conflict("验证所属需求已失效。")
    this.store.recordOperation("task-chain:resume-validation", command.requestId, command, run.binding.runId)
    this.queue.push({ type: "validation", taskId, runId: run.binding.runId, resume: true }); this.scheduleDrain()
  }

  private authorizePlan(taskId: string, command: Extract<TaskChainCommand, { type: "authorize_plan" }>) {
    if (this.store.operation("task-chain:execution", command.requestId, command)) return
    const plan = this.repository.plan(taskId, command.plan.id, command.plan.version, command.plan.digest)
    requireExecutablePlan(plan)
    const requirement = syncConfirmedRequirement(this.store, this.repository, taskId)
    if (!requirement || !planMatchesRequirement(plan, requirement)) conflict("只能授权当前需求的计划。")
    const input = parseTaskValue(plan.inputContract, command.input)
    const missing = plan.steps.find((step) => !this.repository.latestChain(plan, step.id, true))
    if (missing) conflict(`步骤“${missing.title}”尚无已验证链路。`)
    if (plan.steps.length > 1 && !planValidationPassed(this.repository, plan,
      plan.steps.map((step) => this.repository.latestChain(plan, step.id, true)!))) conflict("完整计划尚未通过样本和换输入验证。")
    const record = queuedExecution(taskId, command.requestId, plan, requirement, input, this.repository)
    this.repository.saveExecution(record); this.store.recordOperation("task-chain:execution", command.requestId, command, record.id)
    this.queue.push({ type: "execution", taskId, id: record.id, resume: false }); this.scheduleDrain()
  }

  private resumeExecution(taskId: string, command: Extract<TaskChainCommand, { type: "resume_execution" }>) {
    if (this.store.operation("task-chain:resume", command.requestId, command)) return
    const record = this.repository.execution(taskId, command.executionId)
    if (record.sequence !== command.expectedSequence) conflict("运行状态已变化，请刷新后重试。")
    if (!["paused", "waiting_for_human"].includes(record.status)) conflict("当前运行不在可恢复状态。")
    if (this.controllers.has(`${taskId}:${record.id}`)) conflict("原计划运行仍在收尾，请稍后恢复。")
    record.status = "queued"; record.reason = "恢复请求已排队；执行前会核验检查点和浏览器现场。"
    record.sequence++; record.updatedAt = new Date().toISOString(); this.repository.saveExecution(record)
    this.store.recordOperation("task-chain:resume", command.requestId, command, record.id)
    this.queue.push({ type: "execution", taskId, id: record.id, resume: true }); this.scheduleDrain()
  }

  private cancelExecution(taskId: string, executionId: string) {
    const record = this.repository.execution(taskId, executionId)
    this.controllers.get(`${taskId}:${executionId}`)?.abort()
    const pending = this.queue.findIndex((item) => item.type === "execution" && item.id === executionId)
    if (pending >= 0) this.queue.splice(pending, 1)
    if (["completed", "partial", "blocked", "failed", "cancelled", "stale"].includes(record.status)) return
    record.status = "cancelled"; record.reason = "运行已取消；已有运行和产物记录保留。"; record.sequence++
    record.updatedAt = new Date().toISOString(); this.repository.saveExecution(record)
  }

  private newJob(taskId: string, requestId: string, type: "plan" | "chain", key: string) {
    const now = new Date().toISOString(), job: TaskAuthoringJob = { id: stableUuid(requestId, type), taskId, type, key,
      status: "queued", sequence: 0, reason: null, resultId: null, browserRunId: null,
      waitpoint: null, audit: null, createdAt: now, updatedAt: now }
    return this.repository.saveJob(job)
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
        const item = this.queue.shift()!, key = item.type === "execution" ? item.id : item.runId
        const taskId = item.taskId
        const controller = new AbortController(); this.controllers.set(`${taskId}:${key}`, controller)
        try {
          if (item.type === "execution") {
            const record = this.repository.execution(taskId, item.id)
            await this.executor.execute(record, controller.signal, item.resume)
            recordPlanValidation(this.repository, record)
          }
          else await this.runValidation(item.taskId, item.runId, controller.signal, item.resume)
        } finally { this.controllers.delete(`${taskId}:${key}`) }
      }
    } finally { this.draining = false }
  }

  private async runValidation(taskId: string, runId: string, signal: AbortSignal, resume = false) {
    const queued = this.repository.run(taskId, runId)
    const chain = this.repository.chain(taskId, queued.binding.chain.id, queued.binding.chain.version, queued.binding.chain.digest)
    let completed: TaskRun
    try {
      completed = await this.host.group({ taskId, authorizationId: queued.binding.authorizationId,
        browserRunId: resume ? stableUuid(runId, "resume", String(queued.sequence)) : runId,
        requirementVersion: this.repository.plan(taskId, chain.plan.id, chain.plan.version).requirement.version,
        purpose: queued.mode, chains: [chain], input: queued.input, signal, budget: chain.budget,
        consumed: queued.consumed, scopeConsumption: { [chain.stepId]: queued.consumed } },
      async (execute) => execute(chain, validationRequest(queued), resume && queued.checkpoint ? {
        checkpoint: queued.checkpoint, resumeRequest: { contractVersion: CONTRACT_VERSION,
          requestId: stableUuid(runId, "resume-request", String(queued.sequence)), binding: queued.binding,
          checkpointId: queued.checkpoint.id, expectedSequence: queued.checkpoint.sequence } } : undefined))
    } catch (error) {
      const failed = this.repository.run(taskId, runId)
      if (signal.aborted && failed.checkpoint) {
        failed.status = "paused"; failed.outcome = { status: "paused", cause: "interrupted", checkpointId: failed.checkpoint.id,
          reason: "验证已中断。", evidence: failed.checkpoint.artifacts }
      } else {
        failed.status = "failed"; failed.outcome = { status: "failed", code: error instanceof DomainError ? error.code : "validation_host_failed",
          reason: `验证未完成：${error instanceof Error ? error.message : "host_failed"}`, evidence: [] }
      }
      this.repository.saveRun(failed)
      return
    }
    recordChainValidation(this.repository, chain, completed)
  }

  private enqueueValidation(taskId: string, chain: TaskChain, mode: "sample" | "verification", input: JsonValue,
    requestId: string) {
    const queued = queuedValidationRun(taskId, requestId, chain, input, mode)
    this.repository.saveRun(queued)
    this.queue.push({ type: "validation", taskId, runId: queued.binding.runId })
  }
}

function requireExecutablePlan(plan: TaskPlan) {
  const issues = taskPlanExecutionIssues(plan)
  if (issues.length) conflict(`计划输入输出合同不适用于执行：${issues.join(",")}`)
}

function planMatchesRequirement(plan: TaskPlan, requirement: NonNullable<ReturnType<typeof syncConfirmedRequirement>>) {
  return plan.requirement.id === requirement.id && plan.requirement.version === requirement.version
    && plan.requirement.revision === requirement.revision && plan.requirement.digest === digestJson(requirement)
}

function staleState(requirement: ReturnType<typeof syncConfirmedRequirement>, plans: TaskPlan[], chains: TaskChain[],
  runs: TaskRun[], executions: TaskExecution[]) {
  const ids = new Set<string>()
  const versionKeys = new Set<string>()
  const versions: Array<{ kind: "plan" | "chain"; id: string; version: number }> = []
  const addVersion = (kind: "plan" | "chain", id: string, version: number) => {
    const key = `${kind}:${id}:${version}`
    if (!versionKeys.has(key)) { versionKeys.add(key); versions.push({ kind, id, version }) }
  }
  const currentPlans = new Map(plans.filter((plan) => requirement && planMatchesRequirement(plan, requirement))
    .map((plan) => [`${plan.id}:${plan.version}:${digestJson(plan)}`, plan]))
  for (const plan of plans) if (!currentPlans.has(`${plan.id}:${plan.version}:${digestJson(plan)}`)) addVersion("plan", plan.id, plan.version)
  const currentChains = chains.filter((chain) => currentPlans.has(`${chain.plan.id}:${chain.plan.version}:${chain.plan.digest}`))
  for (const chain of chains) if (!currentChains.includes(chain)) addVersion("chain", chain.id, chain.version)
  for (const run of runs) if (!currentPlans.has(`${run.binding.plan.id}:${run.binding.plan.version}:${run.binding.plan.digest}`)
    || !currentChains.some((chain) => chain.id === run.binding.chain.id && chain.version === run.binding.chain.version
      && executableChainDigest(chain) === run.binding.chain.digest)) ids.add(run.binding.runId)
  for (const execution of executions) if (!currentPlans.has(`${execution.plan.id}:${execution.plan.version}:${execution.plan.digest}`)) ids.add(execution.id)
  return { ids: [...ids], versions }
}

function stateSequence(taskSequence: number, requirements: unknown[], plans: unknown[], chains: TaskChain[], runs: TaskRun[],
  executions: TaskExecution[], jobs: TaskAuthoringJob[]) {
  return taskSequence + requirements.length + plans.length + chains.length + runs.length + executions.length + jobs.length
    + chains.reduce((sum, chain) => sum + chain.validation.evidence.length, 0)
    + runs.reduce((sum, run) => sum + run.sequence, 0)
    + executions.reduce((sum, execution) => sum + execution.sequence, 0)
    + jobs.reduce((sum, job) => sum + job.sequence, 0)
}
