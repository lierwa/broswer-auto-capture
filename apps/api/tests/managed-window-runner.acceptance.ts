import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, readFile, access, rm } from "node:fs/promises"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import { hybridObserveRequestSchema, hybridBrowserStateSchema,
  hybridExecuteRequestSchema, hybridExecuteResultSchema } from "../src/upstream-browser/hybrid-protocol.js"

const projectRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)))
const probeRoot = path.join(projectRoot, "work", "handoff-lifecycle-probe")

test("visible managed window survives runner exit and resumes its original target",
  { skip: process.platform !== "win32", timeout: 120_000 }, async () => {
  await mkdir(probeRoot, { recursive: true })
  const directory = await mkdtemp(path.join(probeRoot, "runner-"))
  const profilePath = path.join(directory, "profile")
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" })
    response.end("<title>Managed window proof</title><main>Same target</main>")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const site = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const pageUrl = `${site}/catalog`
  const ownerId = randomUUID()
  const signal = new AbortController().signal
  // WHY：当前默认是日常浏览器；此生命周期用例必须明确隔离到专属可见模式。
  const runner = () => new RunnerProcess(projectRoot, signal, undefined, { browserMode: "dedicated-visible" })
  const first = runner()
  const resumed = runner()
  const control = runner()
  let ended = false
  let primaryFailed = false
  let browserTempPath: string | undefined
  try {
    await first.startHybrid({ headless: false, profilePath, allowedOrigins: [site],
      managedWindow: { ownerId, resume: false } })
    browserTempPath = JSON.parse(await readFile(path.join(directory, "managed-window-lease.json"), "utf8")).browserTempPath
    assert.equal(typeof browserTempPath, "string")
    const before = hybridExecuteResultSchema.parse(await first.request(hybridExecuteRequestSchema.parse({
      id: randomUUID(), type: "hybrid_execute", command: { name: "browser.workflow-step", version: 2,
        actionName: "navigate", args: { url: pageUrl, new_tab: false }, target: null,
        postconditions: [{ kind: "url", bindingArgument: "url" }] } }))).browser
    await assert.rejects(runner().managedWindowAction({
      action: "inspect", ownerId, leaseId: ownerId, profilePath }), /hybrid_managed_window_controlled/)
    const waiting = await first.handoff()
    assert.equal(waiting.report.status, "confirmed", JSON.stringify(waiting.report.stages))
    assert.equal(waiting.report.activeResources, false)
    assert.equal(waiting.report.stages.find((stage) => stage.stage === "browser_close")?.status, "not_required")
    assert.equal(waiting.lease.active, true)
    assert.equal(waiting.lease.leaseId, ownerId)
    await access(browserTempPath!)
    const contender = runner()
    await assert.rejects(contender.startHybrid({ headless: false, profilePath, allowedOrigins: [site],
      managedWindow: { ownerId: randomUUID(), resume: false } }), /hybrid_managed_window_busy/)
    const contenderCleanup = await contender.close()
    assert.equal(contenderCleanup.status, "confirmed")
    assert.equal(contenderCleanup.stages.find((stage) => stage.stage === "browser_close")?.status, "not_required")
    await assert.rejects(runner().managedWindowAction({
      action: "end", ownerId: randomUUID(), leaseId: ownerId, profilePath }), /hybrid_managed_window_owner_mismatch/)
    const inspected = await control.managedWindowAction({ action: "inspect", ownerId, leaseId: ownerId, profilePath })
    assert.equal(inspected.window.active, true)
    assert.equal(inspected.report.status, "confirmed")
    await resumed.startHybrid({ headless: false, profilePath, allowedOrigins: [site],
      managedWindow: { ownerId, resume: true } })
    const after = hybridBrowserStateSchema.parse(await resumed.request(hybridObserveRequestSchema.parse({
      id: randomUUID(), type: "hybrid_observe" })))
    assert.equal(after.sessionId, before.sessionId)
    assert.equal(after.tabId, before.tabId)
    const delivery = await resumed.handoff()
    assert.equal(delivery.report.status, "confirmed")
    assert.equal(delivery.lease.leaseId, waiting.lease.leaseId)
    assert.equal(delivery.lease.targetDigest, waiting.lease.targetDigest)
    const focused = await runner().managedWindowAction({
      action: "focus", ownerId, leaseId: ownerId, profilePath })
    assert.equal(focused.window.active, true)
    const result = await runner().managedWindowAction({
      action: "end", ownerId, leaseId: ownerId, profilePath })
    assert.equal(result.window.active, false)
    assert.equal(result.report.status, "confirmed")
    ended = true
    await assert.rejects(access(browserTempPath!), { code: "ENOENT" })
  } catch (error) {
    primaryFailed = true
    throw error
  } finally {
    await resumed.close()
    await first.close()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    if (!ended) {
      try {
        const result = await runner().managedWindowAction({
          action: "end", ownerId, leaseId: ownerId, profilePath })
        ended = result.report.status === "confirmed"
      } catch (error) {
        if (error instanceof Error && error.message.includes("hybrid_managed_window_lease_missing")) ended = true
      }
    }
    if (ended) {
      assert.ok(path.resolve(directory).startsWith(path.resolve(probeRoot) + path.sep))
      await rm(directory, { recursive: true, maxRetries: 10, retryDelay: 100 })
    } else if (!primaryFailed) {
      assert.fail(`managed window cleanup requires inspection: ${directory}`)
    }
  }
})
