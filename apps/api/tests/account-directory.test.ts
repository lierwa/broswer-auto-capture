import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { createApplication } from "../src/app.js"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { accountWaitChain } from "../src/browser/account-wait-chain.js"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { accountRequest } from "../src/browser/account-runtime.js"
import { loadPlatformCatalog } from "../src/browser/platform-catalog.js"
import { accountFixtureChain } from "./browser-account-fixture.js"
import { retainAccountTestTask } from "./browser-account-fixture.js"
import { accountOwnedCore } from "./helpers/account-owned-core.js"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { digestJson } from "@browser-capture/runtime"

test("one canonical source; ordinary refresh cannot replace UID; switch is explicit; remove survives restart", async () => {
  const f = await directoryFixture()
  try {
    assert.equal(f.api.accounts.directory.snapshot().items.length, 13)
    assert.equal(f.api.accounts.repository.list("identity").length, 0, "GET cannot create a Profile")
    await f.command("add")
    const original = f.api.accounts.directory.current("bilibili")!
    assert.equal(original.displayIdentity, "Synthetic A"); assert.equal(original.revision, 1)
    f.state.daily = "B"; await f.command("check")
    const changed = f.api.accounts.directory.current("bilibili")!
    assert.equal(changed.identityKey, original.identityKey); assert.equal(changed.state, "account_changed"); assert.equal(changed.revision, 1)
    await f.command("switch")
    assert.equal(f.api.accounts.directory.current("bilibili")!.displayIdentity, "Synthetic B")
    assert.equal(f.api.accounts.directory.current("bilibili")!.revision, 2)
    await f.command("remove")
    assert.equal(f.api.accounts.directory.snapshot().items[0]!.account, null)
    await f.api.app.close()
    const restarted = await createApplication({ root: process.cwd(), directory: f.directory, upstreamBrowserRuntime: f.upstream })
    try { assert.equal(restarted.accounts.directory.snapshot().items[0]!.account, null)
      assert.ok(restarted.accounts.directory.current("bilibili")?.deletedAt)
      assert.ok(restarted.accounts.repository.list("platformCheck").every(c => c.run?.consumed.llmCalls === 0 && c.run.auditComplete)) }
    finally { await restarted.app.close() }
  } finally { await f.api.app.close() }
})

test("unknown does not become logged out; no UID remains source-bound; cancelled switch preserves revision", async () => {
  const f = await directoryFixture()
  try {
    f.state.noUid = true; await f.command("add")
    const original = f.api.accounts.directory.current("bilibili")!
    assert.equal(original.identityKey, null); assert.equal(original.state, "ready")
    f.state.daily = "unknown"; await f.command("check")
    assert.equal(f.api.accounts.directory.current("bilibili")!.state, "unconfirmed")
    assert.equal(f.api.accounts.directory.current("bilibili")!.sourceIdentityId, original.sourceIdentityId)
    const id = randomUUID(); f.state.gate = true
    await f.api.accounts.directoryCommand({ type: "switch", requestId: id, platformId: "bilibili", revision: original.revision })
    await delay(25)
    await f.api.accounts.directoryCommand({ type: "cancel", requestId: id }); await f.api.accounts.settled()
    assert.equal(f.api.accounts.directory.current("bilibili")!.revision, original.revision)
    assert.equal(f.api.accounts.repository.list("directoryOperation").find(v => v.requestId === id)!.status, "cancelled")
  } finally { await f.api.app.close() }
})

test("confirmed inactive maintenance reopens; refusal preserves lease; passive page is not a task busy flag", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add"); await f.command("open")
    assert.equal(f.api.accounts.isBusy(), false)
    const old = f.api.accounts.repository.active()!
    f.api.accounts.repository.save("maintenance", { ...old, status: "cleanup_required" }); f.state.inactive = true
    await f.command("open")
    assert.equal(f.api.accounts.repository.get("maintenance", old.id).status, "closed")
    const current = f.api.accounts.repository.active()!
    assert.notEqual(current.ownerId, old.ownerId)
    f.api.accounts.repository.save("maintenance", { ...current, status: "cleanup_required" }); f.state.refusal = true
    await f.command("open")
    assert.equal(f.api.accounts.repository.get("maintenance", current.id).ownerId, current.ownerId)
    assert.equal(f.api.accounts.repository.get("maintenance", current.id).status, "cleanup_required")
  } finally { await f.api.app.close() }
})

test("native LangGraph login loop observes, waits, stops on proof and has zero models", async () => {
  const catalog = await loadPlatformCatalog(process.cwd()), chain = accountWaitChain(catalog.platforms[0]!, catalog.version, catalog.evidenceSha256)
  let calls = 0, intervals = 0
  const run = await new TaskChainRuntime().execute({ chain, request: accountRequest(chain, randomUUID(), randomUUID(), { expectedIdentityKey: "", expectedDisplayIdentity: "", switching: false }), capabilities: {
    capability: async invocation => {
      if (invocation.node.capability.name === "account.wait") { intervals++; return { outcome: "success", output: null } }
      calls++; const pending = calls < 3
      return { outcome: "success", output: { status: pending ? "unauthenticated" : "authenticated", reason: "fixture",
        identityKey: pending ? "" : "a".repeat(64), displayIdentity: pending ? "" : "Synthetic A", identityConfirmed: !pending,
        evidence: ["fixture"], sources: [], modelCalls: 0, globalInitSuppressed: false, pending } }
    },
  } })
  assert.equal(run.status, "completed", JSON.stringify(run.outcome)); assert.equal(calls, 3); assert.equal(intervals, 2)
  assert.equal(run.consumed.llmCalls, 0); assert.equal(run.auditComplete, true)
  assert.equal(chain.budget.maxActiveMs, 300000)
})

// WHY：扫码时间/取消不是资源结束证明；新操作必须复用原 owned 页面，而不能关闭后重开。
test("cancelled login retains original window; retry saves only fresh authenticated proof", async () => {
  const f = await directoryFixture()
  try {
    f.api.dailyChrome.accountBinding = async () => null
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    f.state.dedicated = "none"
    const requestId = randomUUID()
    await f.api.accounts.directoryCommand({ type: "add", requestId, platformId: "zhihu", revision: 0 })
    while (f.api.accounts.repository.list("directoryOperation").at(-1)?.phase !== "waiting") await delay(10)
    const window = f.api.accounts.repository.active()!, operation = f.api.accounts.repository.list("directoryOperation").at(-1)!
    assert.equal(Date.parse(operation.deadline) - Date.parse(operation.startedAt), 300000)
    await f.api.accounts.directoryCommand({ type: "cancel", requestId }); await f.api.accounts.settled()
    assert.equal(f.api.accounts.repository.get("maintenance", window.id).status, "open")
    assert.equal(f.api.accounts.directory.current("zhihu"), null)
    f.state.dedicated = "B"; await f.command("add", "zhihu")
    assert.equal(f.api.accounts.directory.current("zhihu")?.state, "ready")
    assert.equal(f.api.accounts.repository.list("maintenance").length, 1)
    assert.equal(f.api.accounts.repository.get("maintenance", window.id).status, "closed")
  } finally { await f.api.app.close() }
})

// WHY：已交付的私人 Chrome 标签和独立专属 Profile 不冲突；活动 runner 仍全局互斥。
test("retained browser lease blocks its own Profile and never gets silently cleared", async () => {
  const f = await directoryFixture()
  try {
    const execution = retainAccountTestTask(f.api)
    assert.equal(f.api.store.activeBrowserWindowLease(undefined, "daily")?.executionId, execution.id)
    assert.equal(f.api.store.activeBrowserWindowLease(undefined, "dedicated"), null)
    assert.equal(f.api.store.activeBrowserWindowLease()?.executionId, execution.id)
    assert.equal(f.api.taskChain.repository.execution(execution.taskId, execution.id).browserHandoff.status, "active")
    const resume = retainAccountTestTask(f.api)
    const plan = { ...structuredClone(extractionFixture.plan), taskId: resume.taskId }
    ;(f.api.taskChain.repository as unknown as { saveImmutable(value: unknown): unknown }).saveImmutable(plan)
    f.api.taskChain.repository.saveExecution({ ...resume, plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, status: "paused", browser: { mode: "dedicated-visible", headless: false } })
    const service = f.api.taskChain as unknown as { scheduleDrain(): void; resumeExecution(taskId: string, command: object): void; controllers: Map<string, AbortController> }
    service.scheduleDrain = () => {}
    const command = { type: "resume_execution", requestId: randomUUID(), executionId: resume.id, expectedSequence: resume.sequence }
    service.controllers.set("foreign", new AbortController())
    assert.throws(() => service.resumeExecution(resume.taskId, command))
    service.controllers.clear(); service.resumeExecution(resume.taskId, command)
    assert.equal(f.api.taskChain.repository.execution(resume.taskId, resume.id).status, "queued")
    assert.equal(f.api.taskChain.repository.execution(execution.taskId, execution.id).browserHandoff.leaseId, execution.browserHandoff.leaseId)
    f.api.taskChain.repository.saveExecution({ ...execution, browser: { headless: true } })
    assert.equal(f.api.store.activeBrowserWindowLease(undefined, "daily"), null)
    assert.equal(f.api.store.activeBrowserWindowLease(undefined, "dedicated")?.executionId, execution.id)
  } finally { await f.api.app.close() }
})

test("one timed-out observation is pending; original LangGraph continues without closing login", async () => {
  const f = await directoryFixture(), original = f.upstream.accountSession!
  try {
    const identity = await accountOwnedCore(f.api.accounts).identities.identify("dedicated")
    const platform = f.api.accounts.directory.platform("zhihu")
    const window = await accountOwnedCore(f.api.accounts).windows.open(identity, platform, AbortSignal.timeout(30000))
    let calls = 0
    f.upstream.accountSession = async (input, signal) => {
      if (input.action === "observe" && ++calls === 1) await delay(20000, undefined, { signal })
      return original(input, signal)
    }
    const check = await accountOwnedCore(f.api.accounts).checks.run(platform, identity, window, randomUUID(), AbortSignal.timeout(25000), "wait")
    assert.equal(calls, 2); assert.equal(check.status, "completed"); assert.equal(check.result?.status, "authenticated")
    assert.equal(f.api.accounts.repository.get("maintenance", window.id).status, "open")
    assert.equal(check.run?.consumed.llmCalls, 0)
  } finally { await f.api.app.close() }
})

test("automatic admission writes only an unauthenticated target in either browser; same UID/different/unknown/no scope write zero", async () => {
  for (const target of ["A", "B", "unknown", "none"]) {
    const f = await directoryFixture()
    try {
      await f.command("add"); f.state.dedicated = target
      const input = { ownerId: randomUUID(), browserMode: "dedicated-visible" as const, allowedOrigins: ["https://www.bilibili.com"], signal: new AbortController().signal, resume: false }
      if (target === "A" || target === "none") await f.api.accounts.prepareStartup(input)
      else await assert.rejects(f.api.accounts.prepareStartup(input), /目标登录不同或无法确认/)
      assert.equal(f.state.writes, target === "none" ? 1 : 0)
    } finally { await f.api.app.close() }
  }
  const f = await directoryFixture()
  try {
    f.state.daily = "none"
    f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
    await f.command("add")
    assert.equal(f.api.accounts.directory.current("bilibili")!.displayIdentity, "Synthetic B")
    await f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "daily", allowedOrigins: ["https://www.bilibili.com"], signal: new AbortController().signal, resume: false })
    assert.equal(f.state.daily, "B")
    assert.equal(f.state.writes, 1)
  } finally { await f.api.app.close() }
})

test("switch with unchanged UID waits; cancellation during end acknowledgement cannot commit a new revision", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add"); const original = f.api.accounts.directory.current("bilibili")!
    const requestId = randomUUID()
    await f.api.accounts.directoryCommand({ type: "switch", requestId, platformId: "bilibili", revision: 1 })
    await delay(120)
    assert.equal(f.api.accounts.directory.current("bilibili")!.revision, 1)
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.phase, "waiting")
    await f.api.accounts.directoryCommand({ type: "cancel", requestId }); await f.api.accounts.settled()
    f.state.noUid = true
    const noUid = randomUUID()
    await f.api.accounts.directoryCommand({ type: "switch", requestId: noUid, platformId: "bilibili", revision: 1 })
    await delay(100)
    assert.equal(f.api.accounts.directory.current("bilibili")!.identityKey, original.identityKey)
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.phase, "waiting")
    await f.api.accounts.directoryCommand({ type: "cancel", requestId: noUid }); await f.api.accounts.settled()
    f.state.noUid = false
    f.state.daily = "B"; f.state.endDelay = 250
    const second = randomUUID()
    await f.api.accounts.directoryCommand({ type: "switch", requestId: second, platformId: "bilibili", revision: 1 })
    while (!f.state.ending) await delay(5)
    await f.api.accounts.directoryCommand({ type: "cancel", requestId: second }); await f.api.accounts.settled()
    assert.deepEqual(f.api.accounts.directory.current("bilibili"), original)
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.status, "cancelled")
    f.state.endDelay = 0; await f.command("switch")
    assert.equal(f.api.accounts.directory.current("bilibili")!.revision, 2)
    assert.equal(f.api.accounts.repository.list("logicalAccountRevision")[0]!.account.revision, 1)
  } finally { await f.api.app.close() }
})

test("custom existing immutable chain, canonical open, stale check and marker cannot revive tombstone", async () => {
  const f = await directoryFixture()
  const act = async (body: object) => { await f.api.accounts.directoryCommand({ requestId: randomUUID(), ...body }); await f.api.accounts.settled() }
  try {
    await act({ type: "custom_open" }); await act({ type: "custom_read" })
    let b = f.api.accounts.repository.list("binding")[0]!
    const chain = accountFixtureChain(b.url)
    f.api.accounts.repository.save("platformMethod", { schemaVersion: 1, id: randomUUID(), platformId: b.id, platformVersion: "fixture",
      sourceDigest: "a".repeat(64), chain, createdAt: new Date().toISOString() })
    await act({ type: "custom_attach", platformId: b.id, revision: b.revision, chainId: chain.id, chainVersion: 1 })
    await act({ type: "custom_add", platformId: b.id, revision: 0 })
    assert.equal(f.api.accounts.directory.current(b.id)!.state, "ready")
    await act({ type: "open", platformId: b.id, revision: 1 })
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.status, "completed")
    b = f.api.accounts.repository.get("binding", b.id)
    await act({ type: "custom_pick", platformId: b.id, revision: b.revision })
    const reference = f.api.accounts.custom.markerSelection()!.reference
    await act({ type: "remove", platformId: b.id, revision: 1 })
    await act({ type: "custom_check", platformId: b.id, revision: 1 })
    assert.match(f.api.accounts.repository.list("directoryOperation").at(-1)!.reason!, /已变化/)
    await act({ type: "custom_check", platformId: b.id, revision: 2 })
    await act({ type: "custom_confirm", reference })
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.status, "failed")
    assert.ok(f.api.accounts.directory.current(b.id)!.deletedAt)
    await act({ type: "custom_add", platformId: b.id, revision: 2 })
    assert.equal(f.api.accounts.directory.current(b.id)!.revision, 3)
    assert.equal(f.api.accounts.directory.current(b.id)!.deletedAt, null)
  } finally { await f.api.app.close() }
})

test("old public transfer is gone; actual global controller rejects checks on existing maintenance", async () => {
  const f = await directoryFixture()
  const controllers = (f.api.taskChain as unknown as { controllers: Map<string, AbortController> }).controllers
  try {
    await f.command("add"); await f.command("open")
    const owner = f.api.accounts.repository.active()!.ownerId, calls = f.state.calls
    controllers.set(`${randomUUID()}:${randomUUID()}`, new AbortController())
    await f.command("check")
    assert.equal(f.api.accounts.repository.list("directoryOperation").at(-1)!.status, "failed")
    assert.equal(f.api.accounts.repository.active()!.ownerId, owner); assert.equal(f.state.calls, calls)
    assert.equal((await f.api.app.inject({ method: "POST", url: "/api/browser/platform-accounts", headers: { "sec-fetch-site": "same-origin" }, payload: { type: "prepare_transfer" } })).statusCode, 410)
  } finally { controllers.clear(); await f.api.app.close() }
})

test("restart pending rollback is retried on original owner; custom open cannot discard it; unknown stays pending", async () => {
  const f = await directoryFixture()
  const original = f.upstream.accountSession!
  try {
    await f.command("add"); f.state.dedicated = "none"; f.state.restoreFails = true
    f.upstream.accountSession = async (input, signal) => {
      const result = await original(input, signal)
      if (input.action === "auth_write") f.state.dedicated = "unknown"
      return result
    }
    await assert.rejects(f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "dedicated-visible", allowedOrigins: ["https://www.bilibili.com"], signal: AbortSignal.timeout(10000), resume: false }))
    const transfer = f.api.accounts.repository.list("transfer").at(-1)!, window = f.api.accounts.repository.get("maintenance", transfer.targetWindowId!)
    f.api.accounts.repository.save("transfer", { ...transfer, platformVersion: "previous-policy-version" })
    assert.ok(transfer.rollbackRef); assert.equal(transfer.status, "target_pending")
    await f.api.accounts.directoryCommand({ type: "custom_open", requestId: randomUUID() }); await f.api.accounts.settled()
    assert.equal(f.api.accounts.repository.get("maintenance", window.id).ownerId, window.ownerId)
    assert.ok(f.api.accounts.repository.get("transfer", transfer.id).rollbackRef)
    await f.api.app.close()
    const restarted = await createApplication({ root: process.cwd(), directory: f.directory, upstreamBrowserRuntime: f.upstream })
    restarted.dailyChrome.accountBinding = f.api.dailyChrome.accountBinding; restarted.dailyChrome.endpoint = f.api.dailyChrome.endpoint
    try {
      f.state.restoreFails = false
      await restarted.accounts.directoryCommand({ type: "check", requestId: randomUUID(), platformId: "bilibili", revision: 1 }); await restarted.accounts.settled()
      assert.equal(restarted.accounts.repository.get("transfer", transfer.id).rollbackRef, null)
      assert.equal(restarted.accounts.repository.get("transfer", transfer.id).status, "rolled_back")
      assert.equal(restarted.accounts.repository.get("maintenance", window.id).ownerId, window.ownerId)
      assert.equal(f.state.dedicated, "none")
    } finally { await restarted.app.close() }
  } finally { await f.api.app.close() }
})
