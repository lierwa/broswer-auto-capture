import { taskExecutionDetailSchema, type TaskExecution, type TaskRun } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import type { TaskContractRepository } from "./repository.js"

export function runBelongsToExecution(record: TaskExecution, step: TaskExecution["steps"][number], run: TaskRun) {
  const binding = run.binding
  const equal = (left: TaskExecution["plan"], right: TaskExecution["plan"]) => left.id === right.id
    && left.version === right.version && left.digest === right.digest
  return binding.taskId === record.taskId && binding.authorizationId === record.authorizationId
    && step.runIds.includes(binding.runId) && step.invocationIds.includes(binding.invocationId)
    && equal(binding.plan, record.plan) && equal(binding.chain, step.chain)
}

export function executionCalls(repository: TaskContractRepository, record: TaskExecution) {
  return record.steps.flatMap((step) => step.runIds.flatMap((runId) => {
    let run: TaskRun
    try { run = repository.run(record.taskId, runId) }
    catch (error) {
      // WHY：接单和第一次 persist 之间尚无 TaskRun，是待绑定窗口，不能补造输入或失败。
      if (error instanceof DomainError && error.code === "run_not_found") return []
      throw error
    }
    if (!runBelongsToExecution(record, step, run)) throw new DomainError("execution_run_mismatch", "调用与本次运行的授权或版本不一致。", 409)
    return [{ stepId: step.stepId, run: { binding: run.binding, input: run.input, outputs: run.outputs,
      status: run.status, outcome: run.outcome, sequence: run.sequence } }]
  }))
}

export function executionRequirement(repository: TaskContractRepository, record: TaskExecution) {
  const value = repository.findRequirement(record.taskId, record.requirement.version)
  return value && value.id === record.requirement.id && value.revision === record.requirement.revision
    && digestJson(value) === record.requirement.digest ? value : null
}

export function executionDetail(repository: TaskContractRepository, record: TaskExecution,
  content: import("@browser-capture/contracts").TaskDraftContent | null) {
  return taskExecutionDetailSchema.parse({ execution: record, content,
    requirement: executionRequirement(repository, record), calls: executionCalls(repository, record) })
}
