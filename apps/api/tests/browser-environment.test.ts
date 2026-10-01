import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { browserEnvironmentSchema, executionBrowser } from "@browser-capture/contracts/browser-profile"
import { taskExecutionBrowserSchema } from "@browser-capture/contracts"
import { ProductStore } from "../src/database/store.js"
import { BrowserEnvironmentService } from "../src/browser/environment-service.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { createApplication } from "../src/app.js"
import { randomUUID } from "node:crypto"
import { taskAuthoringActivitySchema } from "@browser-capture/contracts"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { projectActivity } from "../src/task-chain/workspace-projection.js"

const confirmed = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "not_required", code: null })), false)
const unconfirmed = { ...confirmed, status: "unconfirmed" as const, activeResources: true }
const ownerId = "a81d8a80-50ae-48aa-a06c-558ccf08f76a"

// WHY：保护三模式的真实分流与持久化边界，不把静态 UI 或候选探针算作功能验收。
test("专属模式不探测日常 Chrome，并沿用同一 Profile 和 operation owner", async () => {
  for (const mode of ["dedicated-visible", "dedicated-headless"] as const) {
    let resolved = false, request: any
    const runner = new RunnerProcess(process.cwd(), new AbortController().signal, undefined,
      { browserMode: mode, resolveBrowserEndpoint: async () => { resolved = true; throw new Error("daily must not be read") } })
    ;(runner as any).launch = async () => {}
    runner.request = async raw => { request = raw; return null }
    await runner.startHybrid({ headless: false, profilePath: "/tmp/bat-owned-environment/default",
      allowedOrigins: ["https://example.test"], connectionOwnerId: ownerId, managedWindow: { ownerId, resume: false } })
    assert.equal(resolved, false)
    assert.equal(request.config.existingBrowser, undefined)
    assert.equal(request.config.connectionOwnerId, undefined)
    assert.equal(request.config.headless, mode === "dedicated-headless")
    assert.equal(request.config.managedWindow.ownerId, ownerId)
    assert.equal(request.config.profilePath, "/tmp/bat-owned-environment/default")
  }
})

test("模式与可见性不一致拒绝；旧运行合同保持可读", () => {
  for (const mode of ["daily", "dedicated-visible", "dedicated-headless"] as const) {
    assert.deepEqual(taskExecutionBrowserSchema.parse(executionBrowser(mode)), executionBrowser(mode))
    assert.throws(() => taskExecutionBrowserSchema.parse({ mode, headless: mode !== "dedicated-headless" }))
  }
  assert.deepEqual(taskExecutionBrowserSchema.parse({ headless: false }), { headless: false })
})

test("旧显式可见请求不被当前无头选择覆盖；新模式及缺省各自保留语义", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-legacy-browser-"))
  const store = await ProductStore.open(directory)
  try {
    store.saveBrowserEnvironment("dedicated-headless", 0)
    assert.deepEqual(store.executionBrowser({ headless: false }), { mode: "daily", headless: false })
    assert.deepEqual(store.executionBrowser({ headless: true }), { mode: "dedicated-headless", headless: true })
    assert.deepEqual(store.executionBrowser(), { mode: "dedicated-headless", headless: true })
    assert.deepEqual(store.executionBrowser({ mode: "dedicated-visible", headless: false }),
      { mode: "dedicated-visible", headless: false })
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("选择跨服务重启保留，执行快照不随后续选择变化，旧 revision 不得覆盖", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-environment-"))
  let store = await ProductStore.open(directory)
  try {
    assert.deepEqual(browserEnvironmentSchema.parse(store.browserEnvironment()), { mode: "daily", revision: 0 })
    const first = store.saveBrowserEnvironment("dedicated-visible", 0)
    const snapshot = store.executionBrowser()
    store.saveBrowserEnvironment("dedicated-headless", first.revision)
    assert.equal(snapshot.mode, "dedicated-visible")
    assert.throws(() => store.saveBrowserEnvironment("daily", 0), /浏览器选择已变化/)
    await store.close(); store = await ProductStore.open(directory)
    assert.deepEqual(store.browserEnvironment(), { mode: "dedicated-headless", revision: 2 })
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("准备环境快照跨存储重启保留并投影，旧任务不补写未知模式", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-preparation-environment-"))
  let store = await ProductStore.open(directory)
  const taskId = store.taskAction({ type: "create", requestId: randomUUID() }), jobId = randomUUID(), legacyId = randomUUID()
  const now = new Date().toISOString()
  try {
    const repository = new TaskContractRepository(store)
    store.saveBrowserEnvironment("dedicated-visible", 0)
    const job = { id: jobId, taskId, type: "prepare" as const, key: "frozen", status: "failed" as const, sequence: 0,
      reason: "controlled_failure", resultId: null, audit: null,
      preparation: { phase: "forming_plan" as const, plan: null, chains: [], candidatePlan: null,
        representativeInput: null, verificationInput: null, inputRequest: null, requirementReturn: null,
        validationExecutionIds: [], priorAudits: [] }, createdAt: now, updatedAt: now }
    repository.saveJob({ ...job, browser: store.executionBrowser() })
    repository.saveJob({ ...job, id: legacyId, key: "legacy" })
    store.saveBrowserEnvironment("dedicated-headless", 1)
    await store.close(); store = await ProductStore.open(directory)
    const reopened = new TaskContractRepository(store)
    const activity = taskAuthoringActivitySchema.parse(projectActivity(reopened.job(taskId, jobId)))
    assert.deepEqual(activity.browser, { mode: "dedicated-visible", headless: false })
    assert.equal(reopened.job(taskId, legacyId).browser, undefined)
    assert.equal(taskAuthoringActivitySchema.parse(projectActivity(reopened.job(taskId, legacyId))).browser, undefined)
    assert.equal(store.browserEnvironment().mode, "dedicated-headless")
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("原连接清理未确认禁止更换环境；切换期间禁止并发启动或再次切换", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-environment-"))
  const store = await ProductStore.open(directory)
  let release!: (report: typeof confirmed) => void
  const service = new BrowserEnvironmentService(store, { withSession: async () => { throw new Error("unused") },
    close: () => new Promise(resolve => { release = resolve }) }, () => {})
  try {
    const pending = service.select({ mode: "dedicated-visible", expectedRevision: 0 })
    assert.throws(() => service.assertStable(), /浏览器环境正在切换/)
    await assert.rejects(service.select({ mode: "dedicated-headless", expectedRevision: 0 }), /浏览器环境正在切换/)
    release(unconfirmed)
    await assert.rejects(pending, /原浏览器连接清理未确认/)
    assert.deepEqual(service.snapshot(), { mode: "daily", revision: 0 })
    service.assertStable()
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("任务占用时不得清理其连接或改变选择", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-environment-"))
  const store = await ProductStore.open(directory)
  let closes = 0
  const service = new BrowserEnvironmentService(store, { withSession: async () => { throw new Error("unused") },
    close: async () => { closes++; return confirmed } }, () => { throw new Error("busy task") })
  try {
    await assert.rejects(service.select({ mode: "dedicated-visible", expectedRevision: 0 }), /busy task/)
    assert.equal(closes, 0); assert.equal(service.snapshot().revision, 0)
  } finally { await store.close(); await rm(directory, { recursive: true, force: true }) }
})

test("HTTP 入口只接受同源切换；账号窗口占用时不切换、不清理、不启动任务", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-environment-http-"))
  let closes = 0
  const app = await createApplication({ root: process.cwd(), directory,
    upstreamBrowserRuntime: { withSession: async () => { throw new Error("no browser/model expected") },
      close: async () => { closes++; return confirmed } } })
  const headers = { host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin" }
  try {
    const refused = await app.app.inject({ method: "PUT", url: "/api/browser-environment",
      headers: { ...headers, origin: "https://foreign.test" }, payload: { mode: "dedicated-visible", expectedRevision: 0 } })
    assert.equal(refused.statusCode, 403); assert.equal(closes, 0)
    app.browserProfile.isBusy = () => true
    const busy = await app.app.inject({ method: "PUT", url: "/api/browser-environment", headers,
      payload: { mode: "dedicated-visible", expectedRevision: 0 } })
    assert.equal(busy.statusCode, 409); assert.equal(closes, 0)
    app.browserProfile.isBusy = () => false
    const saved = await app.app.inject({ method: "PUT", url: "/api/browser-environment", headers,
      payload: { mode: "dedicated-visible", expectedRevision: 0 } })
    assert.equal(saved.statusCode, 200); assert.equal(closes, 1)
    assert.deepEqual(saved.json(), { mode: "dedicated-visible", revision: 1 })
  } finally { await app.app.close(); await rm(directory, { recursive: true, force: true }) }
})
