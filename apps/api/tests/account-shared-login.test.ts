import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { createApplication } from "../src/app.js"

// WHY：本轮用户明确要求双向复用，认证写入仍需原目标未登录及同 UID 证明。
test("dedicated login is reused in daily Chrome on startup and during a manual check", async () => {
  for (const action of ["startup", "check"] as const) {
    const f = await directoryFixture()
    try {
      f.state.daily = "none"
      f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
      await f.command("add")
      const account = f.api.accounts.directory.current("bilibili")!
      f.api.store.saveBrowserEnvironment("daily", f.api.store.browserEnvironment().revision)
      if (action === "startup") await f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "daily",
        allowedOrigins: ["https://www.bilibili.com"], signal: AbortSignal.timeout(10000), resume: false })
      else await f.command("check")
      assert.equal(f.state.daily, "B")
      assert.equal(f.state.writes, 1)
      assert.equal(f.api.accounts.directory.current("bilibili")!.id, account.id)
      assert.equal(f.api.accounts.directory.snapshot().items[0]!.account!.state, "ready")
    } finally { await f.api.app.close() }
  }
})

test("different or unknown daily accounts are retained, with zero automatic writes", async () => {
  for (const target of ["A", "unknown"]) {
    const f = await directoryFixture()
    try {
      f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
      await f.command("add")
      const canonical = f.api.accounts.directory.current("bilibili")!
      f.state.daily = target
      f.api.store.saveBrowserEnvironment("daily", f.api.store.browserEnvironment().revision)
      const checked = await f.command("check")
      assert.equal(checked.items[0]!.account!.state, "ready")
      assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.status, "failed")
      await assert.rejects(f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "daily",
        allowedOrigins: ["https://www.bilibili.com"], signal: AbortSignal.timeout(10000), resume: false }), /目标登录不同或无法确认/)
      assert.equal(f.state.daily, target)
      assert.equal(f.state.writes, 0)
      assert.equal(f.api.accounts.directory.current("bilibili")!.identityKey, canonical.identityKey)
    } finally { await f.api.app.close() }
  }
})

test("a changed source UID cancels its unused confirmation without writing or blocking the next check", async () => {
  const f = await directoryFixture()
  try {
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    await f.command("add")
    f.state.dedicated = "C"; f.state.daily = "none"
    f.api.store.saveBrowserEnvironment("daily", f.api.store.browserEnvironment().revision)
    const checked = await f.command("check")
    assert.equal(checked.items[0]!.account!.state, "account_changed")
    assert.equal(f.state.writes, 0)
    assert(f.api.accounts.repository.list("transfer").every(t => t.status === "cancelled" && !t.confirmationRef))
    f.state.dedicated = "B"
    assert.equal((await f.command("check")).items[0]!.account!.state, "ready")
    assert.equal(f.state.writes, 1)
  } finally { await f.api.app.close() }
})

test("same-UID target startup succeeds without contacting an unavailable source browser", async () => {
  const f = await directoryFixture(), original = f.upstream.accountSession!
  try {
    await f.command("add"); f.state.dedicated = "A"
    f.api.dailyChrome.accountBinding = async () => null
    const reads: string[] = []
    f.upstream.accountSession = async (input, signal) => { reads.push(input.kind); return original(input, signal) }
    const storage = await f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "dedicated-visible",
      allowedOrigins: ["https://www.bilibili.com"], signal: AbortSignal.timeout(10000), resume: false })
    assert.deepEqual(reads, ["dedicated", "dedicated"])
    assert.equal(storage?.cookies[0]?.name, "SESSDATA")
    assert.equal(f.state.writes, 0)
  } finally { await f.api.app.close() }
})

test("a failed reverse write restores daily state; pending daily rollback can recover before retry", async () => {
  for (const pending of [false, true]) {
    const f = await directoryFixture(), original = f.upstream.accountSession!
    try {
      f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
      await f.command("add"); f.state.daily = "none"; f.state.restoreFails = pending
      f.upstream.accountSession = async (input, signal) => {
        const result = await original(input, signal)
        if (input.action === "auth_write") f.state.daily = "C"
        return result
      }
      const startup = () => f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "daily",
        allowedOrigins: ["https://www.bilibili.com"], signal: AbortSignal.timeout(10000), resume: false })
      await assert.rejects(startup())
      const transfer = f.api.accounts.repository.list("transfer").at(-1)!
      assert.equal(transfer.status, pending ? "target_pending" : "rolled_back")
      assert.equal(f.state.daily, pending ? "C" : "none")
      assert.equal(Boolean(transfer.rollbackRef), pending)
      if (pending) {
        f.state.restoreFails = false; f.upstream.accountSession = original
        await startup()
        assert.equal(f.api.accounts.repository.get("transfer", transfer.id).status, "rolled_back")
        assert.equal(f.state.daily, "B")
        assert(f.api.accounts.repository.list("maintenance").every(w => w.status === "closed"))
      }
    } finally { await f.api.app.close() }
  }
})

test("service restart projects both saved Profile checks without a browser session or a new check", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add"); f.state.dedicated = "A"
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    await f.command("check"); await f.api.app.close()
    const calls = f.state.calls, restarted = await createApplication({ root: process.cwd(), directory: f.directory, upstreamBrowserRuntime: f.upstream })
    restarted.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Owned daily fixture" })
    try {
      await restarted.accounts.directory.refreshProfiles()
      for (const mode of ["daily", "dedicated-visible"] as const) {
        restarted.store.saveBrowserEnvironment(mode, restarted.store.browserEnvironment().revision)
        assert.equal(restarted.accounts.directory.snapshot().items[0]!.account!.state, "ready")
      }
      assert.equal(f.state.calls, calls)
    } finally { await restarted.app.close() }
  } finally { await f.api.app.close() }
})

test("a previously checked browser and an older successful check remain readable from saved facts", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add")
    f.state.dedicated = "A"
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    await f.command("check")
    f.api.store.saveBrowserEnvironment("daily", f.api.store.browserEnvironment().revision)
    const calls = f.state.calls
    assert.equal(f.api.accounts.directory.snapshot().items[0]!.account!.state, "ready")
    const old = new Date(Date.now() - 3600000).toISOString()
    const account = f.api.accounts.directory.current("bilibili")!
    f.api.accounts.repository.saveLogical({ ...account, checkedAt: old })
    for (const check of f.api.accounts.repository.list("platformCheck"))
      f.api.accounts.repository.save("platformCheck", { ...check, finishedAt: old })
    assert.equal(f.api.accounts.directory.snapshot().items[0]!.account!.state, "ready")
    assert.equal(f.state.calls, calls)
  } finally { await f.api.app.close() }
})

test("saved successful checks cannot certify a different Profile or an outdated checking method", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add")
    const calls = f.state.calls
    f.api.dailyChrome.accountBinding = async () => ({ binding: "e".repeat(64), name: "Different isolated Profile" })
    await f.api.accounts.directory.refreshProfiles()
    assert.equal(f.api.accounts.directory.snapshot().items[0]!.account!.state, "unconfirmed")
    assert.equal(f.api.accounts.directory.snapshot().items[0]!.account!.checkedAt, null)
    f.api.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Owned daily fixture" })
    await f.api.accounts.directory.refreshProfiles()
    const check = f.api.accounts.repository.list("platformCheck").at(-1)!
    f.api.accounts.repository.save("platformCheck", { ...check, platformVersion: "obsolete-method" })
    assert.equal(f.api.accounts.directory.snapshot().items[0]!.account!.state, "unconfirmed")
    assert.equal(f.state.calls, calls)
  } finally { await f.api.app.close() }
})
