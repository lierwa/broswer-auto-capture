import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { DomainError } from "../src/errors.js"

// WHY：账号前置失败不能给尚未创建的任务资源挂上永久清理锁；首次异常保持原对象。
test("account preparation failure proves no task runner was created and retains the first failure", async () => {
  const runtime = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory: "unused-owned-fixture", subject: {} as never })
  const failure = new Error("synthetic_connection_refused"), observed: RunnerCleanupReport[] = []
  runtime.setAccountPreparation(async () => { throw failure })
  await assert.rejects(runtime.withCapabilities({ ownerId: randomUUID(), signal: new AbortController().signal,
    browserMode: "daily", allowedOrigins: ["https://fixture.test"], onCleanup: report => observed.push(report) },
    async () => { throw Error("task_runner_must_not_start") }), error => error === failure)
  assert.equal(observed.length, 1)
  assert.equal(observed[0]!.status, "confirmed"); assert.equal(observed[0]!.activeResources, false)
  assert(observed[0]!.stages.every(stage => stage.status === "not_required"))
})

// WHY：同一持久账号的显示不能因切换尚未检查的执行环境而改变，也不能被资源错误抹掉。
test("shared login remains readable across browser selection and a transport failure", async () => {
  const f = await directoryFixture()
  try {
    const first = await f.command("add"), account = first.items[0]!.account!, calls = f.state.calls
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    assert.deepEqual(f.api.accounts.directory.snapshot().items[0]!.account, account)
    assert.equal(f.state.calls, calls)
    const access = (f.api.accounts as unknown as { access: { verify(kind: string): Promise<void> } }).access
    access.verify = async () => { throw new DomainError("account_browser_unavailable", "synthetic_transport_failure", 409) }
    await f.command("check")
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.status, "failed")
    assert.deepEqual(f.api.accounts.directory.snapshot().items[0]!.account, account)
    assert.equal(f.api.accounts.directory.current("bilibili")!.state, "ready")
  } finally { await f.api.app.close() }
})
