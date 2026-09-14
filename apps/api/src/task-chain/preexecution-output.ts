import { z } from "zod"
import {
  jsonValueSchema, parseTaskValue, taskDataContractSchema,
  type JsonValue, type TaskDataContract, type ValueSchema,
} from "@browser-capture/contracts"

const segment = z.union([
  z.string().min(1).max(200).refine((value) => !["__proto__", "constructor", "prototype"].includes(value)),
  z.number().int().nonnegative().max(10_000),
])
export const outputPathSchema = z.array(segment).max(32)
export const recordOutputInputSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: outputPathSchema, value: jsonValueSchema }).strict(),
  z.object({ op: z.literal("append"), path: outputPathSchema, items: z.array(jsonValueSchema).min(1).max(1000) }).strict(),
])
export const finishInputSchema = z.object({}).strict()

export const outputIssueSchema = z.object({ path: outputPathSchema, expected: z.string(), received: z.string(), message: z.string() }).strict()
export const outputFailureSchema = z.object({ ok: z.literal(false), code: z.string(), retryable: z.boolean(),
  issues: z.array(outputIssueSchema).min(1), pendingPaths: z.array(z.string()), example: jsonValueSchema }).strict()
export type OutputFailure = z.infer<typeof outputFailureSchema>
export type RecordOutputInput = z.infer<typeof recordOutputInputSchema>
export type OutputIssue = z.infer<typeof outputIssueSchema>

export type RecordOutputSuccess = Readonly<{ ok: true; writeId: string; path: (string | number)[];
  itemCount: number; pendingPaths: string[] }>
export type RecordOutputAttempt = Readonly<{
  response: RecordOutputSuccess | OutputFailure
  operation?: RecordOutputInput
  value?: JsonValue
}>
export type FinishAttempt = Readonly<{ response: Readonly<{ ok: true; accepted: true; pendingPaths: [] }> | OutputFailure;
  value?: JsonValue }>

type TargetSchema = ValueSchema | null

export class PreexecutionOutputAccumulator {
  readonly contract: TaskDataContract
  private value: JsonValue | undefined

  constructor(rawContract: unknown) {
    this.contract = taskDataContractSchema.parse(rawContract)
    this.value = this.contract.schema.type === "object" ? {}
      : this.contract.schema.type === "array" ? [] : undefined
  }

  record(raw: unknown, writeId: string): RecordOutputAttempt {
    const parsed = recordOutputInputSchema.safeParse(raw)
    if (!parsed.success) return { response: normalizeToolInputFailure(parsed.error, raw,
      recordExample(this.contract), this.pendingPaths()) }
    const operation = parsed.data
    let target: TargetSchema
    try { target = schemaAt(this.contract.schema, operation.path) }
    catch { return { response: pathFailure(operation.path, this.contract) } }
    const checked = operation.op === "set"
      ? validateSet(target, operation.value, operation.path, this.contract)
      : validateAppend(target, this.value, operation, this.contract)
    if (!checked.ok) return { response: mergePending(checked.failure, this.pendingPaths()) }
    let next: JsonValue
    try { next = writeAt(this.value, this.contract.schema, operation.path, checked.value) }
    catch (error) {
      const failure = semanticFailure(operation.path, "当前 accumulator 中可连续写入的合同路径", displayPath(operation.path),
        error instanceof Error ? error.message : "输出路径无法写入", this.contract, operation.path)
      return { response: mergePending(failure, this.pendingPaths()) }
    }
    this.value = next
    return { operation, value: structuredClone(next), response: { ok: true, writeId,
      path: [...operation.path], itemCount: operation.op === "append" ? operation.items.length : 1,
      pendingPaths: this.pendingPaths() } }
  }

  finish(raw: unknown): FinishAttempt {
    const parsed = finishInputSchema.safeParse(raw)
    if (!parsed.success) return { response: normalizeToolInputFailure(parsed.error, raw, {}, this.pendingPaths()) }
    const checked = validateComplete(this.contract, this.value)
    if (!checked.ok) return { response: checked.failure }
    return { value: checked.value, response: { ok: true, accepted: true, pendingPaths: [] } }
  }

  snapshot() { return this.value === undefined ? undefined : structuredClone(this.value) }

  pendingPaths() {
    const checked = validateComplete(this.contract, this.value)
    return checked.ok ? [] : checked.failure.pendingPaths
  }
}

function validateSet(target: TargetSchema, value: JsonValue, path: (string | number)[], contract: TaskDataContract) {
  try {
    const parsed = target === null ? jsonValueSchema.parse(value) : parseTaskValue(subContract(target), value)
    return { ok: true as const, value: parsed }
  } catch (error) {
    return { ok: false as const, failure: validationFailure("output_validation_failed", error, value, contract, path) }
  }
}

function validateAppend(target: TargetSchema, root: JsonValue | undefined, operation: Extract<RecordOutputInput, { op: "append" }>,
  contract: TaskDataContract) {
  if (!target || target.type !== "array") return { ok: false as const, failure: semanticFailure(operation.path,
    "array", target ? schemaLabel(target) : "dynamic json", "append 只能写入数组字段", contract, operation.path) }
  const existing = readLoose(root, operation.path)
  if (existing !== undefined && !Array.isArray(existing)) return { ok: false as const, failure: semanticFailure(operation.path,
    "array", valueType(existing), "目标路径当前不是数组", contract, operation.path) }
  const items: JsonValue[] = []
  try { for (const item of operation.items) items.push(parseTaskValue(subContract(target.items), item)) }
  catch (error) { return { ok: false as const, failure: validationFailure("output_validation_failed", error,
    operation.items, contract, [...operation.path, 0]) } }
  const value = [...((existing as JsonValue[] | undefined) ?? []), ...items]
  if (target.maxItems !== undefined && value.length > target.maxItems) return { ok: false as const, failure: semanticFailure(
    operation.path, `array(maxItems=${target.maxItems})`, `array(${value.length})`, "追加后超过合同允许数量", contract, operation.path) }
  return { ok: true as const, value }
}

function validateComplete(contract: TaskDataContract, value: JsonValue | undefined) {
  try { return { ok: true as const, value: parseTaskValue(contract, value) } }
  catch (error) { return { ok: false as const,
    failure: validationFailure("output_validation_failed", error, value, contract) } }
}

function validationFailure(code: string, error: unknown, value: unknown, contract: TaskDataContract,
  prefix: (string | number)[] = []): OutputFailure {
  const zodIssues = error instanceof z.ZodError ? error.issues : []
  const issues = zodIssues.length ? zodIssues.map((issue) => normalizeIssue(issue, value, contract, prefix))
    : [{ path: prefix, expected: schemaLabel(schemaAtSafe(contract.schema, prefix)), received: valueType(value),
      message: error instanceof Error ? error.message : "输出不符合合同" }]
  const pendingPaths = uniquePaths(issues.map((issue) => issue.path))
  return { ok: false, code, retryable: true, issues, pendingPaths,
    example: recordExample(contract, issues[0]?.path ?? prefix) }
}

function normalizeIssue(issue: z.core.$ZodIssue, value: unknown, contract: TaskDataContract,
  prefix: (string | number)[]): OutputIssue {
  const relative = issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number")
  const path = [...prefix, ...relative], received = readLoose(value, relative)
  const expected = schemaLabel(schemaAtSafe(contract.schema, path))
  const message = received === undefined ? `${displayPath(path)} 缺少必填值`
    : `${displayPath(path)} 应为 ${expected}，实际为 ${valueType(received)}：${issue.message}`
  return { path, expected, received: valueType(received), message }
}

export function normalizeToolInputFailure(error: z.ZodError, raw: unknown, example: JsonValue,
  pendingPaths: string[] = [], expected = "record_output/finish 的合法参数"): OutputFailure {
  const issues = error.issues.map((issue) => {
    const path = issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    return { path, expected, received: valueType(readLoose(raw, path)), message: issue.message }
  })
  return { ok: false, code: "tool_input_invalid", retryable: true, issues, pendingPaths, example }
}

function pathFailure(path: (string | number)[], contract: TaskDataContract): OutputFailure {
  return semanticFailure(path, "合同中已声明的路径", "unknown path", `${displayPath(path)} 不存在于输出合同`, contract)
}

function semanticFailure(path: (string | number)[], expected: string, received: string, message: string,
  contract: TaskDataContract, examplePath?: (string | number)[]): OutputFailure {
  return { ok: false, code: "output_validation_failed", retryable: true,
    issues: [{ path, expected, received, message }], pendingPaths: [displayPath(path)],
    example: recordExample(contract, examplePath) }
}

function schemaAt(schema: ValueSchema, path: (string | number)[]): TargetSchema {
  let current: TargetSchema = schema
  for (const [index, part] of path.entries()) {
    if (current === null) throw new Error("output_path_unknown")
    if (current.type === "object" && typeof part === "string") {
      const child: ValueSchema | undefined = current.properties[part]
      if (!child && !current.additionalProperties) throw new Error("output_path_unknown")
      current = child ?? null
    } else if (current.type === "array" && typeof part === "number") current = current.items
    else throw new Error(`output_path_invalid:${index}`)
  }
  return current
}

function schemaAtSafe(schema: ValueSchema, path: (string | number)[]): TargetSchema {
  try { return schemaAt(schema, path) } catch { return null }
}

function writeAt(root: JsonValue | undefined, schema: ValueSchema, path: (string | number)[], value: JsonValue): JsonValue {
  if (!path.length) return structuredClone(value)
  const [part, ...rest] = path
  if (schema.type === "object" && typeof part === "string") {
    const result = root && !Array.isArray(root) && typeof root === "object" ? structuredClone(root) : {}
    const child = schema.properties[part]
    if (!child && rest.length) throw new Error("output_path_unknown")
    result[part] = child ? writeAt(result[part], child, rest, value) : structuredClone(value)
    return result
  }
  if (schema.type === "array" && typeof part === "number") {
    const result = Array.isArray(root) ? structuredClone(root) : []
    if (part > result.length) throw new Error("output_array_sparse_write")
    result[part] = writeAt(result[part], schema.items, rest, value)
    return result
  }
  throw new Error("output_path_invalid")
}

function readLoose(root: unknown, path: readonly (string | number)[]) {
  let current = root
  for (const part of path) {
    if (typeof part === "number" && Array.isArray(current)) current = current[part]
    else if (typeof part === "string" && current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part]
    } else return undefined
  }
  return current
}

function subContract(schema: ValueSchema): TaskDataContract {
  return { id: "preexecution-field", version: 1, dialect: "bat-value-schema/v1", schema }
}

function schemaLabel(schema: TargetSchema) {
  if (schema === null) return "json"
  if (schema.type === "string" && schema.enum) return `string(${schema.enum.join(" | ")})`
  return schema.type
}

function valueType(value: unknown) {
  if (value === undefined) return "missing"
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "number" && Number.isInteger(value)) return "integer"
  return typeof value
}

function displayPath(path: readonly (string | number)[]) {
  return path.length ? path.map((part, index) => typeof part === "number" ? `[${part}]` : `${index ? "." : ""}${part}`).join("") : "$"
}

function uniquePaths(paths: readonly (readonly (string | number)[])[]) {
  return [...new Set(paths.map(displayPath))]
}

function mergePending(failure: OutputFailure, pendingPaths: string[]): OutputFailure {
  return { ...failure, pendingPaths: [...new Set([...failure.pendingPaths, ...pendingPaths])] }
}

function exampleValue(schema: TargetSchema): JsonValue {
  if (schema === null) return "example"
  if (schema.type === "null") return null
  if (schema.type === "boolean") return true
  if (schema.type === "string") return schema.enum?.[0] ?? "example"
  if (schema.type === "number" || schema.type === "integer") return schema.minimum ?? 0
  if (schema.type === "array") return [exampleValue(schema.items)]
  if (schema.type !== "object") throw new Error("unsupported_value_schema")
  return Object.fromEntries(schema.required.map((key) => [key, exampleValue(schema.properties[key]!)]))
}

function firstPath(schema: ValueSchema): (string | number)[] {
  if (schema.type !== "object") return []
  const key = schema.required[0] ?? Object.keys(schema.properties)[0]
  return key ? [key] : []
}

export function recordExample(contract: TaskDataContract, preferred?: (string | number)[]): JsonValue {
  const path = preferred && schemaAtSafe(contract.schema, preferred) !== null ? preferred : firstPath(contract.schema)
  const schema = schemaAtSafe(contract.schema, path)
  return schema?.type === "array" ? { op: "append", path, items: [exampleValue(schema.items)] }
    : { op: "set", path, value: exampleValue(schema) }
}

export function describeOutputContract(contract: TaskDataContract, goal: string) {
  const lines: string[] = []
  const visit = (schema: ValueSchema, path: (string | number)[], required: boolean) => {
    lines.push(`${displayPath(path)}: ${schemaLabel(schema)}; ${required ? "required" : "optional"}`)
    if (schema.type === "object") for (const [key, child] of Object.entries(schema.properties)) {
      if (lines.length >= 60) break
      visit(child, [...path, key], schema.required.includes(key))
    }
  }
  visit(contract.schema, [], true)
  return `业务目标：${goal}\n输出合同：\n${lines.join("\n")}\n合法调用示例：${JSON.stringify(recordExample(contract))}`
}
