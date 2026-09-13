import type { JsonValue } from "@browser-capture/contracts"
import { readPath } from "./bindings.js"
import { assembleValue } from "./assemble.js"

type Args = Record<string, JsonValue>

function arrayArg(args: Args, name = "source") {
  const value = args[name]
  if (!Array.isArray(value)) throw new Error("data_array_required")
  return value
}

function pathArg(args: Args, name = "path") {
  const value = args[name] ?? []
  if (!Array.isArray(value) || value.some((part) => typeof part !== "string" && (typeof part !== "number" || !Number.isInteger(part) || part < 0))) {
    throw new Error("data_path_required")
  }
  return value as (string | number)[]
}

function comparable(value: JsonValue): string | number | boolean | null {
  return typeof value === "object" ? JSON.stringify(value) : value
}

function compare(left: JsonValue, right: JsonValue) {
  const a = comparable(left), b = comparable(right)
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}

// WHY：这些操作只处理已校验 JSON；没有脚本、表达式或模型入口。
export function executeDataOperation(operation: string, args: Args): JsonValue {
  if (operation === "assign") return structuredClone(args.value ?? null)
  if (operation === "extract") return readPath(args.source ?? null, pathArg(args))
  if (operation === "count") {
    const source = args.source
    if (Array.isArray(source) || typeof source === "string") return source.length
    if (source && typeof source === "object") return Object.keys(source).length
    throw new Error("data_count_source_invalid")
  }
  if (operation === "merge") {
    if (!("sources" in args)) return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, structuredClone(value)]))
    const sources = arrayArg(args, "sources")
    if (sources.every(Array.isArray)) return sources.flat() as JsonValue
    if (sources.every((item) => item && typeof item === "object" && !Array.isArray(item))) return Object.assign({}, ...sources)
    throw new Error("data_merge_shape_mismatch")
  }
  if (operation === "deduplicate") {
    const source = arrayArg(args), path = pathArg(args), seen = new Set<string>()
    return source.filter((item) => {
      const key = JSON.stringify(readPath(item, path))
      if (seen.has(key)) return false
      seen.add(key); return true
    })
  }
  if (operation === "sort") {
    const source = [...arrayArg(args)], path = pathArg(args), direction = args.direction === "desc" ? -1 : 1
    return source.sort((left, right) => direction * compare(readPath(left, path), readPath(right, path)))
  }
  if (operation === "filter") {
    const source = arrayArg(args), path = pathArg(args), expected = args.equals
    return source.filter((item) => JSON.stringify(readPath(item, path)) === JSON.stringify(expected))
  }
  if (operation === "map") {
    const source = arrayArg(args), path = pathArg(args)
    return source.map((item) => readPath(item, path))
  }
  if (operation === "transform") {
    const source = args.source
    if (args.mode === "assemble") return assembleValue(source ?? null, args.paths ?? null)
    if (args.mode === "entries" && source && typeof source === "object" && !Array.isArray(source)) {
      return Object.entries(source).map(([key, value]) => ({ key, value }))
    }
    if (args.mode === "object" && Array.isArray(source)) {
      const result: Record<string, JsonValue> = Object.create(null)
      for (const item of source) {
        if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.key !== "string" || !("value" in item)) throw new Error("data_entries_required")
        result[item.key] = item.value
      }
      return result
    }
    throw new Error("data_transform_mode_invalid")
  }
  throw new Error("data_operation_unsupported")
}
