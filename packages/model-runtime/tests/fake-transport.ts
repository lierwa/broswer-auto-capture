import type {
  CodexAppServerTransport,
  TransportResult,
} from "../src/transport.js"

export interface SentMessage {
  kind: "request" | "notification"
  method: string
  id?: number
  params: object
}

export class FakeTransport implements CodexAppServerTransport {
  readonly sent: SentMessage[] = []
  killCount = 0
  closeCount = 0
  private queue: QueuedItem[] = []
  private waiters: Array<{
    resolve: (value: IteratorResult<unknown>) => void
    reject: (reason: unknown) => void
  }> = []
  private transportResult: TransportResult = { exitCode: 0, stderr: "" }

  constructor(
    private readonly onMessage?: (message: SentMessage, transport: FakeTransport) => void,
  ) {}

  send(method: string, id: number, params: object): void {
    const message: SentMessage = { kind: "request", method, id, params }
    this.sent.push(message)
    this.onMessage?.(message, this)
  }

  notify(method: string, params: object = {}): void {
    const message: SentMessage = { kind: "notification", method, params }
    this.sent.push(message)
    this.onMessage?.(message, this)
  }

  next(): Promise<IteratorResult<unknown>> {
    const queued = this.queue.shift()
    if (queued?.kind === "value") return Promise.resolve({ done: false, value: queued.value })
    if (queued?.kind === "end") return Promise.resolve({ done: true, value: undefined })
    if (queued?.kind === "error") return Promise.reject(queued.reason)
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }))
  }

  push(value: unknown): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve({ done: false, value })
      return
    }
    this.queue.push({ kind: "value", value })
  }

  fail(reason: unknown): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.reject(reason)
      return
    }
    this.queue.push({ kind: "error", reason })
  }

  end(result: TransportResult = { exitCode: 0, stderr: "" }): void {
    this.transportResult = result
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve({ done: true, value: undefined })
      return
    }
    this.queue.push({ kind: "end" })
  }

  kill(): void {
    this.killCount += 1
    this.end({ signal: "SIGTERM", stderr: "" })
  }

  async close(): Promise<void> {
    this.closeCount += 1
    this.end(this.transportResult)
  }

  async result(): Promise<TransportResult> {
    return this.transportResult
  }
}

type QueuedItem =
  | { kind: "value"; value: unknown }
  | { kind: "end" }
  | { kind: "error"; reason: unknown }

export function requestId(message: SentMessage): number {
  if (message.id === undefined) throw new Error(`消息 ${message.method} 缺少 id`)
  return message.id
}

export function stringParam(params: object, name: string): string {
  const value = Reflect.get(params, name)
  if (typeof value !== "string") throw new Error(`参数 ${name} 不是字符串`)
  return value
}
