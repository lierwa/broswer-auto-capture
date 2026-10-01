import { retireWorkflowV1 } from "./retirement.js"
import { randomUUID } from "node:crypto"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import readline from "node:readline"
import { Readable } from "node:stream"
import type { AI, ModelSelection } from "@agent-platform/ai-connect/server"
import type { JsonValue, ValueSchema } from "@browser-capture/contracts"
import type { ModelCallReport, TaskChainCapabilities } from "@browser-capture/runtime"
import type { ModelAudit } from "./model-bridge.js"
import { runnerAuthorRequestSchema, runnerAuthorResultSchema, runnerCloseRequestSchema,
  runnerReplayRequestSchema, runnerReplayResultSchema, runnerResponseSchema, runnerStartRequestSchema,
  type RunnerRequest } from "./protocol.js"
import { hybridProfileStartRequestSchema, hybridStartRequestSchema, hybridHandoffRequestSchema,
  hybridManagedWindowRequestSchema, hybridManagedWindowResultSchema, hybridWindowLeaseSchema,
  profileOwnerRequestSchema, profileRecoverRequestSchema,
  type HybridRunnerRequest } from "./hybrid-protocol.js"
import { recompileHybridSource, type HybridAuthoringProgress,
  type HybridAuthorSession } from "./hybrid-exploration.js"
import { cleanupReport, pythonCleanupResultSchema, type RunnerCleanupReport,
  type RunnerCleanupCode, type RunnerCleanupStage } from "./cleanup.js"
import { browserAllowedSites } from "./site-scope.js"
import { runnerOwnershipSchema, type RunnerOwnership } from "./runner-ownership.js"
import { authoringHumanEventSchema, authoringHumanResumeResultSchema, hybridAuthorResumeRequestSchema,
  type AuthoringHumanHandlers } from "./hybrid-author-human.js"
import { compilationCheckpointSchema, receiveCompilation, type CompilationHandler,
  type CompilationPending } from "./hybrid-compilation-checkpoint.js"
import { dailyChromeConnection, resolveDailyChromeEndpoint } from "./daily-chrome-connection.js"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"

export type UpstreamAuthorResult = ReturnType<typeof runnerAuthorResultSchema.parse> & { modelCalls: ModelCallReport[] }
export type UpstreamReplayResult = ReturnType<typeof runnerReplayResultSchema.parse> & { modelCalls: ModelCallReport[] }
export interface UpstreamBrowserSession {
  author(input: { task: string; input: JsonValue; inputSchema: ValueSchema; outputSchema: ValueSchema;
    workflowInputs: Record<string, string>; artifactKey: string; maxSteps: number }): Promise<UpstreamAuthorResult>
  replay(input: { definition: JsonValue; inputs: Record<string, string | number | boolean>;
    outputSchema: ValueSchema; artifactKey: string; onModelCall?(report: ModelCallReport): Promise<void> }): Promise<UpstreamReplayResult>
}
export interface UpstreamBrowserRuntime {
  close?(): Promise<RunnerCleanupReport>
  sourceDigest?(): Promise<string>
  recompile?(input: Omit<Parameters<typeof recompileHybridSource>[0], "root" | "directory" | "subject">): ReturnType<typeof recompileHybridSource>
  withSession<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string },
    work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T>
  withCapabilities?<T>(input: { signal: AbortSignal; ownerId: string; allowedOrigins: string[]; canRestoreByNavigation?: boolean;
    connectionOwnerId?: string; closeAfterOperation?: boolean;
    headless?: boolean; browserMode?: BrowserMode; managedWindow?: { ownerId: string; resume: boolean };
    handoffPurpose?: () => "delivery" | "human_wait" | null;
    onHandoff?: (purpose: "delivery" | "human_wait", lease: ReturnType<typeof hybridWindowLeaseSchema.parse>) => void;
    onHandoffFailure?: (purpose: "delivery" | "human_wait", reason: string) => void;
    onCleanup?: (report: RunnerCleanupReport) => void },
    work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T>
  withAuthoring?<T>(input: { selection: ModelSelection; signal: AbortSignal; ownerId: string; allowedOrigins: string[];
    connectionOwnerId?: string; browserMode?: BrowserMode;
    onProgress?: (event: HybridAuthoringProgress) => void } & AuthoringHumanHandlers,
    work: (session: HybridAuthorSession) => Promise<T>): Promise<T>
  managedWindowAction?(input: { action: "inspect" | "focus" | "end" | "verify_closed"; ownerId: string; leaseId: string }):
    Promise<{ window: ReturnType<typeof hybridManagedWindowResultSchema.parse>; report: RunnerCleanupReport }>
}

export class UpstreamProtocolError extends Error {
  constructor(readonly code: string, readonly reason: string | null) {
    super(code + (reason ? `:${reason}` : ""))
  }
}

export { PythonUpstreamBrowserRuntime } from "./python-runtime.js"

export class RunnerProcess {
  private child: ChildProcess | null = null
  private temporaryDirectory: string | null = null
  private readonly pending = new Map<string, { resolve(value: JsonValue): void; reject(error: unknown): void;
    onHumanWait?: AuthoringHumanHandlers["onHumanWait"]; waitpointId?: string; resuming?: boolean;
    resumes?: { authorRequestId: string; waitpointId: string } } & CompilationPending>()
  private lines: readline.Interface | null = null
  private diagnosticLines: readline.Interface | null = null
  private termination: Promise<void> | null = null
  private cleanup: Promise<RunnerCleanupReport> | null = null
  private managedWindow: { ownerId: string; profilePath: string } | null = null
  private hybridConnectionOwner: string | undefined
  constructor(private readonly root: string, private readonly signal: AbortSignal,
    private readonly onDiagnostic?: (line: string) => void,
    private readonly lifecycle: { runnerScript?: string; closeTimeoutMs?: number; childCloseTimeoutMs?: number;
      removeTemporaryDirectory?: typeof rm; runnerEnvironment?: Record<string, string>;
      resolveBrowserEndpoint?: typeof resolveDailyChromeEndpoint; browserMode?: BrowserMode;
      resolveExtensionEndpoint?: () => Promise<string | undefined> } = {}) {}

  envValue(name: string) { const value = process.env[name]?.trim(); return value || undefined }
  envBoolean(name: string, fallback: boolean) {
    const value = this.envValue(name)
    return value === undefined ? fallback : value === "true" || value === "1"
  }

  async start(config: Omit<ReturnType<typeof runnerStartRequestSchema.parse>, "id" | "type">["config"]) {
    retireWorkflowV1()
  }

  async startHybrid(config: Omit<ReturnType<typeof hybridStartRequestSchema.parse>["config"], "allowedSites">) {
    const mode = this.lifecycle.browserMode ?? "daily"
    const extensionEndpoint = mode === "daily" && !config.existingBrowser
      ? await this.lifecycle.resolveExtensionEndpoint?.() : undefined
    // WHY：专属 Profile 已由 B-U 与既有窗口 owner 实现；选择专属模式不能探测/借用日常 Chrome。
    const connection = mode === "daily"
      ? await dailyChromeConnection(config, extensionEndpoint ?? this.envValue("BAT_UPSTREAM_BROWSER_CDP_URL"),
        this.lifecycle.resolveBrowserEndpoint ?? resolveDailyChromeEndpoint)
      : { ...config, headless: mode === "dedicated-headless", connectionOwnerId: undefined,
        existingBrowser: undefined }
    if (mode !== "daily" && config.existingBrowser) throw new Error("hybrid_browser_environment_owner_conflict")
    const windowOwner = connection.existingBrowser ?? connection.managedWindow
    this.managedWindow = windowOwner ? { ownerId: windowOwner.ownerId,
      profilePath: config.profilePath } : null
    const request = hybridStartRequestSchema.parse({ id: randomUUID(), type: "hybrid_start",
      config: { ...connection, allowedSites: browserAllowedSites(config.allowedOrigins) } })
    if (this.cleanup) throw new Error("upstream_runner_already_closed")
    if (!config.connectionOwnerId || this.hybridConnectionOwner !== config.connectionOwnerId) {
      await this.launch("main.py")
      this.hybridConnectionOwner = config.connectionOwnerId
    }
    await this.request(request)
  }

  async startProfile(config: ReturnType<typeof hybridProfileStartRequestSchema.parse>["config"],
    onOwnership: (owner: RunnerOwnership) => Promise<void>) {
    this.managedWindow = { ownerId: config.ownerId, profilePath: config.profilePath }
    await this.launch("main.py")
    const owner = runnerOwnershipSchema.parse(await this.request(profileOwnerRequestSchema.parse({
      id: randomUUID(), type: "profile_owner", ownerId: config.ownerId, launcherPid: this.child?.pid })))
    if (owner.ownerId !== config.ownerId || path.resolve(owner.temporaryDirectory) !== this.temporaryDirectory
      || owner.launcher.pid !== this.child?.pid) throw new Error("hybrid_profile_runner_owner_mismatch")
    await onOwnership(owner)
    await this.request(hybridProfileStartRequestSchema.parse({ id: randomUUID(), type: "profile_start", config }))
  }

  async recoverProfile(input: Omit<ReturnType<typeof profileRecoverRequestSchema.parse>, "id" | "type">) {
    await this.launch("main.py")
    let window: ReturnType<typeof hybridManagedWindowResultSchema.parse>
    try { window = hybridManagedWindowResultSchema.parse(await this.request(profileRecoverRequestSchema.parse({
      id: randomUUID(), type: "profile_recover", ...input }))) }
    catch (error) { await this.close(); throw error }
    return { window, report: await this.close() }
  }

  async startCompiler() { await this.launch("main.py") }

  async handoff(): Promise<{ report: RunnerCleanupReport; lease: ReturnType<typeof hybridWindowLeaseSchema.parse> }> {
    if (!this.managedWindow) throw new Error("hybrid_managed_window_not_started")
    const lease = hybridWindowLeaseSchema.parse(await this.request(hybridHandoffRequestSchema.parse({
      id: randomUUID(), type: "hybrid_handoff" })))
    const report = await this.close()
    return { report, lease }
  }

  async managedWindowAction(input: { action: "inspect" | "focus" | "end" | "verify_closed"; profilePath: string;
    ownerId: string; leaseId: string }) {
    await this.launch("main.py")
    let window: ReturnType<typeof hybridManagedWindowResultSchema.parse>
    try {
      window = hybridManagedWindowResultSchema.parse(await this.request(hybridManagedWindowRequestSchema.parse({
        id: randomUUID(), type: "hybrid_managed_window", ...input })))
    } catch (error) {
      await this.close()
      throw error
    }
    return { window, report: await this.close() }
  }

  private async launch(entry: string) {
    this.signal.throwIfAborted()
    if (this.child) throw new Error("upstream_runner_already_started")
    if (this.cleanup) throw new Error("upstream_runner_already_closed")
    // WHY：Python 已记录 realpath；macOS /var 别名不能造成同一 owner 的身份失配。
    const ownerDirectory = await mkdtemp(path.join(await realpath(tmpdir()), "bat-hybrid-owner-"))
    this.temporaryDirectory = ownerDirectory
    const python = this.envValue("BAT_UPSTREAM_BROWSER_PYTHON")
      ?? path.join(this.root, "work", "upstream-browser-hybrid", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
    const script = this.lifecycle.runnerScript ?? path.join(this.root, "apps", "api", "python", "browser_use_runner", entry)
    const child = spawn(python, [script], { cwd: this.root, env: { PATH: process.env.PATH, LANG: "en_US.UTF-8",
      TMPDIR: this.temporaryDirectory, TMP: this.temporaryDirectory, TEMP: this.temporaryDirectory,
      PYTHONPATH: [path.join(this.root, "vendor", "workflow-use", "workflows"), path.join(this.root, "apps", "api", "python")].join(path.delimiter),
      PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false",
      BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false",
      // WHY：Windows 持久 Profile 可能由较新的系统 Chrome 创建；交给现有 Browser-Use owner
      // 查找系统浏览器，避免默认旧 Chromium 降级启动。owner 临时目录不含 bundled 浏览器。
      ...(process.platform === "win32" ? { PLAYWRIGHT_BROWSERS_PATH: ownerDirectory } : {}),
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
    const abort = () => {
      // WHY：取消原因属于本次请求，进程退出只属于清理；必须先保留原 reason，避免被 exit code 覆盖。
      this.rejectAll(this.signal.reason)
      child.stdin?.end(); void this.terminate(child).catch(() => {})
    }
    this.signal.addEventListener("abort", abort, { once: true })
    child.once("close", () => this.signal.removeEventListener("abort", abort))
    if (this.signal.aborted) abort()
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
          || stages.some((stage) => stage.stage === "browser_close" && stage.status === "unconfirmed")
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

  request(request: RunnerRequest | HybridRunnerRequest, onHumanWait?: AuthoringHumanHandlers["onHumanWait"],
    onCompilation?: CompilationHandler): Promise<JsonValue> {
    this.signal.throwIfAborted()
    const child = this.child
    if (!child?.stdin?.writable) return Promise.reject(new Error("upstream_runner_unavailable"))
    return new Promise<JsonValue>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, ...(onHumanWait ? { onHumanWait } : {}),
        ...(onCompilation ? { onCompilation } : {}),
        ...(request.type === "hybrid_author_resume" ? { resumes: request } : {}) })
      child.stdin!.write(`${JSON.stringify(request)}\n`, (error) => { if (error) { this.pending.delete(request.id); reject(error) } })
    }).then((value) => { this.signal.throwIfAborted(); return value })
  }
  private accept(line: string) {
    let raw: unknown
    try { raw = JSON.parse(line) } catch { return this.rejectAll(new Error("upstream_protocol_invalid")) }
    if (raw && typeof raw === "object" && "event" in raw) {
      if (raw.event !== "authoring_compilation") return this.acceptHumanWait(raw)
      const event = compilationCheckpointSchema.safeParse(raw)
      const pending = event.success ? this.pending.get(event.data.id) : undefined
      if (!event.success || !pending?.onCompilation) {
        return this.rejectAll(new Error("hybrid_compilation_protocol_invalid"))
      }
      // 校验失败仍让原 author 返回来源；错误来源由保存层留档，不能丢掉主请求。
      void receiveCompilation(event.data, pending, this.signal, (ack) => this.request(ack)).catch(error => {
        if (error instanceof Error && error.message === "hybrid_compilation_inflight_conflict") this.rejectAll(error)
      })
      return
    }
    const response = runnerResponseSchema.safeParse(raw)
    if (!response.success) return this.rejectAll(new Error("upstream_protocol_invalid"))
    const pending = this.pending.get(response.data.id)
    if (!pending) return
    this.pending.delete(response.data.id)
    if (response.data.ok) {
      if (pending.resumes) {
        const parsed = authoringHumanResumeResultSchema.safeParse(response.data.result)
        if (!parsed.success) { pending.reject(new Error("upstream_human_resume_invalid")); return }
        const author = this.pending.get(pending.resumes.authorRequestId)
        // WHY：fd3 可在同一读事件内交付 ACK 和下一处等待；先清旧身份，Promise 回调不能阻挡新事件。
        if (author?.waitpointId === pending.resumes.waitpointId) {
          delete author.waitpointId; author.resuming = false
        }
      }
      pending.resolve(response.data.result)
    }
    else pending.reject(new UpstreamProtocolError(response.data.code, response.data.reason ?? null))
  }
  private acceptHumanWait(raw: unknown) {
    const event = authoringHumanEventSchema.safeParse(raw)
    if (!event.success) return this.rejectAll(new Error("upstream_human_protocol_invalid"))
    const { id, wait } = event.data, pending = this.pending.get(id)
    if (!pending?.onHumanWait || pending.waitpointId) {
      return this.rejectAll(new Error("upstream_human_handler_unavailable"))
    }
    pending.waitpointId = wait.id
    try {
      pending.onHumanWait(wait, async () => {
        // WHY：继续只作用于仍在等待的原请求；旧闭包或并发点击不能唤醒另一准备任务。
        if (this.pending.get(id) !== pending || pending.waitpointId !== wait.id || pending.resuming) {
          throw new Error("upstream_human_wait_changed")
        }
        pending.resuming = true
        try {
          const result = await this.request(hybridAuthorResumeRequestSchema.parse({ id: randomUUID(),
            type: "hybrid_author_resume", authorRequestId: id, waitpointId: wait.id }))
          authoringHumanResumeResultSchema.parse(result)
        } finally { if (pending.waitpointId === wait.id) pending.resuming = false }
      })
    } catch (error) { this.rejectAll(error) }
  }
  private rejectAll(error: unknown) { for (const pending of this.pending.values()) pending.reject(error); this.pending.clear() }
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
    reportedInvocations: status === "intended" ? null : 1,
    ...(audit.event.type === "generation.failed" ? {
      failureCategory: "ai_event_failure" as const, failureCode: audit.event.code,
    } : {}) }
}
