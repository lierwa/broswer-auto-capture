import {
  taskChainCommandSchema,
  taskChainDispatchResponseSchema,
  taskExecutionEventBatchSchema,
  taskWorkspaceDiagnosticsSchema,
  taskWorkspaceHistoryPageSchema,
  taskWorkspaceSnapshotSchema,
  type AcceptedTaskExecution,
  type TaskChainCommand,
  type TaskExecutionEventBatch,
  type TaskWorkspaceDiagnostics,
  type TaskWorkspaceHistoryPage,
  type TaskWorkspaceSnapshot,
} from "@browser-capture/contracts/api"
import {
  browserProfileStateSchema,
} from "@browser-capture/contracts/browser-profile"

class TaskChainRequestError extends Error {
  constructor(message: string, readonly code: string | null) { super(message) }
}

type HistoryKind = TaskWorkspaceHistoryPage["kind"]
type ConnectionView = {
  workspace: TaskWorkspaceSnapshot | null
  error: string
  errorCode: string | null
  pending: TaskChainCommand | null
  busy: boolean
  acceptedExecution: AcceptedTaskExecution | null
  executionId: string | null
  eventBatch: TaskExecutionEventBatch | null
  history: Partial<Record<HistoryKind, TaskWorkspaceHistoryPage>>
  historyBusy: HistoryKind | null
  diagnostics: TaskWorkspaceDiagnostics | null
  diagnosticsBusy: boolean
}

export class TaskChainConnection {
  private view: ConnectionView = {
    workspace: null, error: "", errorCode: null, pending: null, busy: false,
    acceptedExecution: null, executionId: null, eventBatch: null,
    history: {}, historyBusy: null, diagnostics: null, diagnosticsBusy: false,
  }
  private readonly listeners = new Set<() => void>()
  private diagnosticsRefreshPending = false
  private readonly endpoint: string

  constructor(readonly taskId: string, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.endpoint = `/api/task-chain?taskId=${encodeURIComponent(taskId)}`
  }

  snapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  private update(value: Partial<ConnectionView>) {
    this.view = { ...this.view, ...value }
    for (const listener of this.listeners) listener()
  }

  accept(raw: unknown) {
    const workspace = taskWorkspaceSnapshotSchema.parse(raw)
    if (workspace.taskId !== this.taskId) throw new Error("任务链路归属不匹配")
    if (this.view.workspace && workspace.stateSequence < this.view.workspace.stateSequence) return
    const executionId = workspace.execution && executionMatchesWorkspace(workspace) ? workspace.execution.id : null
    this.update({ workspace, executionId,
      ...(executionId !== this.view.executionId ? { eventBatch: null, acceptedExecution: null } : {}) })
  }

  async reload(signal?: AbortSignal) {
    try {
      const response = await this.fetcher(this.endpoint, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const value: unknown = await response.json()
      if (!signal?.aborted) {
        this.accept(value)
        if (!this.view.pending) this.update({ error: "", errorCode: null })
      }
    } catch {
      if (!signal?.aborted) this.update({ error: "无法读取任务工作区；已加载的草稿和运行状态仍保留。", errorCode: null })
    }
  }

  async reloadExecutionEvents(signal?: AbortSignal) {
    const executionId = this.view.executionId
    if (!executionId) return
    const eventBatch = await this.readExecutionEvents(executionId, this.view.eventBatch, signal)
    if (eventBatch && !signal?.aborted && this.view.executionId === executionId) this.update({ eventBatch })
  }

  async readExecutionEvents(executionId: string, previous: TaskExecutionEventBatch | null = null, signal?: AbortSignal) {
    const after = previous?.executionId === executionId ? previous.next : 0
    try {
      const response = await this.fetcher(`/api/task-chain/events?taskId=${encodeURIComponent(this.taskId)}`
        + `&executionId=${encodeURIComponent(executionId)}&after=${after}`, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const next = taskExecutionEventBatchSchema.parse(await response.json())
      if (next.executionId !== executionId || next.events.some((event) => event.executionId !== executionId)) throw new Error()
      if (signal?.aborted) return null
      const priorEvents = previous?.executionId === executionId ? previous.events : []
      const events = [...priorEvents, ...next.events].filter((event, index, all) =>
        all.findIndex((candidate) => candidate.sequence === event.sequence) === index)
      return { ...next, after: 0, events }
    } catch {
      if (!signal?.aborted) this.update({ error: "运行事件暂时中断；将从上次序列继续。", errorCode: null })
    }
    return null
  }

  async readHistoricalExecutionEvents(executionId: string, signal?: AbortSignal) {
    // WHY：历史事件只返回给按需详情；不能写入当前画布的 eventBatch 或改变 executionId。
    let batch: TaskExecutionEventBatch | null = null
    while (!signal?.aborted) {
      const next = await this.readExecutionEvents(executionId, batch, signal)
      if (!next) return null
      if (next.next <= (batch?.next ?? 0) || next.events.length === batch?.events.length) return next
      batch = next
    }
    return null
  }

  async reloadHistory(kind: HistoryKind, offset = 0, signal?: AbortSignal) {
    if (this.view.historyBusy) return false
    this.update({ historyBusy: kind })
    try {
      const response = await this.fetcher(`/api/task-chain/history?taskId=${encodeURIComponent(this.taskId)}`
        + `&kind=${kind}&offset=${offset}&limit=20`, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const page = taskWorkspaceHistoryPageSchema.parse(await response.json())
      if (page.kind !== kind) throw new Error()
      if (!signal?.aborted) {
        const previous = offset > 0 ? this.view.history[kind] : undefined
        const items = previous?.kind === page.kind ? [...previous.items, ...page.items] : page.items
        this.update({ history: { ...this.view.history, [kind]: { ...page, items } }, error: "", errorCode: null })
      }
      return true
    } catch {
      if (!signal?.aborted) this.update({ error: "历史记录暂时无法读取。", errorCode: null })
      return false
    } finally {
      if (!signal?.aborted) this.update({ historyBusy: null })
    }
  }

  async reloadDiagnostics(signal?: AbortSignal) {
    // WHY：失败 job 的诊断可能在旧请求进行中更新；不能丢掉用户打开恢复面板时的刷新。
    if (this.view.diagnosticsBusy) {
      if (!signal?.aborted) this.diagnosticsRefreshPending = true
      return false
    }
    this.update({ diagnosticsBusy: true })
    try {
      const response = await this.fetcher(`/api/task-chain/diagnostics?taskId=${encodeURIComponent(this.taskId)}`,
        { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const diagnostics = taskWorkspaceDiagnosticsSchema.parse(await response.json())
      if (!signal?.aborted) this.update({ diagnostics, error: "", errorCode: null })
      return true
    } catch {
      if (!signal?.aborted) this.update({ error: "诊断信息暂时无法读取。", errorCode: null })
      return false
    } finally {
      this.update({ diagnosticsBusy: false })
      if (this.diagnosticsRefreshPending) {
        this.diagnosticsRefreshPending = false
        void this.reloadDiagnostics()
      }
    }
  }

  async dispatch(raw: unknown) {
    if (this.view.busy) return false
    const command = taskChainCommandSchema.parse(raw)
    this.update({ busy: true, pending: command, error: "", errorCode: null })
    try {
      const response = await this.fetcher(this.endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command) })
      const value: unknown = await response.json()
      if (!response.ok) {
        const failure = value as { error?: string; code?: string }
        throw new TaskChainRequestError(failure.error ?? "操作未完成，请刷新后重试。", failure.code ?? null)
      }
      const result = taskChainDispatchResponseSchema.parse(value)
      this.accept(result.snapshot)
      this.update({ pending: null, error: "", errorCode: null,
        ...(result.acceptedExecution ? { acceptedExecution: result.acceptedExecution,
          executionId: result.acceptedExecution.executionId, eventBatch: null } : {}) })
      return true
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : "操作未完成，请刷新后重试。",
        errorCode: error instanceof TaskChainRequestError ? error.code : null })
      await this.reload()
      return false
    } finally {
      this.update({ busy: false })
    }
  }

  async controlHandoff(action: "inspect" | "focus" | "end", executionId: string, expectedSequence: number) {
    if (this.view.busy) return false
    this.update({ busy: true, error: "", errorCode: null })
    try {
      const response = await this.fetcher(`/api/task-chain/handoff?taskId=${encodeURIComponent(this.taskId)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, executionId, expectedSequence, requestId: crypto.randomUUID() }),
      })
      const value: unknown = await response.json()
      if (!response.ok) {
        const failure = value as { error?: string; code?: string }
        throw new TaskChainRequestError(failure.error ?? "浏览器现场操作未完成。", failure.code ?? null)
      }
      this.accept(value)
      this.update({ error: "", errorCode: null })
      return true
    } catch (error) {
      // WHY：刷新真实现场后再保留本次失败，避免 reload 的成功反馈吞掉聚焦拒绝。
      await this.reload()
      this.update({ error: error instanceof Error ? error.message : "浏览器现场操作未完成。",
        errorCode: error instanceof TaskChainRequestError ? error.code : null })
      return false
    } finally { this.update({ busy: false }) }
  }

  retry = () => this.view.pending ? this.dispatch(this.view.pending) : Promise.resolve(false)

  async closeBrowserProfileAndRetry() {
    const command = this.view.pending
    if (!command || this.view.busy) return false
    this.update({ busy: true, error: "正在关闭专用浏览器…", errorCode: null })
    try {
      const response = await this.fetcher("/api/browser-profile", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "close" }) })
      const value: unknown = await response.json()
      if (!response.ok) throw new Error((value as { error?: string }).error ?? "专用浏览器没有正常关闭，请重试。")
      browserProfileStateSchema.parse(value)
    } catch (error) {
      this.update({ busy: false, error: error instanceof Error ? error.message : "专用浏览器没有正常关闭，请重试。",
        errorCode: "browser_profile_close_failed" })
      return false
    }
    this.update({ busy: false, error: "", errorCode: null })
    return this.dispatch(command)
  }

  dismiss = () => this.update({ pending: null, error: "", errorCode: null })
}

function executionMatchesWorkspace(workspace: TaskWorkspaceSnapshot) {
  const execution = workspace.execution
  if (!execution) return false
  if (workspace.draft) return execution.draft?.id === workspace.draft.id
    && execution.draft.revision === workspace.draft.revision && execution.draft.checksum === workspace.draft.checksum
  return Boolean(workspace.release && execution.release?.id === workspace.release.reference.id
    && execution.release.version === workspace.release.reference.version
    && execution.release.digest === workspace.release.reference.digest)
}
