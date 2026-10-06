import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { accountFixtureChain } from "./browser-account-fixture.js"

// WHY：共享目录不能让维护操作忽略本次选择，也不能因目标未登录丢失原有效来源。
test("shared account check uses the selected browser and retains the account identity", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add")
    const account = f.api.accounts.directory.current("bilibili")!
    f.state.dedicated = "A"
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    await f.command("check")
    const latest = f.api.accounts.repository.list("platformCheck").at(-1)!
    const identity = f.api.accounts.repository.get("identity", latest.browserIdentityId)
    assert.equal(identity.kind, "dedicated")
    assert.equal(f.api.accounts.directory.current("bilibili")?.id, account.id)
    assert.equal(f.state.writes, 0)
  } finally { await f.api.app.close() }
})

test("daily connection failure is recorded without silently opening dedicated Chrome", async () => {
  const f = await directoryFixture()
  const original = f.upstream.withCapabilities!.bind(f.upstream)
  f.upstream.withCapabilities = async (input, work) => {
    if (input.browserMode === "daily") throw Error("owned_daily_connection_failed")
    return original(input, work)
  }
  try {
    const state = await f.command("add")
    assert.equal(state.operation?.status, "failed")
    assert.equal(f.api.accounts.directory.current("bilibili"), null)
    assert.equal(f.api.accounts.repository.list("maintenance").some(w =>
      f.api.accounts.repository.get("identity", w.browserIdentityId).kind === "dedicated"), false)
  } finally { await f.api.app.close() }
})

test("a selected browser without reusable login does not discard the original account source", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add")
    const account = f.api.accounts.directory.current("bilibili")!
    f.api.accounts.directory.platform("bilibili").transferReady = false
    f.state.dedicated = "none"
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    const state = await f.command("check")
    assert.equal(state.items[0]?.account?.state, "expired")
    assert.equal(f.api.accounts.directory.current("bilibili")?.sourceIdentityId, account.sourceIdentityId)
    assert.equal(f.state.writes, 0)
  } finally { await f.api.app.close() }
})

test("a saved custom check runs in the selected browser without rewriting its chain", async () => {
  const f = await directoryFixture()
  const act = async (body: object) => { await f.api.accounts.directoryCommand({ requestId: randomUUID(), ...body }); await f.api.accounts.settled() }
  try {
    await act({ type: "custom_open" }); await act({ type: "custom_read" })
    const binding = f.api.accounts.repository.list("binding")[0]!
    const chain = accountFixtureChain(binding.url)
    f.api.accounts.repository.save("platformMethod", { schemaVersion: 1, id: randomUUID(), platformId: binding.id,
      platformVersion: "fixture", sourceDigest: "a".repeat(64), chain, createdAt: new Date().toISOString() })
    await act({ type: "custom_attach", platformId: binding.id, revision: binding.revision, chainId: chain.id, chainVersion: chain.version })
    await act({ type: "open", platformId: binding.id, revision: 0 })
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)?.status, "completed")
    await act({ type: "custom_add", platformId: binding.id, revision: 0 })
    const original = f.api.accounts.repository.get("binding", binding.id)
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    await act({ type: "custom_check", platformId: binding.id, revision: 1 })
    const check = f.api.accounts.repository.list("platformCheck").at(-1)!
    assert.equal(f.api.accounts.repository.get("identity", check.browserIdentityId).kind, "dedicated")
    assert.deepEqual(f.api.accounts.repository.get("binding", binding.id), original)
    assert.equal(check.run?.consumed.llmCalls, 0)
  } finally { await f.api.app.close() }
})
