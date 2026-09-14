import { CONTRACT_VERSION, taskRunSchema, type JsonValue, type TaskChain, type TaskExecution, type TaskPlan, type TaskRun } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { TaskContractRepository } from "./repository.js"
import type { syncConfirmedRequirement } from "./requirement.js"

export function queuedValidationRun(taskId: string, requestId: string, chain: TaskChain, input: JsonValue,
  mode: "sample" | "verification"): TaskRun {
  const runId = stableUuid(requestId, "validation-run"), invocationId = stableUuid(runId, "invocation")
  return taskRunSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "run",
    binding: { runId, invocationId, taskId, authorizationId: requestId, plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) },
    mode, input, budget: chain.budget, sequence: 0, status: "queued", outputs: {}, checkpoint: null,
    consumed: { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 },
    outcome: null, events: [], modelCalls: [], auditComplete: true })
}

export function validationRequest(run: TaskRun) {
  return { contractVersion: CONTRACT_VERSION, requestId: stableUuid(run.binding.runId, "start"),
    binding: run.binding, mode: run.mode, input: run.input }
}

export function queuedExecution(taskId: string, requestId: string, plan: TaskPlan, requirement: NonNullable<ReturnType<typeof syncConfirmedRequirement>>,
  input: JsonValue, repository: TaskContractRepository): TaskExecution {
  const now = new Date().toISOString()
  return { contractVersion: CONTRACT_VERSION, kind: "execution", id: stableUuid(requestId, "execution"), taskId,
    authorizationId: requestId, plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, requirement: plan.requirement,
    input, inputDigest: digestJson(input), consumed: zeroConsumption(), status: "queued", sequence: 0, currentStepId: null, currentRunId: null,
    steps: plan.steps.map((step) => { const chain = repository.latestChain(plan, step.id, true)!
      return { stepId: step.id, chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
        invocationIds: [], runIds: [], consumed: zeroConsumption(), status: "pending" as const, output: null, reason: null } }),
    output: null, reason: `已授权需求 v${requirement.version} 的计划 v${plan.version}，等待执行。`, createdAt: now, updatedAt: now }
}

export function zeroConsumption() {
  return { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
}
