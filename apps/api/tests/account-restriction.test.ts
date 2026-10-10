import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { directoryFixture } from "./helpers/account-directory-fixture.js"

// WHY：访问限制必须留给人工，不能继续三秒登录轮询；原检查证据和窗口必须保留。
test("an explicit challenge stops account observation before another network probe", async () => {
  const f = await directoryFixture(), original = f.upstream.accountSession!
  let probes = 0
  f.upstream.accountSession = async (input, signal) => {
    if (input.action !== "observe" && input.action !== "check") return original(input, signal)
    probes++
    return { status: "inconclusive", reason: "challenge", identityKey: null, displayIdentity: null,
      identityConfirmed: false, evidence: [], sources: [], modelCalls: 0, globalInitSuppressed: false }
  }
  try {
    await assert.rejects(f.api.accounts.directory.perform({ type: "add", platformId: "bilibili",
      revision: 0, requestId: randomUUID() }, AbortSignal.timeout(3300)))
    assert.equal(probes, 1)
    const check = f.api.accounts.repository.list("platformCheck").at(-1)!
    assert.equal(check.result?.reason, "challenge")
    assert.notEqual(check.status, "completed")
    assert.ok(!f.api.accounts.directory.current("bilibili"))
  } finally { await f.api.app.close() }
})

test("an HTTP service error stops account observation instead of polling the failing endpoint", async () => {
  const f = await directoryFixture(), original = f.upstream.accountSession!
  let probes = 0
  f.upstream.accountSession = async (input, signal) => {
    if (input.action !== "observe" && input.action !== "check") return original(input, signal)
    probes++
    // 固定evidence.common_failure把503等非2xx映射为http_error；401/403/429有独立语义。
    return { status: "inconclusive", reason: "http_error", identityKey: null, displayIdentity: null,
      identityConfirmed: false, evidence: [], sources: [], modelCalls: 0, globalInitSuppressed: false }
  }
  try {
    await assert.rejects(f.api.accounts.directory.perform({ type: "add", platformId: "bilibili",
      revision: 0, requestId: randomUUID() }, AbortSignal.timeout(3300)))
    assert.equal(probes, 1)
    const check = f.api.accounts.repository.list("platformCheck").at(-1)!
    assert.equal(check.result?.reason, "http_error")
    assert.notEqual(check.status, "completed")
    assert.ok(!f.api.accounts.directory.current("bilibili"))
  } finally { await f.api.app.close() }
})

test("a normal signed-out account can still wait for the user to sign in", async () => {
  const f = await directoryFixture(), original = f.upstream.accountSession!
  f.state.daily = "none"; f.state.dedicated = "none"
  let probes = 0
  f.upstream.accountSession = async (input, signal) => {
    if (input.action === "observe" || input.action === "check") {
      probes++
      if (probes === 3) f.state[input.kind] = "B"
    }
    return original(input, signal)
  }
  try {
    await f.api.accounts.directory.perform({ type: "add", platformId: "bilibili",
      revision: 0, requestId: randomUUID() }, AbortSignal.timeout(10000))
    // 正常流程允许成功后的身份确认读取；不把这次合法读取误判成失败重试。
    assert.ok(probes >= 3)
    const check = f.api.accounts.repository.list("platformCheck").at(-1)!
    assert.equal(check.result?.status, "authenticated")
    assert.equal(check.status, "completed")
    assert.ok(f.api.accounts.directory.current("bilibili"))
  } finally { await f.api.app.close() }
})
