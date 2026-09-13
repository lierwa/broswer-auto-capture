import { valuePathSchema, type JsonValue } from "@browser-capture/contracts"

/** WHY：按受控路径组装嵌套输出，网站字段仅是数据；禁止执行表达式或原型写入。 */
export function assembleValue(source: JsonValue, rawPaths: JsonValue): JsonValue {
  if (!source || typeof source !== "object" || Array.isArray(source) || !rawPaths || typeof rawPaths !== "object" || Array.isArray(rawPaths)) throw new Error("data_assemble_object_required")
  let result: JsonValue | undefined
  const assigned: (string | number)[][] = []
  for (const [key, rawPath] of Object.entries(rawPaths)) {
    const path = valuePathSchema.parse(rawPath)
    if (!Object.hasOwn(source, key)) throw new Error("data_assemble_value_missing")
    if (assigned.some((other) => other.every((part, index) => path[index] === part) || path.every((part, index) => other[index] === part))) throw new Error("data_assemble_overlapping_paths")
    assigned.push(path)
    if (!path.length) { result = structuredClone(source[key]!); continue }
    result ??= typeof path[0] === "number" ? [] : {}
    writePath(result, path, source[key]!)
  }
  if (result === undefined) throw new Error("data_assemble_empty")
  return result
}

function writePath(root: JsonValue, path: (string | number)[], value: JsonValue) {
  let current = root
  for (let index = 0; index < path.length; index++) {
    const key = path[index]!
    if (!current || typeof current !== "object" || (typeof key === "number") !== Array.isArray(current)) throw new Error("data_assemble_container_mismatch")
    const record = current as Record<string | number, JsonValue>
    if (index === path.length - 1) { record[key] = structuredClone(value); return }
    if (!Object.hasOwn(record, key)) record[key] = typeof path[index + 1] === "number" ? [] : {}
    current = record[key]!
  }
}
