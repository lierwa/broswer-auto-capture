import { parseTaskValue, type JsonValue, type TaskPlan } from "@browser-capture/contracts"
import { digestJson, readPath, resolveBinding, type BindingContext } from "@browser-capture/runtime"

export function plannedProgression(plan: TaskPlan, input: JsonValue) {
  const context: BindingContext = { input, nodeOutputs: {}, variables: {} }
  let position = 0
  const resolved = new Map<string, JsonValue>()
  const resolve = (step: TaskPlan["steps"][number]) => {
    if (plan.steps[position]?.id !== step.id) throw new Error(`preexecution_step_order_invalid:${step.id}`)
    if (step.invocation.mode === "batch") throw new Error("workflow_batch_input_unsupported")
    const value = step.invocation.mode === "each" ? eachInputs(step, context)[0]
      : parseTaskValue(step.inputContract, resolveBinding(step.input, context))
    if (value === undefined) throw new Error(`preexecution_step_representative_missing:${step.id}`)
    resolved.set(step.id, value)
    return value
  }
  const accept = (stepId: string, stepInput: JsonValue, raw: JsonValue | undefined) => {
    const step = plan.steps[position]
    if (!step || stepId !== step.id) throw new Error(`preexecution_step_order_invalid:${stepId}`)
    const expected = resolved.get(step.id)
    if (expected === undefined || digestJson(expected) !== digestJson(stepInput)) {
      throw new Error(`preexecution_step_input_mismatch:${step.id}`)
    }
    const output = parseTaskValue(step.outputContract, raw)
    context.nodeOutputs[step.id] = step.invocation.mode === "each" ? [output] : output
    position++
  }
  const finish = () => {
    if (position !== plan.steps.length) throw new Error("preexecution_step_result_missing")
    parseTaskValue(plan.outputContract, resolveBinding(plan.output, context))
  }
  return { resolve, accept, finish }
}

function eachInputs(step: TaskPlan["steps"][number], context: BindingContext) {
  const invocation = step.invocation
  if (invocation.mode !== "each") throw new Error("exploration_each_step_required")
  const collection = resolveBinding(invocation.collection, context)
  if (!Array.isArray(collection)) throw new Error(`exploration_step_collection_missing:${step.id}`)
  const unique: Array<{ item: JsonValue; digest: string; key: string }> = [], seen = new Map<string, string>()
  for (const item of collection) {
    const stableValue = readPath(item, invocation.stableKeyPath)
    if (!["string", "number", "boolean"].includes(typeof stableValue)) throw new Error(`exploration_step_stable_key_invalid:${step.id}`)
    const key = String(stableValue), itemDigest = digestJson(item), previous = seen.get(key)
    if (previous && previous !== itemDigest) throw new Error(`exploration_step_stable_key_collision:${step.id}`)
    if (!previous) { seen.set(key, itemDigest); unique.push({ item, digest: itemDigest, key }) }
  }
  return unique.slice(0, invocation.maxItems).map(({ item }) => parseTaskValue(step.inputContract,
    resolveBinding(step.input, { ...context, variables: { ...context.variables, [invocation.itemVariable]: item } })))
}
