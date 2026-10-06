import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { accountFixtureChain, retainAccountTestTask } from "./browser-account-fixture.js"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { accountAvailability } from "../src/browser/account-availability.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import type { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { stableUuid } from "@browser-capture/runtime"
import type { AccountStartup } from "../src/browser/account-reuse.js"
import { authoringFailureCode, authoringFailureMessage, failureLayer } from "../src/task-chain/authoring-failure.js"

// WHY：同一运行时故障必须在目录与启动入口都保留失败，不能宣称未登录或跳过只读准入。
test("interrupted account checks preserve the account and fail startup before exploration", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add")
    const original = structuredClone(f.api.accounts.directory.current("bilibili"))
    f.upstream.accountSession = async () => { throw Error("hybrid_runner_failed:Error") }
    const snapshot = await f.command("check")
    assert.equal(snapshot.operation?.status, "failed")
    assert.match(snapshot.operation?.reason ?? "", /检查过程发生错误/)
    assert.deepEqual(f.api.accounts.directory.current("bilibili"), original)
    for (const publicRead of [false, true]) {
      await assert.rejects(f.api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "daily",
        allowedOrigins: ["https://www.bilibili.com"], signal: AbortSignal.timeout(5000), resume: false, publicRead }), error => {
        assert.equal(authoringFailureCode(error), "account_check_incomplete")
        assert.equal(failureLayer(error, "exploring"), "账号准备检查")
        assert.match(authoringFailureMessage(error), /试做尚未开始/)
        return true
      })
    }
    assert.equal(f.state.writes, 0)
    assert.deepEqual(f.api.accounts.directory.current("bilibili"), original)
    assert.equal(f.api.accounts.repository.list("platformCheck").at(-1)?.run?.consumed.llmCalls, 0)
  } finally { await f.api.app.close() }
})

test("actual frozen group/controller→native startup permits public read, denies identity-bound writes and foreign owner", async () => {
  const f = await directoryFixture()
  const active = f.api.taskChain as unknown as { controllers: Map<string, AbortController>; host: TaskRuntimeHost }
  const host = active.host as unknown as { upstream: PythonUpstreamBrowserRuntime }
  const access = (f.api.accounts as unknown as { access: ReturnType<typeof accountAvailability> }).access
  const native = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory: f.directory, subject: {} as never })
  const reached: AccountStartup[] = []
  native.setAccountPreparation(async input => {
    if (!input.resume) await access.withStartup(input, () => f.api.accounts.prepareStartup(input))
    reached.push(input); throw Error("verified_native_start_gate")
  })
  host.upstream = native
  const chain = accountFixtureChain("https://www.bilibili.com/")
  const record = retainAccountTestTask(f.api), signal = new AbortController().signal
  const owner = stableUuid(record.id, "browser", String(record.sequence))
  f.api.taskChain.repository.saveExecution({ ...record, status: "running", browser: { mode: "dedicated-visible", headless: false },
    browserHandoff: { ...record.browserHandoff, status: "pending", ownerId: owner, leaseId: null } })
  const input = { taskId: record.taskId, authorizationId: record.authorizationId, browserRunId: owner, requirementVersion: 1,
    purpose: "replay" as const, chains: [chain], input: null, signal, budget: chain.budget,
    consumed: { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }, scopeConsumption: {},
    browser: { mode: "dedicated-visible" as const, headless: false }, managedWindow: { ownerId: owner, resume: false } }
  try {
    await f.command("add")
    active.controllers.set(`${record.taskId}:${record.id}`, new AbortController())
    for (const target of ["B", "unknown"]) {
      f.state.dedicated = target
      await assert.rejects(active.host.group(input, async () => assert.fail("native gate sentinel")), /verified_native_start_gate/)
      assert.equal(reached.at(-1)!.publicRead, true); assert.equal(f.state.writes, 0)
    }
    const write = structuredClone(chain), node = write.nodes.find(n => n.id === "fresh")!
    if (node.kind !== "capability") throw Error("fixture_missing")
    node.config = { actionName: "click", target: { strategy: "css", selector: "#submit" }, postconditions: [] }; node.effect = "external_write"
    await assert.rejects(active.host.group({ ...input, chains: [write] }, async () => assert.fail("identity-bound gate")), /目标登录不同或无法确认/)
    node.effect = "read" // 自报 read 不能把实际 click 写操作升级为免账号 gate。
    await assert.rejects(active.host.group({ ...input, chains: [write] }, async () => assert.fail("forged read")), /目标登录不同或无法确认/)
    assert.equal(f.state.writes, 0)
    await assert.rejects(active.host.group({ ...input, browserRunId: randomUUID() }, async () => assert.fail("foreign owner")), /无法核验当前任务/)
    active.controllers.set(`${randomUUID()}:${randomUUID()}`, new AbortController())
    await assert.rejects(active.host.group(input, async () => assert.fail("other controller")), /无法核验当前任务/)
  } finally { active.controllers.clear(); await native.close(); await f.api.app.close() }
})

test("original authoring startup validates real active job; account purpose and resume do not recursively prepare", async () => {
  const f = await directoryFixture(), active = f.api.taskChain as unknown as { controllers: Map<string, AbortController> }
  const access = (f.api.accounts as unknown as { access: ReturnType<typeof accountAvailability> }).access
  const native = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory: f.directory, subject: {} as never })
  const record = retainAccountTestTask(f.api), id = randomUUID(), ownerId = randomUUID(), now = new Date().toISOString()
  f.api.taskChain.repository.saveJob({ id, taskId: record.taskId, type: "prepare", key: "fixture", status: "running", sequence: 0,
    reason: null, resultId: null, browserRunId: ownerId, browser: { mode: "dedicated-visible", headless: false }, audit: null, createdAt: now, updatedAt: now })
  let calls = 0
  native.setAccountPreparation(async input => {
    calls++
    if (!input.resume) await access.withStartup(input, () => f.api.accounts.prepareStartup(input))
    throw Error("verified_authoring_start_gate")
  })
  try {
    active.controllers.set(`${record.taskId}:${id}`, new AbortController())
    await assert.rejects(native.withAuthoring({ ownerId, connectionOwnerId: record.taskId, signal: AbortSignal.timeout(5000), allowedOrigins: ["https://www.bilibili.com"],
      browserMode: "dedicated-visible", selection: {} as never } as never, async () => assert.fail("no business generation")), /verified_authoring_start_gate/)
    assert.equal(calls, 1)
    await assert.rejects(native.withCapabilities({ ownerId, connectionOwnerId: record.taskId, signal: AbortSignal.timeout(5000), allowedOrigins: [],
      browserMode: "dedicated-visible", managedWindow: { ownerId, resume: true } }, async () => undefined), /verified_authoring_start_gate/)
    assert.equal(calls, 2)
  } finally { active.controllers.clear(); await native.close(); await f.api.app.close() }
})
