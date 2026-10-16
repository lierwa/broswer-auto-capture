import { parseTaskValue, type JsonValue, type RunnableReleaseValidation, type TaskDraft,
  type TaskExecution, type TaskRun } from "@browser-capture/contracts"
import { digestJson, resolveBinding, stableUuid, type BindingContext } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import { executionMatchesDraft } from "./chain-revision.js"
import { invocationInputs, outputFor, outputValue } from "./plan-values.js"
import type { TaskContractRepository } from "./repository.js"

// WHY：completed 是运行摘要；发布授权还必须对应当前草稿和本次实际调用，不能信任空引用或其它运行的成功。
export function validationEvidence(repository: TaskContractRepository, draft: TaskDraft,
  executionId: string): RunnableReleaseValidation | null {
  const execution = optionalFact(() => repository.execution(draft.taskId, executionId))
  if (!execution || execution.id !== executionId || execution.status !== "completed" || !execution.draft
    || execution.draft.id !== draft.id || execution.draft.revision !== draft.revision
    || execution.draft.checksum !== draft.checksum || !executionMatchesDraft(execution, draft)
    || !["sample", "verification"].includes(execution.mode ?? "")) return null
  const candidate = repository.candidate(draft.taskId, execution.id)
  if (!candidate || candidate.executionId !== execution.id || candidate.taskId !== draft.taskId
    || candidate.draft.id !== draft.id || candidate.draft.revision !== draft.revision
    || candidate.draft.checksum !== draft.checksum || digestJson(candidate.content) !== digestJson(draft.content)) return null
  if (!same(execution.input, parsedInput(draft, execution.input)) || digestJson(execution.input) !== execution.inputDigest) return null
  const context: BindingContext = { input: execution.input, nodeOutputs: {}, variables: {} }
  for (const step of draft.content.plan.steps) {
    const progress = execution.steps.find(item => item.stepId === step.id)!
    const frozen = draft.content.steps.find(item => item.stepId === step.id)!
    if (progress.status !== "completed") return null
    const items = validItems(step, context)
    if (!items) return null
    const ids = items.map(item => stableUuid(execution.id, step.id, item.stableKey))
    if (!same(ids, progress.invocationIds) || !same(ids.map(id => stableUuid(id, "run")), progress.runIds)) return null
    const values: JsonValue[] = []
    for (const [index, item] of items.entries()) {
      const run = optionalFact(() => repository.run(draft.taskId, progress.runIds[index]!))
      if (!run || !validRun(run, execution, progress, index, item.input)) return null
      const output = outputFor(frozen.chain, run)
      if (!output) return null
      values.push(outputValue(output))
    }
    const value = step.invocation.mode === "each" ? values : values[0] ?? null
    if (!same(value, progress.output)) return null
    context.nodeOutputs[step.id] = value
  }
  if (!validOutput(draft, execution, context)) return null
  return { phase: execution.mode as "sample" | "verification", executionId: execution.id,
    inputDigest: execution.inputDigest, steps: execution.steps.map(step => ({ stepId: step.stepId,
      chain: step.chain, runIds: step.runIds, outputDigest: digestJson(step.output) })),
    modelCalls: execution.consumed.llmCalls, completedAt: execution.updatedAt }
}

function validRun(run: TaskRun, execution: TaskExecution, step: TaskExecution["steps"][number],
  index: number, input: JsonValue) {
  const binding = run.binding
  return run.status === "completed" && run.outcome?.status === "completed" && run.auditComplete
    && run.mode === execution.mode && binding.runId === step.runIds[index]
    && binding.invocationId === step.invocationIds[index] && binding.taskId === execution.taskId
    && binding.authorizationId === execution.authorizationId && same(binding.plan, execution.plan)
    && same(binding.chain, step.chain) && binding.inputDigest === digestJson(input) && same(run.input, input)
}

function validOutput(draft: TaskDraft, execution: TaskExecution, context: BindingContext) {
  try {
    const plan = draft.content.plan, output = execution.output
    return output?.kind === "value" && output.contract.id === plan.outputContract.id
      && output.contract.version === plan.outputContract.version
      && same(output.value, parseTaskValue(plan.outputContract, resolveBinding(plan.output, context)))
  } catch { return false }
}

function parsedInput(draft: TaskDraft, input: JsonValue) {
  try { return parseTaskValue(draft.content.plan.inputContract, input) } catch { return undefined }
}

function validItems(step: Parameters<typeof invocationInputs>[0], context: BindingContext) {
  try { return invocationInputs(step, context) } catch { return null }
}

function same(left: unknown, right: unknown) { return right !== undefined && digestJson(left) === digestJson(right) }

function optionalFact<T>(read: () => T) {
  try { return read() }
  catch (error) {
    if (error instanceof DomainError && ["execution_not_found", "run_not_found"].includes(error.code)) return null
    throw error
  }
}
