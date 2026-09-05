import { createHash } from "node:crypto"
import { Annotation, Command, END, interrupt, START, StateGraph } from "@langchain/langgraph"
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite"
import {
  runAuditSchema,
  runBindingSchema,
  runRequestSchema,
  type ExecutionEvent,
  type RunAudit,
  type RunBinding,
  type RunItem,
  type RunRequest,
} from "@browser-capture/contracts/run"

type RunStatus = "running" | "paused" | "cancelled" | "completed" | "failed"
type PlannedAttempt = { stableKey: string; idempotencyKey: string } | null

const runState = Annotation.Root({
  binding: Annotation<RunBinding | null>({ reducer: (_current, update) => update, default: () => null }),
  inputs: Annotation<RunItem[]>({ reducer: (_current, update) => update, default: () => [] }),
  cursor: Annotation<number>({ reducer: (_current, update) => update, default: () => 0 }),
  results: Annotation<Record<string, string>>({ reducer: (current, update) => ({ ...current, ...update }), default: () => ({}) }),
  events: Annotation<ExecutionEvent[]>({ reducer: (current, update) => [...current, ...update], default: () => [] }),
  activeAttempt: Annotation<PlannedAttempt>({ reducer: (_current, update) => update, default: () => null }),
  pauseAfterItems: Annotation<number | null>({ reducer: (_current, update) => update, default: () => null }),
  status: Annotation<RunStatus>({ reducer: (_current, update) => update, default: () => "running" }),
})

type InternalState = typeof runState.State

export interface OrdinaryAdapterContext {
  signal?: AbortSignal
  idempotencyKey: string
}

export interface OrdinaryAdapter {
  execute(item: RunItem, context: OrdinaryAdapterContext): Promise<string>
}

export interface ResumeVerification {
  ok: boolean
  detail: string
}

export interface OrdinaryRunDependencies {
  adapter: OrdinaryAdapter
  verifyResume(binding: RunBinding): Promise<ResumeVerification>
  nodeId?: string
}

export interface RunControl {
  pauseAfterItems?: number
  signal?: AbortSignal
}

export interface OrdinaryRunResult {
  audit: RunAudit
  binding: RunBinding
  cursor: number
  results: Record<string, string>
}

const MAX_GRAPH_STEPS = 4_096

function timestamp() {
  return new Date().toISOString()
}

function inputsFingerprint(request: RunRequest) {
  return createHash("sha256").update(JSON.stringify(request.inputs)).digest("hex")
}

function bindingFor(request: RunRequest): RunBinding {
  return runBindingSchema.parse({
    runId: request.runId,
    workflowId: request.workflowId,
    workflowVersion: request.workflowVersion,
    inputsFingerprint: inputsFingerprint(request),
  })
}

function dedupeInputs(inputs: RunItem[]) {
  const seen = new Set<string>()
  return inputs.filter((item) => {
    if (seen.has(item.stableKey)) return false
    seen.add(item.stableKey)
    return true
  })
}

function recursionLimit(inputCount: number) {
  return Math.min(MAX_GRAPH_STEPS, Math.max(64, inputCount * 3 + 32))
}

function invocationConfig(runId: string, inputCount: number, signal?: AbortSignal) {
  const base = { configurable: { thread_id: runId }, recursionLimit: recursionLimit(inputCount) }
  return signal ? { ...base, signal } : base
}

function assertSameBinding(saved: RunBinding, requested: RunBinding) {
  if (saved.runId !== requested.runId) throw new Error("运行 ID 与检查点不一致")
  if (saved.workflowId !== requested.workflowId || saved.workflowVersion !== requested.workflowVersion) {
    throw new Error("恢复拒绝更换 workflow ID 或版本")
  }
  if (saved.inputsFingerprint !== requested.inputsFingerprint) throw new Error("恢复拒绝更换运行输入")
}

function resultFrom(state: InternalState): OrdinaryRunResult {
  if (!state.binding) throw new Error("检查点缺少运行绑定")
  return {
    binding: state.binding,
    cursor: state.cursor,
    results: state.results,
    audit: runAuditSchema.parse({
      runId: state.binding.runId,
      workflowId: state.binding.workflowId,
      workflowVersion: state.binding.workflowVersion,
      status: state.status,
      completedStableKeys: Object.keys(state.results),
      events: state.events,
    }),
  }
}

function resumePayload(value: unknown): ResumeVerification {
  if (!value || typeof value !== "object") throw new Error("恢复验证结果无效")
  const ok = Reflect.get(value, "ok")
  const detail = Reflect.get(value, "detail")
  if (ok !== true || typeof detail !== "string" || detail.length === 0) throw new Error("恢复验证结果无效")
  return { ok, detail }
}

function createGraph(checkpointer: SqliteSaver, dependencies: OrdinaryRunDependencies) {
  const nodeId = dependencies.nodeId ?? "ordinary-loop"
  return new StateGraph(runState)
    .addNode("prepare-attempt", (state) => {
      const item = state.inputs[state.cursor]
      if (!item) return { status: "completed" as const, activeAttempt: null }
      if (Object.hasOwn(state.results, item.stableKey)) {
        return {
          cursor: state.cursor + 1,
          activeAttempt: null,
          events: [{ type: "duplicate_skipped" as const, at: timestamp(), nodeId, stableKey: item.stableKey }],
        }
      }
      const idempotencyKey = `${state.binding?.runId}:${nodeId}:${item.stableKey}`
      return {
        activeAttempt: { stableKey: item.stableKey, idempotencyKey },
        events: [{ type: "ordinary_adapter_planned" as const, at: timestamp(), nodeId, stableKey: item.stableKey, idempotencyKey }],
      }
    })
    .addNode("execute-adapter", async (state, config) => {
      const item = state.inputs[state.cursor]
      if (!item || !state.activeAttempt) throw new Error("普通 adapter 缺少已检查的执行项")
      const adapterContext = config.signal
        ? { idempotencyKey: state.activeAttempt.idempotencyKey, signal: config.signal }
        : { idempotencyKey: state.activeAttempt.idempotencyKey }
      const output = await dependencies.adapter.execute(item, adapterContext)
      return {
        cursor: state.cursor + 1,
        results: { [item.stableKey]: output },
        activeAttempt: null,
        events: [{
          type: "ordinary_adapter_completed" as const,
          at: timestamp(), nodeId, stableKey: item.stableKey,
          idempotencyKey: state.activeAttempt.idempotencyKey,
        }],
      }
    })
    .addNode("mark-paused", () => ({ status: "paused" as const }))
    .addNode("wait-for-resume", () => {
      const verified = resumePayload(interrupt({ reason: "pause_requested", nodeId }))
      return {
        status: "running" as const,
        pauseAfterItems: null,
        events: [{ type: "resume_verified" as const, at: timestamp(), nodeId, detail: verified.detail }],
      }
    })
    .addEdge(START, "prepare-attempt")
    .addConditionalEdges("prepare-attempt", (state) => {
      if (state.status === "completed") return END
      return state.activeAttempt ? "execute-adapter" : "prepare-attempt"
    })
    .addConditionalEdges("execute-adapter", (state) => {
      if (state.pauseAfterItems !== null && state.cursor >= state.pauseAfterItems) return "mark-paused"
      return "prepare-attempt"
    })
    .addEdge("mark-paused", "wait-for-resume")
    .addEdge("wait-for-resume", "prepare-attempt")
    .compile({ checkpointer })
}

export class OrdinaryRunEngine {
  private readonly graph
  private readonly checkpointer: SqliteSaver
  private operationActive = false
  private closed = false

  constructor(sqlitePath: string, private readonly dependencies: OrdinaryRunDependencies) {
    this.checkpointer = SqliteSaver.fromConnString(sqlitePath)
    this.graph = createGraph(this.checkpointer, dependencies)
  }

  async start(rawRequest: unknown, control: RunControl = {}): Promise<OrdinaryRunResult> {
    return this.runExclusive(() => this.startInternal(rawRequest, control))
  }

  async resume(rawRequest: unknown, signal?: AbortSignal): Promise<OrdinaryRunResult> {
    return this.runExclusive(() => this.resumeInternal(rawRequest, signal))
  }

  /** 官方 SqliteSaver 暴露其 better-sqlite3 db；close 后可安全释放 Windows 文件句柄。 */
  close() {
    if (this.operationActive) throw new Error("运行执行中，不能关闭 SQLite")
    if (this.closed) return
    this.checkpointer.db.close()
    this.closed = true
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error("运行引擎已关闭")
    if (this.operationActive) throw new Error("同一运行引擎一次只能执行一个 start 或 resume")
    this.operationActive = true
    try {
      return await operation()
    } finally {
      this.operationActive = false
    }
  }

  private async startInternal(rawRequest: unknown, control: RunControl): Promise<OrdinaryRunResult> {
    const request = runRequestSchema.parse(rawRequest)
    const binding = bindingFor(request)
    const config = invocationConfig(request.runId, request.inputs.length, control.signal)
    const existing = await this.graph.getState(config)
    if (existing.values.binding) throw new Error("运行 ID 已存在；请使用 resume")
    const pauseAfterItems = control.pauseAfterItems ?? null
    if (pauseAfterItems !== null && (!Number.isInteger(pauseAfterItems) || pauseAfterItems < 1)) {
      throw new Error("pauseAfterItems 必须是正整数")
    }
    const state = await this.graph.invoke({
      binding,
      inputs: dedupeInputs(request.inputs),
      cursor: 0,
      results: {},
      events: [],
      activeAttempt: null,
      pauseAfterItems,
      status: "running",
    }, config)
    return resultFrom(state)
  }

  private async resumeInternal(rawRequest: unknown, signal?: AbortSignal): Promise<OrdinaryRunResult> {
    const request = runRequestSchema.parse(rawRequest)
    const config = invocationConfig(request.runId, request.inputs.length, signal)
    const snapshot = await this.graph.getState(config)
    const savedBinding = runBindingSchema.parse(snapshot.values.binding)
    assertSameBinding(savedBinding, bindingFor(request))
    if (snapshot.values.status === "completed") throw new Error("已完成运行不能恢复")
    const verified = await this.dependencies.verifyResume(savedBinding)
    if (!verified.ok) throw new Error(`浏览器恢复核验失败: ${verified.detail}`)
    const resumeEvent: ExecutionEvent = {
      type: "resume_verified",
      at: timestamp(),
      nodeId: this.dependencies.nodeId ?? "ordinary-loop",
      detail: verified.detail,
    }
    if (snapshot.values.status !== "paused") {
      await this.graph.updateState(config, { events: [resumeEvent] })
    }
    const state = snapshot.values.status === "paused"
      ? await this.graph.invoke(new Command({ resume: verified }), config)
      : await this.graph.invoke(null, config)
    return resultFrom(state)
  }
}
