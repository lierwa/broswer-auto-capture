import type { JsonValue, Predicate, ValueBinding, ValueWrite } from "@browser-capture/contracts"

export interface BindingContext {
  input: JsonValue
  nodeOutputs: Record<string, JsonValue>
  variables: Record<string, JsonValue>
}

export function readPath(value: JsonValue, path: (string | number)[]): JsonValue {
  let current: JsonValue = value
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment >= current.length) throw new Error("binding_path_missing")
      current = current[segment]!
      continue
    }
    if (!current || typeof current !== "object" || Array.isArray(current) || !Object.hasOwn(current, segment)) {
      throw new Error("binding_path_missing")
    }
    current = current[segment]!
  }
  return structuredClone(current)
}

export function resolveBinding(binding: ValueBinding, context: BindingContext): JsonValue {
  if (binding.source === "constant") return structuredClone(binding.value)
  if (binding.source === "input") return readPath(context.input, binding.path)
  if (binding.source === "node") {
    if (!Object.hasOwn(context.nodeOutputs, binding.nodeId)) throw new Error("binding_node_unavailable")
    return readPath(context.nodeOutputs[binding.nodeId]!, binding.path)
  }
  if (!Object.hasOwn(context.variables, binding.name)) throw new Error("binding_variable_unavailable")
  return readPath(context.variables[binding.name]!, binding.path)
}

export function resolveBindings(bindings: Record<string, ValueBinding>, context: BindingContext): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, resolveBinding(binding, context)]))
}

export function applyWrites(writes: ValueWrite[], output: JsonValue, variables: Record<string, JsonValue>) {
  for (const write of writes) variables[write.variable] = readPath(output, write.path)
}

export function evaluatePredicate(predicate: Predicate, context: BindingContext): boolean {
  if (predicate.operator === "exists") {
    try { return resolveBinding(predicate.value, context) !== null } catch { return false }
  }
  const left = resolveBinding(predicate.left, context), right = resolveBinding(predicate.right, context)
  if (predicate.operator === "equals") return JSON.stringify(left) === JSON.stringify(right)
  if (typeof left !== "number" || typeof right !== "number") throw new Error("predicate_number_required")
  return left > right
}

export function readObservation(value: JsonValue, path: (string | number)[]) {
  try { return { exists: true, value: readPath(value, path) } }
  catch { return { exists: false, value: null as JsonValue } }
}
