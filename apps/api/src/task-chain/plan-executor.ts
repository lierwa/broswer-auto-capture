import { executionBudget } from "./execution-budget.js"
import {
  CONTRACT_VERSION, parseTaskValue, taskPlanExecutionIssues, type JsonValue, type TaskChain, type TaskExecution,
  type TaskExecutionStep, type TaskOutput, type TaskPlan, type TaskPlanStep, type TaskRun, type TaskRunRequest,
} from "@browser-capture/contracts"
import { evaluatePredicate, readPath, resolveBinding, digestJson, executableChainDigest, stableUuid,
  RuntimeBudgetExceededError, type BindingContext, type RuntimeControl } from "@browser-capture/runtime"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import type { TaskRuntimeHost } from "./runtime-host.js"

export class TaskPlanExecutor {
  constructor(private readonly store: ProductStore, private readonly repository: TaskContractRepository,
    private readonly host: TaskRuntimeHost) {}

  async execute(record: TaskExecution, signal: AbortSignal, resume = false) {
    try {
      const plan = this.repository.plan(record.taskId, record.plan.id, record.plan.version, record.plan.digest)
      if (!this.isCurrent(record, plan)) return this.finish(record, "stale", "需求或计划版本已变化，原授权不能继续执行。")
      if (taskPlanExecutionIssues(plan).length) return this.finish(record, "blocked", "计划输入输出合同不再满足执行约束，需要生成新计划。")
      const chains = this.boundChains(record, plan)
      record.status = "running"; record.sequence++; record.reason = "正在执行本次计划固定的链路版本。"; this.save(record)
      const browserRunId = stableUuid(record.id, "browser", String(record.sequence))
      await this.host.group({ taskId: record.taskId, authorizationId: record.authorizationId, browserRunId,
        requirementVersion: record.requirement.version, purpose: record.mode ?? "replay", chains, input: record.input, signal,
        ...executionBudget(plan, chains), consumed: record.consumed,
        scopeConsumption: Object.fromEntries(record.steps.map((step) => [step.stepId, step.consumed])),
        onConsumption: (scopeId, snapshot) => {
          const progress = record.steps.find((step) => step.stepId === scopeId)
          if (!progress) throw new Error("task_budget_scope_unknown")
          record.consumed = snapshot.total; progress.consumed = snapshot.scope
          record.sequence++; record.updatedAt = new Date().toISOString(); this.save(record)
        } },
      async (execute) => this.runSteps(record, plan, chains, execute, signal, resume))
    } catch (error) {
      if (signal.aborted) {
        const current = this.repository.execution(record.taskId, record.id)
        // WHY：取消命令已经持久化 cancelled 时，异步执行栈晚到的 abort 不能把它降级覆盖成 paused。
        if (current.status === "cancelled") return current
        this.finish(record, "paused", "运行已中断，已完成步骤和检查点保留。")
      }
      else if (error instanceof Error && error.message === "authorized_chain_unavailable") {
        this.finish(record, "blocked", "授权时固定的链路版本不再可用；原授权不会切换到其他版本。")
      } else if (error instanceof RuntimeBudgetExceededError || error instanceof Error && error.message === "plan_item_limit_exceeded") {
        this.finish(record, "blocked", error.message)
      } else this.finish(record, "failed", `运行失败：${error instanceof Error ? error.message : "execution_failed"}`)
    }
    return record
  }

  private boundChains(record: TaskExecution, plan: TaskPlan) {
    return plan.steps.map((step) => {
      const progress = record.steps.find((item) => item.stepId === step.id)
      if (!progress) throw new Error("authorized_chain_unavailable")
      try {
        const chain = this.repository.chain(record.taskId, progress.chain.id, progress.chain.version, progress.chain.digest)
        if ((record.mode ?? "replay") === "replay" && chain.validation.status !== "verified"
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
      if (step.completion.some((condition) => !evaluatePredicate(condition.predicate, context))) {
        progress.status = "blocked"
        this.finish(record, "blocked", `步骤“${step.title}”未满足完成条件。`); return
      }
      this.bump(record)
    }
    if (plan.completion.some((condition) => !evaluatePredicate(condition.predicate, context))) {
      this.finish(record, "partial", "计划步骤已结束，但整体完成条件未全部满足。"); return
    }
    const value = parseTaskValue(plan.outputContract, resolveBinding(plan.output, context))
    record.output = { kind: "value", contract: { id: plan.outputContract.id, version: plan.outputContract.version }, value }
    this.finish(record, record.steps.some((step) => step.status === "partial") ? "partial" : "completed",
      record.steps.some((step) => step.status === "partial") ? "运行保留了部分输出和明确缺口。" : "所有计划步骤与完成条件均已通过。")
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
          this.finish(record, "blocked", run.outcome.reason)
          return { continue: false, output: null, partial: false }
        }
        progress.status = run.status; progress.reason = run.outcome?.reason ?? "运行已暂停。"
        record.status = run.status; record.reason = progress.reason; this.bump(record); return { continue: false, output: null, partial: false }
      }
      if (run.externalFailure) {
        progress.status = "blocked"; progress.reason = externalFailureReason(run.externalFailure)
        this.finish(record, "blocked", progress.reason)
        return { continue: false, output: null, partial }
      }
      // WHY：blocked/cancelled 是执行边界，不属于可由业务 onItemFailure=continue 忽略的数据缺失。
      if (run.status === "blocked" || run.status === "cancelled") {
        progress.status = run.status; progress.reason = run.outcome?.reason ?? "输入执行被阻断。"
        this.finish(record, run.status, progress.reason)
        return { continue: false, output: null, partial }
      }
      partial = true; progress.reason = run.outcome?.reason ?? "输入未完成。"
      // WHY：验证必须暴露每个真实失败，不能用业务 continue 策略把缺失输入算成验证完成。
      if ((record.mode ?? "replay") !== "replay") {
        progress.status = "failed"; this.finish(record, "failed", progress.reason)
        return { continue: false, output: null, partial }
      }
      if (step.invocation.mode !== "each" || step.invocation.onItemFailure === "stop") {
        this.finish(record, "failed", progress.reason)
        return { continue: false, output: null, partial }
      }
      if (step.invocation.onItemFailure === "pause") {
        progress.status = "paused"; record.status = "paused"; record.reason = progress.reason; this.bump(record)
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
  private finish(record: TaskExecution, status: TaskExecution["status"], reason: string) {
    record.status = status; record.reason = reason; record.currentStepId = status === "completed" ? null : record.currentStepId
    record.currentRunId = status === "completed" ? null : record.currentRunId; this.bump(record); return record
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
