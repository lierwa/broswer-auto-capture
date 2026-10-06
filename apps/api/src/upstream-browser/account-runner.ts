import { AsyncLocalStorage } from "node:async_hooks"
import type { RunnerProcess } from "./service.js"

type Entry = { runner: RunnerProcess; controller: AbortController; started: boolean }
type Scope = { entry: Entry | null; busy: boolean; closed: boolean }

/** WHY：复用原多请求协议，仅把账号进程寿命绑定到一次操作；不跨操作缓存浏览器或凭据。 */
export class AccountRunner {
  private scopes = new AsyncLocalStorage<Scope>()
  constructor(private create: (signal: AbortSignal) => RunnerProcess,
    private close: (runner: RunnerProcess) => Promise<unknown>) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.scopes.getStore()) return work()
    const scope: Scope = { entry: null, busy: false, closed: false }
    return this.scopes.run(scope, async () => {
      try { return await work() }
      finally { scope.closed = true; if (scope.entry) await this.close(scope.entry.runner) }
    })
  }

  async use<T>(signal: AbortSignal, work: (runner: RunnerProcess) => Promise<T>): Promise<T> {
    const scope = this.scopes.getStore()
    if (!scope) return this.run(() => this.use(signal, work))
    signal.throwIfAborted()
    if (scope.closed || scope.busy) throw Error("account_runner_scope_unavailable")
    const controller = new AbortController()
    const entry = scope.entry ??= { runner: this.create(controller.signal), controller, started: false }
    const abort = () => entry.controller.abort(signal.reason)
    scope.busy = true
    signal.addEventListener("abort", abort, { once: true })
    try {
      if (signal.aborted) abort()
      if (!entry.started) { await entry.runner.startCompiler(); entry.started = true }
      return await work(entry.runner)
    } catch (error) {
      // WHY：超时/取消后的进程不可接收后续请求；原生回滚若需要继续，将使用新的进程与信号。
      scope.entry = null
      await this.close(entry.runner)
      throw error
    } finally { signal.removeEventListener("abort", abort); scope.busy = false }
  }
}
