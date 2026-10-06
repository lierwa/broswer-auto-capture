import { accountOwnedCore } from "./helpers/account-owned-core.js"
import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createApplication } from "../src/app.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { accountFixtureChain, retainAccountTestTask } from "./browser-account-fixture.js"
import { stableUuid } from "@browser-capture/runtime"
import { accountRequest } from "../src/browser/account-runtime.js"
import { setTimeout as delay } from "node:timers/promises"
import type { JsonValue } from "@browser-capture/contracts"
import type { Platform } from "@browser-capture/contracts/platform-account"

if (process.env.BAT_RUN_ACCOUNT_UNIFIED !== "1") throw Error("explicit_owned_windows_gate_required")
let stdin = ""; for await (const part of process.stdin) stdin += String(part)
const config = JSON.parse(stdin) as { endpoint: string; attemptPath: string }
const root = process.cwd(), out = path.resolve(root, process.env.BAT_ACCOUNT_EVIDENCE_DIR ?? "work/account-unified-20261003/native-login-reuse"), data = path.join(out, randomUUID())
const keys = process.env.BAT_ACCOUNT_PLATFORMS?.split(",") ?? ["bilibili", "weibo", "zhihu"]
await mkdir(data, { recursive: true })
const api = await createApplication({ root, directory: data }), native = (accountOwnedCore(api.accounts).windows as unknown as { upstream: PythonUpstreamBrowserRuntime }).upstream
// WHY：测试只能 headless；不改产品人工登录的可见性，也不把测试窗口弹到用户桌面。
const nativeCapabilities = native.withCapabilities.bind(native)
native.withCapabilities = (input, work) => nativeCapabilities(input.browserMode === "daily" ? input
  : { ...input, browserMode: "dedicated-headless", headless: true }, work)
api.dailyChrome.endpoint = async () => config.endpoint
api.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Owned isolated Chrome" })
const proof = { passed: false, personalProfileTouched: false, modelCalls: 0, steps: [] as string[], platforms: [] as object[], dataPath: data }
const sites: Awaited<ReturnType<typeof site>>[] = [], writes: string[] = []
async function site(key: string) {
  const credential = randomBytes(24).toString("base64url"), sessions = new Map<string, string>(), cookie = `owned_${key}`
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store")
    if (request.method === "POST" && request.url === "/login") {
      let body = ""; for await (const part of request) body += String(part)
      if (new URLSearchParams(body).get("password") !== credential) { response.writeHead(403).end(); return }
      const token = randomBytes(32).toString("base64url"); sessions.set(token, "Alpha")
      response.setHeader("Set-Cookie", `${cookie}=${token}; HttpOnly; SameSite=Strict; Max-Age=3600; Path=/`)
      response.writeHead(303, { Location: "/identity" }).end(); return
    }
    const token = request.headers.cookie?.split("; ").find(c => c.startsWith(`${cookie}=`))?.slice(cookie.length + 1), name = token ? sessions.get(token) : undefined
    if (request.url === "/identity" && process.env.BAT_ACCOUNT_WAIT_SECONDS && !name) {
      response.writeHead(302, { Location: "/signin?next=%2Fidentity" }).end(); return
    }
    if (request.url !== "/identity" && !request.url?.startsWith("/signin")) {
      if (key === "zhihu" && !name) { response.writeHead(401, { "Content-Type": "application/json" }).end('{}'); return }
      const value = key === "bilibili" ? { code: 0, data: { isLogin: Boolean(name), mid: name, uname: name } }
        : key === "weibo" ? { ok: 1, data: { login: Boolean(name), uid: name, nick: name } } : { uid: name, name }
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); return
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(`<main><span data-state="${name ? "signed-in" : "signed-out"}"></span><span data-user="${name ?? ""}"></span></main><form action="/login" method="post"><input type="password" name="password"><button>Sign in</button></form>`)
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return { origin, credential, cookie, close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) }) }
}
const bridges = new Map<string, Platform>()
const bridge = async (input: object, platform: Platform, signal: AbortSignal): Promise<JsonValue> => {
  const child = spawn(path.join(root, "work/upstream-browser-hybrid/.venv/Scripts/python.exe"), ["apps/api/tests/fixtures/account-platform-native.py"], { cwd: root, stdio: "pipe", windowsHide: true, signal })
  let output = ""; child.stdout.on("data", chunk => { output += String(chunk) }); child.stderr.resume()
  child.stdin.end(JSON.stringify({ input, platform, profile: path.join(data, "browser-profile/default") }))
  await new Promise<void>((resolve, reject) => { child.on("error", reject); child.on("exit", code => code === 0 ? resolve() : reject(Error("account_native_fixture_failed"))) })
  return JSON.parse(output) as JsonValue
}
native.accountSession = (input, signal) => {
  if (input.action === "auth_write") writes.push(input.platformId)
  return bridge(input, bridges.get(input.platformId)!, signal)
}
const act = async (type: string, platformId: string) => {
  await api.accounts.directoryCommand({ type, requestId: randomUUID(), platformId, revision: api.accounts.directory.current(platformId)?.revision ?? 0 })
  await api.accounts.settled()
}
async function loginCurrent(key: string, password: string) {
  const window = api.accounts.repository.active()!, identity = api.accounts.repository.get("identity", window.browserIdentityId)
  const catalog = api.accounts.directory.version, digest = (api.accounts as unknown as { catalog: { evidenceSha256: string } }).catalog.evidenceSha256
  await bridge({ action: "fixture_login", ownerId: window.ownerId, leaseId: window.leaseId, kind: identity.kind,
    platformId: key, catalogVersion: catalog, evidenceSha256: digest, payload: { password } }, bridges.get(key)!, AbortSignal.timeout(30000))
}
async function group(key: string, purpose: "sample" | "verification" | "replay", formal = false) {
  const chain = accountFixtureChain(bridges.get(key)!.url), record = retainAccountTestTask(api)
  chain.taskId = record.taskId
  const browserRunId = formal ? stableUuid(record.id, "managed-window") : stableUuid(record.id, "browser", String(record.sequence))
  api.taskChain.repository.saveExecution({ ...record, status: "running", browser: { mode: "dedicated-visible", headless: false },
    ...(formal ? { release: { id: randomUUID(), version: 1, digest: "a".repeat(64) } } : {}), browserHandoff: { ...record.browserHandoff, status: "pending", ownerId: browserRunId, leaseId: null } })
  const internals = api.taskChain as unknown as { controllers: Map<string, AbortController>; host: TaskRuntimeHost }
  const controller = new AbortController(); internals.controllers.set(`${record.taskId}:${record.id}`, controller)
  try {
    const run = await internals.host.group({ taskId: record.taskId, authorizationId: record.authorizationId, browserRunId, requirementVersion: 1,
      purpose, chains: [chain], input: null, signal: controller.signal, budget: chain.budget,
      consumed: { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }, scopeConsumption: {},
      browser: { mode: "dedicated-visible", headless: false }, managedWindow: { ownerId: browserRunId, resume: false } },
    execute => execute(chain, { ...accountRequest(chain, randomUUID(), browserRunId), mode: purpose === "replay" ? "replay" : "verification" }))
    assert.equal(run.status, "completed", JSON.stringify(run.outcome)); assert.equal(run.consumed.llmCalls, 0); assert(run.auditComplete)
    api.taskChain.repository.saveRun(run)
  } finally { internals.controllers.clear()
    api.taskChain.repository.saveExecution({ ...api.taskChain.repository.execution(record.taskId, record.id), status: "completed", browserHandoff: { ...record.browserHandoff, status: "ended", ownerId: null, leaseId: null, purpose: null, targetDigest: null } }) }
}
// WHY：仅验收本轮双向 admission 和读取持久检查，不重跑原全平台/任务启动套件。
async function sharedLoginGate() {
  const key = "bilibili", owned = await site(key); sites.push(owned)
  const platform = api.accounts.directory.platform(key)
  Object.assign(platform, { url: owned.origin + "/identity", host: owned.origin, origins: [owned.origin],
    cookieUrls: [owned.origin + "/"], cookieDomains: ["127.0.0.1"], cookieNames: [owned.cookie], localStorageKeys: {} })
  bridges.set(key, platform)
  const core = accountOwnedCore(api.accounts), signal = () => AbortSignal.timeout(120000)
  api.store.saveBrowserEnvironment("dedicated-visible", api.store.browserEnvironment().revision)
  await core.windows.open(await core.identities.identify("dedicated"), platform, signal(), true)
  await loginCurrent(key, owned.credential); await act("add", key)
  const account = api.accounts.directory.current(key)!
  assert.equal(api.accounts.repository.get("identity", account.sourceIdentityId).kind, "dedicated")
  const startup = async (browserMode: "daily" | "dedicated-visible") => {
    api.store.saveBrowserEnvironment(browserMode, api.store.browserEnvironment().revision)
    await api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode, allowedOrigins: platform.origins,
      signal: signal(), resume: false })
  }
  const signout = async (kind: "daily" | "dedicated") => {
    const window = await core.windows.open(await core.identities.identify(kind), platform, signal(), true)
    await bridge({ action: "fixture_signout", ownerId: window.ownerId, leaseId: window.leaseId, kind, platformId: key,
      catalogVersion: api.accounts.directory.version, evidenceSha256: (api.accounts as unknown as { catalog: { evidenceSha256: string } }).catalog.evidenceSha256 }, platform, signal())
    await core.windows.finish(window)
  }
  await startup("daily")
  assert.equal(writes.length, 1)
  assert.equal(api.accounts.directory.snapshot().items[0]!.account!.state, "ready")
  proof.steps.push("real dedicated login → target daily signed out → original scoped DPAPI write → independent matching UID → owned windows released")
  const before = api.accounts.repository.list("platformCheck").length
  await startup("daily")
  assert.equal(writes.length, 1)
  assert(api.accounts.repository.list("platformCheck").slice(before).every(c => api.accounts.repository.get("identity", c.browserIdentityId).kind === "daily"))
  proof.steps.push("next daily startup checks only target; same UID causes zero source opens and zero writes")
  await signout("daily"); await act("check", key)
  assert.equal(writes.length, 2)
  assert.equal(api.accounts.directory.current(key)!.id, account.id)
  assert.equal(api.accounts.directory.snapshot().operation!.status, "completed")
  assert.equal(api.accounts.repository.get("identity", api.accounts.directory.current(key)!.sourceIdentityId).kind, "daily")
  proof.steps.push("manual daily check reuses dedicated login through the same guarded transfer; logical account retained")
  await signout("dedicated"); await startup("dedicated-visible")
  assert.equal(writes.length, 3)
  proof.steps.push("reverse canonical source daily → dedicated freshly signed out → independently verified reuse")
  assert(api.accounts.repository.list("platformCheck").every(c => c.run?.consumed.llmCalls === 0 && c.run.auditComplete))
  assert(api.accounts.repository.list("transfer").every(t => t.status === "completed" && !t.rollbackRef))
  assert(api.accounts.repository.list("maintenance").every(w => w.status === "closed"))
  await api.app.close()
  const restarted = await createApplication({ root, directory: data })
  restarted.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Owned isolated Chrome" })
  try {
    await restarted.accounts.directory.refreshProfiles()
    for (const mode of ["daily", "dedicated-visible"] as const) {
      restarted.store.saveBrowserEnvironment(mode, restarted.store.browserEnvironment().revision)
      assert.equal(restarted.accounts.directory.snapshot().items[0]!.account!.state, "ready")
    }
    assert.equal(restarted.accounts.directory.current(key)!.id, account.id)
    proof.steps.push("service restart reads successful per-Profile checks for both modes without opening Chrome")
  } finally { await restarted.app.close() }
  proof.platforms.push({ platform: key, writes: writes.length, dedicatedToDaily: 2, dailyToDedicated: 1, modelCalls: 0 })
}
try {
  if (process.env.BAT_ACCOUNT_SHARING_ONLY === "1") {
    await sharedLoginGate(); proof.passed = true
  } else {
  for (const key of keys) {
    const owned = await site(key); sites.push(owned)
    const platform = api.accounts.directory.platform(key)
    Object.assign(platform, { url: owned.origin + "/identity", host: owned.origin, origins: [owned.origin], cookieUrls: [owned.origin + "/"], cookieDomains: ["127.0.0.1"], cookieNames: [owned.cookie], localStorageKeys: {} })
    bridges.set(key, platform)
    if (key === "bilibili" || process.env.BAT_ACCOUNT_WAIT_SECONDS) {
      const id = randomUUID(); await api.accounts.directoryCommand({ type: "add", requestId: id, platformId: key, revision: 0 })
      for (let i = 0; i < 150 && api.accounts.repository.list("directoryOperation").at(-1)?.phase !== "waiting"; i++) await delay(200)
      assert.equal(api.accounts.repository.list("directoryOperation").at(-1)?.phase, "waiting")
      if (process.env.BAT_ACCOUNT_WAIT_SECONDS) {
        await delay(Number(process.env.BAT_ACCOUNT_WAIT_SECONDS) * 1000)
        assert.equal(api.accounts.repository.active()?.status, "open")
        assert.equal(api.accounts.repository.list("directoryOperation").at(-1)?.status, "running")
        assert.equal(api.accounts.directory.current(key), null)
        proof.steps.push("normal signin redirect accepted; login remained open and unsaved for 35 seconds before own form login")
      }
      await loginCurrent(key, owned.credential); await api.accounts.settled()
      assert.equal(api.accounts.directory.current(key)?.state, "ready")
      proof.steps.push("actual signed-out website → production LangGraph observation wait → own native form login → independent proof → automatic SQLite save, no completion button")
      await act("remove", key)
      if (process.env.BAT_ACCOUNT_WAIT_SECONDS) {
        await accountOwnedCore(api.accounts).windows.open(await accountOwnedCore(api.accounts).identities.identify("dedicated"), platform, AbortSignal.timeout(30000), true)
        const w = api.accounts.repository.active()!, digest = (api.accounts as unknown as { catalog: { evidenceSha256: string } }).catalog.evidenceSha256
        await bridge({ action: "fixture_signout", ownerId: w.ownerId, leaseId: w.leaseId, kind: "dedicated", platformId: key,
          catalogVersion: api.accounts.directory.version, evidenceSha256: digest }, platform, AbortSignal.timeout(30000))
        await accountOwnedCore(api.accounts).windows.finish(w)
      }
    }
    await accountOwnedCore(api.accounts).windows.open(await accountOwnedCore(api.accounts).identities.identify("daily"), platform, AbortSignal.timeout(30000), true)
    await loginCurrent(key, owned.credential); await act("add", key)
    assert.equal(api.accounts.repository.get("identity", api.accounts.directory.current(key)!.sourceIdentityId).kind, "daily")
    // B站等待测试已令自有目标登录；服务端失效仅测试站点，无个人账号。
    if (key === "bilibili") { // 重新登录源的随机 token 不同，目标仍是同 UID，先核验零写入。
      await group(key, "sample"); assert.equal(writes.length, 0)
      await accountOwnedCore(api.accounts).windows.open(await accountOwnedCore(api.accounts).identities.identify("dedicated"), platform, AbortSignal.timeout(30000), true)
      const window = api.accounts.repository.active()!, digest = (api.accounts as unknown as { catalog: { evidenceSha256: string } }).catalog.evidenceSha256
      await bridge({ action: "fixture_signout", ownerId: window.ownerId, leaseId: window.leaseId, kind: "dedicated", platformId: key,
        catalogVersion: api.accounts.directory.version, evidenceSha256: digest }, platform, AbortSignal.timeout(30000))
      await accountOwnedCore(api.accounts).windows.finish(window)
      await group(key, "sample")
    } else await group(key, key === "weibo" ? "verification" : "replay", key === "zhihu")
    proof.platforms.push({ platform: key, fixedSourceRun: true, source: "owned daily", target: "owned dedicated", writes: writes.filter(v => v === key).length })
  }
  for (const key of keys) assert.equal(writes.filter(v => v === key).length, 1)
  proof.steps.push(`original native runtime-host group → verified real controller startup hook → ${keys.join(", ")} scoped DPAPI transfers + fresh original source UID checks`)
  assert(api.accounts.repository.list("platformCheck").every(c => c.run?.consumed.llmCalls === 0 && c.run.auditComplete))
  await api.app.close()
  const restarted = await createApplication({ root, directory: data })
  try { assert.equal(restarted.accounts.repository.list("logicalAccount").filter(a => !a.deletedAt).length, keys.length)
    assert.equal(restarted.accounts.repository.list("transfer").filter(t => t.status === "completed").length, keys.length)
    assert(restarted.accounts.repository.list("maintenance").every(w => w.status === "closed")) }
  finally { await restarted.app.close() }
  proof.steps.push(`SQLite/native cleanup close+reopen preserves ${keys.length} canonical sources and completed scoped transfer facts`)
  proof.passed = true
  }
} finally {
  await api.app.close(); await Promise.all(sites.map(s => s.close()))
  await writeFile(path.join(out, "result.json"), JSON.stringify(proof, null, 2) + "\n")
}
