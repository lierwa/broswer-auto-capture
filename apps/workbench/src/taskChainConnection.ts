import {
  taskChainCommandSchema,
  taskChainDispatchResponseSchema,
  taskExecutionEventBatchSchema,
  taskExecutionDetailSchema,
  taskWorkspaceDiagnosticsSchema,
  taskWorkspaceHistoryPageSchema,
  taskWorkspaceSnapshotSchema,
  type AcceptedTaskExecution,
  type TaskChainCommand,
  type TaskExecutionEventBatch,
  type TaskExecutionDetail,
  type TaskExecutionReviewReceipt,
  type TaskWorkspaceDiagnostics,
  type TaskWorkspaceHistoryPage,
  type TaskWorkspaceSnapshot,
} from "@browser-capture/contracts/api"
import {
  browserProfileStateSchema,
} from "@browser-capture/contracts/browser-profile"
import { z } from "zod"
import { jsonLines, reconnect } from "./stateStream.js"

class TaskChainRequestError extends Error {
  constructor(message: string, readonly code: string | null) { super(message) }
}

type HistoryKind = TaskWorkspaceHistoryPage["kind"]
type ReviewCommand = Extract<TaskChainCommand, { type: "review_execution" }>
type ReviewIntent = { command: ReviewCommand; saved: TaskExecutionReviewReceipt | null; busy: boolean; error: string }
type ConnectionView = {
  workspace: TaskWorkspaceSnapshot | null
  error: string
  errorCode: string | null
  pending: TaskChainCommand | null
  busy: boolean
  acceptedExecution: AcceptedTaskExecution | null
  executionId: string | null
  eventBatch: TaskExecutionEventBatch | null
  executionDetail: TaskExecutionDetail | null
  detailBusy: boolean
  detailError: string
  savedReview: TaskExecutionReviewReceipt | null
  reviewIntents: Record<string, ReviewIntent>
  history: Partial<Record<HistoryKind, TaskWorkspaceHistoryPage>>
  historyBusy: HistoryKind | null
  diagnostics: TaskWorkspaceDiagnostics | null
  diagnosticsBusy: boolean
}

export class TaskChainConnection {
  private view: ConnectionView = {
    workspace: null, error: "", errorCode: null, pending: null, busy: false,
    acceptedExecution: null, executionId: null, eventBatch: null,
    executionDetail: null, detailBusy: false, detailError: "", savedReview: null, reviewIntents: {},
    history: {}, historyBusy: null, diagnostics: null, diagnosticsBusy: false,
  }
  private readonly listeners = new Set<() => void>()
  private diagnosticsRefreshPending = false
  private detailSequence = -1
  private readonly endpoint: string

  constructor(readonly taskId: string, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.endpoint = `/api/task-chain?taskId=${encodeURIComponent(taskId)}`
  }

  snapshot = () => this.view
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  private update(value: Partial<ConnectionView>) {
    if (Object.entries(value).every(([key, next]) => Object.is(this.view[key as keyof ConnectionView], next))) return
    this.view = { ...this.view, ...value }
    for (const listener of this.listeners) listener()
  }

  private updateReview(executionId: string, intent: ReviewIntent | null) {
    const reviewIntents = { ...this.view.reviewIntents }
    if (intent) reviewIntents[executionId] = intent
    else delete reviewIntents[executionId]
    this.update({ reviewIntents })
  }

  // WHY：请求身份属于同任务连接；关闭面板、切换节点或响应丢失都不能重新保存同一反馈。
  async submitReview(raw: ReviewCommand, send: (review: TaskExecutionReviewReceipt) => Promise<boolean>) {
    const command = this.view.reviewIntents[raw.executionId]?.command ?? raw
    const prior = this.view.reviewIntents[command.executionId]
    if (prior?.busy || this.view.busy) return false
    let intent: ReviewIntent = { command, saved: prior?.saved ?? null, busy: true, error: "" }
    this.updateReview(command.executionId, intent)
    try {
      if (!intent.saved) {
        if (!await this.dispatch(command)) return false
        const saved = this.view.savedReview
        if (!saved || saved.context?.executionId !== command.executionId || saved.decision !== command.decision
          || saved.feedback !== command.feedback || JSON.stringify(saved.context.selection) !== JSON.stringify(command.selection ?? null)) {
          throw new Error("本次反馈回执未返回，请重试同一提交。")
        }
        intent = { ...intent, saved }; this.updateReview(command.executionId, intent)
      }
      const saved = intent.saved
      if (!saved) throw new Error("反馈回执未返回，请重试同一提交。")
      if (saved.decision === "requirement_revision" && !await send(saved)) {
        throw new Error("说明尚未提交到需求对话。原文字和已保存反馈保留；请重试，或先处理需求对话中的已有请求。")
      }
      this.updateReview(command.executionId, null)
      return true
    } catch (error) {
      intent = { ...intent, error: error instanceof Error ? error.message : "提交未完成，请重试。" }
      return false
    } finally {
      if (this.view.reviewIntents[command.executionId]) this.updateReview(command.executionId, { ...intent, busy: false })
    }
  }

  resetStaleReview(executionId: string) {
    const intent = this.view.reviewIntents[executionId]
    if (this.view.errorCode !== "execution_review_stale" || intent?.busy || intent?.saved) return
    this.updateReview(executionId, null); this.dismiss()
  }

  accept(raw: unknown) {
    const workspace = taskWorkspaceSnapshotSchema.parse(raw)
    if (workspace.taskId !== this.taskId) throw new Error("任务链路归属不匹配")
    if (this.view.workspace && workspace.stateSequence <= this.view.workspace.stateSequence) return
    preserveWorkspaceReferences(workspace, this.view.workspace)
    const executionId = workspace.execution && executionMatchesWorkspace(workspace) ? workspace.execution.id : null
    if (executionId !== this.view.executionId) this.detailSequence = -1
    this.update({ workspace, executionId,
      ...(executionId !== this.view.executionId ? { eventBatch: null, acceptedExecution: null, executionDetail: null } : {}) })
  }

  async reload(signal?: AbortSignal) {
    try {
      const response = await this.fetcher(this.endpoint, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const value: unknown = await response.json()
      if (!signal?.aborted) {
        this.accept(value)
        if (!this.view.pending) this.update({ error: "", errorCode: null })
        return true
      }
    } catch {
      if (!signal?.aborted) this.update({ error: "无法读取任务工作区；已加载的草稿和运行状态仍保留。", errorCode: null })
    }
    return false
  }

  async observe(signal: AbortSignal) {
    let consumed = -1, failures = 0
    while (!signal.aborted) {
      try {
        consumed = await this.refresh(signal)
        const response = await this.fetcher(`/api/task-chain/changes?taskId=${encodeURIComponent(this.taskId)}&after=${consumed}`, { signal })
        for await (const item of jsonLines(response, signal)) {
          const sequence = z.number().int().nonnegative().parse(item)
          if (sequence > consumed) consumed = await this.refresh(signal)
          failures = 0
        }
        if (!signal.aborted) throw new Error("状态流中断")
      } catch {
        if (!signal.aborted) {
          this.update({ error: "状态连接中断，正在重新连接；已加载的运行事实保留。", errorCode: null })
          // WHY：仅故障重连退避；健康连接和已完成任务没有周期请求。
          await reconnect(signal, failures++)
        }
      }
    }
  }

  private async refresh(signal: AbortSignal) {
    if (!await this.reload(signal) || signal.aborted) throw new Error("工作区未读取")
    // WHY：POST 可在后续读取期间 accept 更高版本；只确认本次实际完整消费的版本。
    const sequence = this.view.workspace!.stateSequence
    if (this.view.executionId) {
      if (!await this.reloadExecutionEvents(signal)) throw new Error("运行事件未读取")
      if ((!this.view.executionDetail || this.detailSequence !== sequence)
        && !await this.reloadExecutionDetail(signal, sequence)) throw new Error("调用未读取")
    }
    return sequence
  }

  async reloadExecutionEvents(signal?: AbortSignal) {
    const executionId = this.view.executionId
    if (!executionId) return true
    const eventBatch = await this.readCompleteExecutionEvents(executionId, this.view.eventBatch, signal)
    if (!eventBatch || signal?.aborted || this.view.executionId !== executionId) return false
    this.update({ eventBatch }); return true
  }

  async readExecutionDetail(executionId: string, signal?: AbortSignal, includeContent = true) {
    try {
      const response = await this.fetcher(`/api/task-chain/execution?taskId=${encodeURIComponent(this.taskId)}`
        + `&executionId=${encodeURIComponent(executionId)}&includeContent=${includeContent}`, { signal: signal ?? null })
      if (!response.ok) throw new Error()
      const detail = taskExecutionDetailSchema.parse(await response.json())
      if (detail.execution.taskId !== this.taskId || detail.execution.id !== executionId) throw new Error()
      return signal?.aborted ? null : detail
    } catch { return null }
  }

  async reloadExecutionDetail(signal?: AbortSignal, sequence = this.view.workspace?.stateSequence ?? -1) {
    const executionId = this.view.executionId
    if (!executionId || this.view.detailBusy) return false
    if (!this.view.executionDetail) this.update({ detailBusy: true })
    try {
      const detail = await this.readExecutionDetail(executionId, signal, false)
      if (signal?.aborted || this.view.executionId !== executionId) return false
      if (detail) this.detailSequence = sequence
      this.update({
        ...(detail ? { executionDetail: detail } : {}), detailError: detail ? "" : "本次调用详情暂时无法读取。",
        detailBusy: false,
      })
      return Boolean(detail)
    } finally { this.update({ detailBusy: false }) }
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
      if (previous?.executionId === executionId && !next.events.length && next.next === previous.next
        && next.executionSequence === previous.executionSequence && next.status === previous.status) return previous
      const seen = new Set(priorEvents.map(event => event.sequence))
      const events = [...priorEvents]
      for (const event of next.events) if (!seen.has(event.sequence)) { seen.add(event.sequence); events.push(event) }
      return { ...next, after: 0, events }
    } catch {
      if (!signal?.aborted) this.update({ error: "运行事件暂时中断；将从上次序列继续。", errorCode: null })
    }
    return null
  }

  async readHistoricalExecutionEvents(executionId: string, signal?: AbortSignal) {
    // WHY：历史事件只返回给按需详情；不能写入当前画布的 eventBatch 或改变 executionId。
    return this.readCompleteExecutionEvents(executionId, null, signal)
  }

  private async readCompleteExecutionEvents(executionId: string, batch: TaskExecutionEventBatch | null, signal?: AbortSignal) {
    // WHY：通知可合并，尾部可能已完成；沿既有游标读尽，不能等待下一次写入才补后页。
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
    this.update({ busy: true, pending: command, error: "", errorCode: null,
      ...(command.type === "review_execution" ? { savedReview: null } : {}) })
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
      const accepted = result.snapshot.stateSequence >= (this.view.workspace?.stateSequence ?? -1) ? result.acceptedExecution : null
      const changed = accepted && accepted.executionId !== this.view.executionId
      if (changed) this.detailSequence = -1
      this.update({ pending: null, error: "", errorCode: null,
        ...(result.savedReview ? { savedReview: result.savedReview } : {}),
        ...(accepted ? { acceptedExecution: accepted, executionId: accepted.executionId } : {}),
        ...(changed ? { eventBatch: null, executionDetail: null } : {}) })
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

function preserveWorkspaceReferences(next: TaskWorkspaceSnapshot, previous: TaskWorkspaceSnapshot | null) {
  if (!previous) return
  if (next.requirement && previous.requirement && next.requirement.id === previous.requirement.id
    && next.requirement.version === previous.requirement.version && next.requirement.revision === previous.requirement.revision) {
    next.requirement = previous.requirement
  }
  if (next.release && previous.release && next.release.reference.id === previous.release.reference.id
    && next.release.reference.version === previous.release.reference.version && next.release.reference.digest === previous.release.reference.digest) {
    next.release = previous.release
  }
  if (next.draft && previous.draft && next.draft.id === previous.draft.id
    && next.draft.revision === previous.draft.revision && next.draft.checksum === previous.draft.checksum) {
    // WHY：相同内容仍可能增加试跑验证记录；只复用冻结内容，保留新 envelope。
    next.draft.content = previous.draft.content
  }
  if (next.execution && previous.execution && next.execution.id === previous.execution.id
    && next.execution.sequence === previous.execution.sequence) next.execution = previous.execution
  if (next.activity && previous.activity && next.activity.id === previous.activity.id
    && next.activity.sequence === previous.activity.sequence) next.activity = previous.activity
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
