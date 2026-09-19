import type { JsonValue } from "@browser-capture/contracts"

export function jsonValueAtPath(value: JsonValue, path: Array<string | number>): JsonValue {
  let current = value
  for (const item of path) {
    if (typeof item === "number" && Array.isArray(current) && item >= 0 && item < current.length) {
      current = current[item]!; continue
    }
    if (typeof item === "string" && current !== null && typeof current === "object" && !Array.isArray(current)
      && Object.hasOwn(current, item)) {
      current = current[item]!; continue
    }
    throw new Error("hybrid_natural_node_binding_path_missing")
  }
  return current
}
