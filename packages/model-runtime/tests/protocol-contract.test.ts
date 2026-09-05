import assert from "node:assert/strict"
import test from "node:test"

import {
  createCodexAppServerClient,
  ModelRuntimeError,
} from "../src/index.js"
import {
  FakeTransport,
  requestId,
  stringParam,
  type SentMessage,
} from "./fake-transport.js"

const validOutput = JSON.stringify({
  assistantText: "请确认草案。",
  draftPlan: { steps: [] },
  needsClarification: true,
})

test("thread/start 实际模型或 effort 与产品路由不一致时拒绝启动 turn", async (context) => {
  for (const mismatch of [
    { model: "other-model", reasoningEffort: "medium" },
    { model: "gpt-5.6-terra", reasoningEffort: null },
  ]) {
    await context.test(JSON.stringify(mismatch), async () => {
      const transport = new FakeTransport((message, fake) => {
        if (respondToConnectionMessage(message, fake)) return
        if (message.method === "thread/start") {
          fake.push({
            id: requestId(message),
            result: {
              thread: { id: "mismatch-thread", ephemeral: true },
              ...mismatch,
            },
          })
        }
      })
      const client = createClient(transport)

      await assert.rejects(collect(client.runTurn("mismatch", {})), hasCode("protocol_error"))
      assert.equal(countRequests(transport.sent, "turn/start"), 0)
      assert.equal(transport.closeCount, 1)
    })
  }
})

test("已知 turn/item 通知缺失 threadId 或 turnId 时按协议错误关闭", async () => {
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({
        id: requestId(message),
        result: {
          thread: { id: "owned-thread", ephemeral: true },
          model: "gpt-5.6-terra",
          reasoningEffort: "medium",
        },
      })
      return
    }
    if (message.method === "turn/start") {
      fake.push({ id: requestId(message), result: { turn: { id: "owned-turn" } } })
      fake.push({
        method: "item/started",
        params: { item: { id: "unscoped", type: "reasoning" }, threadId: "owned-thread" },
      })
    }
  })
  const client = createClient(transport)

  await assert.rejects(collect(client.runTurn("ownership", {})), hasCode("protocol_error"))
  assert.equal(transport.closeCount, 1)
})

test("等待 thread/start 响应期间取消时不启动模型且连接仍可复用", async () => {
  const controller = new AbortController()
  let firstThreadRequest: SentMessage | undefined
  let threadStarts = 0
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      threadStarts += 1
      if (threadStarts === 1) {
        firstThreadRequest = message
        return
      }
      fake.push({ id: requestId(message), result: threadResult("retry-thread") })
      return
    }
    if (message.method === "turn/start") pushSuccessfulTurn(message, fake)
  })
  const client = createClient(transport)
  const interruptedPromise = collect(client.runTurn("cancel while starting", {}, controller.signal))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.ok(firstThreadRequest)

  controller.abort()
  transport.push({ id: requestId(firstThreadRequest), result: threadResult("cancelled-thread") })
  const interrupted = await interruptedPromise

  assert.equal(countRequests(transport.sent, "turn/start"), 0)
  assert.equal(interrupted.length, 1)
  assert.equal(interrupted[0]?.type, "interrupted")
  assert.equal(interrupted[0]?.type === "interrupted" ? interrupted[0].audit.invocationCount : -1, 0)

  const retry = await collect(client.runTurn("retry", {}))
  assert.equal(retry.some((event) => event.type === "turn_succeeded"), true)
  assert.equal(countRequests(transport.sent, "initialize"), 1)
})

test("中断后 grace 终止进程会移除旧连接并允许下一轮重连", async () => {
  const controller = new AbortController()
  const first = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadResult("killed-thread") })
      return
    }
    if (message.method === "turn/start") {
      fake.push({ id: requestId(message), result: { turn: { id: "killed-turn" } } })
      queueMicrotask(() => controller.abort())
    }
  })
  const second = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadResult("fresh-thread") })
      return
    }
    if (message.method === "turn/start") pushSuccessfulTurn(message, fake)
  })
  const transports = [first, second]
  const client = createCodexAppServerClient({
    cwd: "C:\\isolated-model-runtime",
    connectionTimeoutMs: 100,
    turnTimeoutMs: 100,
    interruptGraceMs: 10,
    transportFactory: () => {
      const next = transports.shift()
      if (!next) throw new Error("unexpected transport request")
      return next
    },
  })

  const interrupted = await collect(client.runTurn("interrupt", {}, controller.signal))
  const retry = await collect(client.runTurn("retry", {}))

  assert.equal(interrupted.some((event) => event.type === "interrupted"), true)
  assert.equal(first.killCount >= 1, true)
  assert.equal(first.closeCount, 1)
  assert.equal(retry.some((event) => event.type === "turn_succeeded"), true)
  assert.equal(countRequests(second.sent, "initialize"), 1)
})

function createClient(transport: FakeTransport) {
  return createCodexAppServerClient({
    cwd: "C:\\isolated-model-runtime",
    connectionTimeoutMs: 100,
    turnTimeoutMs: 100,
    interruptGraceMs: 10,
    transportFactory: () => transport,
  })
}

function respondToConnectionMessage(message: SentMessage, transport: FakeTransport): boolean {
  if (message.method === "initialize") {
    transport.push({ id: requestId(message), result: {} })
    return true
  }
  if (message.method === "account/read") {
    transport.push({
      id: requestId(message),
      result: { account: { type: "chatgpt" }, requiresOpenaiAuth: true },
    })
    return true
  }
  return message.method === "initialized"
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of iterable) values.push(value)
  return values
}

function countRequests(messages: SentMessage[], method: string): number {
  return messages.filter((message) => message.kind === "request" && message.method === method).length
}

function threadResult(threadId: string) {
  return {
    thread: { id: threadId, ephemeral: true },
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
  }
}

function pushSuccessfulTurn(message: SentMessage, transport: FakeTransport): void {
  const threadId = stringParam(message.params, "threadId")
  const turnId = `turn-for-${threadId}`
  const finalItem = {
    id: `${turnId}-final`,
    type: "agentMessage",
    phase: "final_answer",
    text: validOutput,
  }
  transport.push({ id: requestId(message), result: { turn: { id: turnId } } })
  transport.push({
    method: "item/started",
    params: { threadId, turnId, item: { ...finalItem, text: undefined } },
  })
  transport.push({ method: "item/completed", params: { threadId, turnId, item: finalItem } })
  transport.push({
    method: "turn/completed",
    params: { threadId, turn: { id: turnId, status: "completed", items: [finalItem] } },
  })
}

function hasCode(code: ModelRuntimeError["code"]): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ModelRuntimeError)
    assert.equal(error.code, code)
    return true
  }
}
