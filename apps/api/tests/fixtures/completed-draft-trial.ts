import { randomUUID } from "node:crypto"
import { taskExecutionSchema, taskRunSchema, type TaskDraft, type TaskExecution } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { draftReference } from "../../src/task-chain/chain-revision.js"

// WHY：发布成功夹具必须携带真实形状的调用事实，不能用空 runIds 绕过发布校验。
export function completedDraftExecution(draft: TaskDraft, mode: "sample" | "verification", destination: string): TaskExecution {
  const now = "2026-09-22T00:05:00.000Z", plan = draft.content.plan, id = randomUUID()
  const input = { destination }, value = { title: "当前结果", link: destination }
  const consumed = { transitions: 1, browserCommands: 1, activeMs: 1, llmCalls: 0, invocations: 1 }
  return taskExecutionSchema.parse({ contractVersion: draft.contractVersion, kind: "execution", id,
    taskId: draft.taskId, authorizationId: randomUUID(),
    plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, requirement: draft.requirement,
    draft: draftReference(draft), mode, input, inputDigest: digestJson(input), pacing: { nodeDelayMs: 0 },
    consumed, status: "completed", sequence: 1, currentStepId: null, currentRunId: null,
    steps: draft.content.steps.map(step => {
      const invocationId = stableUuid(id, step.stepId, "root")
      return { stepId: step.stepId,
        chain: { id: step.chain.id, version: step.chain.version, digest: executableChainDigest(step.chain) },
        invocationIds: [invocationId], runIds: [stableUuid(invocationId, "run")], consumed,
        status: "completed", output: value, reason: null }
    }),
    output: { kind: "value", value, contract: { id: plan.outputContract.id, version: plan.outputContract.version } },
    reason: "试跑完成。", cleanup: { status: "confirmed", attempt: 1, code: null,
      evidenceDigest: "a".repeat(64), updatedAt: now }, cleanupResume: null, reviews: [],
    createdAt: now, updatedAt: now })
}

export function completedDraftRuns(draft: TaskDraft, execution: TaskExecution) {
  return execution.steps.map(step => {
    const chain = draft.content.steps.find(item => item.stepId === step.stepId)!.chain
    return taskRunSchema.parse({ contractVersion: draft.contractVersion, kind: "run",
      binding: { runId: step.runIds[0], invocationId: step.invocationIds[0], taskId: execution.taskId,
        authorizationId: execution.authorizationId, plan: execution.plan, chain: step.chain,
        inputDigest: execution.inputDigest }, mode: execution.mode, input: execution.input, budget: chain.budget,
      sequence: 1, status: "completed", outputs: { result: { kind: "value", value: step.output,
        contract: { id: chain.outputContract.id, version: chain.outputContract.version } } }, checkpoint: null,
      consumed: step.consumed, outcome: { status: "completed", reason: "完成", evidence: [], completionEvidence: ["observed"] },
      events: [], modelCalls: [], auditComplete: true })
  })
}
