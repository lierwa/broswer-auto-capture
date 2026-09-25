import {
  CONTRACT_VERSION, UNRECORDED_EXECUTION_CLEANUP,
  type JsonValue, type RunnableTaskRelease, type TaskDraft, type TaskExecution, type TaskPlan,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { syncConfirmedRequirement } from "./requirement.js"
import { initialExecutionResult } from "./execution-result.js"
import { draftReference } from "./chain-revision.js"

export function queuedExecution(taskId: string, requestId: string, plan: TaskPlan, requirement: NonNullable<ReturnType<typeof syncConfirmedRequirement>>,
  release: RunnableTaskRelease, input: JsonValue, pacing: TaskExecution["pacing"],
  browser: NonNullable<TaskExecution["browser"]>): TaskExecution {
  const now = new Date().toISOString()
  const record: TaskExecution = { contractVersion: CONTRACT_VERSION, kind: "execution", id: stableUuid(requestId, "execution"), taskId,
    authorizationId: requestId, plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, requirement: plan.requirement,
    release: { id: release.id, version: release.version, digest: digestJson(release) },
    input, inputDigest: digestJson(input), pacing, browser, consumed: zeroConsumption(), status: "queued", sequence: 0,
    cleanup: { ...UNRECORDED_EXECUTION_CLEANUP }, cleanupResume: null,
    currentStepId: null, currentRunId: null,
    steps: plan.steps.map((step) => { const chain = release.content.steps.find((item) => item.stepId === step.id)?.chain
      if (!chain) throw new Error("release_step_missing")
      return { stepId: step.id, chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
        invocationIds: [], runIds: [], consumed: zeroConsumption(), status: "pending" as const, output: null, reason: null } }),
    output: null, reason: `已授权需求 v${requirement.version} 的计划 v${plan.version}，等待执行。`, reviews: [],
    createdAt: now, updatedAt: now }
  record.result = initialExecutionResult(plan, record.steps, record.reason)
  return record
}

export function queuedDraftExecution(taskId: string, requestId: string, draft: TaskDraft, input: JsonValue,
  pacing: TaskExecution["pacing"], mode: "sample" | "verification" = "sample"): TaskExecution {
  const plan = draft.content.plan, now = new Date().toISOString()
  const record: TaskExecution = { contractVersion: CONTRACT_VERSION, kind: "execution",
    id: stableUuid(requestId, "execution"), taskId, authorizationId: requestId,
    plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, requirement: draft.requirement,
    draft: draftReference(draft), mode, input, inputDigest: digestJson(input), pacing,
    consumed: zeroConsumption(), status: "queued", sequence: 0,
    cleanup: { ...UNRECORDED_EXECUTION_CLEANUP }, cleanupResume: null,
    currentStepId: null, currentRunId: null,
    steps: plan.steps.map((step) => {
      const chain = draft.content.steps.find((item) => item.stepId === step.id)?.chain
      if (!chain) throw new Error("draft_step_missing")
      return { stepId: step.id, chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
        invocationIds: [], runIds: [], consumed: zeroConsumption(), status: "pending" as const, output: null, reason: null }
    }), output: null, reason: `草稿 revision ${draft.revision} 已冻结，等待试跑。`, reviews: [],
    createdAt: now, updatedAt: now }
  record.result = initialExecutionResult(plan, record.steps, record.reason)
  return record
}

export function zeroConsumption() {
  return { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
}
