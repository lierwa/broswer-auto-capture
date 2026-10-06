import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { createApplication } from "../src/app.js"
import { accountOwnedCore } from "./helpers/account-owned-core.js"

// WHY：真实公开登录页的重定向、等待和取消不能关闭 owned 窗口；不登录个人账号。
if (process.env.BAT_RUN_ACCOUNT_UNIFIED !== "1") throw Error("explicit_owned_windows_gate_required")
const root = process.cwd(), out = path.join(root, "work/account-user-regressions-20261003/public-zhihu")
const data = path.join(out, randomUUID()); await mkdir(data, { recursive: true })
const api = await createApplication({ root, directory: data })
const proof = { passed: false, personalProfileTouched: false, modelCalls: 0, privateLoginTested: false,
  steps: [] as string[], operationStatus: "", reason: null as string | null, checks: 0, windowPreserved: false }
try {
  const requestId = randomUUID()
  await api.accounts.directoryCommand({ type: "add", requestId, platformId: "zhihu", revision: 0 })
  await delay(35000)
  const operation = api.accounts.repository.list("directoryOperation").at(-1)!
  proof.operationStatus = operation.status; proof.reason = operation.reason
  const session = api.accounts.repository.active()!
  assert(session, "actual public login window must survive opening/checking errors")
  const inspected = await accountOwnedCore(api.accounts).windows.action("inspect", session)
  assert(inspected.window.active)
  proof.steps.push("actual public zhihu add kept isolated owned Windows Chrome active for 35 seconds")
  await api.accounts.directoryCommand({ type: "cancel", requestId }); await api.accounts.settled()
  const retained = api.accounts.repository.get("maintenance", session.id)
  assert.equal(retained.status, "open")
  assert.equal((await accountOwnedCore(api.accounts).windows.action("inspect", retained)).window.active, true)
  assert.equal(api.accounts.directory.current("zhihu"), null)
  proof.windowPreserved = true
  const checks = api.accounts.repository.list("platformCheck")
  proof.checks = checks.length
  assert(checks.length > 0, "original fixed platform check must actually start")
  assert(checks.every(c => !c.run || c.run.consumed.llmCalls === 0))
  proof.steps.push("cancel stops observation, keeps original login window and never saves a fake account")
  await accountOwnedCore(api.accounts).windows.finish(retained)
  assert.equal(api.accounts.repository.get("maintenance", retained.id).status, "closed")
  proof.passed = true
} finally {
  for (const w of api.accounts.repository.list("maintenance").filter(w => w.status !== "closed")) {
    try { await accountOwnedCore(api.accounts).windows.finish(w) } catch { /* retain unconfirmed original ownership */ }
  }
  await api.app.close()
  await writeFile(path.join(out, "result.json"), JSON.stringify(proof, null, 2) + "\n")
}
