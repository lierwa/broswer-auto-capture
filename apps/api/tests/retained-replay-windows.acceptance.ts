import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn, execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { stableUuid } from "@browser-capture/runtime"
import { ProductStore } from "../src/database/store.js"
import { TaskChainService } from "../src/task-chain/service.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { seedRunControl } from "./helpers/run-control-fixture.js"
import { AccountRepository } from "../src/browser/account-repository.js"
import { AccountIdentities } from "../src/browser/account-identity.js"
import { BrowserAccountService } from "../src/browser/account-service.js"
import { BrowserProfileService } from "../src/browser/profile-service.js"
import { accountAvailability } from "../src/browser/account-availability.js"
import { loadPlatformCatalog } from "../src/browser/platform-catalog.js"
import { markerChain } from "../src/browser/account-marker-chain.js"

const root = process.cwd(), out = path.join(root, "work/run-control-20261004")
await mkdir(out, { recursive: true })
const proof: { passed: boolean; cases: unknown[]; failure?: string } = { passed: false, cases: [] }
const visits: number[] = []
const cookie = randomUUID(); let cookieRequests = 0
const server = createServer((_request, response) => {
  if (_request.url === "/proof") {
    let body = ""; _request.on("data", chunk => { body += chunk })
    _request.on("end", () => { visits.push(Number(body)); response.end("ok") }); return
  }
  response.setHeader("content-type", "text/html")
  const authenticated = _request.headers.cookie?.includes(`owned_session=${cookie}`)
  if (authenticated) cookieRequests++
  else response.setHeader("Set-Cookie", `owned_session=${cookie}; Path=/; HttpOnly; SameSite=Strict`)
  response.end(`<title>Owned replay fixture</title><main>Controlled proof ${authenticated ? '<span id="account-name">Owned synthetic account</span>' : ''}</main><script>
    const count=Number(localStorage.getItem('owned-replay')||0);localStorage.setItem('owned-replay',String(count+1));
    fetch('/proof',{method:'POST',body:String(count)});</script>`)
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const browser = { setAuthorizationValidator() {}, owner: () => null }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function settled(service: TaskChainService, taskId: string, id: string) {
  const deadline = Date.now() + 100_000
  while (Date.now() < deadline) {
    const record = service.repository.execution(taskId, id)
    if (!["queued", "running"].includes(record.status) && record.cleanup.status !== "pending") return record
    await sleep(100)
  }
  throw Error("controlled_execution_timeout")
}

async function runCase(mode: "daily" | "dedicated-visible") {
  const directory = path.join(out, `native-${mode}-${randomUUID()}`), chromeProfile = path.join(directory, "owned-chrome")
  await mkdir(chromeProfile, { recursive: true })
  let chrome: ReturnType<typeof spawn> | undefined, endpoint: string | undefined
  if (mode === "daily") {
    chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
      `--user-data-dir=${chromeProfile}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "about:blank"],
      { stdio: "ignore", windowsHide: true })
    for (let attempt = 0; attempt < 80 && !endpoint; attempt++) {
      try { const [port, route] = (await readFile(path.join(chromeProfile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/)
        endpoint = `ws://127.0.0.1:${port}${route}` } catch { await sleep(100) }
    }
    assert.ok(endpoint, "owned_daily_endpoint_missing")
  }
  const createNative = () => new PythonUpstreamBrowserRuntime({ root, directory, subject: {} as never,
    ...(endpoint ? { dailyChromeEndpoint: async () => endpoint } : {}) })
  let store = await ProductStore.open(directory), upstream = createNative()
  const createService = () => new TaskChainService(store, browser as never, {} as never, upstream)
  let service = createService(), fixture = seedRunControl(store, service, origin)
  let repository: AccountRepository, accounts: BrowserAccountService, accountId: string | undefined
  async function wireAccounts() {
    repository = new AccountRepository(store)
    const daily = { accountBinding: async () => ({ binding: "d".repeat(64), name: "Owned Chrome" }), endpoint: async () => endpoint }
    const identities = new AccountIdentities(directory, daily as never, repository)
    const access = accountAvailability(store, service, browser as never, new BrowserProfileService(root, directory))
    accounts = new BrowserAccountService(repository, identities, upstream, access.assert, await loadPlatformCatalog(root), access)
    upstream.setAccountPreparation(input => input.resume ? Promise.resolve()
      : access.withStartup(input, () => accounts.prepareStartup(input)))
    return identities
  }
  let identities = await wireAccounts()
  const executions = [], owners: string[] = [], before = visits.length
  const cookieBefore = cookieRequests, processes: number[] = []
  try {
    for (let index = 0; index < 4; index++) {
      if (index === 2) {
        await service.close(); await upstream.close(); await store.close()
        store = await ProductStore.open(directory); upstream = createNative(); service = createService()
        identities = await wireAccounts()
        assert.equal(store.activeBrowserWindowLease(undefined, mode === "daily" ? "daily" : "dedicated"), null)
      }
      const command = { type: "run_task", requestId: randomUUID(), release: fixture.release,
        input: null, browser: { mode, headless: false }, pacing: { nodeDelayMs: 0 } }
      const accepted = await service.dispatchAsync(fixture.taskId, command)
      const id = accepted.acceptedExecution!.executionId
      const record = await settled(service, fixture.taskId, id)
      assert.equal(record.status, "completed", JSON.stringify(record.result?.failure ?? record.reason))
      assert.equal(record.cleanup.status, "confirmed"); assert.equal(record.browserHandoff.purpose, "delivery")
      assert.equal(record.browserHandoff.status, "active"); assert.equal(record.consumed.llmCalls, 0)
      const owner = stableUuid(id, "managed-window"); owners.push(owner)
      const runs = record.steps.flatMap(step => step.runIds.map(runId => service.repository.run(fixture.taskId, runId)))
      assert.ok(runs.length); assert.ok(runs.every(run => run.auditComplete && !run.modelCalls.length))
      executions.push({ id, owner, cleanup: record.cleanup.status, outcome: record.status, modelCalls: record.consumed.llmCalls,
        targetDigest: record.browserHandoff.targetDigest, runIds: runs.map(run => run.binding.runId) })
      if (mode === "dedicated-visible") {
        const receipt = JSON.parse(await readFile(path.join(directory, "browser-profile/managed-window-lease.json"), "utf8"))
        processes.push(receipt.browserPid); assert.equal(processes.at(-1), processes[0])
      }
      if (index === 0) {
        const identity = await identities.identify(mode === "daily" ? "daily" : "dedicated")
        const binding = repository!.save("binding", { schemaVersion: 1, id: randomUUID(), browserIdentityId: identity.id,
          url: `${origin}/fixture`, name: "Owned synthetic account", revision: 0,
          chain: markerChain(`${origin}/fixture`, "#account-name", "account", null), createdAt: new Date().toISOString(), deletedAt: null })
        accountId = binding.id
        await accounts!.directoryCommand({ type: "custom_add", requestId: randomUUID(), platformId: binding.id, revision: 0 })
        await accounts!.settled()
        assert.equal(accounts!.directory.current(binding.id)?.state, "ready", "real isolated account check must be saved")
      }
      if (index === 1) {
        const first = service.repository.execution(fixture.taskId, executions[0]!.id)
        const inspected = await service.controlBrowserHandoff(fixture.taskId, { requestId: randomUUID(), executionId: first.id,
          expectedSequence: first.sequence, action: "inspect" })
        assert.equal(inspected.execution?.browserHandoff.status, "active")
        const latestFirst = service.repository.execution(fixture.taskId, first.id)
        await service.controlBrowserHandoff(fixture.taskId, { requestId: randomUUID(), executionId: first.id,
          expectedSequence: latestFirst.sequence, action: "end" })
        const second = await upstream.managedWindowAction({ action: "inspect", ownerId: owner, leaseId: owner, browserMode: mode })
        assert.equal(second.window.active, true, "ending an archived owner must not close the second page")
      }
      if (index === 2) await service.controlBrowserHandoff(fixture.taskId, { requestId: randomUUID(), executionId: id,
        expectedSequence: record.sequence, action: "end" })
    }
    assert.equal(new Set(executions.map(item => item.id)).size, 4)
    assert.equal(new Set(executions.map(item => item.targetDigest)).size, 4)
    const observed = visits.slice(before)
    assert.ok(observed.length >= 3); assert.ok(observed.at(-1)! >= 2, "login storage must survive rerun and restart")
    assert.ok(cookieRequests - cookieBefore >= 3, "HttpOnly session must survive startup checks, rerun and restart")
    assert.ok(repository!.list("platformCheck").length >= 4)
    assert.equal(accounts!.directory.current(accountId!)?.state, "ready")
    const current = service.repository.execution(fixture.taskId, executions[3]!.id)
    await service.controlBrowserHandoff(fixture.taskId, { requestId: randomUUID(), executionId: current.id,
      expectedSequence: current.sequence, action: "end" })
    proof.cases.push({ mode, directory, sqlite: path.join(directory, "workbench.sqlite"), executions,
      observed, restartPassed: true, archivedOwnerEndPreservedNewPage: true })
    Object.assign(proof.cases.at(-1) as object, { savedAccountStartup: true, httpOnlySessionPreserved: true,
      sameProcess: mode === "dedicated-visible" ? new Set(processes).size === 1 : true, endedOwnerReplay: true })
  } finally {
    await service.close(); await upstream.close(); await store.close()
    // 仅此测试自行启动/记录的 Chrome 子进程；绝不通过名称关闭个人 Chrome。
    chrome?.kill()
    if (mode === "dedicated-visible") execFileSync(path.join(root, "work/upstream-browser-hybrid/.venv/Scripts/python.exe"),
      [path.join(root, "apps/api/tests/helpers/owned-profile-cleanup.py"), directory],
      { env: { ...process.env, PYTHONPATH: "apps/api/python;vendor/workflow-use/workflows" }, stdio: "pipe", windowsHide: true })
  }
}

try { await runCase("daily"); await runCase("dedicated-visible"); proof.passed = true }
catch (error) { proof.failure = error instanceof Error ? error.message : "controlled_acceptance_failed"; throw error }
finally {
  await writeFile(path.join(out, `native-${process.argv[2] ?? "first"}.json`), JSON.stringify(proof, null, 2))
  if (proof.passed) await writeFile(path.join(out, "native-passed.json"), JSON.stringify(proof, null, 2))
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
}
