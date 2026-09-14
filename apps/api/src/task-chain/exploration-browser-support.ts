import { z } from "zod"
import type { JsonValue, ValueSchema } from "@browser-capture/contracts"
import type { BrowserCommand, BrowserFailure, BrowserGrant } from "@browser-capture/browser"
import { digestJson } from "@browser-capture/runtime"

export const explorationCapabilities: BrowserGrant["actions"] = ["navigate", "observe", "click", "hover", "fill", "press", "select",
  "tabs", "tab_open", "tab_select", "tab_close", "page", "read", "follow", "request_help"]

export function opensAccessCircuit(code: BrowserFailure, command: BrowserCommand["type"]) {
  // WHY：定位歧义、局部读取和动作命令错误可由探索模型在原会话内修正；只有外部访问事实或不确定导航才停止后续访问。
  if ((code === "command_failed" || code === "invalid_response") && (command === "navigate" || command === "follow")) return true
  if (code === "origin_denied") return false
  return ["authentication_required", "verification_required", "rate_limited", "access_denied",
    "transient_failure", "readiness_timeout", "manual_required",
    "cleanup_required", "session_closed"].includes(code)
}

export function grantSignature(grant: BrowserGrant) {
  return digestJson({ taskId: grant.taskId, runId: grant.runId, requirementVersion: grant.requirementVersion,
    ownerId: grant.ownerId ?? null, purpose: grant.purpose, allowedOrigins: grant.allowedOrigins,
    actions: grant.actions, maxCommands: grant.maxCommands, timeoutMs: grant.timeoutMs })
}

export function collectOrigins(values: unknown[]) {
  return [...new Set(collectUrls(values).map((value) => new URL(value).origin))]
}

export function collectUrls(values: unknown[]) {
  const urls = new Set<string>()
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const candidates = [value, ...value.matchAll(/https?:\/\/[^\s\])\]}>"']+/gi)].map((item) => typeof item === "string" ? item : item[0])
      for (const candidate of candidates) {
        try { const url = new URL(candidate); if (["http:", "https:"].includes(url.protocol)) urls.add(url.href) }
        catch { /* 普通任务文本不是 URL。 */ }
      }
      return
    }
    if (Array.isArray(value)) { for (const item of value) visit(item); return }
    if (value && typeof value === "object") for (const item of Object.values(value)) visit(item)
  }
  for (const value of values) visit(value)
  return [...urls].slice(0, 64)
}

export function needsFreshObservation(command: BrowserCommand) {
  return command.type !== "observe" && command.type !== "page" && command.type !== "tabs"
}

export function traceObservation(inspection: { url: string; text: string; truncated: boolean }): JsonValue {
  const text = inspection.text.slice(0, 6000)
  return { url: inspection.url, text,
    truncated: inspection.truncated || text.length < inspection.text.length }
}

export function traceOutput(raw: string | null): JsonValue {
  if (raw === null) return null
  const limited = raw.slice(0, 200000)
  try { return z.json().parse(JSON.parse(limited)) }
  catch { return limited }
}

export function valueJsonSchema(schema: ValueSchema): Record<string, unknown> {
  if (schema.type === "null") return { type: "null" }
  if (schema.type === "boolean") return { type: "boolean" }
  if (schema.type === "string") return { type: "string", ...(schema.enum ? { enum: schema.enum } : {}),
    ...(schema.minLength === undefined ? {} : { minLength: schema.minLength }), ...(schema.maxLength === undefined ? {} : { maxLength: schema.maxLength }) }
  if (schema.type === "number" || schema.type === "integer") return { type: schema.type,
    ...(schema.minimum === undefined ? {} : { minimum: schema.minimum }), ...(schema.maximum === undefined ? {} : { maximum: schema.maximum }) }
  if (schema.type === "array") return { type: "array", items: valueJsonSchema(schema.items),
    ...(schema.minItems === undefined ? {} : { minItems: schema.minItems }), ...(schema.maxItems === undefined ? {} : { maxItems: schema.maxItems }) }
  if (schema.type !== "object") throw new Error("unsupported_value_schema")
  return { type: "object", properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, valueJsonSchema(value)])),
    required: schema.required, additionalProperties: schema.additionalProperties }
}
