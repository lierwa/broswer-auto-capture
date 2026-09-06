import { z } from "zod"

const id = z.string().min(1).max(120)
export const sessionIdSchema = z.string().regex(/^[a-z]{4}$/)
export const grantSchema = z.object({
  taskId: id, runId: z.string().uuid(), requirementVersion: z.number().int().positive(),
  purpose: z.enum(["source_research", "exploration", "verification", "replay", "repair"]),
  allowedOrigins: z.array(z.string().url().refine((value) => {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && url.origin === value
  })).max(64),
  actions: z.array(z.enum(["navigate", "observe", "click", "fill", "press", "page", "follow"])).min(1),
  maxCommands: z.number().int().min(1).max(3850), timeoutMs: z.number().int().min(1000).max(1_440_000),
}).strict()
export type BrowserGrant = z.infer<typeof grantSchema>
export const targetSchema = z.object({ role: z.enum(["link", "button", "textbox", "combobox"]), name: z.string().min(1).max(300) }).strict()
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page") }).strict(),
  z.object({ type: z.literal("follow"), url: z.string().url().max(4000) }).strict(),
  z.object({ type: z.literal("navigate"), url: z.string().url().max(4000) }).strict(),
  z.object({ type: z.literal("observe"), until: z.object({ text: z.string().min(1).max(300), timeoutMs: z.number().int().min(100).max(10_000) }).strict().optional() }).strict(),
  z.object({ type: z.literal("click"), target: targetSchema }).strict(),
  z.object({ type: z.literal("fill"), target: targetSchema, value: z.string().max(10_000) }).strict(),
  z.object({ type: z.literal("press"), target: targetSchema, key: z.enum(["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Home", "End"]) }).strict(),
])
export type BrowserCommand = z.infer<typeof commandSchema>
export type BrowserFailure = "busy" | "cleanup_required" | "invalid_response" | "command_failed" | "cancelled" | "budget_exceeded" | "origin_denied" | "permission_denied" | "manual_required" | "target_missing" | "target_ambiguous" | "session_closed" | "readiness_timeout"
export class BrowserError extends Error {
  constructor(readonly code: BrowserFailure) { super(`浏览器操作未完成：${code}`) }
}
export interface CommandResult { stdout: string; exitCode: number }
export type CommandExecutor = (args: readonly string[], signal?: AbortSignal) => Promise<CommandResult>
export interface BrowserAudit {
  at: string; taskId: string; runId: string; requirementVersion: number; purpose: BrowserGrant["purpose"];
  sessionId: string | null; command: string; argsHash: string; phase: "intended" | "completed" | "failed";
}
export const ownershipSchema = z.object({
  runId: z.string().uuid(), taskId: id, sessionId: sessionIdSchema.nullable(),
  requirementVersion: z.number().int().positive(), purpose: grantSchema.shape.purpose,
  state: z.enum(["opening", "active", "closed", "cleanup_required"]),
}).strict()
export type Ownership = z.infer<typeof ownershipSchema>
