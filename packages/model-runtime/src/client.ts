import {
  accountReadResultSchema,
  notificationSchema,
  rpcResponseSchema,
  threadStartResultSchema,
  turnStartResultSchema,
} from "./wire.js"
import { authenticationError, ModelRuntimeError, protocolError, timeoutError } from "./errors.js"
import {
  startCodexAppServerTransport,
  type CodexAppServerTransport,
  type TransportFactory,
} from "./transport.js"
import {
  PRODUCT_MODEL_ID,
  PRODUCT_REASONING_EFFORT,
  type AccountProjection,
  type ModelInvocationAudit,
} from "./contracts.js"
import {
  createTurnState,
  handleNotification,
  threadStartParams,
  turnStartParams,
  type TurnState,
} from "./turn-events.js"

const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000
const DEFAULT_TURN_TIMEOUT_MS = 180_000
const DEFAULT_INTERRUPT_GRACE_MS = 2_000

export interface CodexAppServerClientOptions {
  cwd: string
  packageRoot?: string
  executable?: string
  connectionTimeoutMs?: number
  turnTimeoutMs?: number
  interruptGraceMs?: number
  transportFactory?: TransportFactory
}

export type CodexRunEvent =
  | { type: "commentary_delta"; delta: string }
  | {
      type: "item_lifecycle"
      itemId: string
      itemType: string
      status: "started" | "completed"
    }
  | { type: "interrupted"; audit: ModelInvocationAudit }
  | {
      type: "turn_succeeded"
      outputText: string
      threadId: string
      turnId: string
      audit: ModelInvocationAudit
    }

export interface CodexAppServerClient {
  readAccount(): Promise<AccountProjection>
  runTurn(
    prompt: string,
    outputSchema: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<CodexRunEvent>
  close(): Promise<void>
}

interface TurnCancellation {
  interrupt(timedOut: boolean): void
  dispose(): void
}

export function createCodexAppServerClient(
  options: CodexAppServerClientOptions,
): CodexAppServerClient {
  return new ReusableCodexAppServerClient(options)
}

class ReusableCodexAppServerClient implements CodexAppServerClient {
  private transport: CodexAppServerTransport | undefined
  private sequence = 0
  private account: AccountProjection | undefined
  private accountPromise: Promise<AccountProjection> | undefined
  private active = false

  constructor(private readonly options: CodexAppServerClientOptions) {}

  async readAccount(): Promise<AccountProjection> {
    if (this.account) return this.account
    if (this.accountPromise) return this.accountPromise
    const pending = this.fetchAccount()
    this.accountPromise = pending
    try {
      return await pending
    } finally {
      if (this.accountPromise === pending) this.accountPromise = undefined
    }
  }

  private async fetchAccount(): Promise<AccountProjection> {
    if (this.account) return this.account
    const transport = await this.ensureConnection()
    const requestId = ++this.sequence
    transport.send("account/read", requestId, { refreshToken: false })
    let result: unknown
    try {
      result = await this.waitForResult(transport, requestId, "account.read")
    } catch (error) {
      await this.dropTransport(transport)
      throw error
    }
    const parsed = accountReadResultSchema.safeParse(result)
    if (!parsed.success) {
      await this.dropTransport(transport)
      throw protocolError("account.read.result")
    }
    const projection: AccountProjection = {
      loggedIn: parsed.data.account !== null,
      type: parsed.data.account?.type ?? null,
    }
    this.account = projection
    return projection
  }

  async *runTurn(
    prompt: string,
    outputSchema: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<CodexRunEvent> {
    if (this.active) {
      throw new ModelRuntimeError("busy", "已有产品模型轮次正在运行。", "single-flight")
    }
    if (signal?.aborted) {
      yield { type: "interrupted", audit: modelAudit(0, null, null) }
      return
    }
    this.active = true
    try {
      const account = await this.readAccount()
      if (!account.loggedIn || account.type !== "chatgpt") throw authenticationError("account.read")
      if (signal?.aborted) {
        yield { type: "interrupted", audit: modelAudit(0, null, null) }
        return
      }
      const transport = await this.ensureConnection()
      if (signal?.aborted) {
        yield { type: "interrupted", audit: modelAudit(0, null, null) }
        return
      }
      yield* this.executeTurn(transport, prompt, outputSchema, signal)
    } finally {
      this.active = false
    }
  }

  async close(): Promise<void> {
    const transport = this.transport
    this.transport = undefined
    this.account = undefined
    this.accountPromise = undefined
    if (transport) await transport.close()
  }

  private async ensureConnection(): Promise<CodexAppServerTransport> {
    if (this.transport) return this.transport
    const factory = this.options.transportFactory ?? startCodexAppServerTransport
    const transport = factory({
      cwd: this.options.cwd,
      ...(this.options.executable ? { executable: this.options.executable } : {}),
      ...(this.options.packageRoot ? { packageRoot: this.options.packageRoot } : {}),
    })
    this.transport = transport
    const requestId = ++this.sequence
    transport.send("initialize", requestId, {
      clientInfo: {
        name: "browser_capture_tool",
        title: "Browser Capture Tool",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: false, requestAttestation: false },
    })
    try {
      await this.waitForResult(transport, requestId, "initialize")
      transport.notify("initialized")
      return transport
    } catch (error) {
      await this.dropTransport(transport)
      throw error
    }
  }

  private async waitForResult(
    transport: CodexAppServerTransport,
    requestId: number,
    phase: string,
  ): Promise<unknown> {
    const timeoutMs = this.options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const remainingMs = Math.max(1, deadline - Date.now())
      const raw = await this.nextWithTimeout(transport, remainingMs, phase)
      const response = rpcResponseSchema.safeParse(raw)
      if (response.success) {
        if (response.data.id !== requestId) continue
        if (response.data.error !== undefined) throw rpcFailure(response.data.error, phase)
        return response.data.result
      }
      if (notificationSchema.safeParse(raw).success) continue
      throw protocolError(`${phase}.envelope`)
    }
  }

  private async nextWithTimeout(
    transport: CodexAppServerTransport,
    timeoutMs: number,
    phase: string,
  ): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const next = await Promise.race([
        transport.next(),
        new Promise<IteratorResult<unknown>>((_, reject) => {
          timer = setTimeout(() => {
            reject(timeoutError(phase, timeoutMs))
            transport.kill()
          }, timeoutMs)
        }),
      ])
      if (!next.done) return next.value
      const result = await transport.result()
      throw processEnded(result.exitCode, result.stderr, phase)
    } catch (error) {
      if (error instanceof ModelRuntimeError) throw error
      throw protocolError(`${phase}.ndjson`)
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async *executeTurn(
    transport: CodexAppServerTransport,
    prompt: string,
    outputSchema: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<CodexRunEvent> {
    const state = createTurnState(++this.sequence, ++this.sequence)
    const timeoutMs = this.options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS
    const graceMs = this.options.interruptGraceMs ?? DEFAULT_INTERRUPT_GRACE_MS
    let terminal = false
    const cancellation = this.armTurnCancellation(
      transport,
      state,
      signal,
      timeoutMs,
      graceMs,
      () => terminal,
    )
    if (state.interrupted) {
      terminal = true
      cancellation.dispose()
      yield { type: "interrupted", audit: auditOf(state) }
      return
    }
    try {
      transport.send("thread/start", state.threadRequestId, threadStartParams(this.options.cwd))
      for (;;) {
        let raw: unknown
        try {
          raw = await this.nextForTurn(transport)
        } catch (error) {
          if (state.interrupted && !state.timedOut) {
            await this.dropTransport(transport)
            terminal = true
            yield { type: "interrupted", audit: auditOf(state) }
            return
          }
          throw error
        }
        const response = rpcResponseSchema.safeParse(raw)
        if (response.success) {
          this.handleTurnResponse(transport, response.data, state, prompt, outputSchema)
          if (state.interrupted) {
            cancellation.interrupt(state.timedOut)
            if (!state.turnStartSent) {
              if (state.timedOut) throw timeoutError("turn", timeoutMs)
              terminal = true
              yield { type: "interrupted", audit: auditOf(state) }
              return
            }
          }
          continue
        }
        const notification = notificationSchema.safeParse(raw)
        if (!notification.success) throw protocolError("turn.envelope")
        const events = handleNotification(notification.data.method, notification.data.params, state)
        for (const event of events) yield event
        if (!state.terminalStatus) continue
        terminal = true
        if (state.timedOut) throw timeoutError("turn", timeoutMs)
        if (state.interrupted || state.terminalStatus === "interrupted") {
          yield { type: "interrupted", audit: auditOf(state) }
          return
        }
        if (state.terminalStatus !== "completed") throw turnFailed()
        if (!state.threadId || !state.turnId || !state.finalOutputText) {
          throw protocolError("turn.completed.output")
        }
        yield {
          type: "turn_succeeded",
          outputText: state.finalOutputText,
          threadId: state.threadId,
          turnId: state.turnId,
          audit: auditOf(state),
        }
        return
      }
    } catch (error) {
      if (!terminal) cancellation.interrupt(state.timedOut)
      await this.dropTransport(transport)
      terminal = true
      if (state.timedOut && !(error instanceof ModelRuntimeError && error.code === "timeout")) {
        throw timeoutError("turn", timeoutMs)
      }
      throw error
    } finally {
      if (!terminal) {
        cancellation.interrupt(false)
        // WHY：消费方提前停止事件流后无人再读取该 turn；关闭连接避免留下后台模型工作。
        transport.kill()
        await this.dropTransport(transport)
      }
      cancellation.dispose()
    }
  }

  private handleTurnResponse(
    transport: CodexAppServerTransport,
    response: { id: string | number; result?: unknown; error?: unknown },
    state: TurnState,
    prompt: string,
    outputSchema: Record<string, unknown>,
  ): void {
    if (response.id !== state.threadRequestId && response.id !== state.turnRequestId) return
    if (response.error !== undefined) throw rpcFailure(response.error, "turn.request")
    if (response.id === state.threadRequestId) {
      const parsed = threadStartResultSchema.safeParse(response.result)
      if (!parsed.success) throw protocolError("thread.start.result")
      if (parsed.data.model !== PRODUCT_MODEL_ID) throw protocolError("thread.start.model")
      if (parsed.data.reasoningEffort !== PRODUCT_REASONING_EFFORT) {
        throw protocolError("thread.start.reasoning_effort")
      }
      state.threadId = parsed.data.thread.id
      state.reportedModel = PRODUCT_MODEL_ID
      state.reportedEffort = PRODUCT_REASONING_EFFORT
      if (state.interrupted) return
      transport.send("turn/start", state.turnRequestId, turnStartParams(state.threadId, prompt, outputSchema))
      state.turnStartSent = true
      return
    }
    const parsed = turnStartResultSchema.safeParse(response.result)
    if (!parsed.success) throw protocolError("turn.start.result")
    if (state.turnId && state.turnId !== parsed.data.turn.id) throw protocolError("turn.start.ownership")
    state.turnId = parsed.data.turn.id
  }

  private armTurnCancellation(
    transport: CodexAppServerTransport,
    state: TurnState,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    graceMs: number,
    isTerminal: () => boolean,
  ): TurnCancellation {
    let killTimer: ReturnType<typeof setTimeout> | undefined
    const interrupt = (timedOut: boolean) => {
      state.interrupted = true
      state.timedOut ||= timedOut
      if (state.threadId && state.turnId && !state.interruptSent) {
        state.interruptSent = true
        transport.send("turn/interrupt", ++this.sequence, {
          threadId: state.threadId,
          turnId: state.turnId,
        })
      }
      killTimer ??= setTimeout(() => {
        if (!isTerminal()) transport.kill()
      }, graceMs)
    }
    const onAbort = () => interrupt(false)
    signal?.addEventListener("abort", onAbort, { once: true })
    const timeoutTimer = setTimeout(() => interrupt(true), timeoutMs)
    if (signal?.aborted) onAbort()
    return {
      interrupt,
      dispose: () => {
        signal?.removeEventListener("abort", onAbort)
        clearTimeout(timeoutTimer)
        if (killTimer) clearTimeout(killTimer)
      },
    }
  }

  private async nextForTurn(transport: CodexAppServerTransport): Promise<unknown> {
    try {
      const next = await transport.next()
      if (!next.done) return next.value
      const result = await transport.result()
      throw processEnded(result.exitCode, result.stderr, "turn.stream")
    } catch (error) {
      if (error instanceof ModelRuntimeError) throw error
      throw protocolError("turn.ndjson")
    }
  }

  private async dropTransport(transport: CodexAppServerTransport): Promise<void> {
    if (this.transport === transport) {
      this.transport = undefined
      this.account = undefined
      this.accountPromise = undefined
    }
    await transport.close()
  }
}

function auditOf(state: TurnState): ModelInvocationAudit {
  return modelAudit(
    state.turnStartSent ? 1 : 0,
    state.reportedModel,
    state.reportedEffort,
  )
}

function modelAudit(
  invocationCount: 0 | 1,
  reportedModel: typeof PRODUCT_MODEL_ID | null,
  reportedEffort: typeof PRODUCT_REASONING_EFFORT | null,
): ModelInvocationAudit {
  return {
    invocationCount,
    requestedModel: PRODUCT_MODEL_ID,
    requestedEffort: PRODUCT_REASONING_EFFORT,
    reportedModel,
    reportedEffort,
  }
}

function rpcFailure(value: unknown, phase: string): ModelRuntimeError {
  const text = safeInspect(value)
  if (/auth|login|required|unauthorized|401/i.test(text)) return authenticationError(phase)
  return new ModelRuntimeError(
    "connection_failed",
    "Codex App Server 请求失败，本轮未完成。",
    `phase=${phase} rpcError=true`,
  )
}

function processEnded(exitCode: number | undefined, stderr: string, phase: string): ModelRuntimeError {
  if (/auth|login|required|unauthorized|401/i.test(stderr)) return authenticationError(phase)
  return new ModelRuntimeError(
    "connection_failed",
    "Codex App Server 已提前结束，本轮未完成。",
    `phase=${phase} exitCode=${String(exitCode)}`,
  )
}

function turnFailed(): ModelRuntimeError {
  return new ModelRuntimeError(
    "connection_failed",
    "Codex 模型轮次执行失败，本轮未完成。",
    "turnStatus=failed",
  )
}

function safeInspect(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
