import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs"
import path from "node:path"
import type { AuthoringProgressEvent } from "@browser-capture/contracts"
import type { ModelCallReport } from "@browser-capture/runtime"
import { z } from "zod"

const actionNameSchema = z.enum([
  "bat_inspect_dom", "bat_read_fields", "bat_scroll_to", "bat_summarize", "bat_wait_for", "click", "close", "done",
  "dropdown_options", "extract", "find_elements", "find_text", "go_back", "input", "navigate", "save_as_pdf",
  "scroll", "search", "search_page", "select_dropdown", "send_keys", "switch", "wait",
])
const pythonEventSchema = z.object({
  phase: z.enum(["author", "before_action", "after_step", "dispatch"]),
  status: z.enum(["started", "completed", "failed", "cancelled"]),
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
}).strict()
const modelStatus = { intended: "started", completed: "completed", interrupted: "cancelled", failed: "failed" } as const
export type SourceLifecycleProgress = Omit<AuthoringProgressEvent, "sequence">
type ProgressPayload = Omit<SourceLifecycleProgress, "occurredAt">

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
      const event = pythonEventSchema.parse(JSON.parse(line))
      this.record({ source: "browser", ...event }, "python")
    } catch { /* Invalid or sensitive metadata is discarded without persisting the raw line. */ }
  }

  recordModel(report: ModelCallReport) {
    const event = modelEventSchema.safeParse({ callId: report.callId, purpose: report.purpose, status: report.status })
    if (!event.success) return
    this.record({ source: "model", phase: "model", status: modelStatus[event.data.status],
      callId: event.data.callId, purpose: event.data.purpose }, "model")
  }

  close() {
    if (this.descriptor === null) return
    try { closeSync(this.descriptor) } catch { /* Diagnostics never replace the business cleanup result. */ }
    this.descriptor = null
  }

  private record(event: ProgressPayload, diagnosticSource: "python" | "model") {
    const occurredAt = new Date().toISOString(), progress = { ...event, occurredAt } as SourceLifecycleProgress
    try { this.onProgress?.(progress) } catch { /* Progress projection cannot break Browser ownership cleanup. */ }
    // WHY：selector 进入本地 job 供实时诊断，但不复制到追加式日志，避免把任务值扩散为日志内容。
    const { selector: _selector, container: _container, readError: _readError, ...safeEvent } = event
    this.append({ ...safeEvent, source: diagnosticSource }, occurredAt)
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
