import { type TaskExecution, type TaskExecutionFailureEvidence, type TaskExecutionResult, type TaskPlan,
  type TaskRun } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import type { TaskContractRepository } from "./repository.js"

export type FailureHint = Pick<TaskExecutionFailureEvidence, "classification" | "code" | "repairable">

export function initialExecutionResult(plan: TaskPlan, steps: TaskExecution["steps"], reason: string): TaskExecutionResult {
  return { status: "queued", summary: reason, nextAction: "view",
    payload: plan.outputContract.schema.type === "null"
      ? { mode: "execution", completedSteps: 0, totalSteps: steps.length, evidence: [] }
      : { mode: "data", output: null }, failure: null }
}

export function projectExecutionResult(repository: TaskContractRepository, record: TaskExecution,
  failureHint: FailureHint | null = null): TaskExecutionResult | undefined {
  const plan = repository.plan(record.taskId, record.plan.id, record.plan.version, record.plan.digest)
  const runs = record.steps.flatMap((step) => step.runIds.flatMap((id) => {
    try { return [repository.run(record.taskId, id)] } catch { return [] }
  }))
  const artifacts = uniqueArtifacts(runs)
  const payload: TaskExecutionResult["payload"] = plan.outputContract.schema.type === "null"
    ? { mode: "execution", completedSteps: record.steps.filter((step) => step.status === "completed").length,
      totalSteps: record.steps.length, evidence: artifacts }
    : { mode: "data", output: record.output }
  const failure = failureHint ? failureEvidence(record, runs, failureHint) : null
  return { status: record.status, summary: record.reason, nextAction: nextAction(record.status, failure), payload, failure }
}

function failureEvidence(record: TaskExecution, runs: TaskRun[], hint: FailureHint): TaskExecutionFailureEvidence {
  const run = runs.findLast((candidate) => candidate.binding.runId === record.currentRunId) ?? runs.at(-1)
  const event = run?.events.at(-1), checkpoint = run?.checkpoint
  const base = { ...hint, executionId: record.id, stepId: record.currentStepId,
    runId: run?.binding.runId ?? null, runSequence: run?.sequence ?? null,
    checkpointId: checkpoint?.id ?? null, eventSequence: event?.sequence ?? null, reason: record.reason }
  return { ...base, digest: digestJson(base) }
}

function uniqueArtifacts(runs: TaskRun[]) {
  const values = runs.flatMap((run) => run.outcome?.evidence ?? run.checkpoint?.artifacts ?? [])
  return [...new Map(values.map((artifact) => [artifact.artifactId, artifact])).values()]
}

function nextAction(status: TaskExecution["status"], failure: TaskExecutionFailureEvidence | null): TaskExecutionResult["nextAction"] {
  if (["queued", "running"].includes(status)) return "view"
  if (["paused", "waiting_for_human"].includes(status)) return "resume"
  if (status === "cleanup_required") return "cleanup"
  if (["completed", "partial", "cancelled"].includes(status)) return "rerun"
  return "none"
}
