import { z } from "zod"
import { keySchema, textSchema, versionReferenceSchema } from "./common.js"
import { observationConditionSchema, predicateSchema, valueBindingSchema, valuePathSchema, valueWriteSchema } from "./binding.js"
import { jsonValueSchema, taskDataContractSchema } from "./value.js"

export const nodeOutcomeSchema = z.enum([
  "success", "missing", "timeout", "blocked", "human_required", "failed", "cancelled",
  "true", "false", "body", "done", "limit", "partial",
])
export const terminalStatusSchema = z.enum(["completed", "partial", "blocked", "failed", "cancelled"])
export const stableTargetSchema = z.discriminatedUnion("kind", [
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

export const capabilityReferenceSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/),
  version: z.number().int().positive(),
}).strict()
export const modelCallPurposeSchema = z.enum([
  "explicit_llm", "agent", "judge", "workflow_generation", "variable_suggestion", "extract", "output_conversion",
])
const delegatedLlmSchema = z.object({
  capability: capabilityReferenceSchema, config: jsonValueSchema,
  effect: z.enum(["read", "idempotent_write", "external_write"]),
  modelPurposes: z.array(modelCallPurposeSchema.exclude(["explicit_llm"])).min(1),
  maxInvocations: z.number().int().positive(), maxBrowserCommands: z.number().int().nonnegative(),
}).strict()
const humanResumeSchema = z.object({
  reason: z.enum(["login", "captcha", "one_time_code", "confirmation", "permission", "access_restriction", "other"]),
  prompt: textSchema, resumeWhen: observationConditionSchema,
}).strict()
const terminalOutputSchema = z.object({
  name: keySchema,
  output: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("value"), value: valueBindingSchema }).strict(),
    z.object({ kind: z.literal("artifact"), artifact: valueBindingSchema }).strict(),
  ]),
  contract: taskDataContractSchema,
}).strict()
const loopAccumulatorSchema = z.object({
  variable: keySchema, initial: valueBindingSchema, next: valueBindingSchema,
  operation: z.literal("append_unique"), stableKeyPath: valuePathSchema.optional(),
  appendWhen: predicateSchema.optional(),
}).strict()

/** 新链只使用六种稳定控制节点；浏览器和数据动作属于注册能力配置。 */
export const stableChainNodeSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("capability"), capability: capabilityReferenceSchema,
    input: bindings, config: jsonValueSchema, effect: z.enum(["read", "idempotent_write", "external_write"]),
    stableWhen: observationConditionSchema.optional(), human: humanResumeSchema.optional(),
    timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("llm"), instruction: textSchema, input: valueBindingSchema,
    model: textSchema, timeoutMs: z.number().int().positive(), delegate: delegatedLlmSchema.optional() }).strict(),
  base.extend({ kind: z.literal("branch"), predicate: predicateSchema }).strict(),
  base.extend({ kind: z.literal("loop"), iteration: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("each"), collection: valueBindingSchema, itemVariable: keySchema, stableKeyPath: valuePathSchema }).strict(),
    z.object({ mode: z.literal("while"), condition: predicateSchema,
      repeatCondition: predicateSchema.optional() }).strict(),
  ]), cursorVariable: keySchema, maxIterations: z.number().int().positive(),
  body: z.object({ entry: keySchema, exits: z.array(keySchema).min(1) }).strict(),
  accumulators: z.array(loopAccumulatorSchema).default([]), stopWhen: predicateSchema.optional() }).strict(),
  base.extend({ kind: z.literal("invoke"), chain: versionReferenceSchema, input: valueBindingSchema,
    iteration: invocationModeSchema }).strict(),
  base.extend({ kind: z.literal("terminal"), status: terminalStatusSchema, reason: textSchema,
    result: terminalOutputSchema.optional(), evidence: z.array(valueBindingSchema).min(1) }).strict(),
])

/** 仅用于读取历史 v1 链；新编译器不得再产出这些节点。 */
export const legacyChainNodeSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("browser"), operation: browserOperationSchema, arguments: bindings,
    target: stableTargetSchema.optional(), timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("observe"), scope: z.enum(["page", "target", "tabs", "downloads"]),
    target: stableTargetSchema.optional(), maxItems: z.number().int().min(1).max(300).optional(),
    stableWhen: observationConditionSchema, timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("data"), operation: z.enum(["extract", "assign", "transform", "filter", "map", "deduplicate", "sort", "merge", "count"]),
    arguments: bindings }).strict(),
  base.extend({ kind: z.literal("condition"), predicate: predicateSchema }).strict(),
  base.extend({ kind: z.literal("loop"), iteration: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("each"), collection: valueBindingSchema, itemVariable: keySchema, stableKeyPath: valuePathSchema }).strict(),
    z.object({ mode: z.literal("while"), condition: predicateSchema }).strict(),
  ]), cursorVariable: keySchema, maxIterations: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("invoke"), chain: versionReferenceSchema, input: valueBindingSchema,
    iteration: invocationModeSchema }).strict(),
  base.extend({ kind: z.literal("human"), reason: humanResumeSchema.shape.reason,
    prompt: textSchema, resumeWhen: observationConditionSchema, timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("llm"), instruction: textSchema, input: valueBindingSchema,
    model: textSchema, timeoutMs: z.number().int().positive() }).strict(),
  base.extend({ kind: z.literal("checkpoint"), resumeWhen: observationConditionSchema }).strict(),
  base.extend({ kind: z.literal("emit"), name: keySchema, output: terminalOutputSchema.shape.output,
    contract: taskDataContractSchema }).strict(),
  base.extend({ kind: z.literal("terminal"), status: terminalStatusSchema, reason: textSchema,
    evidence: z.array(valueBindingSchema).min(1) }).strict(),
])

export const chainNodeSchema = z.union([stableChainNodeSchema, legacyChainNodeSchema])
export type StableChainNode = z.infer<typeof stableChainNodeSchema>
export type LegacyChainNode = z.infer<typeof legacyChainNodeSchema>
export type ChainNode = StableChainNode | LegacyChainNode
export type NodeOutcome = z.infer<typeof nodeOutcomeSchema>

export const requiredStableNodeOutcomes: Record<StableChainNode["kind"], readonly NodeOutcome[]> = {
  capability: ["success", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"],
  llm: ["success", "timeout", "failed", "cancelled"], branch: ["true", "false", "failed"],
  loop: ["body", "done", "limit", "failed"],
  invoke: ["success", "partial", "blocked", "human_required", "timeout", "failed", "cancelled"], terminal: [],
}
export const requiredLegacyNodeOutcomes: Record<LegacyChainNode["kind"], readonly NodeOutcome[]> = {
  browser: ["success", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"],
  observe: ["success", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"],
  data: ["success", "failed"], condition: ["true", "false", "failed"], loop: ["body", "done", "limit", "failed"],
  invoke: ["success", "partial", "blocked", "human_required", "timeout", "failed", "cancelled"],
  human: ["success", "timeout", "blocked", "cancelled"], llm: ["success", "timeout", "failed", "cancelled"],
  checkpoint: ["success", "failed"], emit: ["success", "failed"], terminal: [],
}
export const requiredNodeOutcomes = { ...requiredLegacyNodeOutcomes, ...requiredStableNodeOutcomes }

/** 只遍历协议内 binding，不把 config 中的任务数据误识别为平台指令。 */
export function nodeBindings(node: ChainNode): z.infer<typeof valueBindingSchema>[] {
  const own = node.kind === "capability" ? Object.values(node.input)
    : node.kind === "browser" || node.kind === "data" ? Object.values(node.arguments)
      : node.kind === "invoke" || node.kind === "llm" ? [node.input]
        : node.kind === "terminal" ? [...node.evidence] : []
  if ((node.kind === "browser" || node.kind === "observe") && node.target) {
    if (node.target.kind === "semantic") {
      if (typeof node.target.role !== "string") own.push(node.target.role)
      own.push(node.target.name)
      if (node.target.fallbackName !== undefined) own.push(node.target.fallbackName)
      if (node.target.occurrence !== undefined) own.push(node.target.occurrence)
    } else own.push(node.target.value)
  }
  if (node.kind === "emit" && node.output.kind === "value") own.push(node.output.value)
  if (node.kind === "emit" && node.output.kind === "artifact") own.push(node.output.artifact)
  if (node.kind === "terminal" && "result" in node && node.result) own.push(node.result.output.kind === "value"
    ? node.result.output.value : node.result.output.artifact)
  if (node.kind === "invoke" && node.iteration.mode === "each") own.push(node.iteration.collection)
  if (node.kind === "loop" && node.iteration.mode === "each") own.push(node.iteration.collection)
  if (node.kind === "loop" && "accumulators" in node) {
    for (const accumulator of node.accumulators) {
      own.push(accumulator.initial, accumulator.next)
      if (accumulator.appendWhen) own.push(...predicateBindings(accumulator.appendWhen))
    }
    if (node.stopWhen) own.push(...predicateBindings(node.stopWhen))
  }
  const predicate = node.kind === "branch" || node.kind === "condition" ? node.predicate
    : node.kind === "loop" && node.iteration.mode === "while" ? node.iteration.condition : null
  if (predicate) own.push(...predicateBindings(predicate))
  if (node.kind === "loop" && node.iteration.mode === "while" && "repeatCondition" in node.iteration
    && node.iteration.repeatCondition) own.push(...predicateBindings(node.iteration.repeatCondition))
  const observation = node.kind === "capability" ? node.stableWhen ?? node.human?.resumeWhen
    : node.kind === "observe" ? node.stableWhen : node.kind === "human" || node.kind === "checkpoint" ? node.resumeWhen : null
  if (observation?.operator === "equals") own.push(observation.expected)
  return own
}

export function predicateBindings(predicate: z.infer<typeof predicateSchema>) {
  if (predicate.operator === "exists") return [predicate.value]
  if (predicate.operator === "array_length_at_least") return [predicate.value, predicate.minimum]
  return [predicate.left, predicate.right]
}
