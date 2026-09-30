import path from "node:path"
import type { AI } from "@agent-platform/ai-connect/server"
import type { TaskChainCapabilities } from "@browser-capture/runtime"
import { RunnerProcess, type UpstreamBrowserRuntime, type UpstreamBrowserSession } from "./service.js"
import { withHybridCapabilities } from "./hybrid-runtime.js"
import { withHybridAuthoring, recompileHybridSource, type HybridAuthorSession } from "./hybrid-exploration.js"
import { verifyForkSource } from "../../../../vendor/workflow-use/verify-source.mjs"
import { retireWorkflowV1 } from "./retirement.js"
import { TaskConnection } from "./task-connection.js"

type AuthoringInput = Parameters<NonNullable<UpstreamBrowserRuntime["withAuthoring"]>>[0]
type CapabilitiesInput = Parameters<NonNullable<UpstreamBrowserRuntime["withCapabilities"]>>[0]

/** WHY：复用仍由原上游控制器执行；此适配只管理任务父连接与单次运行的借用边界。 */
export class PythonUpstreamBrowserRuntime implements UpstreamBrowserRuntime {
  constructor(private readonly options: { root: string; directory: string; subject: ReturnType<AI["forSubject"]> },
    private readonly connection = new TaskConnection(options.root)) {}

  sourceDigest() { return verifyForkSource(this.options.root) }
  close() { return this.connection.close() }
  recompile(input: Omit<Parameters<typeof recompileHybridSource>[0], "root" | "directory" | "subject">) {
    return recompileHybridSource({ ...input, ...this.options })
  }

  withAuthoring<T>(input: AuthoringInput, work: (session: HybridAuthorSession) => Promise<T>): Promise<T> {
    return withHybridAuthoring({ ...input, ...this.options }, work, input.connectionOwnerId ? {
      createRunner: (_root, signal, onDiagnostic) => this.connection.borrow({
        connectionOwnerId: input.connectionOwnerId!, signal, ...(onDiagnostic ? { onDiagnostic } : {}) }),
    } : {})
  }

  withCapabilities<T>(input: CapabilitiesInput, work: (capabilities: TaskChainCapabilities) => Promise<T>): Promise<T> {
    return withHybridCapabilities({ ...input, root: this.options.root, directory: this.options.directory,
      // WHY：人工现场恢复接管已交付的旧页，不是创建新的 operation；保持既有租约恢复协议。
      ...(input.connectionOwnerId && !input.managedWindow?.resume ? {
        createRunner: (_root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void) =>
          this.connection.borrow({ connectionOwnerId: input.connectionOwnerId!, signal,
            ...(input.closeAfterOperation !== undefined ? { closeAfterOperation: input.closeAfterOperation } : {}),
            ...(onDiagnostic ? { onDiagnostic } : {}) }),
      } : {}), canRestoreByNavigation: input.canRestoreByNavigation ?? false }, work)
  }

  managedWindowAction(input: Parameters<NonNullable<UpstreamBrowserRuntime["managedWindowAction"]>>[0]) {
    const runner = new RunnerProcess(this.options.root, new AbortController().signal)
    return runner.managedWindowAction({ ...input,
      profilePath: path.join(this.options.directory, "browser-profile", "default") })
  }

  async withSession<T>(_input: Parameters<UpstreamBrowserRuntime["withSession"]>[0],
    _work: (session: UpstreamBrowserSession) => Promise<T>): Promise<T> {
    retireWorkflowV1()
    throw new Error("legacy_workflow_use_v1_retired")
  }
}
