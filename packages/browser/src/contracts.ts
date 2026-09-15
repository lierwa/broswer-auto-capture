import { z } from "zod"

export const browserGrantLimits = { maxCommands: 3850, timeoutMs: 1_440_000 } as const

const cssSelectorSchema = z.string().trim().min(1).max(1000)
  .refine((value) => !/:has-text\s*\(|:text(?:-is)?\s*\(|:visible\b|:contains\s*\(/i.test(value), "unsupported_selector_syntax")
  .describe("浏览器标准 CSS 选择器；不支持 Playwright/jQuery 的 :has-text、:text、:visible 或 :contains 伪选择器。")
export const readTargetSchema = z.object({ selector: cssSelectorSchema
  .refine((value) => !/@e\d+|password|token|cookie|secret|captcha|one.time.code/i.test(value), "unsafe_or_temporary_target"),
  maxItems: z.number().int().min(1).max(300).default(100) }).strict()

const id = z.string().min(1).max(120)
export const sessionIdSchema = z.string().regex(/^[a-z]{4}$/)
export const humanWaitReasonSchema = z.enum(["login", "captcha", "confirmation", "access"])
const browserPurposeSchema = z.enum(["exploration", "verification", "replay"])
export const grantSchema = z.object({
  taskId: id, runId: z.string().uuid(), requirementVersion: z.number().int().positive(),
  ownerId: z.string().uuid().optional(),
  browserInstanceId: z.string().min(1).max(200).optional(),
  purpose: browserPurposeSchema,
  allowedOrigins: z.array(z.string().url().refine((value) => {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && url.origin === value
  })).max(64),
  actions: z.array(z.enum(["navigate", "observe", "click", "hover", "fill", "press", "select", "tabs",
    "tab_open", "tab_select", "tab_close", "upload", "download", "page", "read", "follow", "request_help"])).min(1),
  maxCommands: z.number().int().min(1).max(browserGrantLimits.maxCommands),
  timeoutMs: z.number().int().min(1000).max(browserGrantLimits.timeoutMs),
}).strict()
export type BrowserGrant = z.infer<typeof grantSchema>
export type HumanWaitReason = z.infer<typeof humanWaitReasonSchema>
export type HumanWaitStatus = "waiting" | "completed" | "cancelled" | "timed_out" | "disabled" | "failed"
export interface BrowserHelpState {
  id: string; reason: HumanWaitReason; status: HumanWaitStatus; prompt: string;
  origin: string | null; requestedAt: string; resolvedAt: string | null;
}
export type BrowserHelpObserver = (state: BrowserHelpState) => void | Promise<void>
export const semanticTargetSchema = z.object({ role: z.enum(["link", "button", "textbox", "combobox"]),
  name: z.string().min(1).max(300), fallbackName: z.string().min(4).max(300).optional(),
  occurrence: z.number().int().nonnegative().max(99).optional() }).strict()
export const selectorTargetSchema = z.object({ selector: cssSelectorSchema
  .refine((value) => !/@e\d+/.test(value), "temporary_target_ref") }).strict()
export const targetSchema = z.union([semanticTargetSchema, selectorTargetSchema])
const tabIdSchema = z.number().int().nonnegative()
const pathSchema = z.string().trim().min(1).max(32_767)
export const commandSchema = z.discriminatedUnion("type", [
  readTargetSchema.extend({ type: z.literal("read") }).strict(),
  z.object({ type: z.literal("page") }).strict(),
  z.object({ type: z.literal("follow"), url: z.string().url().max(4000) }).strict(),
  z.object({ type: z.literal("navigate"), url: z.string().url().max(4000),
    captureNetworkEvidence: z.boolean().optional(), reuseOpenTab: z.boolean().optional() }).strict(),
  z.object({ type: z.literal("observe"), until: z.object({ text: z.string().min(1).max(300), timeoutMs: z.number().int().min(100).max(10_000) }).strict().optional() }).strict(),
  z.object({ type: z.literal("tabs") }).strict(),
  z.object({ type: z.literal("click"), target: targetSchema, dispatch: z.literal("dom").optional()
    .describe("普通指针或键盘激活已确认无效果后，对已唯一确认的语义或标准 CSS 目标使用一次受控 DOM 激活。") }).strict(),
  z.object({ type: z.literal("hover"), target: targetSchema }).strict(),
  z.object({ type: z.literal("fill"), target: targetSchema, value: z.string().max(10_000) }).strict(),
  z.object({ type: z.literal("press"), target: targetSchema.optional(),
    key: z.enum(["Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Home", "End"]) }).strict(),
  z.object({ type: z.literal("select"), target: targetSchema, values: z.array(z.string().max(10_000)).min(1).max(100) }).strict(),
  z.object({ type: z.literal("tab_open"), url: z.string().url().max(4000), background: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("tab_select"), tabId: tabIdSchema }).strict(),
  z.object({ type: z.literal("tab_close"), tabId: tabIdSchema }).strict(),
  z.object({ type: z.literal("upload"), target: targetSchema, files: z.array(pathSchema).min(1).max(20),
    mode: z.enum(["input", "drop"]).default("input") }).strict(),
  z.object({ type: z.literal("download"), target: targetSchema.optional(), out: pathSchema,
    overwrite: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("request_help"), reason: humanWaitReasonSchema,
    prompt: z.string().trim().min(1).max(2000).optional(), timeoutMs: z.number().int().min(1000).max(1_800_000).optional() }).strict(),
])
export type BrowserCommand = z.infer<typeof commandSchema>
export type BrowserFailure = "busy" | "cleanup_required" | "invalid_response" | "command_failed" | "cancelled" | "budget_exceeded" | "origin_denied" | "permission_denied" | "manual_required" | "target_missing" | "target_ambiguous" | "session_closed" | "readiness_timeout" | "capability_unsupported"
  | "authentication_required" | "verification_required" | "rate_limited" | "access_denied" | "transient_failure"
export interface BrowserFailureEvidence {
  origin?: string
  observedOrigin?: string
  httpStatus?: number
  retryAt?: number
}
export class BrowserError extends Error {
  constructor(readonly code: BrowserFailure, readonly evidence: BrowserFailureEvidence = {}) {
    super(`浏览器操作未完成：${code}`)
  }
}
export interface CommandResult { stdout: string; exitCode: number }
export type CommandExecutor = (args: readonly string[], signal?: AbortSignal) => Promise<CommandResult>
export const browserInspectionSchema = z.object({
  sessionId: sessionIdSchema, tabId: tabIdSchema, url: z.string().min(1).max(4000), text: z.string(),
  truncated: z.boolean(), observedAt: z.string().datetime(),
}).strict()
export type BrowserInspection = z.infer<typeof browserInspectionSchema>
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
