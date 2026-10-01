import path from "node:path"
import type { AI } from "@agent-platform/ai-connect/server"
import type { TaskChainCapabilities } from "@browser-capture/runtime"
import { RunnerProcess, type UpstreamBrowserRuntime, type UpstreamBrowserSession } from "./service.js"
import { withHybridCapabilities } from "./hybrid-runtime.js"
import { withHybridAuthoring, recompileHybridSource, type HybridAuthorSession } from "./hybrid-exploration.js"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { retireWorkflowV1 } from "./retirement.js"
import { TaskConnection } from "./task-connection.js"
import type { BrowserMode } from "@browser-capture/contracts/browser-profile"

type AuthoringInput = Parameters<NonNullable<UpstreamBrowserRuntime["withAuthoring"]>>[0]
type CapabilitiesInput = Parameters<NonNullable<UpstreamBrowserRuntime["withCapabilities"]>>[0]

/** WHY：复用仍由原上游控制器执行；此适配只管理任务父连接与单次运行的借用边界。 */
export class PythonUpstreamBrowserRuntime implements UpstreamBrowserRuntime {
  constructor(private readonly options: { root: string; directory: string; subject: ReturnType<AI["forSubject"]>;
    browserMode?: () => BrowserMode; dailyChromeEndpoint?: () => Promise<string | undefined> },
    private readonly connection = new TaskConnection(options.root, (root, signal, diagnostic) =>
      new RunnerProcess(root, signal, diagnostic, { ...(options.dailyChromeEndpoint ? { resolveExtensionEndpoint: options.dailyChromeEndpoint } : {}) }))) {}

  sourceDigest() { return verifyForkSource(this.options.root) }
  close() { return this.connection.close() }
  recompile(input: Omit<Parameters<typeof recompileHybridSource>[0], "root" | "directory" | "subject">) {
    return recompileHybridSource({ ...input, ...this.options })
  }

  async withAuthoring<T>(input: AuthoringInput, work: (session: HybridAuthorSession) => Promise<T>): Promise<T> {
    const mode = input.browserMode ?? this.options.browserMode?.() ?? "daily"
    if (mode !== "daily") await this.closeIdleConnection()
    const dedicated = mode !== "daily" ? { createRunner: (root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) =>
      new RunnerProcess(root, signal, onDiagnostic, { browserMode: mode }) } : undefined
    return withHybridAuthoring({ ...input, ...this.options, headless: mode === "dedicated-headless" }, work, dedicated ?? (input.connectionOwnerId ? {
      createRunner: (_root, signal, onDiagnostic) => this.connection.borrow({
        connectionOwnerId: input.connectionOwnerId!, signal, ...(onDiagnostic ? { onDiagnostic } : {}) }),
    } : { createRunner: (root, signal, diagnostic) => new RunnerProcess(root, signal, diagnostic,
      { ...(this.options.dailyChromeEndpoint ? { resolveExtensionEndpoint: this.options.dailyChromeEndpoint } : {}) }) }))
  }

  async withCapabilities<T>(input: CapabilitiesInput, work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
    const mode = input.browserMode ?? (input.headless ? "dedicated-headless" : this.options.browserMode?.() ?? "daily")
    if (mode !== "daily") await this.closeIdleConnection()
    return withHybridCapabilities({ ...input, root: this.options.root, directory: this.options.directory,
      ...(mode !== "daily" ? { createRunner: (root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) =>
        new RunnerProcess(root, signal, onDiagnostic, { browserMode: mode }) } : {}),
      // WHY：人工现场恢复接管已交付的旧页，不是创建新的 operation；保持既有租约恢复协议。
      ...(mode === "daily" && input.connectionOwnerId && !input.managedWindow?.resume ? {
        createRunner: (_root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) =>
          this.connection.borrow({ connectionOwnerId: input.connectionOwnerId!, signal,
            ...(input.closeAfterOperation !== undefined ? { closeAfterOperation: input.closeAfterOperation } : {}),
            ...(onDiagnostic ? { onDiagnostic } : {}) }),
      } : mode === "daily" && !input.managedWindow?.resume && this.options.dailyChromeEndpoint ? {
        createRunner: (root: string, signal: AbortSignal, diagnostic?: (line: string) => void) =>
          new RunnerProcess(root, signal, diagnostic, { resolveExtensionEndpoint: this.options.dailyChromeEndpoint! }),
      } : {}), canRestoreByNavigation: input.canRestoreByNavigation ?? false }, work)
  }

  managedWindowAction(input: Parameters<NonNullable<UpstreamBrowserRuntime["managedWindowAction"]>>[0]) {
    const runner = new RunnerProcess(this.options.root, new AbortController().signal)
    return runner.managedWindowAction({ ...input,
      profilePath: path.join(this.options.directory, "browser-profile", "default") })
  }
  private async closeIdleConnection() {
    const report = await this.connection.close()
    if (report.status !== "confirmed") throw new Error("hybrid_task_connection_cleanup_required")
  }

  async withSession<T>(_input: Parameters<UpstreamBrowserRuntime["withSession"]>[0],
    _work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T> {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
}
