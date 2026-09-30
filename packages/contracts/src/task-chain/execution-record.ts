import { z } from "zod"
import { countSchema, keySchema, textSchema } from "./common.js"
import { jsonValueSchema } from "./value.js"

export const NODE_VALUE_RECORD_BYTES = 16 * 1024
export const NODE_EXECUTION_RECORD_BYTES = 64 * 1024
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength

/** WHY：记录是否存在与 JSON 的 null/false/0/空串分开；脱敏、限额不能伪装成真实空值。 */
export const nodeValueRecordSchema = z.object({
  status: z.enum(["recorded", "redacted", "truncated", "missing"]),
  value: jsonValueSchema.optional(),
  reason: z.enum(["sensitive_fields", "raw_source", "unsupported_capability",
    "value_size_limit", "event_size_limit"]).optional(),
}).strict().superRefine((record, context) => {
  const hasValue = Object.hasOwn(record, "value")
  if (record.status === "recorded" && !hasValue) context.addIssue({ code: "custom", message: "recorded_value_required" })
  if (["missing", "truncated"].includes(record.status) && hasValue) context.addIssue({ code: "custom", message: "unavailable_value_forbidden" })
  if (hasValue && byteLength(record.value) > NODE_VALUE_RECORD_BYTES) context.addIssue({ code: "custom", message: "record_value_size_limit" })
})
export const nodeLoopRecordSchema = z.object({
  index: countSchema, activeStableKey: textSchema.nullable(), completedStableKeysCount: countSchema,
  total: countSchema.optional(),
  exitReason: z.enum(["condition_false", "stop_when", "collection_exhausted", "iteration_limit"]).optional(),
}).strict()
export const nodeExecutionRecordSchema = z.object({
  input: nodeValueRecordSchema.optional(), output: nodeValueRecordSchema.optional(), loop: nodeLoopRecordSchema.optional(),
  loops: z.array(z.object({ nodeId: keySchema, index: countSchema, stableKey: textSchema }).strict()).optional(),
}).strict().refine((record) => byteLength(record) <= NODE_EXECUTION_RECORD_BYTES, "execution_record_size_limit")

export type NodeValueRecord = z.infer<typeof nodeValueRecordSchema>
export type NodeLoopRecord = z.infer<typeof nodeLoopRecordSchema>
export type NodeExecutionRecord = z.infer<typeof nodeExecutionRecordSchema>
