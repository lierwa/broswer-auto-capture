import type { JsonValue, Predicate, ValueBinding, ValueWrite } from "@browser-capture/contracts"

export interface BindingContext {
  input: JsonValue
  nodeOutputs: Record<string, JsonValue>
  variables: Record<string, JsonValue>
}

export function readPath(value: JsonValue, path: (string | number)[], copy = true): JsonValue {
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
  return copy ? structuredClone(current) : current
}

export function resolveBinding(binding: ValueBinding, context: BindingContext, copy = true): JsonValue {
  if (binding.source === "constant") return copy ? structuredClone(binding.value) : binding.value
  if (binding.source === "input") return readPath(context.input, binding.path, copy)
  if (binding.source === "node") {
    if (!Object.hasOwn(context.nodeOutputs, binding.nodeId)) throw new Error("binding_node_unavailable")
    return readPath(context.nodeOutputs[binding.nodeId]!, binding.path, copy)
  }
  if (!Object.hasOwn(context.variables, binding.name)) throw new Error("binding_variable_unavailable")
  return readPath(context.variables[binding.name]!, binding.path, copy)
}

export function resolveBindings(bindings: Record<string, ValueBinding>, context: BindingContext): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, resolveBinding(binding, context)]))
}

export function applyWrites(writes: ValueWrite[], output: JsonValue, variables: Record<string, JsonValue>) {
  for (const write of writes) variables[write.variable] = readPath(output, write.path)
}

export function evaluatePredicate(predicate: Predicate, context: BindingContext,
  observed?: (name: string, value: JsonValue, binding: ValueBinding) => void): boolean {
  const resolve = (name: string, binding: ValueBinding) => {
    const value = resolveBinding(binding, context)
    observed?.(name, value, binding)
    return value
  }
  if (predicate.operator === "exists") {
    try { return resolve("value", predicate.value) !== null } catch { return false }
  }
  if (predicate.operator === "array_length_at_least") {
    const value = resolve("value", predicate.value), minimum = resolve("minimum", predicate.minimum)
    if (!Array.isArray(value) || typeof minimum !== "number" || !Number.isInteger(minimum) || minimum < 0) {
      throw new Error("predicate_array_length_required")
    }
    return value.length >= minimum
  }
  const left = resolve("left", predicate.left), right = resolve("right", predicate.right)
  if (predicate.operator === "equals") return JSON.stringify(left) === JSON.stringify(right)
  if (typeof left !== "number" || typeof right !== "number") throw new Error("predicate_number_required")
  return left > right
}

export function readObservation(value: JsonValue, path: (string | number)[]) {
  try { return { exists: true, value: readPath(value, path) } }
  catch { return { exists: false, value: null as JsonValue } }
}
