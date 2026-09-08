import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { createApplication } from "../src/app.js"
import { openFixture, succeeded, draft } from "./helpers.js"
import { testAIModel } from "./fixtures/ai-model.js"

async function fixture(run: (value: Awaited<ReturnType<typeof createApplication>>) => Promise<void>) {
  const original = await openFixture()
  await original.coordinator.close(); await original.store.close()
  const value = await createApplication({ root: process.cwd(), directory: original.directory, aiModel: testAIModel((prompt, schema, signal) => original.client.runTurn(prompt, schema, signal)) })
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
    yield succeeded(turn === 1
      ? { assistantText: "请先确认评价范围。", question: { prompt: "收集多少评价？", options: [
        { label: "前 20 条", description: "先覆盖核心范围", recommended: true },
        { label: "前 100 条", description: "覆盖范围更大", recommended: false },
      ] }, draft: null }
      : { assistantText: "范围已明确。", question: null, draft })
  }
  const open = () => createApplication({ root: process.cwd(), directory: original.directory,
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
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: {
      type: "message", requestId: randomUUID(), expectedRevision: 1, text: "前 20 条", answer: { questionId, label: "前 20 条" },
    } })
    await current.coordinator.waitForIdle()
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers,
      payload: { type: "confirm", requestId: randomUUID(), expectedRevision: 2, version: 1 } })
    await current.app.close(); current = await open()

    const confirmed = (await current.app.inject({ url: `/api/interview?taskId=${id}`, headers })).json()
    assert.equal(confirmed.confirmedVersion, 1)
    assert.deepEqual(confirmed.decisions.map((item: { kind: string }) => item.kind), ["option", "draft_confirmation"])
    assert.equal(confirmed.unresolved[0].status, "resolved")
  } finally {
    await current?.app.close()
    const { rm } = await import("node:fs/promises")
    await rm(original.directory, { recursive: true, force: true })
  }
})
