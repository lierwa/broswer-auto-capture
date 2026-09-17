import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs"
import path from "node:path"
import type { ModelCallReport } from "@browser-capture/runtime"
import { z } from "zod"

const actionNameSchema = z.enum([
  "bat_read_fields", "bat_scroll_to", "bat_summarize", "bat_wait_for", "click", "close", "done",
  "dropdown_options", "extract", "find_elements", "find_text", "go_back", "input", "navigate", "save_as_pdf",
  "scroll", "search", "search_page", "select_dropdown", "send_keys", "switch", "wait",
])
const pythonEventSchema = z.object({
  phase: z.enum(["author", "before_action", "after_step", "dispatch"]),
  status: z.enum(["started", "completed", "failed", "cancelled"]),
  actionName: actionNameSchema.optional(),
  stepNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict().superRefine((event, context) => {
  if ((event.actionName === undefined) !== (event.stepNumber === undefined)) {
    context.addIssue({ code: "custom", message: "action metadata must be complete" })
  }
})
const modelEventSchema = z.object({
  callId: z.uuid(),
  purpose: z.enum(["agent", "judge", "extract", "semantic_annotation"]),
  status: z.enum(["intended", "completed", "interrupted", "failed"]),
}).strict()
const modelStatus = { intended: "started", completed: "completed", interrupted: "cancelled", failed: "failed" } as const

/** WHY：诊断只能记录固定生命周期元数据；同步写入并 fsync，确保进程被取消前的最后阶段仍可定位。 */
export class SourceLifecycleDiagnostics {
  readonly file: string
  private descriptor: number | null = null
  private readonly ownerId: string

  static open(directory: string, ownerId: string) {
    try { return new SourceLifecycleDiagnostics(directory, ownerId) } catch { return undefined }
  }

  constructor(directory: string, ownerId: string) {
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
      this.append({ source: "python", ...event })
    } catch { /* Invalid or sensitive metadata is discarded without persisting the raw line. */ }
  }

  recordModel(report: ModelCallReport) {
    const event = modelEventSchema.safeParse({ callId: report.callId, purpose: report.purpose, status: report.status })
    if (!event.success) return
    this.append({ source: "model", phase: "model", status: modelStatus[event.data.status],
      callId: event.data.callId, purpose: event.data.purpose })
  }

  close() {
    if (this.descriptor === null) return
    try { closeSync(this.descriptor) } catch { /* Diagnostics never replace the business cleanup result. */ }
    this.descriptor = null
  }

  private append(event: Record<string, unknown>) {
    if (this.descriptor === null) return
    const record = { schemaVersion: "bat.source-lifecycle-diagnostic/v1", ownerId: this.ownerId,
      occurredAt: new Date().toISOString(), ...event }
    try {
      writeSync(this.descriptor, `${JSON.stringify(record)}\n`)
      fsyncSync(this.descriptor)
    } catch {
      try { closeSync(this.descriptor) } catch { /* Already unusable. */ }
      this.descriptor = null
    }
  }
}
