import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs"
import path from "node:path"
import type { AuthoringProgressEvent } from "@browser-capture/contracts"
import type { ModelCallReport } from "@browser-capture/runtime"
import { z } from "zod"
import { authorResultIssues } from "./author-result-diagnostics.js"
import { runnerCleanupCodeSchema, retainedConnectionSchema, type RunnerCleanupReport, type RuntimePrimaryOutcome } from "./cleanup.js"

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const targetStateSchema = z.object({
  "aria-expanded": z.boolean().optional(), "aria-checked": z.boolean().optional(),
  "aria-selected": z.boolean().optional(), "aria-disabled": z.boolean().optional(),
  checked: z.boolean().optional(), selected: z.boolean().optional(), disabled: z.boolean().optional(),
  focused: z.boolean().optional(),
}).strict()
const pageIdentitySchema = z.object({ sessionDigest: hashSchema, targetDigest: hashSchema,
  documentDigest: hashSchema, urlDigest: hashSchema }).strict()
const validationTargetSchema = z.object({ sessionDigest: hashSchema, targetDigest: hashSchema,
  documentDigest: hashSchema, backendDigest: hashSchema }).strict()
const runtimeCheckSchema = z.object({
  kind: z.enum(["url", "url_digest", "title", "target_value", "target_text", "target_state",
    "target_in_view", "target_visible", "scroll_position", "visible_overlays", "media_playback", "focused_element", "read_fields"]),
  attempts: z.number().int().min(1).max(100), expected: targetStateSchema.optional(), actual: targetStateSchema.optional(),
}).strict().superRefine((value, context) => {
  const values = value.expected !== undefined || value.actual !== undefined
  if (values !== (value.kind === "target_state") || (value.expected === undefined) !== (value.actual === undefined)) {
    context.addIssue({ code: "custom", message: "only target state may expose fixed boolean values" })
  }
})
const runtimeActionFailureSchema = z.object({ phase: z.literal("runtime_action_failure"), status: z.literal("failed"),
  actionRef: z.string().regex(/^[A-Za-z0-9._:-]{1,256}$/), actionName: z.enum([
    "navigate", "go_back", "wait", "click", "input", "scroll", "send_keys",
    "dropdown_options", "select_dropdown", "bat_scroll_to", "bat_wait_for",
  ]), errorCode: z.string().regex(/^ordinary_postcondition_[a-z_]{1,140}$/), dispatchCount: z.literal(1),
  check: runtimeCheckSchema, beforePage: pageIdentitySchema.nullable(), afterPage: pageIdentitySchema.nullable(),
  validationTarget: validationTargetSchema.nullable(), eventTarget: z.object({
    relation: z.enum(["self", "descendant", "composed"]), trusted: z.boolean(),
    eventCount: z.number().int().min(1).max(1000),
    targetKind: z.enum(["element", "shadow_root", "document", "window", "other"]),
    targetTag: z.string().regex(/^[A-Za-z0-9-]{1,40}$/).nullable(),
    targetRef: z.string().regex(/^n-[0-9]{1,12}$/).nullable(),
  }).strict().nullable(),
}).strict()

const attachedStartupSchema = z.object({
  phase: z.literal("attached_startup"), status: z.enum(["started", "completed", "failed"]),
  stage: z.enum(["reserve", "sdk_connect", "task_target_prepare", "task_target_focus"]),
  causes: z.array(z.object({
    errorKind: z.enum(["timeout_error", "os_error", "runtime_error", "value_error", "cancelled_error", "other_error"]),
    code: z.enum(["external_error", "hybrid_attached_window_endpoint_invalid", "hybrid_attached_window_endpoint_required",
      "hybrid_attached_window_lease_missing", "hybrid_attached_window_owner_mismatch", "hybrid_attached_window_profile_changed",
      "hybrid_attached_window_endpoint_changed", "hybrid_attached_window_busy", "hybrid_attached_window_target_missing",
      "hybrid_attached_window_sdk_mismatch", "hybrid_attached_window_scope_busy", "hybrid_attached_window_cdp_unavailable",
      "hybrid_attached_window_storage_state_disallowed", "hybrid_managed_window_resume_unavailable"]),
    locations: z.array(z.object({ source: z.enum(["bat_attached_window", "bat_target_scope", "sdk_browser_session",
      "sdk_session_manager", "sdk_cdp_client"]), line: z.number().int().min(1).max(1000000) }).strict()).max(3),
  }).strict()).min(1).max(4).optional(),
}).strict().superRefine((event, context) => {
  if ((event.status === "failed") !== (event.causes !== undefined)) {
    context.addIssue({ code: "custom", message: "startup causes belong only to failed stages" })
  }
})

const actionNameSchema = z.enum([
  "bat_inspect_dom", "bat_read_fields", "bat_request_human", "bat_scroll_to", "bat_summarize", "bat_validate_selection", "bat_wait_for", "click", "close", "done",
  "dropdown_options", "extract", "find_elements", "find_text", "go_back", "input", "navigate", "save_as_pdf",
  "scroll", "search", "search_page", "select_dropdown", "send_keys", "switch", "wait",
])
const progressPhaseSchema = z.enum(["author", "before_action", "after_step", "dispatch"])
const pythonEventSchema = z.object({
  phase: z.enum(["author", "before_action", "after_step", "dispatch", "before_action_detail", "author_transport"]),
  status: z.enum(["started", "completed", "failed", "cancelled"]),
  stage: z.enum(["live_current_page", "live_target_before", "live_document_session", "live_document_root",
    "live_target_after", "live_document_other", "observation_title", "observation_url"]).optional(),
  errorKind: z.enum(["timeout_error", "os_error", "runtime_error", "value_error", "other_error"]).optional(),
  code: z.enum(["serialize_started", "serialize_completed", "serialize_failed",
    "write_started", "write_completed", "write_failed"]).optional(),
  actionName: actionNameSchema.optional(),
  stepNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  selector: z.string().min(1).max(2000).optional(),
  queryOutcome: z.enum(["matched", "no_match", "invalid_selector", "error", "unavailable"]).optional(),
  matchCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  contextOutcome: z.enum(["enriched", "failed"]).optional(),
  contextCount: z.number().int().nonnegative().max(20).optional(),
  outputPath: z.array(z.union([z.string().min(1).max(2000), z.number().int().nonnegative()])).max(32).optional(),
  container: z.string().min(1).max(2000).optional(),
  readOutcome: z.enum(["succeeded", "failed", "unavailable"]).optional(),
  readError: z.string().min(1).max(2000).optional(),
}).strict().superRefine((event, context) => {
  if (event.phase === "author_transport") {
    const expected = event.code?.endsWith("_started") ? "started"
      : event.code?.endsWith("_completed") ? "completed" : "failed"
    if (!event.code || event.status !== expected || Object.keys(event).some((key) => !["phase", "status", "code"].includes(key))) {
      context.addIssue({ code: "custom", message: "author transport metadata must be fixed" })
    }
    return
  }
  if (event.phase === "before_action_detail") {
    if (event.status !== "failed" || !event.actionName || event.stepNumber === undefined || !event.stage
      || !event.errorKind || Object.keys(event).some((key) => !["phase", "status", "actionName", "stepNumber", "stage", "errorKind"].includes(key))) {
      context.addIssue({ code: "custom", message: "before action detail metadata must be fixed" })
    }
    return
  }
  if (event.stage !== undefined || event.errorKind !== undefined || event.code !== undefined) {
    context.addIssue({ code: "custom", message: "fixed stage metadata belongs to its phase" })
  }
  if ((event.actionName === undefined) !== (event.stepNumber === undefined)) {
    context.addIssue({ code: "custom", message: "action metadata must be complete" })
  }
  if ((event.selector !== undefined || event.queryOutcome !== undefined || event.matchCount !== undefined
    || event.contextOutcome !== undefined || event.contextCount !== undefined)
    && event.actionName !== "find_elements") {
    context.addIssue({ code: "custom", message: "query metadata belongs to find_elements" })
  }
  if (event.contextCount !== undefined && event.contextOutcome !== "enriched") {
    context.addIssue({ code: "custom", message: "context count requires enriched outcome" })
  }
  if ((event.outputPath !== undefined || event.container !== undefined || event.readOutcome !== undefined
    || event.readError !== undefined) && event.actionName !== "bat_read_fields") {
    context.addIssue({ code: "custom", message: "read metadata belongs to bat_read_fields" })
  }
  if (event.readError !== undefined && event.readOutcome !== "failed") {
    context.addIssue({ code: "custom", message: "read error requires failed outcome" })
  }
})
const modelEventSchema = z.object({
  callId: z.uuid(),
  purpose: z.enum(["agent", "judge", "extract", "semantic_annotation"]),
  status: z.enum(["intended", "completed", "interrupted", "failed"]),
  failureCategory: z.literal("ai_event_failure").optional(),
  failureCode: z.enum(["ai_generation_failed", "ai_model_image_unsupported", "ai_structured_output_invalid",
    "ai_capability_unavailable", "model_account_model_unavailable"]).optional(),
}).strict().superRefine((event, context) => {
  const metadata = event.failureCategory !== undefined || event.failureCode !== undefined
  if (metadata && event.status !== "failed" || (event.failureCategory === undefined) !== (event.failureCode === undefined)) {
    context.addIssue({ code: "custom", message: "model failure metadata must be complete" })
  }
})
const modelStatus = { intended: "started", completed: "completed", interrupted: "cancelled", failed: "failed" } as const
const runtimeOutcomeSchema = z.object({ phase: z.literal("runtime_outcome"), status: z.enum(["completed", "failed"]),
  primary: z.object({ status: z.enum(["completed", "failed"]),
    category: z.enum(["none", "runner_protocol", "source_contract", "model", "browser", "runtime", "unknown"]),
    code: z.string().regex(/^[a-z][a-z0-9_]{1,120}$/).nullable() }).strict(),
  cleanup: z.object({ status: z.enum(["confirmed", "unconfirmed"]), code: runnerCleanupCodeSchema.nullable(),
    evidenceDigest: hashSchema, activeResources: z.boolean().nullable(),
    retainedConnection: retainedConnectionSchema.optional() }).strict().nullable(),
  bridge: z.object({ status: z.enum(["completed", "failed"]), code: z.string().regex(/^[a-z][a-z0-9_]{1,120}$/).nullable() }).strict(),
}).strict()
export type SourceLifecycleProgress = Omit<AuthoringProgressEvent, "sequence">
type ProgressPayload = Omit<SourceLifecycleProgress, "occurredAt">

const fixedReadErrors = new Set([
  "natural_read_output_path_invalid", "natural_read_schema_mismatch", "natural_read_schema_unsupported",
  "natural_read_page_identity_changed", "natural_read_container_identity_changed", "natural_read_output_changed",
  "read_collection_limit", "read_sample_limit_invalid", "read_sample_empty_unproven", "read_sample_method_changed",
  "read_sample_document_identity_unavailable", "read_sample_document_changed", "read_sample_schema_unsupported",
  "read_single_object_required", "read_output_schema_mismatch", "ambiguous_or_missing_read_field",
  "read_boolean_invalid", "read_field_not_text", "read_field_projection_failed", "read_field_projection_invalid",
  "read_field_value_limit", "read_field_native_projection_failed", "read_container_resolution_failed",
  "read_input_limit", "read_number_not_finite", "read_text_affix_invalid", "bat_read_fields_failed",
])

function fixedReadError(raw: string) {
  const code = /^([a-z_]+)(?=:|\s|$)/.exec(raw)?.[1]
  return code && fixedReadErrors.has(code) ? code : "bat_read_fields_failed"
}

/** WHY：诊断只能记录固定生命周期元数据；同步写入并 fsync，确保进程被取消前的最后阶段仍可定位。 */
export class SourceLifecycleDiagnostics {
  readonly file: string
  private descriptor: number | null = null
  private readonly ownerId: string

  static open(directory: string, ownerId: string, onProgress?: (event: SourceLifecycleProgress) => void) {
    try { return new SourceLifecycleDiagnostics(directory, ownerId, onProgress) } catch { return undefined }
  }

  constructor(directory: string, ownerId: string, private readonly onProgress?: (event: SourceLifecycleProgress) => void) {
    const owner = z.uuid().parse(ownerId)
    this.ownerId = owner
    const diagnosticsDirectory = path.join(directory, "source-lifecycle-diagnostics")
    this.file = path.join(diagnosticsDirectory, `${owner}.jsonl`)
    try {
      mkdirSync(diagnosticsDirectory, { recursive: true, mode: 0o700 })
      this.descriptor = openSync(this.file, "a", 0o600)
    } catch { this.descriptor = null }
  }

  acceptPythonLine(line: string) {
    try {
      const raw: unknown = JSON.parse(line)
      const runtime = runtimeActionFailureSchema.safeParse(raw)
      if (runtime.success) {
        this.append({ source: "python", ...runtime.data }, new Date().toISOString())
        return
      }
      const startup = attachedStartupSchema.safeParse(raw)
      if (startup.success) {
        // WHY：连接阶段与链路节点结果分离；只持久化固定码和可信源码位置，不公开 SDK 消息。
        this.append({ source: "python", ...startup.data }, new Date().toISOString())
        return
      }
      const event = pythonEventSchema.parse(raw)
      if (event.phase === "before_action_detail" || event.phase === "author_transport") {
        // WHY：固定故障阶段只属于本地 owner 诊断，不改变用户进度合同或暴露页面值。
        this.append({ source: "python", ...event }, new Date().toISOString())
        return
      }
      this.record({ source: "browser", ...event, phase: progressPhaseSchema.parse(event.phase) }, "python")
    } catch { /* Invalid or sensitive metadata is discarded without persisting the raw line. */ }
  }

  recordModel(report: ModelCallReport) {
    const event = modelEventSchema.safeParse({ callId: report.callId, purpose: report.purpose, status: report.status,
      ...(report.failureCategory ? { failureCategory: report.failureCategory } : {}),
      ...(report.failureCode ? { failureCode: report.failureCode } : {}) })
    if (!event.success) return
    this.record({ source: "model", phase: "model", status: modelStatus[event.data.status],
      callId: event.data.callId, purpose: event.data.purpose }, "model",
    event.data.failureCategory ? { failureCategory: event.data.failureCategory,
      failureCode: event.data.failureCode } : undefined)
  }

  recordRuntimeOutcome(primary: RuntimePrimaryOutcome<unknown>, cleanup: RunnerCleanupReport | null,
    bridgeFailure?: unknown) {
    const failure = primary.status === "failed" ? safeRuntimeFailure(primary.error) : { category: "none" as const, code: null }
    const event = runtimeOutcomeSchema.safeParse({ phase: "runtime_outcome",
      status: primary.status === "failed" || cleanup?.status === "unconfirmed" || bridgeFailure ? "failed" : "completed",
      primary: { status: primary.status, ...failure },
      cleanup: cleanup ? { status: cleanup.status, code: cleanup.code,
        evidenceDigest: cleanup.evidenceDigest, activeResources: cleanup.activeResources,
        ...(cleanup.retainedConnection ? { retainedConnection: cleanup.retainedConnection } : {}) } : null,
      bridge: bridgeFailure ? { status: "failed", code: safeRuntimeCode(bridgeFailure) }
        : { status: "completed", code: null } })
    if (event.success) this.append({ source: "host", ...event.data }, new Date().toISOString())
  }

  recordTransportBoundary(code: "author_request_failed" | "author_response_received"
    | "author_result_schema_invalid" | "author_response_validation_failed" | "author_response_accepted", error?: unknown) {
    // WHY：Python 已结束却未保存来源时，只记录固定接收阶段；原始响应、异常和页面内容不进诊断文件。
    const status = code === "author_response_received" || code === "author_response_accepted" ? "completed" : "failed"
    const issues = code === "author_result_schema_invalid" ? authorResultIssues(error) : []
    this.append({ source: "host", phase: "result_boundary", status, code,
      ...(issues.length ? { issues } : {}) }, new Date().toISOString())
  }

  close() {
    if (this.descriptor === null) return
    try { closeSync(this.descriptor) } catch { /* Diagnostics never replace the business cleanup result. */ }
    this.descriptor = null
  }

  private record(event: ProgressPayload, diagnosticSource: "python" | "model", local?: Record<string, unknown>) {
    const occurredAt = new Date().toISOString(), progress = { ...event, occurredAt } as SourceLifecycleProgress
    try { this.onProgress?.(progress) } catch { /* Progress projection cannot break Browser ownership cleanup. */ }
    // WHY：selector 进入本地 job 供实时诊断，但不复制到追加式日志，避免把任务值扩散为日志内容。
    const { selector: _selector, container: _container, readError: _readError, ...safeEvent } = event
    // WHY：固定错误码可定位方法失败；字段名、选择器及页面值仍不进入追加式日志。
    this.append({ ...safeEvent, source: diagnosticSource, ...local,
      ...(_readError === undefined ? {} : { readError: fixedReadError(_readError) }) }, occurredAt)
  }

  private append(event: Record<string, unknown>, occurredAt: string) {
    if (this.descriptor === null) return
    const record = { schemaVersion: "bat.source-lifecycle-diagnostic/v1", ownerId: this.ownerId,
      occurredAt, ...event }
    try {
      writeSync(this.descriptor, `${JSON.stringify(record)}\n`)
      fsyncSync(this.descriptor)
    } catch {
      try { closeSync(this.descriptor) } catch { /* Already unusable. */ }
      this.descriptor = null
    }
  }
}

function safeRuntimeFailure(error: unknown) {
  const code = safeRuntimeCode(error)
  const category = !code ? "unknown" : code.startsWith("upstream_") || code === "hybrid_runner_failed"
    ? "runner_protocol" : code.startsWith("hybrid_source_") || code.startsWith("workflow_")
      ? "source_contract" : /^(ai_|model_account_|provider_)/.test(code) ? "model"
        : /^(browser_|capture_)/.test(code) ? "browser" : "runtime"
  return { category: category as "runner_protocol" | "source_contract" | "model" | "browser" | "runtime" | "unknown", code }
}

function safeRuntimeCode(error: unknown) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {}
  const reason = typeof value.reason === "string" ? /^[A-Za-z_]+:([a-z][a-z0-9_]{1,120})$/.exec(value.reason)?.[1] : undefined
  const own = typeof value.code === "string" ? value.code : undefined
  const message = error instanceof Error ? /^([a-z][a-z0-9_]{1,120})(?::|$)/.exec(error.message)?.[1] : undefined
  const candidate = [reason, own, message].find((item) => item && /^(?:upstream_|hybrid_|workflow_|model_account_|ai_|provider_|browser_|capture_|ordinary_|read_|target_selection_)/.test(item))
  return candidate ?? null
}
