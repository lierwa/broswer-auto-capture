import { z } from "zod"
import type { JsonValue, NodeCapabilityResult } from "@browser-capture/contracts"
import { executeDataOperation } from "./data.js"
import type { CapabilityNodeInvocation } from "./types.js"

const inputNameSchema = z.string().regex(/^[a-z][A-Za-z0-9_-]{0,63}$/)
export const dataCapabilityConfigSchema = z.object({
  operation: z.enum(["extract", "assign", "transform", "filter", "map", "deduplicate", "sort", "merge", "count"]),
  arguments: z.record(inputNameSchema, inputNameSchema),
}).strict()

/** 运行时只内建无外部副作用的数据能力；其他能力必须由宿主注册。 */
export function executeBuiltinCapability(invocation: CapabilityNodeInvocation): NodeCapabilityResult | null {
  if (invocation.node.capability.name !== "data.transform" || invocation.node.capability.version !== 1) return null
  const config = dataCapabilityConfigSchema.parse(invocation.config)
  const arguments_: Record<string, JsonValue> = {}
  for (const [name, source] of Object.entries(config.arguments)) {
    if (!Object.hasOwn(invocation.input, source)) throw new Error("data_capability_input_missing")
    arguments_[name] = invocation.input[source]!
  }
  return { outcome: "success", output: executeDataOperation(config.operation, arguments_) }
}
