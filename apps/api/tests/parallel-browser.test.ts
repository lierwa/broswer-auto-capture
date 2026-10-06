import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { seedRunControl } from "./helpers/run-control-fixture.js"
import { taskBrowserEnvironment, saveTaskBrowserEnvironment } from "../src/browser/task-environment.js"
import { ProductStore } from "../src/database/store.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { CDPOwnerScopes } from "../../../vendor/daily-chrome-extension/cdpOwnerScopes.js"

// WHY：保护真实回归边界：配置继承/落盘、独立 controller 与 CDP 作用域，而非镜像实现。
test("任务默认动态跟随全局，覆盖/清除持久化，已启动快照不变", async () => {
  const f = await directoryFixture(), store = f.api.store
  const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
  try {
    store.saveBrowserEnvironment("dedicated-visible", 0)
    assert.equal(taskBrowserEnvironment(store, taskId).mode, "dedicated-visible")
    const override = saveTaskBrowserEnvironment(store, taskId, "daily", 0)
    const frozen = store.executionBrowser(undefined, taskId)
    store.saveBrowserEnvironment("dedicated-headless", 1)
    assert.equal(taskBrowserEnvironment(store, taskId).mode, "daily")
    const cleared = saveTaskBrowserEnvironment(store, taskId, null, override.revision)
    assert.equal(taskBrowserEnvironment(store, taskId).mode, "dedicated-headless")
    assert.equal(frozen.mode, "daily")
    assert.throws(() => saveTaskBrowserEnvironment(store, taskId, "daily", 0), /已变化/)
    const persisted = saveTaskBrowserEnvironment(store, taskId, "dedicated-visible", cleared.revision)
    assert.throws(() => saveTaskBrowserEnvironment(store, taskId, "daily", 0), /已变化/)
    const response = await f.api.app.inject({ method: "GET", url: `/api/task-browser-environment?taskId=${taskId}` })
    assert.equal(response.statusCode, 200); assert.equal(response.json().override, persisted.override)
    await f.api.app.close()
    const reopened = await ProductStore.open(f.directory)
    try { assert.equal(taskBrowserEnvironment(reopened, taskId).override, "dedicated-visible") }
    finally { await reopened.close() }
  } finally { await f.api.app.close(); await rm(f.directory, { recursive: true, force: true }) }
})

test("两个任务实际同时进入执行；取消一个不取消另一个，历史交付不阻塞", async () => {
  const f = await directoryFixture(), entered: string[] = [], gates = new Map<string, () => void>()
  let ready!: () => void
  const both = new Promise<void>(resolve => { ready = resolve })
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "confirmed", code: null })), false)
  f.upstream.withCapabilities = async (input, work) => {
    entered.push(input.ownerId)
    try {
      await new Promise<void>((resolve, reject) => {
        gates.set(input.ownerId, resolve)
        input.signal.addEventListener("abort", () => reject(input.signal.reason), { once: true })
        if (entered.length === 2) ready()
      })
      const result = await work({ capability: async () => ({ outcome: "success", output: null }) })
      const purpose = input.handoffPurpose?.()
      if (purpose) input.onHandoff?.(purpose, { ownerId: input.ownerId, leaseId: input.ownerId, active: true, targetDigest: "a".repeat(64), reason: null })
      return result
    } finally { input.onCleanup?.(report) }
  }
  const first = seedRunControl(f.api.store, f.api.taskChain, "https://parallel.test")
  const second = seedRunControl(f.api.store, f.api.taskChain, "https://parallel.test")
  try {
    const a = await f.api.taskChain.dispatchAsync(first.taskId, { type: "run_task", requestId: randomUUID(), release: first.release, input: null })
    const b = await f.api.taskChain.dispatchAsync(second.taskId, { type: "run_task", requestId: randomUUID(), release: second.release, input: null })
    await Promise.race([both, new Promise((_, reject) => setTimeout(() => reject(Error("parallel_start_timeout")), 3000))])
    assert.equal(new Set(entered).size, 2)
    assert.equal(f.api.taskChain.isActive(first.taskId), true); assert.equal(f.api.taskChain.isActive(second.taskId), true)
    assert.throws(() => f.api.taskChain.dispatch(first.taskId, { type: "run_task", requestId: randomUUID(), release: first.release, input: null }), /本任务正在处理/)
    f.api.taskChain.dispatch(first.taskId, { type: "cancel_execution", executionId: a.acceptedExecution!.executionId })
    assert.equal(f.api.taskChain.isActive(second.taskId), true)
    gates.get(entered[1]!)!()
    await Promise.all([...(f.api.taskChain as unknown as { activeWork: Set<Promise<unknown>> }).activeWork])
    const failed = f.api.taskChain.repository.execution(first.taskId, a.acceptedExecution!.executionId)
    const completed = f.api.taskChain.repository.execution(second.taskId, b.acceptedExecution!.executionId)
    assert.equal(failed.status, "cancelled")
    assert.equal(completed.status, "completed")
    assert.notEqual(failed.id, completed.id)
    const third = seedRunControl(f.api.store, f.api.taskChain, "https://parallel.test")
    const c = await f.api.taskChain.dispatchAsync(third.taskId, { type: "run_task", requestId: randomUUID(), release: third.release, input: null })
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(entered.length, 3); gates.get(entered[2]!)!()
    await Promise.all([...(f.api.taskChain as unknown as { activeWork: Set<Promise<unknown>> }).activeWork])
    assert.equal(f.api.taskChain.repository.execution(third.taskId, c.acceptedExecution!.executionId).status, "completed")
  } finally { for (const release of gates.values()) release(); await f.api.app.close(); await rm(f.directory, { recursive: true, force: true }) }
})

test("两个 CDP owner 隔离目标/事件/session；断开一个仍可向另一个投递", () => {
  const scopes = new CDPOwnerScopes(), a = randomUUID(), b = randomUUID(), eventsA: unknown[] = [], eventsB: unknown[] = []
  const ca = { readyState: 1, send: (value: string) => eventsA.push(JSON.parse(value)) }
  const cb = { readyState: 1, send: (value: string) => eventsB.push(JSON.parse(value)) }
  scopes.register(a, ["a"]); scopes.register(b, ["b"]); scopes.connect(ca, a); scopes.connect(cb, b)
  scopes.event({ method: "Target.attachedToTarget", params: { sessionId: "sa", targetInfo: { targetId: "a" } } })
  scopes.event({ method: "Target.attachedToTarget", params: { sessionId: "sb", targetInfo: { targetId: "b" } } })
  assert.equal(eventsA.length, 1); assert.equal(eventsB.length, 1)
  assert.throws(() => scopes.check(a, "Target.closeTarget", { targetId: "b" }), /not_authorized/)
  assert.throws(() => scopes.check(a, "Runtime.evaluate", {}, "sb"), /not_authorized/)
  assert.throws(() => scopes.check(a, "Browser.close", {}), /not_authorized/)
  assert.deepEqual(scopes.response(a, "Target.getTargets", {}, { targetInfos: [{ targetId: "a" }, { targetId: "b" }] }).targetInfos, [{ targetId: "a" }])
  scopes.disconnect(ca); scopes.event({ method: "Runtime.consoleAPICalled", sessionId: "sb", params: {} })
  assert.equal(eventsB.length, 2); assert.equal(eventsA.length, 1)
})
