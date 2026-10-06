import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { AccountRunner } from "../src/upstream-browser/account-runner.js"
import type { RunnerProcess } from "../src/upstream-browser/service.js"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { accountOwnedCore } from "./helpers/account-owned-core.js"

// WHY：保护进程复用与取消边界；取消后的进程不能被恢复请求继续使用。
test("account operation reuses one runner; abort discards it before fresh recovery", async () => {
  let starts = 0, closes = 0
  const signals = new Map<RunnerProcess, AbortSignal>()
  const adapter = new AccountRunner(signal => {
    const runner = { async startCompiler() { starts++ } } as RunnerProcess
    signals.set(runner, signal); return runner
  }, async runner => { signals.delete(runner); closes++ })
  const signal = new AbortController().signal
  await adapter.run(async () => {
    const first = await adapter.use(signal, async runner => runner)
    for (let i = 0; i < 10; i++) assert.equal(await adapter.use(signal, async r => r), first)
    assert.equal(starts, 1)
    const controller = new AbortController()
    await assert.rejects(adapter.use(controller.signal, async runner => {
      controller.abort(Error("owned_timeout"))
      signals.get(runner)!.throwIfAborted()
    }), /owned_timeout/)
    assert.equal(closes, 1)
    assert.notEqual(await adapter.use(signal, async r => r), first)
  })
  assert.equal(starts, 2); assert.equal(closes, 2); assert.equal(signals.size, 0)
})

test("independent account operations never share runner ownership", async () => {
  let closes = 0
  const adapter = new AccountRunner(() => ({ async startCompiler() {} }) as RunnerProcess, async () => { closes++ })
  const [a, b] = await Promise.all([1, 2].map(() => adapter.run(() => adapter.use(new AbortController().signal, async r => r))))
  assert.notEqual(a, b); assert.equal(closes, 2)
})

// WHY：读取/复用失败都要结束自动检查页，同时保留原账号与已核验回滚事实。
test("failed native check closes its maintenance page without overwriting the account", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add"); const original = structuredClone(f.api.accounts.directory.current("bilibili"))
    f.upstream.accountSession = async () => { throw Error("native_check_failed") }
    assert.equal((await f.command("check")).operation?.status, "failed")
    assert.deepEqual(f.api.accounts.directory.current("bilibili"), original)
    assert(f.api.accounts.repository.list("maintenance").every(w => w.status === "closed"))
  } finally { await f.api.app.close() }
})

test("failure after transfer verification rolls back and closes both automatic maintenance pages", async () => {
  const f = await directoryFixture(), native = f.upstream.accountSession!
  try {
    await f.command("add"); f.state.dedicated = "none"
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    f.upstream.accountSession = async (input, signal) => {
      if (input.action === "auth_abandon") throw Error("receipt_cleanup_failed")
      return native(input, signal)
    }
    assert.equal((await f.command("check")).operation?.status, "failed")
    assert.equal(f.state.dedicated, "none")
    assert.equal(f.api.accounts.repository.list("transfer").at(-1)?.status, "rolled_back")
    assert(f.api.accounts.repository.list("maintenance").every(w => w.status === "closed"))
  } finally { await f.api.app.close() }
})

test("check timeout does not request login; committed check survives a later cleanup deadline", async () => {
  const f = await directoryFixture(), native = f.upstream.accountSession!
  try {
    await f.command("add")
    const original = f.api.accounts.directory.current("bilibili")!
    const controller = new AbortController()
    f.upstream.accountSession = async () => { controller.abort(new DOMException("timed out", "TimeoutError")); throw controller.signal.reason }
    await assert.rejects(f.api.accounts.directory.perform({ type: "check", requestId: randomUUID(), platformId: "bilibili", revision: original.revision }, controller.signal))
    assert.match(f.api.accounts.directory.snapshot().operation?.reason ?? "", /账号检查超时/)
    assert.doesNotMatch(f.api.accounts.directory.snapshot().operation?.reason ?? "", /完成登录/)
    f.upstream.accountSession = native
    const deadline = new AbortController(), end = f.upstream.managedWindowAction!
    f.upstream.managedWindowAction = async input => {
      if (input.action === "end") deadline.abort(new DOMException("timed out", "TimeoutError"))
      return end(input)
    }
    await f.api.accounts.directory.perform({ type: "check", requestId: randomUUID(), platformId: "bilibili", revision: original.revision }, deadline.signal)
    assert.equal(f.api.accounts.directory.snapshot().operation?.status, "completed")
    assert(f.api.accounts.repository.list("maintenance").every(w => w.status === "closed"))
  } finally { await f.api.app.close() }
})

test("cleanup stays busy and its failure is visible without losing the successful account check", async () => {
  const f = await directoryFixture(), action = f.upstream.managedWindowAction!
  try {
    await f.command("add"); let closing = false, finish!: () => void
    const released = new Promise<void>(resolve => { finish = resolve })
    f.upstream.managedWindowAction = async input => {
      if (input.action === "end") { closing = true; await released; throw Error("owned_close_failed") }
      if (input.action === "verify_closed") throw Error("owned_close_unconfirmed")
      return action(input)
    }
    const running = f.command("check")
    while (!closing) await delay(10)
    assert.equal(f.api.accounts.directory.snapshot().operation?.status, "running")
    finish(); const result = await running
    assert.equal(result.operation?.status, "completed")
    assert.equal(result.items[0]!.account?.state, "ready")
    assert.match(result.notice ?? "", /窗口关闭尚未确认/)
  } finally { f.upstream.managedWindowAction = action; await f.api.app.close() }
})

test("missing relay enumeration cannot block native owned cleanup before startup or after restart", async () => {
  const f = await directoryFixture(), action = f.upstream.managedWindowAction!
  try {
    await f.command("add"); await f.command("open")
    const core = accountOwnedCore(f.api.accounts), window = f.api.accounts.repository.active()!
    f.upstream.managedWindowAction = async input => {
      if (input.action === "inspect") throw Error("hybrid_attached_window_end_unconfirmed")
      return action(input)
    }
    await f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "daily", allowedOrigins: [], signal: new AbortController().signal, resume: false })
    assert.equal(f.api.accounts.repository.get("maintenance", window.id).status, "closed")
    await f.command("open"); const retained = f.api.accounts.repository.active()!
    f.api.accounts.repository.save("maintenance", { ...retained, status: "cleanup_required" })
    const identity = f.api.accounts.repository.get("identity", retained.browserIdentityId)
    const next = await core.windows.open(identity, f.api.accounts.directory.platform("bilibili"), new AbortController().signal, false)
    assert.notEqual(next.ownerId, retained.ownerId)
    assert.equal(f.api.accounts.repository.get("maintenance", retained.id).status, "closed")
  } finally { await f.api.app.close() }
})

test("manual login replaces a retained headless check only after owned closure is confirmed", async () => {
  const f = await directoryFixture(), action = f.upstream.managedWindowAction!
  try {
    const core = accountOwnedCore(f.api.accounts), identity = await core.identities.identify("dedicated")
    const first = await core.windows.open(identity, f.api.accounts.directory.platform("bilibili"), new AbortController().signal, false)
    assert.equal(first.headless, true)
    f.api.accounts.repository.save("maintenance", { ...first, status: "cleanup_required" })
    f.upstream.managedWindowAction = async input => {
      if (input.action === "end" || input.action === "verify_closed") throw Error("owned_close_unconfirmed")
      return action(input)
    }
    await assert.rejects(core.windows.open(identity, null, new AbortController().signal, true), /关闭尚未确认/)
    assert.equal(f.api.accounts.repository.list("maintenance").length, 1)
    f.upstream.managedWindowAction = action
    const next = await core.windows.open(identity, null, new AbortController().signal, true)
    assert.notEqual(next.ownerId, first.ownerId); assert.equal(next.headless, false)
    assert.equal(f.api.accounts.repository.get("maintenance", first.id).status, "closed")
  } finally { f.upstream.managedWindowAction = action; await f.api.app.close() }
})
