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
import { hybridProfilePickTargetRequestSchema, hybridProfilePickTargetResultSchema,
  hybridProfileStartRequestSchema, hybridStartRequestSchema, type HybridRunnerRequest } from "./hybrid-protocol.js"
import { withHybridAuthoring, recompileHybridSource, type HybridAuthoringProgress,
  type HybridAuthorSession } from "./hybrid-exploration.js"
import { cleanupReport, pythonCleanupResultSchema, type RunnerCleanupReport,
  type RunnerCleanupCode, type RunnerCleanupStage } from "./cleanup.js"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { browserAllowedSites } from "./site-scope.js"

export type UpstreamAuthorResult = ReturnType<typeof runnerAuthorResultSchema.parse> & { modelCalls: ModelCallReport[] }
export type UpstreamReplayResult = ReturnType<typeof runnerReplayResultSchema.parse> & { modelCalls: ModelCallReport[] }
export interface UpstreamBrowserSession {
  author(input: { task: string; input: JsonValue; inputSchema: ValueSchema; outputSchema: ValueSchema;
    workflowInputs: Record<string, string>; artifactKey: string; maxSteps: number }): Promise<UpstreamAuthorResult>
  replay(input: { definition: JsonValue; inputs: Record<string, string | number | boolean>;
    outputSchema: ValueSchema; artifactKey: string; onModelCall?(report: ModelCallReport): Promise<void> }): Promise<UpstreamReplayResult>
}
export interface UpstreamBrowserRuntime {
  sourceDigest?(): Promise<string>
  recompile?(input: Omit<Parameters<typeof recompileHybridSource>[0], "root" | "directory" | "subject">): ReturnType<typeof recompileHybridSource>
  withSession<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string },
    work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T>
  withCapabilities?<T>(input: { signal: AbortSignal; ownerId: string; allowedOrigins: string[]; canRestoreByNavigation?: boolean;
    headless?: boolean;
    onCleanup?: (report: RunnerCleanupReport) => void },
    work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T>
  withAuthoring?<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string; allowedOrigins: string[];
    onProgress?: (event: HybridAuthoringProgress) => void },
    work: (session: HybridAuthorSession) => Promise<T>): Promise<T>
}

export class UpstreamProtocolError extends Error {
  constructor(readonly code: string, readonly reason: string | null) {
    super(code + (reason ? `:${reason}` : ""))
  }
}

/** WHY：Python 只拥有上游 Browser/Agent/Workflow；B-A-T 通过独立 fd3 协议保留取消、审计和产物边界。 */
export class PythonUpstreamBrowserRuntime implements UpstreamBrowserRuntime {
  constructor(private readonly options: { root: string; directory: string; subject: ReturnType<AI["forSubject"]> }) {}

  sourceDigest() { return verifyForkSource(this.options.root) }

  recompile(input: Omit<Parameters<typeof recompileHybridSource>[0], "root" | "directory" | "subject">) {
    return recompileHybridSource({ ...input, ...this.options })
  }

  withAuthoring<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string; allowedOrigins: string[];
    onProgress?: (event: HybridAuthoringProgress) => void },
    work: (session: HybridAuthorSession) => Promise<T>): Promise<T> {
    return withHybridAuthoring({ ...input, root: this.options.root, directory: this.options.directory,
      subject: this.options.subject }, work)
  }

  withCapabilities<T>(input: { signal: AbortSignal; ownerId: string; allowedOrigins: string[]; canRestoreByNavigation?: boolean;
    headless?: boolean;
    onCleanup?: (report: RunnerCleanupReport) => void },
    work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
    return withHybridCapabilities({ root: this.options.root, directory: this.options.directory, ownerId: input.ownerId,
      signal: input.signal, allowedOrigins: input.allowedOrigins,
      ...(input.headless !== undefined ? { headless: input.headless } : {}),
      ...(input.onCleanup ? { onCleanup: input.onCleanup } : {}),
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
  private termination: Promise<void> | null = null
  private cleanup: Promise<RunnerCleanupReport> | null = null
  constructor(private readonly root: string, private readonly signal: AbortSignal,
    private readonly onDiagnostic?: (line: string) => void,
    private readonly lifecycle: { runnerScript?: string; closeTimeoutMs?: number; childCloseTimeoutMs?: number;
      removeTemporaryDirectory?: typeof rm; runnerEnvironment?: Record<string, string> } = {}) {}

  envValue(name: string) { const value = process.env[name]?.trim(); return value || undefined }
  envBoolean(name: string, fallback: boolean) {
    const value = this.envValue(name)
    return value === undefined ? fallback : value === "true" || value === "1"
  }

  async start(config: Omit<ReturnType<typeof runnerStartRequestSchema.parse>, "id" | "type">["config"]) {
    retireWorkflowV1()
  }

  async startHybrid(config: Omit<ReturnType<typeof hybridStartRequestSchema.parse>["config"], "allowedSites">) {
    await this.launch("main.py")
    await this.request(hybridStartRequestSchema.parse({ id: randomUUID(), type: "hybrid_start",
      config: { ...config, allowedSites: browserAllowedSites(config.allowedOrigins) } }))
  }

  async startProfile(config: ReturnType<typeof hybridProfileStartRequestSchema.parse>["config"]) {
    await this.launch("main.py")
    await this.request(hybridProfileStartRequestSchema.parse({ id: randomUUID(), type: "profile_start", config }))
  }

  async pickProfileTarget(timeoutMs = 180_000) {
    const request = hybridProfilePickTargetRequestSchema.parse({ id: randomUUID(), type: "profile_pick_target", timeoutMs })
    return hybridProfilePickTargetResultSchema.parse(await this.request(request))
  }

  async startCompiler() { await this.launch("main.py") }

  private async launch(entry: string) {
    this.signal.throwIfAborted()
    if (this.child) throw new Error("upstream_runner_already_started")
    if (this.cleanup) throw new Error("upstream_runner_already_closed")
    this.temporaryDirectory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-owner-"))
    const python = this.envValue("BAT_UPSTREAM_BROWSER_PYTHON")
      ?? path.join(this.root, "work", "upstream-browser-hybrid", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
    const script = this.lifecycle.runnerScript ?? path.join(this.root, "apps", "api", "python", "browser_use_runner", entry)
    const child = spawn(python, [script], { cwd: this.root, env: { PATH: process.env.PATH, LANG: "en_US.UTF-8",
      TMPDIR: this.temporaryDirectory, TMP: this.temporaryDirectory, TEMP: this.temporaryDirectory,
      PYTHONPATH: [path.join(this.root, "vendor", "workflow-use", "workflows"), path.join(this.root, "apps", "api", "python")].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false",
      ...this.lifecycle.runnerEnvironment,
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
    const abort = () => { child.stdin?.end(); void this.terminate(child).catch(() => {}) }
    this.signal.addEventListener("abort", abort, { once: true })
    child.once("close", () => this.signal.removeEventListener("abort", abort))
  }

  async author(input: Omit<ReturnType<typeof runnerAuthorRequestSchema.parse>, "id" | "type">) {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
  async replay(input: Omit<ReturnType<typeof runnerReplayRequestSchema.parse>, "id" | "type" | "onModelCall">) {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
  close() { return this.cleanup ??= this.performClose() }

  private async performClose(): Promise<RunnerCleanupReport> {
    const child = this.child
    const temporaryDirectory = this.temporaryDirectory
    const stages: RunnerCleanupStage[] = []
    let activeResources: boolean | null = false
    try {
      if (!child) {
        stages.push(notRequired("capability_close"), notRequired("browser_close"), notRequired("close_protocol"),
          notRequired("child_exit"), notRequired("process_tree"))
      } else {
        await this.closeChild(child, stages)
        activeResources = !hasExited(child)
      }
    } finally {
      this.lines?.close(); this.diagnosticLines?.close(); this.child = null
      this.lines = null; this.diagnosticLines = null
      try {
        if (temporaryDirectory) {
          await removeRunnerTemporaryDirectory(temporaryDirectory, this.lifecycle.removeTemporaryDirectory)
          stages.push(confirmedStage("temporary_directory"))
        } else stages.push(notRequired("temporary_directory"))
      } catch {
        stages.push(unconfirmed("temporary_directory", "cleanup_temp_directory_failed"))
        activeResources = true
      } finally { this.temporaryDirectory = null }
    }
    return cleanupReport(stages, activeResources)
  }

  private terminate(child: ChildProcess) {
    return this.termination ??= terminateProcessTree(child).then(() => undefined)
  }

  private async closeChild(child: ChildProcess, stages: RunnerCleanupStage[]) {
    if (!hasExited(child) && !this.signal.aborted) {
      const result = await this.closeProtocol()
      stages.push(...result.stages, result.protocol)
    } else {
      stages.push(notRequired("capability_close"), notRequired("browser_close"), notRequired("close_protocol"))
    }
    child.stdin?.end()
    if (this.signal.aborted && !hasExited(child)) {
      const confirmed = await this.terminateConfirmed(child)
      stages.push(confirmed ? confirmedStage("child_exit") : unconfirmed("child_exit", "cleanup_child_exit_timeout"))
      stages.push(confirmed ? confirmedStage("process_tree") : unconfirmed("process_tree", "cleanup_process_tree_unconfirmed"))
      return
    }
    const closed = await waitForChildClose(child, this.lifecycle.childCloseTimeoutMs ?? 5_000)
    if (!closed) {
      stages.push(unconfirmed("child_exit", "cleanup_child_exit_timeout"))
      const confirmed = await this.terminateConfirmed(child)
      stages.push(confirmed ? confirmedStage("process_tree") : unconfirmed("process_tree", "cleanup_process_tree_unconfirmed"))
      return
    }
    stages.push(childExitStage(child, stages.every((stage) => stage.status !== "unconfirmed")))
    stages.push(notRequired("process_tree"))
  }

  private async closeProtocol() {
    const request = runnerCloseRequestSchema.parse({ id: randomUUID(), type: "close" })
    try {
      const raw = await this.requestWithin(request, this.lifecycle.closeTimeoutMs ?? 5_000)
      const parsed = pythonCleanupResultSchema.safeParse(raw)
      if (!parsed.success) return { stages: [notRequired("capability_close"), notRequired("browser_close")],
        protocol: unconfirmed("close_protocol", "cleanup_close_protocol_invalid") }
      // WHY：I7 必须沿真实 runner/API/Workbench 证明 cleanup overlay，不用 mock 替换浏览器执行；
      // 该显式验收开关只否定 close 回执的可信度，仍等待真实 Python owner 完成关闭与 child exit。
      if (this.envValue("BAT_ACCEPTANCE_CLEANUP_FAULT") === "close_protocol_unconfirmed") {
        return { stages: parsed.data.stages,
          protocol: unconfirmed("close_protocol", "cleanup_close_protocol_rejected") }
      }
      return { stages: parsed.data.stages, protocol: confirmedStage("close_protocol") }
    } catch (error) {
      return { stages: [notRequired("capability_close"), notRequired("browser_close")],
        protocol: unconfirmed("close_protocol", error instanceof CloseProtocolTimeout
          ? "cleanup_close_protocol_timeout" : "cleanup_close_protocol_rejected") }
    }
  }

  private async requestWithin(request: RunnerRequest, timeoutMs: number): Promise<JsonValue> {
    let timer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([this.request(request), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CloseProtocolTimeout()), timeoutMs)
      })])
    } finally {
      if (timer) clearTimeout(timer)
      this.pending.delete(request.id)
    }
  }

  private async terminateConfirmed(child: ChildProcess) {
    try { await this.terminate(child) } catch { return false }
    return hasExited(child)
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
    else pending.reject(new UpstreamProtocolError(response.data.code, response.data.reason ?? null))
  }
  private rejectAll(error: Error) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear() }
}

class CloseProtocolTimeout extends Error {}

function confirmedStage(stage: RunnerCleanupStage["stage"]): RunnerCleanupStage {
  return { stage, status: "confirmed", code: null }
}

function notRequired(stage: RunnerCleanupStage["stage"]): RunnerCleanupStage {
  return { stage, status: "not_required", code: null }
}

function unconfirmed(stage: RunnerCleanupStage["stage"], code: RunnerCleanupCode): RunnerCleanupStage {
  return { stage, status: "unconfirmed", code }
}

function hasExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null
}

function childExitStage(child: ChildProcess, ownerCloseConfirmed: boolean): RunnerCleanupStage {
  if (child.exitCode === 0) return confirmedStage("child_exit")
  // WHY：child_exit 在清理合同中证明进程已退出，不是进程业务返回值。Python 已用结构化
  // close 回执确认 capability/browser 所有权释放时，非零退出码不能把已完成链路改成待清理；
  // close protocol 未确认时仍保留 unconfirmed，并继续由 execution cleanup 恢复。
  if (child.exitCode !== null && ownerCloseConfirmed) return confirmedStage("child_exit")
  if (child.exitCode !== null) return unconfirmed("child_exit", "cleanup_child_exit_nonzero")
  if (child.signalCode !== null) return unconfirmed("child_exit", "cleanup_child_exit_signal")
  return unconfirmed("child_exit", "cleanup_child_exit_timeout")
}

function waitForChildClose(child: ChildProcess, timeoutMs: number) {
  if (hasExited(child)) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    const closed = () => { clearTimeout(timer); resolve(true) }
    const timer = setTimeout(() => { child.removeListener("close", closed); resolve(hasExited(child)) }, timeoutMs)
    child.once("close", closed)
  })
}

export async function removeRunnerTemporaryDirectory(directory: string, removeDirectory: typeof rm = rm) {
  // WHY：Windows 的 runner 树退出后，浏览器文件句柄仍可能短暂滞留；Node 原生有界重试
  // 只作用于本 RunnerProcess 创建的精确临时目录，不触碰持久 Profile。
  await removeDirectory(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

async function terminateProcessTree(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === "win32" && child.pid) {
    // WHY：Windows 的 child.kill 不会终止 Chrome 子树；取消 authoring 时必须按精确 runner PID
    // 回收它创建的浏览器，不能遗留 tab/profile，也不能误杀用户自己的 Chrome。
    const requested = await new Promise<boolean>((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true })
      killer.once("error", () => resolve(false))
      killer.once("close", (code) => resolve(code === 0))
    })
    if (!requested && !hasExited(child)) throw new Error("process_tree_termination_failed")
    if (!await waitForChildClose(child, 5_000)) throw new Error("process_tree_termination_unconfirmed")
    return
  }
  if (!child.kill("SIGTERM") && !hasExited(child)) throw new Error("process_termination_failed")
  if (await waitForChildClose(child, 5_000)) return
  if (!child.kill("SIGKILL") && !hasExited(child)) throw new Error("process_force_termination_failed")
  if (!await waitForChildClose(child, 5_000)) throw new Error("process_force_termination_unconfirmed")
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
