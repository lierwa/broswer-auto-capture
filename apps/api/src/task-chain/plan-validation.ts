import { CONTRACT_VERSION, type JsonValue, type TaskChain, type TaskExecution, type TaskPlan, type TaskRun } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { TaskContractRepository } from "./repository.js"

export function queuedPlanValidation(taskId: string, requestId: string, plan: TaskPlan, chains: TaskChain[],
  input: JsonValue, mode: "sample" | "verification"): TaskExecution {
  const now = new Date().toISOString()
  return { contractVersion: CONTRACT_VERSION, kind: "execution", id: stableUuid(requestId, "execution"), taskId,
    authorizationId: requestId, plan: { id: plan.id, version: plan.version, digest: digestJson(plan) },
    requirement: plan.requirement, mode, input, inputDigest: digestJson(input), consumed: zero(),
    status: "queued", sequence: 0, currentStepId: null, currentRunId: null,
    steps: plan.steps.map((step) => {
      const chain = chains.find((item) => item.stepId === step.id)
      if (!chain) throw new Error("validation_chain_missing")
      return { stepId: step.id, chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
        invocationIds: [], runIds: [], consumed: zero(), status: "pending", output: null, reason: null }
    }), output: null, reason: mode === "sample" ? "计划样本验证已排队。" : "计划换输入验证已排队。",
    createdAt: now, updatedAt: now }
}

export function matchingPlanValidations(repository: TaskContractRepository, plan: TaskPlan, chains: TaskChain[]) {
  return repository.executions(plan.taskId).filter((record) => record.status === "completed" && record.output
    && record.plan.id === plan.id && record.plan.version === plan.version && record.plan.digest === digestJson(plan)
    && record.steps.length === chains.length && record.steps.every((step) => chains.some((chain) =>
      step.stepId === chain.stepId && step.chain.id === chain.id && step.chain.version === chain.version
      && step.chain.digest === executableChainDigest(chain))))
}

export function planValidationPassed(repository: TaskContractRepository, plan: TaskPlan, chains: TaskChain[]) {
  const records = matchingPlanValidations(repository, plan, chains)
  return records.some((sample) => sample.mode === "sample" && records.some((verification) =>
    verification.mode === "verification" && verification.inputDigest !== sample.inputDigest))
}

export function recordPlanValidation(repository: TaskContractRepository, record: TaskExecution) {
  if (!record.mode || record.mode === "replay") return
  // WHY：只有整体合同通过才发布成功证据；暂停时留待原计划恢复，不把单链成功冒充完整计划成功。
  if (["queued", "running", "paused", "waiting_for_human"].includes(record.status)) return
  for (const step of record.steps) {
    for (const runId of step.runIds) {
      const run = repository.runs(record.taskId).find((item) => item.binding.runId === runId)
      if (!run) continue
      const chain = repository.chain(record.taskId, step.chain.id, step.chain.version, step.chain.digest)
      recordChainValidation(repository, chain, run, record.status === "completed")
    }
  }
}

export function recordChainValidation(repository: TaskContractRepository, chain: TaskChain, run: TaskRun, planPassed = true) {
  const output = Object.values(run.outputs).find((item) => item.contract.id === chain.outputContract.id
    && item.contract.version === chain.outputContract.version)
  const evidence = { phase: run.mode, runId: run.binding.runId, chainDigest: executableChainDigest(chain),
    inputDigest: run.binding.inputDigest, outputDigest: digestJson(output ?? null),
    passed: planPassed && run.status === "completed" && Boolean(output) && run.auditComplete,
    modelCalls: run.consumed.llmCalls, at: new Date().toISOString() }
  const current = repository.chain(chain.taskId, chain.id, chain.version)
  const all = [...current.validation.evidence.filter((item) => item.runId !== evidence.runId), evidence]
  const passed = all.filter((item) => item.passed && item.modelCalls !== null)
  const verified = passed.some((sample) => sample.phase === "sample" && passed.some((verification) =>
    verification.phase === "verification" && verification.chainDigest === sample.chainDigest
    && verification.inputDigest !== sample.inputDigest))
  repository.updateChainValidation({ ...current, validation: { status: verified ? "verified" : "candidate", evidence: all } })
  return evidence.passed
}

function zero() { return { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 } }
