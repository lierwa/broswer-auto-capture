import { accountOwnedCore } from "./helpers/account-owned-core.js"
import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createApplication } from "../src/app.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import type { JsonValue } from "@browser-capture/contracts"
import { accountFixtureChain } from "./browser-account-fixture.js"
import { admitAccountChain } from "../src/browser/account-runtime.js"
import { executeAccount } from "../src/browser/account-runtime.js"
import { privateRun } from "../src/browser/account-custom.js"
import { taskRunSchema, type TaskRun } from "@browser-capture/contracts"
import type { AccountTransfers } from "../src/browser/account-transfer.js"
import { loadPlatformCatalog } from "../src/browser/platform-catalog.js"

async function fixture() {
  const state = { cleanupFails: false, changedOwner: false, gate: false, calls: 0, checkFails: false, changeBeforePrepare: false, writes: 0 }
  const sessions = { daily: { cookies: [{ name: "SESSDATA", value: "synthetic-A", domain: ".bilibili.com", path: "/" }], storage: {} },
    dedicated: { cookies: [{ name: "SESSDATA", value: "synthetic-B", domain: ".bilibili.com", path: "/" }], storage: {} } }
  const backups = new Map<string, JsonValue>()
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "confirmed", code: null })), false)
  const upstream: UpstreamBrowserRuntime = {
    async withCapabilities(input, work) {
      state.calls++; const value = await work({ capability: async () => ({ outcome: "success", output: null }) })
      input.onHandoff?.("human_wait", { ownerId: input.ownerId, leaseId: input.ownerId, targetDigest: "b".repeat(64), active: true, reason: null }); return value
    },
    async managedWindowAction(input) {
      if (state.cleanupFails) throw Error("cleanup_unconfirmed")
      return { window: { ownerId: state.changedOwner ? randomUUID() : input.ownerId, leaseId: input.leaseId,
        targetDigest: null, active: input.action !== "end" && input.action !== "verify_closed", reason: null,
        ...(input.action === "page" ? { page: { url: "https://example.test/account" } } : {}) }, report }
    },
    async accountSession(input, signal) {
      if (state.gate) await new Promise((_yes, no) => signal.addEventListener("abort", () => no(new Error("cancelled")), { once: true }))
      signal.throwIfAborted()
      if (input.action === "pick_marker") return { selector: '[id="account-name"]', preview: "Synthetic account", url: (input.payload as { url: string }).url }
      const current = sessions[input.kind], payload = (input.payload ?? {}) as { rollbackRef: string; state: typeof current; expected: typeof current }
      if (input.action === "check") {
        const name = current.cookies[0]!.value.endsWith("A") ? "A" : "B"
        return { status: state.checkFails ? "inconclusive" : "authenticated", reason: state.checkFails ? "network_error" : "platform_confirmed",
          identityKey: state.checkFails ? null : name.toLowerCase().repeat(64), displayIdentity: state.checkFails ? null : `Synthetic ${name}`, identityConfirmed: !state.checkFails,
          evidence: ["fixture.nav.isLogin"], sources: [{ package: "fixture", commit: "fixture", file: "fixture", callable: "pong", startLine: 1, endLine: 2 }], modelCalls: 0, globalInitSuppressed: false }
      }
      if (input.action === "auth_read") return structuredClone(current)
      if (input.action === "auth_prepare") {
        if (state.changeBeforePrepare) current.cookies[0]!.value = "synthetic-unconfirmed-C"
        if (JSON.stringify(current) !== JSON.stringify(payload.expected)) throw Error("account_transfer_target_changed")
        backups.set(payload.rollbackRef, structuredClone(current)); return { phase: "rollback_ready" }
      }
      if (input.action === "auth_write") { state.writes++; sessions[input.kind] = structuredClone(payload.state); return { phase: "written" } }
      if (input.action === "auth_restore") {
        if (!backups.has(payload.rollbackRef)) throw Error("account_rollback_snapshot_unavailable")
        sessions[input.kind] = structuredClone(backups.get(payload.rollbackRef)) as typeof current; backups.delete(payload.rollbackRef); return { phase: "rolled_back" }
      }
      backups.delete(payload.rollbackRef); return { phase: "abandoned" }
    },
  }
  const directory = await mkdtemp(path.join(tmpdir(), "account-rebuild-"))
  const api = await createApplication({ root: process.cwd(), directory, upstreamBrowserRuntime: upstream })
  api.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Owned daily fixture" })
  api.dailyChrome.endpoint = async () => "ws://fixture.invalid"
  await accountOwnedCore(api.accounts).identities.identify("dedicated"); await accountOwnedCore(api.accounts).identities.identify("daily"); await api.accounts.refreshIdentityProjection()
  // WHY：旧手动共享 HTTP 已退休；保留原事务/回滚核心回归，用内部 API，不重新开放个人 Chrome 写入入口。
  const transfers = (api.accounts as unknown as { transfers: AccountTransfers }).transfers
  const platform = (await loadPlatformCatalog(process.cwd())).platforms[0]!
  const act = async (body: unknown) => {
    const c = body as { type: string; sourceKind: "daily" | "dedicated"; requestId: string; transferId: string; confirmationRef: string }
    if (c.type === "prepare_transfer") {
      const identities = api.accounts.repository.list("identity")
      await transfers.prepare(platform, identities.find(i => i.kind === c.sourceKind)!, identities.find(i => i.kind !== c.sourceKind)!, c.requestId, AbortSignal.timeout(30000))
    } else if (c.type === "confirm_transfer") await transfers.confirm(platform, c.transferId, c.confirmationRef, AbortSignal.timeout(30000)).catch(() => undefined)
    else if (c.type === "abandon_transfer") await transfers.abandon(platform, c.transferId, AbortSignal.timeout(30000))
    else throw Error("unsupported_owned_core_fixture_action")
    await api.accounts.settled(); return api.accounts.platformSnapshot()
  }
  return { api, state, sessions, act, directory, upstream }
}

test("share validates fresh identities and both state snapshots; stale target refuses write; reverse direction works", async () => {
  const { api, act, sessions } = await fixture()
  try {
    let next = await act({ type: "prepare_transfer", requestId: randomUUID(), platformId: "bilibili", sourceKind: "daily" })
    let t = next.transfers.at(-1)!; assert.equal(t.status, "confirmation")
    sessions.dedicated.cookies[0]!.value = "synthetic-manual-change"
    next = await act({ type: "confirm_transfer", transferId: t.id, confirmationRef: t.confirmationRef })
    assert.equal(next.transfers.at(-1)?.status, "expired"); assert.equal(sessions.dedicated.cookies[0]!.value, "synthetic-manual-change")
    next = await act({ type: "prepare_transfer", requestId: randomUUID(), platformId: "bilibili", sourceKind: "daily" })
    t = next.transfers.at(-1)!; assert.equal(t.status, "confirmation")
    next = await act({ type: "confirm_transfer", transferId: t.id, confirmationRef: t.confirmationRef })
    assert.equal(next.transfers.at(-1)?.status, "completed")
    assert.equal(sessions.dedicated.cookies[0]!.value, "synthetic-A")
    sessions.daily.cookies[0]!.value = "synthetic-B"
    next = await act({ type: "prepare_transfer", requestId: randomUUID(), platformId: "bilibili", sourceKind: "dedicated" })
    t = next.transfers.at(-1)!
    next = await act({ type: "confirm_transfer", transferId: t.id, confirmationRef: t.confirmationRef })
    assert.equal(next.transfers.at(-1)?.status, "completed"); assert.equal(sessions.daily.cookies[0]!.value, "synthetic-A")
    const encoded = JSON.stringify(next)
    assert(!encoded.includes("synthetic-A"), "cookie values never enter API/SQLite facts")
  } finally { await api.app.close() }
})

test("old establish is explicitly rejected; imported/custom paths cannot admit hidden models, mutation or invoke", async () => {
  const { api } = await fixture()
  try {
    assert.equal((await api.app.inject({method:"POST",url:"/api/browser/accounts",headers:{"sec-fetch-site":"same-origin"},payload:{type:"establish",entryId:randomUUID(),revision:0}})).statusCode,410)
    const url = "https://example.test/account", chain = accountFixtureChain(url)
    assert.doesNotThrow(() => admitAccountChain(chain, url))
    assert.throws(() => admitAccountChain({ ...chain, budget: { ...chain.budget, maxLlmCalls: 1 } }, url), /model_invalid/)
    const changed = structuredClone(chain); const read = changed.nodes.find(n => n.kind === "capability" && n.capability.name === "browser.read-fields")!
    if (read.kind === "capability") read.effect = "external_write"
    assert.throws(() => admitAccountChain(changed, url), /read_only/)
    assert.throws(() => api.accounts.custom.attach(randomUUID(), 0, chain.id, chain.version))
  } finally { await api.app.close() }
})

test("target changed between confirm read and native snapshot is preserved; missing snapshot has explicit abandon exit", async () => {
  const { api, act, sessions, state } = await fixture()
  try {
    let next = await act({ type: "prepare_transfer", requestId: randomUUID(), platformId: "bilibili", sourceKind: "daily" })
    const t = next.transfers.at(-1)!; state.changeBeforePrepare = true
    next = await act({ type: "confirm_transfer", transferId: t.id, confirmationRef: t.confirmationRef })
    assert.equal(state.writes, 0); assert.equal(sessions.dedicated.cookies[0]!.value, "synthetic-unconfirmed-C")
    assert.equal(next.transfers.at(-1)?.status, "target_pending")
    next = await act({ type: "abandon_transfer", transferId: t.id, requestId: randomUUID() })
    assert.equal(next.transfers.at(-1)?.status, "abandoned"); assert.equal(next.transfers.at(-1)?.rollbackRef, null)
    assert.equal(sessions.dedicated.cookies[0]!.value, "synthetic-unconfirmed-C")
  } finally { await api.app.close() }
})

test("expired confirmation releases preparation; every persisted rollback ref remains actionable after restart", async () => {
  const { api, act, directory, upstream } = await fixture()
  try {
    let next = await act({ type: "prepare_transfer", requestId: randomUUID(), platformId: "bilibili", sourceKind: "daily" })
    const expired = next.transfers.at(-1)!
    api.accounts.repository.save("transfer", { ...expired, expiresAt: new Date(Date.now() - 1).toISOString() })
    next = await act({ type: "prepare_transfer", requestId: randomUUID(), platformId: "bilibili", sourceKind: "daily" })
    assert.equal(next.transfers[0]?.status, "expired"); assert.equal(next.transfers.at(-1)?.status, "confirmation")
    const pending = next.transfers.at(-1)!
    for (const status of ["rollback_ready", "checking_target", "rolling_back", "expired"] as const) {
      api.accounts.repository.save("transfer", { ...pending, id: randomUUID(), platformVersion: "old-version", status, rollbackRef: randomUUID() })
    }
    await api.app.close()
    const restarted = await createApplication({ root: process.cwd(), directory, upstreamBrowserRuntime: upstream })
    try {
      const retained = restarted.accounts.platformSnapshot().transfers.filter(v => v.rollbackRef)
      assert.equal(retained.length, 4); assert(retained.every(v => v.status === "target_pending"))
      for (const t of retained) {
        await accountOwnedCore(restarted.accounts).transfers.abandon((await loadPlatformCatalog(process.cwd())).platforms[0]!, t.id, AbortSignal.timeout(30000))
        assert.equal(restarted.accounts.repository.get("transfer", t.id).status, "abandoned")
      }
    } finally { await restarted.app.close() }
  } finally { if (api.app.server.listening) await api.app.close() }
})

test("private custom run removes live token URL, function error and page outputs while preserving actual failed audit", async () => {
  const secret = "fixture-sensitive-token", chain = accountFixtureChain("https://example.test/account")
  const classify = chain.nodes.find(n => n.kind === "function")!
  if (classify.kind === "function") classify.source = `function main(){throw new Error('${secret}');}`
  let actual: TaskRun | null = null
  await executeAccount(chain, randomUUID(), randomUUID(), "https://example.test/account", { capability: async invocation => ({ outcome: "success",
    output: invocation.node.id === "read" ? [{ state: "signed-in", identity: secret }] : null,
    browser: { sessionId: "fixture", tabId: "fixture", url: `https://example.test/account?token=${secret}`, observationDigest: "a".repeat(64), observedAt: new Date().toISOString() } }) },
    AbortSignal.timeout(5000), run => { actual = run })
  assert(actual); const safe = privateRun(actual!)
  assert.equal(safe.status, "failed"); taskRunSchema.parse(safe)
  assert(!JSON.stringify(safe).includes(secret)); assert.equal(safe.consumed.llmCalls, 0); assert.equal(safe.auditComplete, true)
})

test("current Profile projection hides revoked grants and returns the original identity when switching back", async () => {
  const { api } = await fixture()
  try {
    const original = api.accounts.platformSnapshot().currentIdentityIds.daily
    api.dailyChrome.accountBinding = async () => null
    await api.accounts.refreshIdentityProjection(); assert.equal(api.accounts.platformSnapshot().currentIdentityIds.daily, null)
    api.dailyChrome.accountBinding = async () => ({ binding: "e".repeat(64), name: "Other owned Profile" })
    await accountOwnedCore(api.accounts).identities.identify("daily"); await api.accounts.refreshIdentityProjection()
    assert.notEqual(api.accounts.platformSnapshot().currentIdentityIds.daily, original)
    api.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Owned daily fixture" })
    await api.accounts.refreshIdentityProjection(); assert.equal(api.accounts.platformSnapshot().currentIdentityIds.daily, original)
    assert.equal(api.accounts.platformSnapshot().identities.filter(v => v.kind === "daily").length, 2)
  } finally { await api.app.close() }
})
