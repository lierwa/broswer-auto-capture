import assert from "node:assert/strict"
import test from "node:test"

import {
  createCodexAppServerClient,
  ModelRuntimeError,
} from "../src/index.js"
import { FakeTransport, requestId, type SentMessage } from "./fake-transport.js"

test("握手超时会终止并关闭 App Server 连接", async () => {
  const transport = new FakeTransport()
  const client = createClient(transport, 10, 100)

  await assert.rejects(client.readAccount(), hasCode("timeout"))
  assert.equal(transport.killCount, 1)
  assert.equal(transport.closeCount, 1)
})

test("模型轮次超时会 interrupt，随后有界终止并关闭连接", async () => {
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({
        id: requestId(message),
        result: {
          thread: { id: "timeout-thread", ephemeral: true },
          model: "gpt-5.6-terra",
          reasoningEffort: "medium",
        },
      })
      return
    }
    if (message.method === "turn/start") {
      fake.push({ id: requestId(message), result: { turn: { id: "timeout-turn" } } })
    }
  })
  const client = createClient(transport, 100, 10)

  await assert.rejects(collect(client.runTurn("timeout", {})), hasCode("timeout"))
  assert.equal(countRequests(transport.sent, "turn/interrupt"), 1)
  assert.equal(transport.killCount >= 1, true)
  assert.equal(transport.closeCount, 1)
})

test("thread 响应晚于超时时保留 timeout 语义且不启动模型 turn", async () => {
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method !== "thread/start") return
    setTimeout(() => fake.push({
      id: requestId(message),
      result: {
        thread: { id: "late-thread", ephemeral: true },
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
      },
    }), 20)
  })
  const client = createCodexAppServerClient({
    cwd: "C:\\isolated-model-runtime",
    turnTimeoutMs: 10,
    interruptGraceMs: 100,
    transportFactory: () => transport,
  })
  await assert.rejects(collect(client.runTurn("late-thread", {})), hasCode("timeout"))
  assert.equal(countRequests(transport.sent, "turn/start"), 0)
  assert.equal(transport.closeCount, 1)
})

function createClient(
  transport: FakeTransport,
  connectionTimeoutMs: number,
  turnTimeoutMs: number,
) {
  return createCodexAppServerClient({
    cwd: "C:\\isolated-model-runtime",
    connectionTimeoutMs,
    turnTimeoutMs,
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

function hasCode(code: ModelRuntimeError["code"]): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ModelRuntimeError)
    assert.equal(error.code, code)
    return true
  }
}
