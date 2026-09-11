import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { BrowserError, type BrowserGrant, type CommandExecutor } from "@browser-capture/browser"
import { createApplication } from "../src/app.js"
import { openFixture, deferred, projectRoot } from "./helpers.js"
import { testAIModel } from "./fixtures/ai-model.js"

const headers = { host: "127.0.0.1:4175" }
async function fixture(work: (value: Awaited<ReturnType<typeof context>>) => Promise<void>) {
  const value = await context()
  try { await work(value) } finally { await value.current.app.close(); await rm(value.directory, { recursive: true, force: true }) }
}
async function context() {
  const original = await openFixture(), taskId = original.create(), otherId = original.create()
  original.send(taskId); await original.coordinator.waitForIdle()
  original.coordinator.dispatch(taskId, { type: "confirm", requestId: randomUUID(), expectedRevision: 1, version: 1 })
  await original.coordinator.close(); await original.store.close()
  const fake = { text: "@e1 link \"下一页\"", badStop: false, count: 0 }
  const executor: CommandExecutor = async (args) => {
    fake.count += 1
    const value = args[1] === "session" ? args[2] === "start" ? { session_id: "abcd" }
      : { stopped: fake.badStop ? [] : ["abcd"], failed: fake.badStop ? ["failed"] : [], return_failures: [] }
      : args[1] === "tab" ? { tabs: [{ tab_id: 1, url: "https://example.com/", active: true, scope: "agent" }] }
      : { tab_id: 1, text: fake.text, truncated: false }
    return { stdout: JSON.stringify(value), exitCode: 0 }
  }
  const open = () => createApplication({ root: projectRoot, directory: original.directory, browserExecutor: executor,
    aiModel: testAIModel((prompt, schema, signal) => original.client.runTurn(prompt, schema, signal)) })
  const current = await open()
  const grant = (): BrowserGrant => ({ taskId, runId: randomUUID(), requirementVersion: 1, purpose: "plan_evidence",
    allowedOrigins: ["https://example.com"], actions: ["observe"], maxCommands: 20, timeoutMs: 10_000 })
  return { current, open, grant, fake, taskId, otherId, directory: original.directory }
}

test("正式服务校验确认版本，持久化任务归属；HTTP 不接受浏览器授权或原始命令", async () => fixture(async (value) => {
  const { current, grant, otherId, taskId, fake } = value
  await assert.rejects(current.browser.run({ ...grant(), taskId: otherId }, async () => {}), (e: unknown) => e instanceof BrowserError && e.code === "permission_denied")
  assert.equal(fake.count, 0)
  const binding = grant()
  await current.browser.run(binding, (session) => session.command({ type: "observe" }))
  const status = await current.app.inject({ url: `/api/browser?taskId=${taskId}`, headers })
  assert.equal(status.json().record.status, "succeeded")
  assert.equal(status.json().record.requirementVersion, 1)
  assert.equal((await current.browser.snapshot(otherId)).record, null)
  await assert.rejects(current.browser.run(binding, async () => {}))
  const before = fake.count
  assert.equal((await current.app.inject({ method: "POST", url: `/api/browser?taskId=${taskId}`, headers, payload: { type: "navigate", url: "https://example.com" } })).statusCode, 400)
  assert.equal(fake.count, before)
  await current.app.close(); value.current = await value.open()
  assert.equal((await value.current.browser.snapshot(taskId)).record?.runId, binding.runId)
}))

test("当前服务的等待/互斥/跨任务取消保护/停止通过正式 API 展示", async () => fixture(async ({ current, grant, taskId, otherId }) => {
  const ready = deferred(), binding = grant()
  const running = current.browser.run(binding, async () => { ready.resolve(); await new Promise(() => {}) })
  const rejected = assert.rejects(running, (e: unknown) => e instanceof BrowserError && e.code === "cancelled")
  await ready.promise
  assert.equal((await current.browser.snapshot(taskId)).record?.status, "running")
  await assert.rejects(current.browser.run(grant(), async () => {}), (e: unknown) => e instanceof BrowserError && e.code === "busy")
  assert.equal((await current.app.inject({ method: "POST", url: `/api/browser?taskId=${otherId}`, headers, payload: { type: "cancel", runId: binding.runId } })).statusCode, 409)
  assert.equal((await current.app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "archive", id: taskId, archived: true } })).statusCode, 409)
  assert.equal((await current.app.inject({ method: "POST", url: `/api/browser?taskId=${taskId}`, headers, payload: { type: "cancel", runId: binding.runId } })).statusCode, 200)
  await rejected
  assert.equal((await current.browser.snapshot(taskId)).record?.status, "cancelled")
}))

test("访问受限持久化为待人工，关闭失败仅所属任务可清理且不伪造成功", async () => fixture(async ({ current, grant, fake, taskId, otherId }) => {
  fake.text = "请先登录"
  await assert.rejects(current.browser.run(grant(), (session) => session.command({ type: "observe" })))
  assert.equal((await current.browser.snapshot(taskId)).record?.status, "manual_required")
  fake.badStop = true
  const binding = grant()
  await assert.rejects(current.browser.run(binding, async () => {}))
  assert.equal((await current.browser.snapshot(taskId)).cleanupRunId, binding.runId)
  assert.equal((await current.browser.snapshot(otherId)).cleanupRunId, null)
  await assert.rejects(current.browser.control(otherId, { type: "cleanup", runId: binding.runId }))
  fake.badStop = false
  const cleaned = await current.browser.control(taskId, { type: "cleanup", runId: binding.runId })
  assert.equal(cleaned.cleanupRequired, false)
  assert.equal(cleaned.record?.status, "interrupted")
}))
