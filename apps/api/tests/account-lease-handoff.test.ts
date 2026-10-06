import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { TaskConnection } from "../src/upstream-browser/task-connection.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import type { RunnerProcess } from "../src/upstream-browser/service.js"

// WHY：旧 closed 维护可归档，但许可不能跨 Profile、未知 owner 或正在维护的操作。
test("历史账号收据的归档许可只包含当前 Profile 的 closed 确定 owner", async () => {
  const f = await directoryFixture()
  try {
    await f.command("add")
    const window = f.api.accounts.repository.list("maintenance")[0]!
    f.api.accounts.repository.save("maintenance", { ...window, status: "open" })
    assert.deepEqual(await f.api.accounts.releasedWindowOwners("daily"), [])
    f.api.accounts.repository.save("maintenance", { ...window, status: "closed" })
    assert.deepEqual(await f.api.accounts.releasedWindowOwners("daily"), [window.ownerId])
    assert.deepEqual(await f.api.accounts.releasedWindowOwners("dedicated"), [])
    f.api.accounts.repository.save("maintenance", { ...window, status: "closed", leaseId: randomUUID() })
    assert.deepEqual(await f.api.accounts.releasedWindowOwners("daily"), [])
    f.api.accounts.repository.save("maintenance", { ...window, status: "closed" })
    f.api.dailyChrome.accountBinding = async () => ({ binding: "e".repeat(64), name: "Different Chrome" })
    assert.deepEqual(await f.api.accounts.releasedWindowOwners("daily"), [])
  } finally { await f.api.app.close() }
})

// WHY：只暴露宿主当前已确认的维护 owner；必须在账号准备完成后合并，再交原 runner 归档。
test("复跑实际传给 runner 的 releasedOwners 包含账号准备后释放的维护收据", async () => {
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "confirmed", code: null })), false)
  let prepared = false, captured: Parameters<RunnerProcess["startHybrid"]>[0]["managedWindow"]
  const connection = new TaskConnection(process.cwd(), () => ({ envBoolean: () => true,
    startHybrid: async config => { captured = config.managedWindow }, request: async () => null, close: async () => report }))
  const runtime = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory: "unused-owned-fixture", subject: {} as never }, connection)
  const accountOwner = randomUUID(), deliveryOwner = randomUUID(), owner = randomUUID()
  runtime.setAccountPreparation(async () => { prepared = true })
  runtime.setReleasedAccountOwners(async kind => { assert(prepared); assert.equal(kind, "daily"); return [accountOwner, deliveryOwner] })
  try {
    await runtime.withCapabilities({ ownerId: owner, connectionOwnerId: randomUUID(), closeAfterOperation: true,
      browserMode: "daily", signal: new AbortController().signal, allowedOrigins: ["https://fixture.test"],
      managedWindow: { ownerId: owner, resume: false, releasedOwners: [deliveryOwner] } }, async () => {})
    assert.deepEqual(captured?.releasedOwners, [deliveryOwner, accountOwner])
    assert.equal(captured?.ownerId, owner)
  } finally { await runtime.close() }
})
