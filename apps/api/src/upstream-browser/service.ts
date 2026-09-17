import { retireWorkflowV1 } from "./retirement.js"
import { randomUUID } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import readline from "node:readline"
import { Readable } from "node:stream"
import type { AI, ModelSelection } from "@agent-platform/ai-connect/server"
import type { JsonValue, ValueSchema } from "@browser-capture/contracts"
import type { ModelCallReport, TaskChainCapabilities } from "@browser-capture/runtime"
import { withHybridCapabilities } from "./hybrid-runtime.js"
import type { ModelAudit } from "./model-bridge.js"
import { runnerAuthorRequestSchema, runnerAuthorResultSchema, runnerCloseRequestSchema,
  runnerReplayRequestSchema, runnerReplayResultSchema, runnerResponseSchema, runnerStartRequestSchema,
  type RunnerRequest } from "./protocol.js"
import { hybridStartRequestSchema, type HybridRunnerRequest } from "./hybrid-protocol.js"
import { withHybridAuthoring, recompileHybridSource, type HybridAuthorSession } from "./hybrid-exploration.js"

export type UpstreamAuthorResult = ReturnType<typeof runnerAuthorResultSchema.parse> & { modelCalls: ModelCallReport[] }
export type UpstreamReplayResult = ReturnType<typeof runnerReplayResultSchema.parse> & { modelCalls: ModelCallReport[] }
export interface UpstreamBrowserSession {
  author(input: { task: string; input: JsonValue; inputSchema: ValueSchema; outputSchema: ValueSchema;
    workflowInputs: Record<string, string>; artifactKey: string; maxSteps: number }): Promise<UpstreamAuthorResult>
  replay(input: { definition: JsonValue; inputs: Record<string, string | number | boolean>;
    outputSchema: ValueSchema; artifactKey: string; onModelCall?(report: ModelCallReport): Promise<void> }): Promise<UpstreamReplayResult>
}
export interface UpstreamBrowserRuntime {
  recompile?(input: Omit<Parameters<typeof recompileHybridSource>[0], "root">): ReturnType<typeof recompileHybridSource>
  withSession<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string },
    work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T>
  withCapabilities?<T>(input: { signal: AbortSignal; ownerId: string; allowedOrigins: string[]; canRestoreByNavigation?: boolean },
    work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T>
  withAuthoring?<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string; allowedOrigins: string[] },
    work: (session: HybridAuthorSession) => Promise<T>): Promise<T>
}

/** WHY：Python 只拥有上游 Browser/Agent/Workflow；B-A-T 通过独立 fd3 协议保留取消、审计和产物边界。 */
export class PythonUpstreamBrowserRuntime implements UpstreamBrowserRuntime {
  constructor(private readonly options: { root: string; directory: string; subject: ReturnType<AI["forSubject"]> }) {}

  recompile(input: Omit<Parameters<typeof recompileHybridSource>[0], "root">) {
    return recompileHybridSource({ ...input, root: this.options.root })
  }

  withAuthoring<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string; allowedOrigins: string[] },
    work: (session: HybridAuthorSession) => Promise<T>): Promise<T> {
    return withHybridAuthoring({ ...input, root: this.options.root, directory: this.options.directory,
      subject: this.options.subject }, work)
  }

  withCapabilities<T>(input: { signal: AbortSignal; ownerId: string; allowedOrigins: string[]; canRestoreByNavigation?: boolean },
    work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
    return withHybridCapabilities({ root: this.options.root, signal: input.signal, allowedOrigins: input.allowedOrigins,
      canRestoreByNavigation: input.canRestoreByNavigation ?? false }, work)
  }

  async withSession<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string },
    work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T> {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
}

export class RunnerProcess {
  private child: ChildProcess | null = null
  private temporaryDirectory: string | null = null
  private readonly pending = new Map<string, { resolve(value: JsonValue): void; reject(error: Error): void }>()
  private lines: readline.Interface | null = null
  private diagnosticLines: readline.Interface | null = null
  constructor(private readonly root: string, private readonly signal: AbortSignal,
    private readonly onDiagnostic?: (line: string) => void) {}

  envValue(name: string) { const value = process.env[name]?.trim(); return value || undefined }
  envBoolean(name: string, fallback: boolean) {
    const value = this.envValue(name)
    return value === undefined ? fallback : value === "true" || value === "1"
  }

  async start(config: Omit<ReturnType<typeof runnerStartRequestSchema.parse>, "id" | "type">["config"]) {
    retireWorkflowV1()
  }

  async startHybrid(config: ReturnType<typeof hybridStartRequestSchema.parse>["config"]) {
    await this.launch("main.py")
    await this.request(hybridStartRequestSchema.parse({ id: randomUUID(), type: "hybrid_start", config }))
  }

  async startCompiler() { await this.launch("main.py") }

  private async launch(entry: string) {
    this.signal.throwIfAborted()
    if (this.child) throw new Error("upstream_runner_already_started")
    this.temporaryDirectory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-owner-"))
    const python = this.envValue("BAT_UPSTREAM_BROWSER_PYTHON")
      ?? path.join(this.root, "work", "upstream-browser-hybrid", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
    const script = path.join(this.root, "apps", "api", "python", "browser_use_runner", entry)
    const child = spawn(python, [script], { cwd: this.root, env: { PATH: process.env.PATH, LANG: "en_US.UTF-8",
      TMPDIR: this.temporaryDirectory, TMP: this.temporaryDirectory, TEMP: this.temporaryDirectory,
      PYTHONPATH: [path.join(this.root, "vendor", "workflow-use", "workflows"), path.join(this.root, "apps", "api", "python")].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false",
      ...(this.onDiagnostic ? { BAT_SOURCE_LIFECYCLE_DIAGNOSTICS: "1" } : {}) },
      stdio: ["pipe", "ignore", "ignore", "pipe", this.onDiagnostic ? "pipe" : "ignore"] })
    this.child = child
    const protocol = child.stdio[3]
    if (!protocol || typeof protocol === "string") throw new Error("upstream_protocol_unavailable")
    this.lines = readline.createInterface({ input: protocol as Readable })
    this.lines.on("line", (line) => this.accept(line))
    const diagnostics = child.stdio[4]
    if (this.onDiagnostic && diagnostics && typeof diagnostics !== "string") {
      this.diagnosticLines = readline.createInterface({ input: diagnostics as Readable })
      this.diagnosticLines.on("line", (line) => { try { this.onDiagnostic?.(line) } catch { /* Diagnostic isolation. */ } })
    }
    child.once("error", (error) => this.rejectAll(error))
    child.once("close", (code) => this.rejectAll(new Error(`upstream_runner_closed:${code ?? "signal"}`)))
    let forced: NodeJS.Timeout | undefined
    const abort = () => { child.stdin?.end(); child.kill("SIGTERM"); forced = setTimeout(() => child.kill("SIGKILL"), 5_000); forced.unref() }
    this.signal.addEventListener("abort", abort, { once: true })
    child.once("close", () => { if (forced) clearTimeout(forced); this.signal.removeEventListener("abort", abort) })
  }

  async author(input: Omit<ReturnType<typeof runnerAuthorRequestSchema.parse>, "id" | "type">) {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
  async replay(input: Omit<ReturnType<typeof runnerReplayRequestSchema.parse>, "id" | "type" | "onModelCall">) {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
  async close() {
    const child = this.child
    if (!child) return
    if (child.exitCode === null && !this.signal.aborted) {
      let timer: NodeJS.Timeout | undefined
      await Promise.race([this.request(runnerCloseRequestSchema.parse({ id: randomUUID(), type: "close" })),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("upstream_close_timeout")), 5_000) })])
        .catch(() => {}).finally(() => { if (timer) clearTimeout(timer) })
    }
    child.stdin?.end()
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise<void>((resolve) => {
        const terminate = setTimeout(() => child.kill("SIGTERM"), 5_000)
        const forced = setTimeout(() => child.kill("SIGKILL"), 10_000)
        child.once("close", () => { clearTimeout(terminate); clearTimeout(forced); resolve() })
      })
    }
    this.lines?.close(); this.diagnosticLines?.close(); this.child = null
    this.lines = null; this.diagnosticLines = null
    if (child.exitCode !== 0) throw new Error(`upstream_cleanup_unconfirmed:${child.exitCode ?? child.signalCode}`)
    if (this.temporaryDirectory) { await rm(this.temporaryDirectory, { recursive: true, force: true }); this.temporaryDirectory = null }
  }

  request(request: RunnerRequest | HybridRunnerRequest): Promise<JsonValue> {
    this.signal.throwIfAborted()
    const child = this.child
    if (!child?.stdin?.writable) return Promise.reject(new Error("upstream_runner_unavailable"))
    return new Promise<JsonValue>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject })
      child.stdin!.write(`${JSON.stringify(request)}\n`, (error) => { if (error) { this.pending.delete(request.id); reject(error) } })
    }).then((value) => { this.signal.throwIfAborted(); return value })
  }
  private accept(line: string) {
    let raw: unknown
    try { raw = JSON.parse(line) } catch { return this.rejectAll(new Error("upstream_protocol_invalid")) }
    const response = runnerResponseSchema.safeParse(raw)
    if (!response.success) return this.rejectAll(new Error("upstream_protocol_invalid"))
    const pending = this.pending.get(response.data.id)
    if (!pending) return
    this.pending.delete(response.data.id)
    if (response.data.ok) pending.resolve(response.data.result)
    else pending.reject(new Error(response.data.code + (response.data.reason ? ":" + response.data.reason : "")))
  }
  private rejectAll(error: Error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear() }
}

export function modelReport(audit: ModelAudit, model: string, intendedAtByRequest: Map<string, string>): ModelCallReport {
  const status = audit.event.type === "generation.started" ? "intended" : audit.event.type === "generation.completed"
    ? "completed" : audit.event.type === "generation.cancelled" ? "interrupted" : "failed"
  if (status === "intended") intendedAtByRequest.set(audit.requestId, new Date().toISOString())
  const intendedAt = intendedAtByRequest.get(audit.requestId) ?? new Date().toISOString()
  if (status !== "intended") intendedAtByRequest.delete(audit.requestId)
  return { callId: audit.requestId, purpose: audit.purpose, model, intendedAt, status,
    reportedInvocations: status === "intended" ? null : 1 }
}
