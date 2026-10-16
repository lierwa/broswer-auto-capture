import { parseTaskValue, type JsonValue, type TaskChain, type TaskOutput, type TaskPlanStep, type TaskRun } from "@browser-capture/contracts"
import { readPath, resolveBinding, digestJson, type BindingContext } from "@browser-capture/runtime"

// WHY：执行与发布验收共用输入展开和输出投影，避免第二套解释绕过真实调用。
export function invocationInputs(step: TaskPlanStep, context: BindingContext) {
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


export function outputFor(chain: TaskChain, run: TaskRun): TaskOutput | null {
  return Object.values(run.outputs).find((output) => output.contract.id === chain.outputContract.id
    && output.contract.version === chain.outputContract.version) ?? null
}
export function outputValue(output: TaskOutput): JsonValue {
  return output.kind === "value" ? output.value : { artifactId: output.artifact.artifactId,
    mediaType: output.artifact.mediaType, digest: output.artifact.digest }
}
