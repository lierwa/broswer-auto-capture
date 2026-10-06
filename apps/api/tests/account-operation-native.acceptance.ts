import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createApplication } from "../src/app.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import type { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { accountOwnedCore } from "./helpers/account-owned-core.js"

if (process.env.BAT_RUN_ACCOUNT_OPERATION !== "1") throw Error("owned_headless_gate_required")
let input = ""; for await (const part of process.stdin) input += String(part)
const config = JSON.parse(input) as { endpointPort: number; nativePort: number; output: string }
const root = process.cwd(), data = path.join(config.output, "data"), python = path.join(root, "work/upstream-browser-hybrid/.venv/Scripts/python.exe")
await mkdir(data, { recursive: true })
const credential = randomBytes(20).toString("hex"), sessions = new Set<string>()
const site = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store")
  if (request.method === "POST") {
    let body = ""; for await (const part of request) body += String(part)
    assert.equal(new URLSearchParams(body).get("password"), credential)
    const token = randomBytes(20).toString("hex"); sessions.add(token)
    response.setHeader("Set-Cookie", `owned_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`)
    response.writeHead(303, { Location: "/identity" }).end(); return
  }
  const token = request.headers.cookie?.split("; ").find(c => c.startsWith("owned_session="))?.slice(14)
  if (request.url !== "/identity") {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({ code: 0, data: { isLogin: Boolean(token && sessions.has(token)), mid: "fixture-id", uname: "Owned account" } })); return
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end('<form method="post"><input name="password"><button>Sign in</button></form>')
})
await new Promise<void>(resolve => site.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${(site.address() as { port: number }).port}`
const api = await createApplication({ root, directory: data, serveUi: true }), core = accountOwnedCore(api.accounts)
const native = (core.windows as unknown as { upstream: PythonUpstreamBrowserRuntime }).upstream
const platform = api.accounts.directory.platform("bilibili")
Object.assign(platform, { url: origin + "/identity", host: origin, origins: [origin], cookieUrls: [origin + "/"],
  cookieDomains: ["127.0.0.1"], cookieNames: ["owned_session"], localStorageKeys: {} })
api.dailyChrome.accountBinding = async () => ({ binding: "d".repeat(64), name: "Isolated headless Chrome" })
api.dailyChrome.endpoint = async (_popup, ownerId) => {
  const response = await fetch(`http://127.0.0.1:${config.endpointPort}/?owner=${ownerId ?? randomUUID()}`)
  assert(response.ok); return ((await response.json()) as { endpoint: string }).endpoint
}
// 仅替换测试目录中的网站地址。真实 accountSession / RunnerProcess / Python 请求循环都保留。
const start = RunnerProcess.prototype.startCompiler
const prototype = RunnerProcess.prototype as unknown as { launch(entry: string): Promise<void> }
const launch = prototype.launch
let launches = 0
prototype.launch = async function(entry) {
  const runner = this as unknown as { lifecycle: { runnerScript?: string; runnerEnvironment?: Record<string, string> } }
  runner.lifecycle.runnerScript = path.join(root, "apps/api/tests/fixtures/account-operation-runner.py")
  runner.lifecycle.runnerEnvironment = { BAT_OWNED_ACCOUNT_PLATFORM: JSON.stringify(platform) }
  return launch.call(this, entry)
}
RunnerProcess.prototype.startCompiler = async function() { launches++; return start.call(this) }
const call = native.accountSession.bind(native), actions: string[] = []
const managedAction = native.managedWindowAction.bind(native)
native.accountSession = (args, signal) => { actions.push(args.action); return call(args, signal) }
async function child(script: string, value: object) {
  const process = spawn(python, [script], { cwd: root, stdio: "pipe", windowsHide: true })
  let stdout = "", stderr = ""
  process.stdout.on("data", part => { stdout += String(part) }); process.stderr.on("data", part => { stderr += String(part) })
  process.stdin.end(JSON.stringify(value))
  const code = await new Promise<number | null>((resolve, reject) => { process.on("error", reject); process.on("exit", resolve) })
  assert.equal(code, 0, stderr || stdout)
  return JSON.parse(stdout) as object
}
const proof = { passed: false, headless: true, personalProfileTouched: false, modelCalls: 0, elapsedMs: 0,
  compilerLaunches: 0, actions, ui: {} as object, cleanupFailureUi: {} as object, manuallyClosedRecovery: false, closedOwners: [] as string[] }
try {
  api.store.saveBrowserEnvironment("dedicated-visible", api.store.browserEnvironment().revision)
  const identity = await core.identities.identify("dedicated")
  const window = await core.windows.open(identity, platform, AbortSignal.timeout(60000), true)
  await child("apps/api/tests/fixtures/account-platform-native.py", { input: { action: "fixture_login", kind: "dedicated",
    ownerId: window.ownerId, leaseId: window.leaseId, platformId: platform.id,
    catalogVersion: api.accounts.directory.version, evidenceSha256: (api.accounts as unknown as { catalog: { evidenceSha256: string } }).catalog.evidenceSha256,
    payload: { password: credential } }, platform, profile: path.join(data, "browser-profile/default") })
  await api.accounts.directoryCommand({ type: "add", platformId: platform.id, revision: 0, requestId: randomUUID() })
  await api.accounts.settled()
  assert.equal(api.accounts.directory.snapshot().operation?.status, "completed")
  api.store.saveBrowserEnvironment("daily", api.store.browserEnvironment().revision)
  await api.app.listen({ host: "127.0.0.1", port: 0 })
  const url = `http://127.0.0.1:${(api.app.server.address() as { port: number }).port}`
  actions.length = 0; const before = launches, started = Date.now()
  proof.ui = await child("apps/api/tests/fixtures/account-operation-ui.py", { url })
  await api.accounts.settled()
  proof.elapsedMs = Date.now() - started; proof.compilerLaunches = launches - before
  assert.equal(proof.compilerLaunches, 1, "完整检查/转移必须复用同一个原生账号 runner")
  assert.equal(api.accounts.directory.snapshot().operation?.status, "completed")
  assert.equal(api.accounts.repository.list("transfer").at(-1)?.status, "completed")
  proof.actions = actions.slice()
  // 注入本次 owner 关闭失败，检验 UI 不丢失已确认登录，并显示独立清理事实。
  native.managedWindowAction = async args => {
    if (args.action === "end" || args.action === "verify_closed") throw Error("owned_fixture_close_unconfirmed")
    return managedAction(args)
  }
  proof.cleanupFailureUi = await child("apps/api/tests/fixtures/account-operation-ui.py", { url, noticeExpected: true })
  await api.accounts.settled()
  assert(api.accounts.repository.list("maintenance").some(w => w.status === "cleanup_required"))
  native.managedWindowAction = managedAction
  for (const w of api.accounts.repository.list("maintenance").filter(w => w.status !== "closed")) await core.windows.finish(w)
  const daily = await core.identities.identify("daily")
  const retained = await core.windows.open(daily, platform, AbortSignal.timeout(30000), false)
  const lease = JSON.parse(await readFile(path.join(data, "browser-profile/window-leases/attached-window-lease", `${retained.ownerId}.json`), "utf8"))
  await child("apps/api/tests/fixtures/account-operation-close.py", { port: config.nativePort, targetId: lease.targetId })
  await api.accounts.prepareStartup({ ownerId: randomUUID(), browserMode: "daily", allowedOrigins: [], signal: AbortSignal.timeout(30000), resume: false })
  assert.equal(api.accounts.repository.get("maintenance", retained.id).status, "closed")
  proof.manuallyClosedRecovery = true
  for (const w of api.accounts.repository.list("maintenance")) {
    assert.equal(w.status, "closed")
    assert.equal((await core.windows.action("verify_closed", w)).window.active, false)
    proof.closedOwners.push(w.ownerId)
  }
  assert(api.accounts.repository.list("platformCheck").every(c => c.run?.consumed.llmCalls === 0 && c.run.auditComplete))
  proof.passed = true
} finally {
  native.managedWindowAction = managedAction
  for (const w of api.accounts.repository.list("maintenance").filter(w => w.status !== "closed")) await core.windows.finish(w)
  await api.app.close(); RunnerProcess.prototype.startCompiler = start; prototype.launch = launch
  site.closeAllConnections(); site.close()
  await writeFile(path.join(config.output, "product-result.json"), JSON.stringify(proof, null, 2) + "\n")
}
