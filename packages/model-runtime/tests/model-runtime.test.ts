import assert from "node:assert/strict"
import test from "node:test"

import {
  createCodexAppServerClient,
  createProductModelRuntime,
  modelConversationOutputJsonSchema,
  modelConversationResultSchema,
  ModelRuntimeError,
  type CodexAppServerClient,
  type CodexRunEvent,
} from "../src/index.js"
import { FakeTransport, requestId, stringParam, type SentMessage } from "./fake-transport.js"

const validOutput = JSON.stringify({
  assistantText: "我已整理需求，请确认草案。",
  draftPlan: {
    steps: [{
      goal: "枚举商品",
      completionCriteria: ["记录全部可见商品"],
      sourceScope: ["用户指定的公开店铺页面"],
    }],
  },
  needsClarification: false,
})

test("单次握手复用连接，两轮使用彼此隔离的 ephemeral thread", async () => {
  let threadSequence = 0
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      threadSequence += 1
      fake.push({
        id: requestId(message),
        result: threadStartResult(`thread-${threadSequence}`),
      })
      return
    }
    if (message.method === "turn/start") pushSuccessfulTurn(message, fake, validOutput)
  })
  const client = createClient(transport)

  assert.deepEqual(await client.readAccount(), { loggedIn: true, type: "chatgpt" })
  const first = await collect(client.runTurn("first", {}))
  const second = await collect(client.runTurn("second", {}))

  assert.equal(countRequests(transport.sent, "initialize"), 1)
  assert.equal(countRequests(transport.sent, "account/read"), 1)
  const starts = requests(transport.sent, "thread/start")
  assert.equal(starts.length, 2)
  assert.ok(starts.every((message) => Reflect.get(message.params, "ephemeral") === true))
  const firstResult = first.find((event) => event.type === "turn_succeeded")
  const secondResult = second.find((event) => event.type === "turn_succeeded")
  assert.equal(firstResult?.type === "turn_succeeded" ? firstResult.threadId : undefined, "thread-1")
  assert.equal(secondResult?.type === "turn_succeeded" ? secondResult.threadId : undefined, "thread-2")
  assert.deepEqual(firstResult?.type === "turn_succeeded" ? firstResult.audit : undefined, {
    invocationCount: 1,
    requestedModel: "gpt-5.6-terra",
    requestedEffort: "medium",
    reportedModel: "gpt-5.6-terra",
    reportedEffort: "medium",
  })
  assert.ok(first.some((event) => event.type === "commentary_delta"))
  await client.close()
})

test("忽略不属于当前 thread/turn 的通知", async () => {
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadStartResult("current-thread") })
      return
    }
    if (message.method !== "turn/start") return
    const turnId = "current-turn"
    fake.push({ id: requestId(message), result: { turn: { id: turnId } } })
    fake.push({
      method: "item/started",
      params: {
        threadId: "other-thread",
        turnId: "other-turn",
        item: { id: "foreign-message", type: "agentMessage", phase: "commentary" },
      },
    })
    fake.push({
      method: "item/agentMessage/delta",
      params: {
        threadId: "other-thread",
        turnId: "other-turn",
        itemId: "foreign-message",
        delta: "不得泄漏",
      },
    })
    fake.push({
      method: "turn/completed",
      params: {
        threadId: "other-thread",
        turn: {
          id: "other-turn",
          status: "completed",
          items: [{ id: "foreign-final", type: "agentMessage", text: "错误输出" }],
        },
      },
    })
    pushTurnNotifications(fake, "current-thread", turnId, validOutput)
  })
  const events = await collect(createClient(transport).runTurn("current", {}))

  assert.equal(events.some((event) => event.type === "commentary_delta" && event.delta.includes("泄漏")), false)
  const result = events.find((event) => event.type === "turn_succeeded")
  assert.equal(result?.type === "turn_succeeded" ? result.outputText : undefined, validOutput)
})

test("非法 NDJSON 或协议 envelope 会关闭连接并返回安全错误", async (context) => {
  await context.test("非法 NDJSON", async () => {
    const transport = new FakeTransport((message, fake) => {
      if (message.method === "initialize") fake.fail(new SyntaxError("secret raw line"))
    })
    const client = createClient(transport)
    await assert.rejects(client.readAccount(), isSafeProtocolError)
    assert.equal(transport.closeCount, 1)
  })

  await context.test("Zod envelope 失败", async () => {
    const transport = new FakeTransport((message, fake) => {
      if (message.method === "initialize") fake.push("not-an-envelope")
    })
    const client = createClient(transport)
    await assert.rejects(client.readAccount(), isSafeProtocolError)
    assert.equal(transport.closeCount, 1)
  })
})

test("最终输出必须同时通过 JSON 与 Zod 校验", async (context) => {
  await context.test("拒绝非法 JSON", async () => {
    const runtime = createProductModelRuntime({ client: staticClient("not-json") })
    await assert.rejects(collect(runtime.run(sampleInput())), hasCode("invalid_output"))
  })

  await context.test("拒绝不符合结果 schema 的 JSON", async () => {
    const runtime = createProductModelRuntime({
      client: staticClient(JSON.stringify({ assistantText: "缺少字段" })),
    })
    await assert.rejects(collect(runtime.run(sampleInput())), hasCode("invalid_output"))
  })
})

test("取消发送 turn/interrupt，且不产生 completed 结果", async () => {
  const controller = new AbortController()
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadStartResult("cancel-thread") })
      return
    }
    if (message.method === "turn/start") {
      fake.push({ id: requestId(message), result: { turn: { id: "cancel-turn" } } })
      queueMicrotask(() => controller.abort())
      return
    }
    if (message.method === "turn/interrupt") {
      fake.push({ id: requestId(message), result: {} })
      fake.push({
        method: "turn/completed",
        params: {
          threadId: "cancel-thread",
          turn: { id: "cancel-turn", status: "interrupted", items: [] },
        },
      })
    }
  })
  const events = await collect(createClient(transport).runTurn("cancel", {}, controller.signal))

  assert.equal(countRequests(transport.sent, "turn/interrupt"), 1)
  assert.equal(events.some((event) => event.type === "interrupted"), true)
  assert.equal(events.some((event) => event.type === "turn_succeeded"), false)
})

test("读取账户期间取消后不启动 thread 或模型 turn", async () => {
  const controller = new AbortController()
  const transport = new FakeTransport((message, fake) => {
    if (message.method === "initialize") {
      fake.push({ id: requestId(message), result: {} })
      return
    }
    if (message.method === "account/read") {
      controller.abort()
      fake.push({
        id: requestId(message),
        result: { account: { type: "chatgpt" }, requiresOpenaiAuth: true },
      })
    }
  })
  const events = await collect(createClient(transport).runTurn("cancel before model", {}, controller.signal))

  assert.deepEqual(events, [{
    type: "interrupted",
    audit: {
      invocationCount: 0,
      requestedModel: "gpt-5.6-terra",
      requestedEffort: "medium",
      reportedModel: null,
      reportedEffort: null,
    },
  }])
  assert.equal(countRequests(transport.sent, "thread/start"), 0)
  assert.equal(countRequests(transport.sent, "turn/start"), 0)
})

test("并发账户读取与 runTurn 共享一个 account/read 消费者", async () => {
  let accountRequest: SentMessage | undefined
  const transport = new FakeTransport((message, fake) => {
    if (message.method === "initialize") {
      fake.push({ id: requestId(message), result: {} })
      return
    }
    if (message.method === "account/read") {
      accountRequest = message
      return
    }
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadStartResult("shared-thread") })
      return
    }
    if (message.method === "turn/start") pushSuccessfulTurn(message, fake, validOutput)
  })
  const client = createClient(transport)
  const accountPromise = client.readAccount()
  const turnPromise = collect(client.runTurn("shared account", {}))
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.ok(accountRequest)
  transport.push({
    id: requestId(accountRequest),
    result: { account: { type: "chatgpt" }, requiresOpenaiAuth: true },
  })

  assert.deepEqual(await accountPromise, { loggedIn: true, type: "chatgpt" })
  assert.ok((await turnPromise).some((event) => event.type === "turn_succeeded"))
  assert.equal(countRequests(transport.sent, "account/read"), 1)
})

test("消费方提前停止事件流会 interrupt、关闭旧连接并允许下一轮重连", async () => {
  const first = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadStartResult("abandoned-thread") })
      return
    }
    if (message.method === "turn/start") {
      fake.push({ id: requestId(message), result: { turn: { id: "abandoned-turn" } } })
      fake.push({
        method: "item/started",
        params: {
          threadId: "abandoned-thread",
          turnId: "abandoned-turn",
          item: { id: "abandoned-item", type: "reasoning" },
        },
      })
    }
  })
  const second = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadStartResult("fresh-thread") })
      return
    }
    if (message.method === "turn/start") pushSuccessfulTurn(message, fake, validOutput)
  })
  const transports = [first, second]
  const client = createCodexAppServerClient({
    cwd: "C:\\isolated-model-runtime",
    connectionTimeoutMs: 500,
    turnTimeoutMs: 500,
    interruptGraceMs: 50,
    transportFactory: () => {
      const next = transports.shift()
      if (!next) throw new Error("unexpected transport request")
      return next
    },
  })

  for await (const event of client.runTurn("abandon", {})) {
    if (event.type === "item_lifecycle") break
  }
  const nextEvents = await collect(client.runTurn("retry", {}))

  assert.equal(countRequests(first.sent, "turn/interrupt"), 1)
  assert.equal(first.killCount >= 1, true)
  assert.equal(first.closeCount, 1)
  assert.ok(nextEvents.some((event) => event.type === "turn_succeeded"))
  assert.equal(countRequests(second.sent, "initialize"), 1)
})

test("App Server output schema 由 Zod 生成并移除不支持的限制关键字", () => {
  const serialized = JSON.stringify(modelConversationOutputJsonSchema)
  for (const keyword of ["minLength", "maxLength", "minItems", "maxItems", "format"]) {
    assert.equal(serialized.includes(`\"${keyword}\"`), false)
  }
  assert.equal(modelConversationResultSchema.safeParse({
    assistantText: "",
    draftPlan: { steps: [] },
    needsClarification: true,
  }).success, false)
})

test("进程提前终止会关闭连接，且不返回成功", async () => {
  const transport = new FakeTransport((message, fake) => {
    if (respondToConnectionMessage(message, fake)) return
    if (message.method === "thread/start") {
      fake.push({ id: requestId(message), result: threadStartResult("ended-thread") })
      return
    }
    if (message.method === "turn/start") {
      fake.push({ id: requestId(message), result: { turn: { id: "ended-turn" } } })
      fake.end({ exitCode: 0, stderr: "" })
    }
  })
  const client = createClient(transport)

  await assert.rejects(collect(client.runTurn("end", {})), hasCode("connection_failed"))
  assert.equal(transport.closeCount, 1)
})

test("登录错误不暴露 App Server 原始日志", async () => {
  const privateText = "user@example.com bearer-secret-value"
  const transport = new FakeTransport((message, fake) => {
    if (message.method === "initialize") {
      fake.push({ id: requestId(message), result: {} })
      return
    }
    if (message.method === "account/read") {
      fake.push({ id: requestId(message), error: { message: `login required ${privateText}` } })
    }
  })
  const client = createClient(transport)

  await assert.rejects(client.readAccount(), (error: unknown) => {
    assert.ok(error instanceof ModelRuntimeError)
    assert.equal(error.code, "authentication_required")
    assert.equal(`${error.message} ${error.diagnostic}`.includes(privateText), false)
    return true
  })
  assert.equal(transport.closeCount, 1)
})

function createClient(transport: FakeTransport) {
  return createCodexAppServerClient({
    cwd: "C:\\isolated-model-runtime",
    connectionTimeoutMs: 500,
    turnTimeoutMs: 500,
    interruptGraceMs: 50,
    transportFactory: () => transport,
  })
}

function respondToConnectionMessage(message: SentMessage, transport: FakeTransport): boolean {
  if (message.method === "initialize") {
    transport.push({ id: requestId(message), result: { userAgent: "test" } })
    return true
  }
  if (message.method === "account/read") {
    transport.push({
      id: requestId(message),
      result: { account: { type: "chatgpt", email: "must-not-project" }, requiresOpenaiAuth: true },
    })
    return true
  }
  return message.method === "initialized"
}

function pushSuccessfulTurn(message: SentMessage, transport: FakeTransport, output: string): void {
  const threadId = stringParam(message.params, "threadId")
  const turnId = `turn-for-${threadId}`
  transport.push({ id: requestId(message), result: { turn: { id: turnId } } })
  pushTurnNotifications(transport, threadId, turnId, output)
}

function pushTurnNotifications(
  transport: FakeTransport,
  threadId: string,
  turnId: string,
  output: string,
): void {
  transport.push({
    method: "item/started",
    params: {
      threadId,
      turnId,
      item: { id: `${turnId}-commentary`, type: "agentMessage", phase: "commentary" },
    },
  })
  transport.push({
    method: "item/agentMessage/delta",
    params: { threadId, turnId, itemId: `${turnId}-commentary`, delta: "正在整理" },
  })
  transport.push({
    method: "item/completed",
    params: {
      threadId,
      turnId,
      item: { id: `${turnId}-commentary`, type: "agentMessage", phase: "commentary", text: "正在整理" },
    },
  })
  transport.push({
    method: "item/started",
    params: {
      threadId,
      turnId,
      item: { id: `${turnId}-final`, type: "agentMessage", phase: "final_answer" },
    },
  })
  const finalItem = {
    id: `${turnId}-final`,
    type: "agentMessage",
    phase: "final_answer",
    text: output,
  }
  transport.push({ method: "item/completed", params: { threadId, turnId, item: finalItem } })
  transport.push({
    method: "turn/completed",
    params: { threadId, turn: { id: turnId, status: "completed", items: [finalItem] } },
  })
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of iterable) values.push(value)
  return values
}

function requests(messages: SentMessage[], method: string): SentMessage[] {
  return messages.filter((message) => message.kind === "request" && message.method === method)
}

function countRequests(messages: SentMessage[], method: string): number {
  return requests(messages, method).length
}

function staticClient(outputText: string): CodexAppServerClient {
  return {
    readAccount: async () => ({ loggedIn: true, type: "chatgpt" }),
    runTurn: async function* (): AsyncIterable<CodexRunEvent> {
      yield {
        type: "turn_succeeded",
        outputText,
        threadId: "thread",
        turnId: "turn",
        audit: {
          invocationCount: 1,
          requestedModel: "gpt-5.6-terra",
          requestedEffort: "medium",
          reportedModel: "gpt-5.6-terra",
          reportedEffort: "medium",
        },
      }
    },
    close: async () => undefined,
  }
}

function threadStartResult(threadId: string) {
  return {
    thread: { id: threadId, ephemeral: true },
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
  }
}

function sampleInput() {
  return {
    conversation: [{ role: "user" as const, content: "抓取商品参数" }],
    requirement: "形成抓取需求草案",
  }
}

function isSafeProtocolError(error: unknown): boolean {
  assert.ok(error instanceof ModelRuntimeError)
  assert.equal(error.code, "protocol_error")
  assert.equal(`${error.message} ${error.diagnostic}`.includes("secret raw line"), false)
  return true
}

function hasCode(code: ModelRuntimeError["code"]): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ModelRuntimeError)
    assert.equal(error.code, code)
    return true
  }
}
