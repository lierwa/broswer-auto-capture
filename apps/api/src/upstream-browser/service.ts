import { randomUUID } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"
import { Readable } from "node:stream"
import type { AI, AIEvent, ModelSelection } from "@agent-platform/ai-connect/server"
import { jsonValueSchema, type JsonValue, type ValueSchema } from "@browser-capture/contracts"
import type { ModelCallReport } from "@browser-capture/runtime"
import { openModelBridge, type ModelAudit } from "./model-bridge.js"
import { runnerAuthorRequestSchema, runnerAuthorResultSchema, runnerCloseRequestSchema,
  runnerReplayRequestSchema, runnerReplayResultSchema, runnerResponseSchema, runnerStartRequestSchema,
  type RunnerRequest } from "./protocol.js"

export type UpstreamAuthorResult = ReturnType<typeof runnerAuthorResultSchema.parse> & { modelCalls: ModelCallReport[] }
export type UpstreamReplayResult = ReturnType<typeof runnerReplayResultSchema.parse> & { modelCalls: ModelCallReport[] }
export interface UpstreamBrowserSession {
  author(input: { task: string; input: JsonValue; inputSchema: ValueSchema; outputSchema: ValueSchema;
    workflowInputs: Record<string, string>; artifactKey: string; maxSteps: number }): Promise<UpstreamAuthorResult>
  replay(input: { definition: JsonValue; inputs: Record<string, string | number | boolean>;
    outputSchema: ValueSchema; artifactKey: string; onModelCall?(report: ModelCallReport): Promise<void> }): Promise<UpstreamReplayResult>
}
export interface UpstreamBrowserRuntime {
  withSession<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string },
    work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T>
}

/** WHY：Python 只拥有上游 Browser/Agent/Workflow；B-A-T 通过独立 fd3 协议保留取消、审计和产物边界。 */
export class PythonUpstreamBrowserRuntime implements UpstreamBrowserRuntime {
  constructor(private readonly options: { root: string; directory: string; subject: ReturnType<AI["forSubject"]> }) {}

  async withSession<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string },
    work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T> {
    input.signal.throwIfAborted()
    const modelCalls: ModelCallReport[] = [], listeners = new Set<(report: ModelCallReport) => Promise<void>>()
    const intendedAtByRequest = new Map<string, string>()
    let queue = Promise.resolve()
    const bridge = await openModelBridge({ subject: this.options.subject, selection: input.selection, signal: input.signal,
      onAudit: (audit) => { const report = modelReport(audit, input.selection.modelId, intendedAtByRequest); modelCalls.push(report)
        queue = queue.then(async () => { for (const listener of listeners) await listener(report) }) } })
    const artifactDirectory = path.join(this.options.directory, "upstream-browser-artifacts", input.ownerId)
    await mkdir(artifactDirectory, { recursive: true })
    const process = new RunnerProcess(this.options.root, input.signal)
    try {
      await process.start({ model: input.selection.modelId, endpoint: bridge.url, token: bridge.token, artifactDirectory,
        headless: process.envBoolean("BAT_UPSTREAM_BROWSER_HEADLESS", false),
        ...(process.envValue("BAT_UPSTREAM_BROWSER_EXECUTABLE") ? { executablePath: process.envValue("BAT_UPSTREAM_BROWSER_EXECUTABLE") } : {}) })
      const session: UpstreamBrowserSession = {
        author: async (request) => {
          const offset = modelCalls.length
          const result = await process.author(request)
          await queue
          return { ...result, modelCalls: modelCalls.slice(offset) }
        },
        replay: async (request) => {
          const { onModelCall: listener, ...command } = request
          const offset = modelCalls.length
          if (listener) listeners.add(listener)
          try { const result = await process.replay(command); await queue
            return { ...result, modelCalls: modelCalls.slice(offset) } }
          finally { if (listener) listeners.delete(listener) }
        },
      }
      const result = await work(session)
      input.signal.throwIfAborted()
      return result
    } finally {
      await process.close().catch(() => {})
      await bridge.close()
    }
  }
}

class RunnerProcess {
  private child: ChildProcess | null = null
  private readonly pending = new Map<string, { resolve(value: JsonValue): void; reject(error: Error): void }>()
  private lines: readline.Interface | null = null
  constructor(private readonly root: string, private readonly signal: AbortSignal) {}

  envValue(name: string) { const value = process.env[name]?.trim(); return value || undefined }
  envBoolean(name: string, fallback: boolean) {
    const value = this.envValue(name)
    return value === undefined ? fallback : value === "true" || value === "1"
  }

  async start(config: Omit<ReturnType<typeof runnerStartRequestSchema.parse>, "id" | "type">["config"]) {
    const python = this.envValue("BAT_UPSTREAM_BROWSER_PYTHON")
      ?? path.join(this.root, "work", "upstream-browser-runner", "source", "workflows", ".venv", "bin", "python")
    const script = path.join(this.root, "apps", "api", "python", "browser_use_runner", "main.py")
    const child = spawn(python, [script], { cwd: this.root, env: { PATH: process.env.PATH, LANG: "en_US.UTF-8",
      PYTHONPATH: path.join(this.root, "apps", "api", "python"), ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" }, stdio: ["pipe", "ignore", "ignore", "pipe"] })
    this.child = child
    const protocol = child.stdio[3]
    if (!protocol || typeof protocol === "string") throw new Error("upstream_protocol_unavailable")
    this.lines = readline.createInterface({ input: protocol as Readable })
    this.lines.on("line", (line) => this.accept(line))
    child.once("error", (error) => this.rejectAll(error))
    child.once("close", (code) => this.rejectAll(new Error(`upstream_runner_closed:${code ?? "signal"}`)))
    this.signal.addEventListener("abort", () => { child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 5_000).unref() }, { once: true })
    await this.request(runnerStartRequestSchema.parse({ id: randomUUID(), type: "start", config }))
  }

  async author(input: Omit<ReturnType<typeof runnerAuthorRequestSchema.parse>, "id" | "type">) {
    return runnerAuthorResultSchema.parse(await this.request(runnerAuthorRequestSchema.parse({ id: randomUUID(), type: "author", ...input })))
  }
  async replay(input: Omit<ReturnType<typeof runnerReplayRequestSchema.parse>, "id" | "type" | "onModelCall">) {
    return runnerReplayResultSchema.parse(await this.request(runnerReplayRequestSchema.parse({ id: randomUUID(), type: "replay", ...input })))
  }
  async close() {
    const child = this.child
    if (!child) return
    if (child.exitCode === null && !this.signal.aborted) {
      await this.request(runnerCloseRequestSchema.parse({ id: randomUUID(), type: "close" })).catch(() => {})
    }
    if (child.exitCode === null) child.kill("SIGTERM")
    this.lines?.close(); this.child = null
  }

  private request(request: RunnerRequest): Promise<JsonValue> {
    this.signal.throwIfAborted()
    const child = this.child
    if (!child?.stdin?.writable) return Promise.reject(new Error("upstream_runner_unavailable"))
    return new Promise<JsonValue>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject })
      child.stdin!.write(`${JSON.stringify(request)}\n`, (error) => { if (error) { this.pending.delete(request.id); reject(error) } })
    }).then((value) => { this.signal.throwIfAborted(); return value })
  }
  private accept(line: string) {
    const response = runnerResponseSchema.safeParse(JSON.parse(line))
    if (!response.success) return this.rejectAll(new Error("upstream_protocol_invalid"))
    const pending = this.pending.get(response.data.id)
    if (!pending) return
    this.pending.delete(response.data.id)
    if (response.data.ok) pending.resolve(response.data.result)
    else pending.reject(new Error(response.data.code))
  }
  private rejectAll(error: Error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear() }
}

function modelReport(audit: ModelAudit, model: string, intendedAtByRequest: Map<string, string>): ModelCallReport {
  const status = audit.event.type === "generation.started" ? "intended" : audit.event.type === "generation.completed"
    ? "completed" : audit.event.type === "generation.cancelled" ? "interrupted" : "failed"
  if (status === "intended") intendedAtByRequest.set(audit.requestId, new Date().toISOString())
  const intendedAt = intendedAtByRequest.get(audit.requestId) ?? new Date().toISOString()
  if (status !== "intended") intendedAtByRequest.delete(audit.requestId)
  return { callId: audit.requestId, purpose: audit.purpose, model, intendedAt, status,
    reportedInvocations: status === "intended" ? null : 1 }
}
