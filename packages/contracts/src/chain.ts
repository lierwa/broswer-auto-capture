import { z } from "zod"
import { taskIdSchema } from "./task.js"

const text = z.string().trim().min(1).max(2000), key = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), id = z.string().uuid()
const target = z.object({ role: z.enum(["link", "button", "textbox", "combobox"]), name: text }).strict()
const base = z.object({ id: key, label: text })
const next = { next: key }
export const captureFieldSchema = z.object({ name: text, source: z.enum(["url", "title", "text_line"]), contains: z.string().max(300),
  after: z.string().max(300), before: z.string().max(300), required: z.boolean() }).strict()
export const actionNodeSchema = z.discriminatedUnion("kind", [
  base.extend({ kind: z.literal("navigate"), ...next, url: z.string().max(4000) }).strict(),
  base.extend({ kind: z.literal("read"), ...next }).strict(),
  base.extend({ kind: z.literal("click"), ...next, target }).strict(),
  base.extend({ kind: z.literal("fill"), ...next, target, value: z.string().max(2000) }).strict(),
  base.extend({ kind: z.literal("press"), ...next, target, key: z.enum(["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"]) }).strict(),
  base.extend({ kind: z.literal("wait"), ...next, text, timeoutMs: z.number().int().min(100).max(10000) }).strict(),
  base.extend({ kind: z.literal("extract_links"), ...next, pathPrefix: z.string().max(1000), pathSuffix: z.string().max(200), titleContains: z.string().max(300) }).strict(),
  base.extend({ kind: z.literal("extract_fields"), ...next, fields: z.array(captureFieldSchema).min(1).max(100) }).strict(),
  base.extend({ kind: z.literal("branch"), text, present: key, absent: key }).strict(),
  base.extend({ kind: z.literal("loop"), maxIterations: z.number().int().min(1).max(100), body: key, exhausted: key }).strict(),
  base.extend({ kind: z.literal("checkpoint"), ...next }).strict(),
  base.extend({ kind: z.literal("derive_missing"), ...next, outputField: text, ruleIndex: z.number().int().nonnegative() }).strict(),
  base.extend({ kind: z.literal("llm"), ...next, instruction: text, outputField: text }).strict(),
  base.extend({ kind: z.literal("finish"), reason: text, minRecords: z.number().int().min(1).max(1000) }).strict(),
  base.extend({ kind: z.literal("stop"), reason: text }).strict(),
])
export const actionGraphSchema = z.object({ entry: key, nodes: z.array(actionNodeSchema).min(2).max(80), coverage: text,
  completion: text, maxTransitions: z.number().int().min(2).max(1000) }).strict()
export const chainInputSchema = z.object({ url: z.string().url().max(4000), value: z.string().max(2000) }).strict()
export const explorationDecisionSchema = z.object({ action: z.enum(["command", "compile", "manual_required", "blocked"]),
  reason: text, command: z.object({ type: z.enum(["navigate", "read", "click", "fill", "press", "wait"]), url: z.string().max(4000),
    target: target.nullable(), value: z.string().max(2000) }).strict().nullable(),
  graph: actionGraphSchema.nullable(), sample: chainInputSchema.nullable(), verification: chainInputSchema.nullable(),
}).strict()
export const nodeEvidenceSchema = z.object({ nodeId: key, phase: z.enum(["sample", "verification"]), status: z.enum(["running", "passed", "failed"]),
  at: z.string().datetime(), detail: text, records: z.number().int().nonnegative() }).strict()
export const captureRowSchema = z.object({ stableKey: text, url: z.string().url(), fields: z.record(z.string(), z.string()), missing: z.array(text) }).strict()
export const chainRecordSchema = z.object({ id, taskId: taskIdSchema, executionId: id, planId: id, planVersion: z.number().int().positive(),
  planDigest: z.string().length(64), stepId: key, version: z.number().int().positive(), sequence: z.number().int().nonnegative(),
  status: z.enum(["exploring", "compiled", "validating", "verified", "failed", "budget_exceeded", "manual_required", "cancelled", "interrupted"]),
  reason: text, failureCode: text.nullable().default(null), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), graph: actionGraphSchema.nullable(),
  sample: chainInputSchema.nullable(), verification: chainInputSchema.nullable(), sampleRows: z.array(captureRowSchema).max(1000), verificationRows: z.array(captureRowSchema).max(1000),
  observations: z.array(z.object({ url: z.string().url(), digest: z.string().length(64), at: z.string().datetime() }).strict()).max(100),
  decisions: z.array(z.object({ action: explorationDecisionSchema.shape.action, reason: text, commandType: text.nullable() }).strict()).default([]),
  validationOutcomes: z.array(z.object({ phase: z.enum(["sample", "verification"]), termination: text, bounded: z.boolean(), rows: z.number().int().nonnegative() }).strict()).default([]),
  events: z.array(nodeEvidenceSchema).max(5000), consumed: z.object({ commands: z.number().int().nonnegative(), modelCalls: z.number().int().nonnegative(), elapsedMs: z.number().int().nonnegative() }).strict(),
  audits: z.array(z.object({ purpose: z.enum(["exploration", "explicit_llm"]), nodeId: key.nullable(), phase: z.enum(["exploration", "sample", "verification"]),
    model: text, effort: text, invocations: z.number().int().nonnegative().nullable(), reportedModel: text.nullable(), reportedEffort: text.nullable(),
    status: z.enum(["intended", "completed", "interrupted", "failed"]) }).strict()),
}).strict()
export const chainStateSchema = z.object({ taskId: taskIdSchema, taskSequence: z.number().int().nonnegative(), records: z.array(chainRecordSchema), staleIds: z.array(id),
  plans: z.array(z.object({ id, version: z.number().int().positive(), steps: z.array(z.object({ id: key, title: text })) })) }).strict()
export type ActionGraph = z.infer<typeof actionGraphSchema>
export type ActionNode = z.infer<typeof actionNodeSchema>
export type ChainInput = z.infer<typeof chainInputSchema>
export type CaptureRow = z.infer<typeof captureRowSchema>
export type ChainRecord = z.infer<typeof chainRecordSchema>
export type ChainState = z.infer<typeof chainStateSchema>
export type ExplorationDecision = z.infer<typeof explorationDecisionSchema>
