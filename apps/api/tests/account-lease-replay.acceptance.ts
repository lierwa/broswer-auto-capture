import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { ProductStore } from "../src/database/store.js"
import { TaskChainService } from "../src/task-chain/service.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { AccountRepository } from "../src/browser/account-repository.js"
import { AccountIdentities } from "../src/browser/account-identity.js"
import { BrowserAccountService } from "../src/browser/account-service.js"
import { BrowserProfileService } from "../src/browser/profile-service.js"
import { accountAvailability } from "../src/browser/account-availability.js"
import { loadPlatformCatalog } from "../src/browser/platform-catalog.js"
import { seedRunControl } from "./helpers/run-control-fixture.js"

// WHY：真实 TS→Python→CDP→SQLite 交接验证。Chrome 必须 headless + 新 Profile，绝不发现个人浏览器。
const root = process.cwd(), out = path.join(root, "work/account-lease-repair-20261004")
const directory = path.join(out, `isolated-${randomUUID()}`), chromeProfile = path.join(directory, "owned-headless-chrome")
await mkdir(chromeProfile, { recursive: true })
const proof: { passed: boolean; headless: boolean; runs: unknown[]; failure?: string; firstFailure?: unknown;
  restartPassed?: boolean; originalFailurePreserved?: boolean; oldReceiptPreserved?: boolean; unrelatedTargetPreserved?: boolean } = {
  passed: false, headless: true, runs: [] }
const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/html"); response.end('<title>Owned replay</title><main>Controlled replay</main>')
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new",
  `--user-data-dir=${chromeProfile}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "about:blank"],
{ stdio: "ignore", windowsHide: true })
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
let endpoint: string | undefined, store: ProductStore | undefined, service: TaskChainService | undefined
let upstream: PythonUpstreamBrowserRuntime | undefined, accounts: BrowserAccountService | undefined

async function cdp(method: string, params: Record<string, unknown> = {}) {
  assert(endpoint)
  const socket = new WebSocket(endpoint)
  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("owned_cdp_timeout")), 15000)
      socket.addEventListener("error", () => { clearTimeout(timer); reject(Error("owned_cdp_connection_failed")) }, { once: true })
      socket.addEventListener("open", () => socket.send(JSON.stringify({ id: 1, method, params })), { once: true })
      socket.addEventListener("message", event => {
        const message = JSON.parse(String(event.data))
        if (message.id !== 1) return
        clearTimeout(timer); message.error ? reject(Error("owned_cdp_rejected")) : resolve(message.result)
      })
    })
  } finally { socket.close() }
}

async function wire() {
  store = await ProductStore.open(directory)
  upstream = new PythonUpstreamBrowserRuntime({ root, directory, subject: {} as never, dailyChromeEndpoint: async () => endpoint })
  const browser = { owner: () => null, setAuthorizationValidator() {} }
  service = new TaskChainService(store, browser as never, {} as never, upstream, undefined, directory)
  const repository = new AccountRepository(store)
  const daily = { accountBinding: async () => ({ binding: "d".repeat(64), name: "Owned headless Chrome" }), endpoint: async () => endpoint }
  const identities = new AccountIdentities(directory, daily as never, repository)
  const access = accountAvailability(store, service, browser as never, new BrowserProfileService(root, directory))
  accounts = new BrowserAccountService(repository, identities, upstream, access.assert, await loadPlatformCatalog(root), access)
  upstream.setAccountPreparation(input => access.withStartup(input, () => accounts!.prepareStartup(input)))
  return { repository, identity: await identities.identify("daily") }
}

async function run(taskId: string, release: ReturnType<typeof seedRunControl>["release"]) {
  const accepted = await service!.dispatchAsync(taskId, { type: "run_task", requestId: randomUUID(), release,
    input: null, browser: { mode: "daily", headless: false }, pacing: { nodeDelayMs: 0 } })
  const id = accepted.acceptedExecution!.executionId, deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    const record = service!.repository.execution(taskId, id)
    if (!["queued", "running"].includes(record.status) && record.cleanup.status !== "pending" && !service!.isAnyActive()) return record
    await sleep(100)
  }
  throw Error("owned_execution_timeout")
}

try {
  for (let attempt = 0; attempt < 100 && !endpoint; attempt++) {
    try { const [port, route] = (await readFile(path.join(chromeProfile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/)
      endpoint = `ws://127.0.0.1:${port}${route}` } catch { await sleep(100) }
  }
  assert(endpoint, "owned_headless_endpoint_missing")
  const wired = await wire(), fixture = seedRunControl(store!, service!, origin), accountOwner = randomUUID()
  const protectedTargets = (await cdp("Target.getTargets")).targetInfos as { targetId: string; type: string }[]
  const protectedId = protectedTargets.find(target => target.type === "page")!.targetId
  await upstream!.withCapabilities({ ownerId: accountOwner, sessionPurpose: "account", signal: new AbortController().signal,
    browserMode: "daily", headless: false, allowedOrigins: [origin], managedWindow: { ownerId: accountOwner, resume: false },
    handoffPurpose: () => "human_wait" }, async () => {})
  const base = path.join(directory, "browser-profile/attached-window-lease.json")
  const lease = JSON.parse(await readFile(base, "utf8"))
  assert.equal(lease.ownerId, accountOwner); assert.equal(lease.status, "handoff")
  await cdp("Target.closeTarget", { targetId: lease.targetId })
  const stamp = new Date().toISOString()
  wired.repository.save("maintenance", { id: randomUUID(), browserIdentityId: wired.identity.id,
    entryId: null, ownerId: accountOwner, leaseId: accountOwner, status: "closed", reason: null, createdAt: stamp, updatedAt: stamp })
  // 原错误必须经真实 runner 复现，而不是 mock；保留这一失败 execution 供后续复读。
  const first = await run(fixture.taskId, fixture.release)
  assert.equal(first.status, "failed"); assert.match(first.reason, /hybrid_attached_window_busy/)
  assert.equal(first.cleanup.status, "confirmed"); assert(first.steps.every(step => !step.runIds.length))
  assert.equal(service!.executionDetail(fixture.taskId, first.id).startupFailure?.code, "hybrid_attached_window_busy")
  proof.firstFailure = { id: first.id, reason: first.reason, nodesRun: 0, cleanup: first.cleanup.status }
  upstream!.setReleasedAccountOwners(kind => accounts!.releasedWindowOwners(kind))
  for (let index = 0; index < 3; index++) {
    if (index === 2) {
      await accounts!.close(); await service!.close(); await upstream!.close(); await store!.close()
      await wire(); upstream!.setReleasedAccountOwners(kind => accounts!.releasedWindowOwners(kind))
    }
    const record = await run(fixture.taskId, fixture.release)
    assert.equal(record.status, "completed", record.reason); assert.equal(record.cleanup.status, "confirmed")
    assert.equal(record.consumed.llmCalls, 0); assert.equal(record.browserHandoff.status, "active")
    const runs = record.steps.flatMap(step => step.runIds.map(id => service!.repository.run(fixture.taskId, id)))
    assert(runs.length && runs.every(run => run.auditComplete && !run.modelCalls.length))
    proof.runs.push({ id: record.id, runIds: runs.map(run => run.binding.runId), status: record.status,
      cleanup: record.cleanup.status, llmCalls: record.consumed.llmCalls })
  }
  assert.equal(service!.repository.execution(fixture.taskId, first.id).reason, first.reason)
  const oldLease = JSON.parse(await readFile(path.join(directory, "browser-profile/window-leases/attached-window-lease", `${accountOwner}.json`), "utf8"))
  assert.equal(oldLease.ownerId, accountOwner)
  const finalTargets = (await cdp("Target.getTargets")).targetInfos as { targetId: string }[]
  assert(finalTargets.some(target => target.targetId === protectedId))
  Object.assign(proof, { passed: true, restartPassed: true, originalFailurePreserved: true,
    oldReceiptPreserved: true, unrelatedTargetPreserved: true })
} catch (error) {
  proof.failure = error instanceof Error ? error.message : "acceptance_failed"
  process.exitCode = 1
} finally {
  await accounts?.close(); await service?.close(); await upstream?.close(); await store?.close()
  if (endpoint) await cdp("Browser.close").catch(() => {})
  chrome.kill(); await new Promise<void>(resolve => server.close(() => resolve()))
  await writeFile(path.join(out, "headless-native-proof.json"), JSON.stringify(proof, null, 2))
  console.log(JSON.stringify(proof))
}
