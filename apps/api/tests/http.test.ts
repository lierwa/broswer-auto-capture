import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { get, type IncomingMessage } from "node:http"
import { createInterface } from "node:readline"
import { createApplication } from "../src/app.js"
import { openFixture, authoredInterview, deferred, draft, projectRoot } from "./helpers.js"
import { testAIModel } from "./fixtures/ai-model.js"

async function fixture(run: (value: Awaited<ReturnType<typeof createApplication>>) => Promise<void>) {
  const original = await openFixture()
  await original.coordinator.close(); await original.store.close()
  const value = await createApplication({ root: projectRoot, directory: original.directory, aiModel: testAIModel((prompt, schema, signal) => original.client.runTurn(prompt, schema, signal)) })
  try { await run(value) }
  finally { await value.app.close(); const { rm } = await import("node:fs/promises"); await rm(original.directory, { recursive: true, force: true }) }
}
const headers = { host: "127.0.0.1:4175" }
const aiHeaders = { ...headers, origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin" }
test("正式 API 拒绝跨站、越界输入与未知任务，错误不暴露内部字段", async () => fixture(async ({ app }) => {
  assert.equal((await app.inject({ url: "/api/tasks", headers: { host: "malicious.example:4175" } })).statusCode, 403)
  assert.equal((await app.inject({ url: "/api/tasks", headers: { ...headers, origin: "https://outside.example" } })).statusCode, 403)
  assert.equal((await app.inject({ url: "/api/interview?taskId=missing", headers })).statusCode, 404)
  const invalid = await app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "create", secret: "do-not-echo" } })
  assert.equal(invalid.statusCode, 400); assert.doesNotMatch(invalid.body, /do-not-echo/)
  assert.equal((await app.inject({ method: "POST", url: "/api/tasks", headers: { ...headers, "content-type": "text/plain" }, payload: "x" })).statusCode, 400)
  assert.equal((await app.inject({ url: "/api/model-settings", headers })).statusCode, 403)
  assert.equal((await app.inject({ url: "/api/model-settings", headers: { ...aiHeaders, "sec-fetch-site": "cross-site" } })).statusCode, 403)
  assert.deepEqual((await app.inject({ url: "/api/model-settings", headers: aiHeaders })).json(), { selection: null })
  assert.deepEqual((await app.inject({ url: "/api/ai/catalog", headers: aiHeaders })).json(), { data: [] })
}))
test("任务/访谈/版本确认由正式 API 交付，重试同一请求不重复调用", async () => fixture(async ({ app, coordinator, store }) => {
  const createRequestId = randomUUID()
  const created = await app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "create", requestId: createRequestId } })
  assert.equal(created.statusCode, 200)
  const { id } = created.json<{ id: string }>()
  const duplicateCreate = await app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "create", requestId: createRequestId } })
  assert.equal(duplicateCreate.json().id, id); assert.equal(duplicateCreate.json().tasks.length, 1)
  const command = { type: "message", requestId: randomUUID(), expectedRevision: 0, text: "采集公开商品" }
  const sent = await app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: command })
  assert.equal(sent.statusCode, 202)
  await coordinator.waitForIdle()
  const stream = await app.inject({ url: `/api/interview/events?taskId=${id}&after=0`, headers })
  const terminal = JSON.parse(stream.body.trim())
  assert.equal(terminal.state.active, false); assert.equal(terminal.state.drafts.length, 1)
  await app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: command })
  assert.equal(store.snapshot(id).turns.length, 1)
  const confirmed = await app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: { type: "confirm", requestId: randomUUID(), expectedRevision: 1, version: 1 } })
  assert.equal(confirmed.json().state.confirmedVersion, 1)
  assert.equal((await app.inject({ url: "/api/tasks", headers })).json()[0].status, "confirmed")
}))
test("正式 API 重启后继续同一任务，并保留问题、决策、草稿和确认", async () => {
  const original = await openFixture()
  await original.coordinator.close(); await original.store.close()
  let turn = 0
  original.client.runTurn = async function* () {
    turn += 1
    yield authoredInterview(turn === 1
      ? { assistantText: "请先确认评价范围。", question: { prompt: "收集多少评价？", options: [
        { label: "前 20 条", description: "先覆盖核心范围", recommended: true },
        { label: "前 100 条", description: "覆盖范围更大", recommended: false },
      ] }, draft: null }
      : { assistantText: "范围已明确。", question: null, draft })
  }
  const open = () => createApplication({ root: projectRoot, directory: original.directory,
    aiModel: testAIModel((prompt, schema, signal) => original.client.runTurn(prompt, schema, signal)) })
  let current: Awaited<ReturnType<typeof createApplication>> | undefined
  try {
    current = await open()
    const created = await current.app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "create", requestId: randomUUID() } })
    const { id } = created.json<{ id: string }>()
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers,
      payload: { type: "message", requestId: randomUUID(), expectedRevision: 0, text: "抓取公开商品评价" } })
    await current.coordinator.waitForIdle()
    const asked = current.store.snapshot(id)
    assert.equal(asked.unresolved[0]?.status, "open")
    const questionId = asked.unresolved[0]!.id
    await current.app.close(); current = await open()

    const restored = await current.app.inject({ url: `/api/interview?taskId=${id}`, headers })
    assert.equal(restored.json().unresolved[0].id, questionId)
    const surfaceSubmit = { answers: [{ questionId, data: {
      selectedOptionIds: ["1"], inputValues: { other: "只看公开在售商品" },
    } }], displayText: "前 20 条\n其他补充：只看公开在售商品" }
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: {
      type: "message", requestId: randomUUID(), expectedRevision: 1,
      text: "前 20 条\n其他补充：只看公开在售商品",
      answer: { type: "common_question", questionId, surfaceSubmit },
    } })
    await current.coordinator.waitForIdle()
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers,
      payload: { type: "confirm", requestId: randomUUID(), expectedRevision: 2, version: 1 } })
    await current.app.close(); current = await open()

    const confirmed = (await current.app.inject({ url: `/api/interview?taskId=${id}`, headers })).json()
    assert.equal(confirmed.confirmedVersion, 1)
    assert.deepEqual(confirmed.decisions.map((item: { kind: string }) => item.kind), ["option", "draft_confirmation"])
    assert.equal(confirmed.unresolved[0].status, "resolved")
    const reply = confirmed.messages.find((message: { interactionReply?: unknown }) => message.interactionReply)?.interactionReply
    assert.equal(reply.surfaceId, questionId)
    assert.deepEqual(reply.surfaceSubmit, surfaceSubmit)
  } finally {
    await current?.app.close()
    const { rm } = await import("node:fs/promises")
    await rm(original.directory, { recursive: true, force: true })
  }
})

async function openHttpStream(url: string) {
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    get(url, resolve).once("error", reject)
  })
  assert.equal(response.statusCode, 200)
  assert.match(String(response.headers["content-type"]), /application\/x-ndjson/)
  const lines = createInterface({ input: response }), reader = lines[Symbol.asyncIterator]()
  return { response, reader, close: () => { lines.close(); response.destroy() } }
}

function trackStreamRelease(store: Awaited<ReturnType<typeof createApplication>>["store"]) {
  const observe = store.workspaceChanges.observe.bind(store.workspaceChanges)
  const releases: Array<ReturnType<typeof deferred>> = []
  // WHY：只观测真实迭代器的 finally；路由、SQLite 通知、HTTP 生命周期仍走生产实现。
  store.workspaceChanges.observe = async function* (...args) {
    const released = deferred(); releases.push(released)
    try { yield* observe(...args) } finally { released.resolve() }
  }
  return releases
}

async function within<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("HTTP stream did not settle")), 1500)
    timer.unref()
  })
  try { return await Promise.race([promise, limit]) } finally { clearTimeout(timer) }
}

test("HTTP通知回归：暂停后追最新、重连补进展、客户端取消及服务关闭释放开放流", async () => fixture(async ({ app, coordinator, store, taskChain }) => {
  const taskId = coordinator.taskAction({ type: "create", requestId: randomUUID() })
  const releases = trackStreamRelease(store)
  const address = await app.listen({ port: 0, host: "127.0.0.1" })
  const endpoint = `${address}/api/task-chain/changes?taskId=${taskId}`
  const streams: Array<Awaited<ReturnType<typeof openHttpStream>>> = []
  try {
    const first = await within(openHttpStream(`${endpoint}&after=-1`)); streams.push(first)
    const baseline = JSON.parse((await within(first.reader.next())).value!) as number
    assert.equal(baseline, taskChain.repository.workspaceSequence(taskId))
    first.response.pause()
    for (let index = 0; index < 6; index++) {
      store.mutate(taskId, () => {})
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    const latest = taskChain.repository.workspaceSequence(taskId)
    first.response.resume()
    let consumed = baseline
    while (consumed < latest) {
      const item = await within(first.reader.next())
      assert.equal(item.done, false)
      const sequence = JSON.parse(item.value!) as number
      assert.ok(sequence > consumed); consumed = sequence
    }
    assert.equal(consumed, latest)
    const cancelled = releases[0]!.promise
    first.close(); await within(cancelled)
    store.mutate(taskId, () => {}); store.mutate(taskId, () => {})
    const resumed = await within(openHttpStream(`${endpoint}&after=${consumed}`)); streams.push(resumed)
    assert.equal(JSON.parse((await within(resumed.reader.next())).value!), taskChain.repository.workspaceSequence(taskId))
    await within(app.close())
    await within(releases[1]!.promise)
    assert.equal((await within(resumed.reader.next())).done, true)
  } finally { for (const stream of streams) stream.close() }
  // TRADE-OFF：短暂停读验证真实 HTTP 追进展；不声称已填满 OS socket 缓冲或测出内存上界。
}))

test("HTTP通知回归：continuous访谈从idle消费新提交并在取消后释放，无模型调用", async () => fixture(async ({ app, coordinator, store }) => {
  const taskId = coordinator.taskAction({ type: "create", requestId: randomUUID() })
  const releases = trackStreamRelease(store)
  const address = await app.listen({ port: 0, host: "127.0.0.1" })
  const stream = await within(openHttpStream(`${address}/api/interview/events?taskId=${taskId}&after=-1&continuous=true`))
  try {
    const initial = JSON.parse((await within(stream.reader.next())).value!)
    assert.equal(initial.taskId, taskId); assert.equal(initial.state.active, false)
    store.mutate(taskId, () => {})
    const changed = JSON.parse((await within(stream.reader.next())).value!)
    assert.equal(changed.taskId, taskId)
    assert.equal(changed.state.sequence, store.task(taskId).sequence)
    assert.ok(changed.state.sequence > initial.state.sequence)
    assert.deepEqual(changed.state.messages, []); assert.deepEqual(changed.state.audits, [])
    stream.close(); await within(releases[0]!.promise)
  } finally { stream.close() }
}))
