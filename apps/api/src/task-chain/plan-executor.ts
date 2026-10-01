import { executionBudget } from "./execution-budget.js"
import {
  CONTRACT_VERSION, DEFAULT_TASK_EXECUTION_BROWSER, parseTaskValue, taskPlanExecutionIssues, type JsonValue, type TaskChain, type TaskExecution,
  type TaskExecutionStep, type TaskOutput, type TaskPlan, type TaskPlanStep, type TaskRun, type TaskRunRequest,
} from "@browser-capture/contracts"
import { readPath, resolveBinding, digestJson, executableChainDigest, stableUuid,
  RuntimeBudgetExceededError, type BindingContext, type RuntimeControl, type RuntimeNodePacing } from "@browser-capture/runtime"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import type { TaskRuntimeHost } from "./runtime-host.js"
import { projectExecutionResult, type FailureHint } from "./execution-result.js"
import { executionCleanupAuditSchema, RuntimeCleanupRequiredError, type RunnerCleanupReport } from "../upstream-browser/cleanup.js"
import { UpstreamProtocolError } from "../upstream-browser/service.js"

export class TaskPlanExecutor {
  constructor(private readonly store: ProductStore, private readonly repository: TaskContractRepository,
    private readonly host: TaskRuntimeHost) {}

  async execute(record: TaskExecution, signal: AbortSignal, resume = false, pacing?: RuntimeNodePacing) {
    const cleanupObservation: { value: { ownerId: string; report: RunnerCleanupReport } | null } = { value: null }
    const resumingWindow = record.browserHandoff.status === "active"
    try {
      const plan = this.repository.plan(record.taskId, record.plan.id, record.plan.version, record.plan.digest)
      if (!this.isCurrent(record, plan)) return this.finish(record, "stale", "需求或计划版本已变化，原授权不能继续执行。",
        { classification: "version", code: "execution_version_stale", repairable: false })
      if (taskPlanExecutionIssues(plan).length) return this.finish(record, "blocked", "计划输入输出合同不再满足执行约束，需要生成新计划。",
        { classification: "version", code: "plan_contract_invalid", repairable: false })
      const chains = this.boundChains(record, plan)
      // WHY：无头同样占用本次专属进程；沿用固定 owner 与清理审计，不因没有可见现场丢失资源身份。
      const managedWindow = Boolean(record.release)
      record.status = "running"; record.sequence++; record.reason = "正在执行本次计划固定的链路版本。"
      record.cleanup = { status: "pending", attempt: record.cleanup.attempt + 1, code: null,
        evidenceDigest: null, updatedAt: new Date().toISOString() }
      record.cleanupResume = null
      record.result = projectExecutionResult(this.repository, record); this.save(record)
      // WHY：人工处理后重新接管的是同一 execution 的同一现场；sequence 只标识记录变更，不是浏览器所有权。
      const browserRunId = managedWindow ? stableUuid(record.id, "managed-window")
        : stableUuid(record.id, "browser", String(record.sequence))
      if (managedWindow) {
        // WHY：启动前持久化本 execution 的确定 owner；中断后只能用同一 owner 核验现场。
        record.browserHandoff = { ...record.browserHandoff, status: "pending",
          leaseId: browserRunId, ownerId: browserRunId, updatedAt: new Date().toISOString() }
        this.bump(record)
      }
      await this.host.group({ taskId: record.taskId, authorizationId: record.authorizationId, browserRunId,
        requirementVersion: record.requirement.version, purpose: record.mode ?? "replay", chains, input: record.input, signal,
        ...(record.browser || !record.mode || record.mode === "replay"
          ? { browser: record.browser ?? DEFAULT_TASK_EXECUTION_BROWSER } : {}),
        ...(managedWindow ? { managedWindow: { ownerId: browserRunId, resume: resumingWindow },
          handoffPurpose: () => record.status === "waiting_for_human" || record.status === "paused" ? "human_wait" as const
            : record.status === "completed" && plan.browserHandoff === "keep_open" ? "delivery" as const : null,
          onHandoff: (purpose, lease) => {
            record.browserHandoff = { status: "active", purpose, leaseId: lease.leaseId, ownerId: lease.ownerId,
              targetDigest: lease.targetDigest, reason: null, updatedAt: new Date().toISOString() }
            this.bump(record)
          }, onHandoffFailure: (purpose, _reason) => {
            // WHY：回执丢失后私有租约可能仍有效；只保留确定 owner，后续必须独立 inspect 核验。
            record.browserHandoff = { status: "unavailable", purpose, leaseId: browserRunId, ownerId: browserRunId,
              targetDigest: null, reason: "browser_handoff_failed", updatedAt: new Date().toISOString() }
            this.bump(record)
          } } : {}),
        ...executionBudget(plan, chains), consumed: record.consumed, ...(pacing ? { pacing } : {}),
        scopeConsumption: Object.fromEntries(record.steps.map((step) => [step.stepId, step.consumed])),
        onConsumption: (scopeId, snapshot) => {
          const progress = record.steps.find((step) => step.stepId === scopeId)
          if (!progress) throw new Error("task_budget_scope_unknown")
          record.consumed = snapshot.total; progress.consumed = snapshot.scope
          record.sequence++; record.updatedAt = new Date().toISOString(); this.save(record)
        }, onCleanup: (report) => { cleanupObservation.value = { ownerId: browserRunId, report } } },
      async (execute) => this.runSteps(record, plan, chains, execute, signal, resume))
      const observedCleanup = cleanupObservation.value
      if (observedCleanup) this.saveCleanupAudit(record, observedCleanup.ownerId, observedCleanup.report)
      this.confirmCleanup(record, observedCleanup?.report.evidenceDigest
        ?? this.saveOwnerVerification(record, browserRunId, true, null))
      this.settleHandoff(record, plan.browserHandoff === "keep_open", resumingWindow)
    } catch (error) {
      if (error instanceof RuntimeCleanupRequiredError) {
        this.saveCleanupAudit(record, error.ownerId, error.report)
        if (error.primary.status === "failed") this.finishPrimaryFailure(record, error.primary.error, signal)
        this.requireCleanup(record, error.report.code ?? "runtime_cleanup_unconfirmed", error.report.evidenceDigest)
      } else {
        this.finishPrimaryFailure(record, error, signal)
        if (record.cleanup.status === "pending") {
          const observedCleanup = cleanupObservation.value
          if (observedCleanup?.report.status === "confirmed") {
            this.saveCleanupAudit(record, observedCleanup.ownerId, observedCleanup.report)
            this.confirmCleanup(record, observedCleanup.report.evidenceDigest)
            this.settleReleasedStartup(record, observedCleanup, resumingWindow)
          } else {
            const evidence = this.saveOwnerVerification(record, stableUuid(record.id, "cleanup-owner"), false,
              "runtime_cleanup_report_missing")
            this.requireCleanup(record, "runtime_cleanup_report_missing", evidence)
          }
        }
      }
    }
    if (record.browserHandoff.status === "pending" && record.status !== "queued" && record.status !== "running") {
      record.browserHandoff = { status: "unavailable", purpose: null,
        leaseId: record.browserHandoff.leaseId, ownerId: record.browserHandoff.ownerId,
        targetDigest: null, reason: "browser_handoff_not_confirmed", updatedAt: new Date().toISOString() }
      this.bump(record)
    }
    return record
  }

  private settleHandoff(record: TaskExecution, keepOpen: boolean, resumingWindow: boolean) {
    if (record.browserHandoff.status !== "pending") return
    const unavailable = record.status === "waiting_for_human" || record.status === "paused"
      || record.status === "completed" && keepOpen
    record.browserHandoff = { status: unavailable ? "unavailable" : resumingWindow ? "ended" : "not_requested",
      purpose: null, leaseId: unavailable ? record.browserHandoff.leaseId : null,
      ownerId: unavailable ? record.browserHandoff.ownerId : null, targetDigest: null,
      reason: unavailable ? "browser_handoff_missing" : null, updatedAt: new Date().toISOString() }
    this.bump(record)
  }

  private settleReleasedStartup(record: TaskExecution,
    observed: { ownerId: string; report: RunnerCleanupReport }, resumingWindow: boolean) {
    const handoff = record.browserHandoff, browserClose = observed.report.stages.find(stage => stage.stage === "browser_close")
    // WHY：启动 owner 不是已交付租约；只用同 operation 的真实释放证明。恢复旧交付页或交付回执不明仍保留占用。
    if (resumingWindow || handoff.status !== "pending" || handoff.purpose !== null || handoff.targetDigest !== null
      || handoff.ownerId !== observed.ownerId || handoff.leaseId !== observed.ownerId
      || observed.report.status !== "confirmed" || observed.report.activeResources !== false
      || !browserClose || !["confirmed", "not_required"].includes(browserClose.status)) return
    record.browserHandoff = { status: "not_requested", purpose: null, leaseId: null, ownerId: null,
      targetDigest: null, reason: null, updatedAt: new Date().toISOString() }
    this.bump(record)
  }

  private finishPrimaryFailure(record: TaskExecution, error: unknown, signal: AbortSignal) {
    if (signal.aborted) {
      const current = this.repository.execution(record.taskId, record.id)
      // WHY：取消命令已经持久化 cancelled 时，异步执行栈晚到的 abort 不能把它降级覆盖成 paused。
      if (current.status === "cancelled") { Object.assign(record, current); return current }
      return this.finish(record, "paused", "运行已中断，已完成步骤和检查点保留。")
    }
    if (error instanceof Error && error.message === "authorized_chain_unavailable") {
      return this.finish(record, "blocked", "授权时固定的链路版本不再可用；原授权不会切换到其他版本。",
        { classification: "version", code: "authorized_chain_unavailable", repairable: false })
    }
    if (error instanceof RuntimeBudgetExceededError || error instanceof Error && error.message === "plan_item_limit_exceeded") {
      return this.finish(record, "blocked", error.message,
        { classification: "budget", code: "execution_budget_exceeded", repairable: false })
    }
    // WHY：没有任何链路调用的上游启动失败不授权模型修图；类型与调用事实分类，不猜原生授权或网络根因。
    if (error instanceof UpstreamProtocolError && record.steps.every(step => step.runIds.length === 0)) {
      return this.finish(record, "failed", `运行失败：${error.message}`,
        { classification: "external", code: error.code, repairable: false })
    }
    return this.finish(record, "failed", `运行失败：${error instanceof Error ? error.message : "execution_failed"}`,
      { classification: "deterministic", code: "execution_failed", repairable: true })
  }

  private confirmCleanup(record: TaskExecution, evidenceDigest: string) {
    record.cleanup = { status: "confirmed", attempt: record.cleanup.attempt, code: null, evidenceDigest,
      updatedAt: new Date().toISOString() }
    record.cleanupResume = null
    this.bump(record)
  }

  private requireCleanup(record: TaskExecution, code: string, evidenceDigest: string) {
    if (record.status !== "cleanup_required") {
      record.cleanupResume = { status: record.status, reason: record.reason, result: record.result ?? null }
    }
    record.cleanup = { status: "unconfirmed", attempt: record.cleanup.attempt, code, evidenceDigest,
      updatedAt: new Date().toISOString() }
    record.status = "cleanup_required"
    record.reason = "本次运行的业务结论已保留，但运行资源清理尚未确认。"
    if (record.result) record.result = { ...record.result, status: "cleanup_required",
      summary: record.reason, nextAction: "cleanup" }
    this.bump(record)
  }

  private saveCleanupAudit(record: TaskExecution, ownerId: string, report: RunnerCleanupReport) {
    this.repository.saveCleanupAudit(executionCleanupAuditSchema.parse({
      id: stableUuid(record.id, "cleanup-audit", String(record.cleanup.attempt)), taskId: record.taskId,
      executionId: record.id, ownerId, attempt: record.cleanup.attempt, source: "runner",
      status: report.status, code: report.code, activeResources: report.activeResources,
      ...(report.retainedConnection ? { retainedConnection: report.retainedConnection } : {}),
      evidenceDigest: report.evidenceDigest, stages: report.stages, createdAt: new Date().toISOString(),
    }))
  }

  private saveOwnerVerification(record: TaskExecution, ownerId: string, confirmed: boolean, code: string | null) {
    const facts = { executionId: record.id, ownerId, attempt: record.cleanup.attempt,
      status: confirmed ? "confirmed" as const : "unconfirmed" as const, code,
      activeResources: confirmed ? false : null, stages: [] }
    const evidenceDigest = digestJson(facts)
    this.repository.saveCleanupAudit(executionCleanupAuditSchema.parse({ id: stableUuid(record.id, "cleanup-audit",
      String(record.cleanup.attempt)), taskId: record.taskId, ...facts, source: "owner_verification",
      evidenceDigest, createdAt: new Date().toISOString() }))
    return evidenceDigest
  }

  private boundChains(record: TaskExecution, plan: TaskPlan) {
    return plan.steps.map((step) => {
      const progress = record.steps.find((item) => item.stepId === step.id)
      if (!progress) throw new Error("authorized_chain_unavailable")
      try {
        const chain = this.repository.chain(record.taskId, progress.chain.id, progress.chain.version, progress.chain.digest)
        if ((record.mode ?? "replay") === "replay" && !record.release && chain.validation.status !== "verified"
          || chain.stepId !== step.id || chain.plan.id !== plan.id
          || chain.plan.version !== plan.version || chain.plan.digest !== record.plan.digest) throw new Error()
        return chain
      } catch { throw new Error("authorized_chain_unavailable") }
    })
  }

  private async runSteps(record: TaskExecution, plan: TaskPlan, chains: TaskChain[],
    execute: (chain: TaskChain, request: TaskRunRequest, control?: RuntimeControl) => Promise<TaskRun>,
    signal: AbortSignal, resume: boolean) {
    const context: BindingContext = { input: record.input, nodeOutputs: {}, variables: {} }
    for (const step of plan.steps) {
      const progress = record.steps.find((item) => item.stepId === step.id)!
      if (progress.status === "completed" || progress.status === "partial") {
        if (progress.output !== null) context.nodeOutputs[step.id] = progress.output
        continue
      }
      if (["paused", "waiting_for_human"].includes(progress.status) && !resume) return
      record.currentStepId = step.id; progress.status = "running"; progress.reason = null; this.bump(record)
      const outcome = await this.runStep(record, step, chains[plan.steps.indexOf(step)]!, progress,
        context, execute, signal, resume)
      if (!outcome.continue) return
      progress.output = outcome.output; progress.status = outcome.partial ? "partial" : "completed"
      context.nodeOutputs[step.id] = outcome.output
      this.bump(record)
    }
    const value = parseTaskValue(plan.outputContract, resolveBinding(plan.output, context))
    record.output = { kind: "value", contract: { id: plan.outputContract.id, version: plan.outputContract.version }, value }
    this.finish(record, record.steps.some((step) => step.status === "partial") ? "partial" : "completed",
      record.steps.some((step) => step.status === "partial") ? "运行保留了部分输出和明确缺口。" : "所有计划步骤均已沿合法控制流完成。")
  }

  private async runStep(record: TaskExecution, step: TaskPlanStep, chain: TaskChain, progress: TaskExecutionStep,
    context: BindingContext, execute: (chain: TaskChain, request: TaskRunRequest, control?: RuntimeControl) => Promise<TaskRun>,
    signal: AbortSignal, resume: boolean) {
    const items = invocationInputs(step, context), outputs: JsonValue[] = []
    let partial = false
    for (const item of items) {
      signal.throwIfAborted()
      const invocationId = stableUuid(record.id, step.id, item.stableKey)
      if (!progress.invocationIds.includes(invocationId)) progress.invocationIds.push(invocationId)
      const attempt = runAttempt(this.repository.runs(record.taskId), invocationId)
      const { runId, existing } = attempt
      if (!progress.runIds.includes(runId)) progress.runIds.push(runId)
      const request = runRequest(record, chain, item.input, runId, invocationId)
      let run = existing
      if (!run || !["completed", "partial", "blocked", "failed", "cancelled"].includes(run.status)) {
        record.currentRunId = runId; this.bump(record)
        const control = existing?.checkpoint && resume ? resumeControl(existing) : undefined
        run = await execute(chain, request, control)
      }
      const output = outputFor(chain, run)
      if (run.status === "completed" && output) { outputs.push(outputValue(output)); continue }
      if (run.status === "partial" && output) { outputs.push(outputValue(output)); partial = true; continue }
      if (run.status === "waiting_for_human" || run.status === "paused") {
        if (run.outcome?.status === "paused" && run.outcome.cause === "budget") {
          this.finish(record, "blocked", run.outcome.reason,
            { classification: "budget", code: "run_budget_exceeded", repairable: false })
          return { continue: false, output: null, partial: false }
        }
        progress.status = run.status; progress.reason = run.outcome?.reason ?? "运行已暂停。"
        record.status = run.status; record.reason = progress.reason
        record.result = projectExecutionResult(this.repository, record); this.bump(record); return { continue: false, output: null, partial: false }
      }
      if (run.externalFailure) {
        progress.status = "blocked"; progress.reason = externalFailureReason(run.externalFailure)
        this.finish(record, "blocked", progress.reason,
          { classification: "external", code: run.externalFailure.code, repairable: false })
        return { continue: false, output: null, partial }
      }
      // WHY：blocked/cancelled 是执行边界，不属于可由业务 onItemFailure=continue 忽略的数据缺失。
      if (run.status === "blocked" || run.status === "cancelled") {
        progress.status = run.status; progress.reason = run.outcome?.reason ?? "输入执行被阻断。"
        this.finish(record, run.status, progress.reason, run.status === "cancelled"
          ? { classification: "cancelled", code: "run_cancelled", repairable: false }
          : { classification: "deterministic", code: "run_blocked", repairable: true })
        return { continue: false, output: null, partial }
      }
      partial = true; progress.reason = run.outcome?.reason ?? "输入未完成。"
      // WHY：验证必须暴露每个真实失败，不能用业务 continue 策略把缺失输入算成验证完成。
      if ((record.mode ?? "replay") !== "replay") {
        progress.status = "failed"; this.finish(record, "failed", progress.reason,
          { classification: "deterministic", code: "validation_run_failed", repairable: true })
        return { continue: false, output: null, partial }
      }
      if (step.invocation.mode !== "each" || step.invocation.onItemFailure === "stop") {
        this.finish(record, "failed", progress.reason,
          { classification: "deterministic", code: "run_failed", repairable: true })
        return { continue: false, output: null, partial }
      }
      if (step.invocation.onItemFailure === "pause") {
        progress.status = "paused"; record.status = "paused"; record.reason = progress.reason
        record.result = projectExecutionResult(this.repository, record); this.bump(record)
        return { continue: false, output: null, partial }
      }
    }
    const output = step.invocation.mode === "each" ? outputs : outputs[0] ?? null
    return { continue: true, output, partial }
  }

  private isCurrent(record: TaskExecution, plan: TaskPlan) {
    const state = this.store.snapshot(record.taskId)
    if (state.active || state.confirmedVersion !== record.requirement.version) return false
    const requirement = this.repository.requirement(record.taskId, record.requirement.version)
    return requirement.id === record.requirement.id && requirement.revision === record.requirement.revision
      && digestJson(requirement) === record.requirement.digest && plan.requirement.id === requirement.id
      && plan.requirement.version === requirement.version && plan.requirement.revision === requirement.revision
  }
  private bump(record: TaskExecution) { record.sequence++; record.updatedAt = new Date().toISOString(); this.save(record) }
  private finish(record: TaskExecution, status: TaskExecution["status"], reason: string, failure: FailureHint | null = null) {
    const stepStatus: TaskExecutionStep["status"] | null = status === "stale" ? "blocked"
      : status === "failed" || status === "blocked" || status === "cancelled" || status === "paused" ? status : null
    const current = stepStatus && record.currentStepId
      ? record.steps.find((step) => step.stepId === record.currentStepId) : undefined
    // WHY：execution 的终态与当前 step 是同一次失败事实；不能留下 running 伪现场。
    if (current?.status === "running" && stepStatus) {
      current.status = stepStatus
      current.reason = reason
    }
    record.status = status; record.reason = reason; record.currentStepId = status === "completed" ? null : record.currentStepId
    record.currentRunId = status === "completed" ? null : record.currentRunId
    record.result = projectExecutionResult(this.repository, record, failure); this.bump(record); return record
  }
  private save(record: TaskExecution) { this.repository.saveExecution(record) }
}

function invocationInputs(step: TaskPlanStep, context: BindingContext) {
  if (step.invocation.mode !== "each") return [{ input: parseTaskValue(step.inputContract, resolveBinding(step.input, context)), stableKey: "root" }]
  const invocation = step.invocation
  const collection = resolveBinding(invocation.collection, context)
  if (!Array.isArray(collection)) throw new Error("plan_each_collection_required")
  const selected: { input: JsonValue; stableKey: string }[] = [], seen = new Map<string, string>()
  for (const item of collection) {
    const variables = { ...context.variables, [invocation.itemVariable]: item }
    const stableValue = readPath(item, invocation.stableKeyPath)
    if (!["string", "number", "boolean"].includes(typeof stableValue)) throw new Error("plan_stable_key_scalar_required")
    const input = parseTaskValue(step.inputContract, resolveBinding(step.input, { ...context, variables }))
    const stableKey = digestJson(stableValue), inputDigest = digestJson(input), previous = seen.get(stableKey)
    if (previous && previous !== inputDigest) throw new Error("plan_stable_key_collision")
    if (previous) continue
    seen.set(stableKey, inputDigest); selected.push({ input, stableKey })
  }
  if (selected.length > invocation.maxItems) throw new Error("plan_item_limit_exceeded")
  return selected
}

function runRequest(record: TaskExecution, chain: TaskChain, input: JsonValue, runId: string, invocationId: string): TaskRunRequest {
  return { contractVersion: CONTRACT_VERSION, requestId: stableUuid(runId, "request"), mode: record.mode ?? "replay", input,
    binding: { runId, invocationId, taskId: record.taskId, authorizationId: record.authorizationId, plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) } }
}

function resumeControl(run: TaskRun): RuntimeControl {
  const checkpoint = run.checkpoint!
  return { checkpoint, resumeRequest: { contractVersion: CONTRACT_VERSION, requestId: stableUuid(run.binding.runId, "resume", String(run.sequence)),
    binding: run.binding, checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } }
}

function runAttempt(runs: TaskRun[], invocationId: string) {
  const firstRunId = stableUuid(invocationId, "run")
  return { runId: firstRunId, existing: runs.find((run) => run.binding.runId === firstRunId) }
}

function externalFailureReason(failure: NonNullable<TaskRun["externalFailure"]>) {
  const status = failure.httpStatus === null ? "" : ` HTTP ${failure.httpStatus}`
  const origin = failure.origin ? `（${failure.origin}）` : ""
  return `来源访问已熔断：${failure.category}${status}${origin}；已完成输入和检查点保留，未继续调度剩余输入。`
}

function outputFor(chain: TaskChain, run: TaskRun): TaskOutput | null {
  return Object.values(run.outputs).find((output) => output.contract.id === chain.outputContract.id
    && output.contract.version === chain.outputContract.version) ?? null
}
function outputValue(output: TaskOutput): JsonValue {
  return output.kind === "value" ? output.value : { artifactId: output.artifact.artifactId,
    mediaType: output.artifact.mediaType, digest: output.artifact.digest }
}
