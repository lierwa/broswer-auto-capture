import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { directoryFixture } from "./helpers/account-directory-fixture.js"

async function copiedAccount() {
  const f = await directoryFixture()
  f.state.daily = "none"
  f.api.store.saveBrowserEnvironment("dedicated-visible", f.api.store.browserEnvironment().revision)
  await f.command("add")
  f.api.store.saveBrowserEnvironment("daily", f.api.store.browserEnvironment().revision)
  assert.equal((await f.command("check")).operation?.status, "completed")
  f.state.daily = "none"
  return f
}
const startup = (f: Awaited<ReturnType<typeof directoryFixture>>) => f.api.accounts.prepareStartup({
  ownerId: randomUUID(), browserMode: "daily", allowedOrigins: ["https://www.bilibili.com"],
  signal: AbortSignal.timeout(10000), resume: false,
})

// WHY：检查成功曾把目标提升为目录来源；目标旧登录失效后仍应重新核验另一已知同UID来源。
test("expired copied login reuses another verified source in startup and manual check", async () => {
  for (const action of ["startup", "check"]) {
    const f = await copiedAccount()
    try {
      if (action === "startup") await startup(f)
      else assert.equal((await f.command("check")).operation?.status, "completed")
      assert.equal(f.state.daily, "B")
      assert.equal(f.state.writes, 2)
      assert(f.api.accounts.repository.list("maintenance").every(w => w.status === "closed"))
    } finally { await f.api.app.close() }
  }
})

test("historical source success cannot authorize changed or unconfirmed current credentials", async () => {
  for (const current of ["C", "unknown", "none"]) {
    const f = await copiedAccount()
    try {
      f.state.dedicated = current
      await assert.rejects(startup(f))
      assert.equal(f.state.daily, "none")
      assert.equal(f.state.writes, 1)
      assert(f.api.accounts.repository.list("maintenance").every(w => w.status === "closed"))
      assert(f.api.accounts.repository.list("transfer").every(t => !t.rollbackRef && !t.confirmationRef))
    } finally { await f.api.app.close() }
  }
})
