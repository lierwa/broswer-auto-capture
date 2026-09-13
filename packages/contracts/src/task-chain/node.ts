import { z } from "zod"
import { keySchema, textSchema, versionReferenceSchema } from "./common.js"
import { observationConditionSchema, predicateSchema, valueBindingSchema, valuePathSchema, valueWriteSchema } from "./binding.js"
import { taskDataContractSchema } from "./value.js"

export const nodeOutcomeSchema = z.enum([
  "success", "missing", "timeout", "blocked", "human_required", "failed", "cancelled",
  "true", "false", "body", "done", "limit", "partial",
])
export const terminalStatusSchema = z.enum(["completed", "partial", "blocked", "failed", "cancelled"])
export const stableTargetSchema = z.discriminatedUnion("kind", [
  // TRADE-OFF：string 保留历史链原字节可读；新编译链可把 role 与 name 一样绑定到运行输入。
  z.object({ kind: z.literal("semantic"), role: z.union([textSchema, valueBindingSchema]), name: valueBindingSchema,
    fallbackName: valueBindingSchema.optional(), occurrence: valueBindingSchema.optional() }).strict(),
  z.object({ kind: z.literal("locator"), strategy: z.enum(["css", "label", "text", "test_id"]), value: valueBindingSchema }).strict(),
])
export const browserOperationSchema = z.enum([
  "navigate", "click", "hover", "fill", "press", "select", "scroll", "drag", "tab_open", "tab_select", "tab_close", "upload", "download", "wait",
])
const bindings = z.record(keySchema, valueBindingSchema)
const base = z.object({
  id: keySchema, label: textSchema, outcomes: z.array(nodeOutcomeSchema),
  outputContract: taskDataContractSchema, writes: z.array(valueWriteSchema),
}).strict()
export const invocationModeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("once") }).strict(),
  z.object({ mode: z.literal("each"), collection: valueBindingSchema, itemVariable: keySchema,
    stableKeyPath: valuePathSchema, maxItems: z.number().int().positive(),
    onItemFailure: z.enum(["stop", "pause", "continue"]) }).strict(),
])
export const chainNodeSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("browser"), operation: browserOperationSchema, arguments: bindings,
    target: stableTargetSchema.optional(), timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("observe"), scope: z.enum(["page", "target", "tabs", "downloads"]),
    target: stableTargetSchema.optional(), maxItems: z.number().int().min(1).max(300).optional(), stableWhen: observationConditionSchema, timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("data"), operation: z.enum(["extract", "assign", "transform", "filter", "map", "deduplicate", "sort", "merge", "count"]),
    arguments: bindings }).strict(),
  base.extend({ kind: z.literal("condition"), predicate: predicateSchema }).strict(),
  base.extend({ kind: z.literal("loop"), iteration: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("each"), collection: valueBindingSchema, itemVariable: keySchema, stableKeyPath: valuePathSchema }).strict(),
    z.object({ mode: z.literal("while"), condition: predicateSchema }).strict(),
  ]), cursorVariable: keySchema, maxIterations: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("invoke"), chain: versionReferenceSchema, input: valueBindingSchema,
    iteration: invocationModeSchema }).strict(),
  base.extend({ kind: z.literal("human"), reason: z.enum(["login", "captcha", "one_time_code", "confirmation", "permission", "access_restriction", "other"]),
    prompt: textSchema, resumeWhen: observationConditionSchema, timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("llm"), instruction: textSchema, input: valueBindingSchema,
    model: textSchema, timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("checkpoint"), resumeWhen: observationConditionSchema }).strict(),
  base.extend({ kind: z.literal("emit"), name: keySchema, output: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("value"), value: valueBindingSchema }).strict(),
    z.object({ kind: z.literal("artifact"), artifact: valueBindingSchema }).strict(),
  ]), contract: taskDataContractSchema }).strict(),
  base.extend({ kind: z.literal("terminal"), status: terminalStatusSchema, reason: textSchema,
    evidence: z.array(valueBindingSchema).min(1) }).strict(),
])
export type ChainNode = z.infer<typeof chainNodeSchema>
export type NodeOutcome = z.infer<typeof nodeOutcomeSchema>

// WHY：缺失、超时和人工请求是类型化出口，不能因未声明而悄悄按成功继续。
export const requiredNodeOutcomes: Record<ChainNode["kind"], readonly NodeOutcome[]> = {
  browser: ["success", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"],
  observe: ["success", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"],
  data: ["success", "failed"], condition: ["true", "false", "failed"], loop: ["body", "done", "limit", "failed"],
  invoke: ["success", "partial", "blocked", "human_required", "timeout", "failed", "cancelled"],
  human: ["success", "timeout", "blocked", "cancelled"], llm: ["success", "timeout", "failed", "cancelled"],
  checkpoint: ["success", "failed"], emit: ["success", "failed"], terminal: [],
}

/** 只遍历协议内 binding，不把 constant 的业务键误识别为平台指令。 */
export function nodeBindings(node: ChainNode): z.infer<typeof valueBindingSchema>[] {
  const own = node.kind === "browser" || node.kind === "data" ? Object.values(node.arguments)
    : node.kind === "invoke" || node.kind === "llm" ? [node.input]
      : node.kind === "terminal" ? node.evidence : []
  if ((node.kind === "browser" || node.kind === "observe") && node.target) {
    if (node.target.kind === "semantic") {
      if (typeof node.target.role !== "string") own.push(node.target.role)
      own.push(node.target.name)
      if (node.target.occurrence !== undefined) own.push(node.target.occurrence)
    } else own.push(node.target.value)
  }
  if (node.kind === "emit" && node.output.kind === "value") own.push(node.output.value)
  if (node.kind === "emit" && node.output.kind === "artifact") own.push(node.output.artifact)
  if (node.kind === "invoke" && node.iteration.mode === "each") own.push(node.iteration.collection)
  if (node.kind === "loop" && node.iteration.mode === "each") own.push(node.iteration.collection)
  const predicate = node.kind === "condition" ? node.predicate
    : node.kind === "loop" && node.iteration.mode === "while" ? node.iteration.condition : null
  if (predicate) own.push(...predicateBindings(predicate))
  const observation = node.kind === "observe" ? node.stableWhen : node.kind === "human" || node.kind === "checkpoint" ? node.resumeWhen : null
  if (observation?.operator === "equals") own.push(observation.expected)
  return own
}
export function predicateBindings(predicate: z.infer<typeof predicateSchema>) {
  return predicate.operator === "exists" ? [predicate.value] : [predicate.left, predicate.right]
}
