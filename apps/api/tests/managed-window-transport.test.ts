import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"

// WHY：服务重启可改变 relay 端口；关闭必须重连原 owner，只读与已结束租约不得启动浏览器。
test("owned end refreshes transport while inspection stays passive and ended leases never connect", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-window-transport-")), ownerId = randomUUID()
  try {
    const profile = path.join(directory, "browser-profile")
    await mkdir(profile)
    const lease = { ownerId, cdpUrl: `ws://127.0.0.1:4100/fixture/${ownerId}`, status: "running",
      ownedTargets: ["owned-target"], targetCreationPending: false }
    const writeLease = () => writeFile(path.join(profile, "attached-window-lease.json"), JSON.stringify(lease))
    await writeLease()
    const calls: string[] = [], requests: Parameters<RunnerProcess["managedWindowAction"]>[0][] = []
    const refreshed = `ws://127.0.0.1:4200/fixture/${ownerId}`
    const runtime = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory, subject: {} as never,
      dailyChromeEndpoint: async owner => { assert.equal(owner, ownerId); calls.push("connect"); return refreshed },
      dailyChromeInspectionEndpoint: async owner => { assert.equal(owner, ownerId); calls.push("inspect"); return undefined } })
    t.mock.method(RunnerProcess.prototype, "managedWindowAction", async (input: typeof requests[number]) => {
      requests.push(input)
      return { window: { ownerId, leaseId: ownerId, targetDigest: null, active: false, reason: null },
        report: cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "not_required", code: null })), false) }
    })
    for (const action of ["inspect", "verify_closed", "end"] as const) {
      await runtime.managedWindowAction({ action, ownerId, leaseId: ownerId, browserMode: "daily", controllerReleased: true })
    }
    assert.deepEqual(calls, ["inspect", "inspect", "connect"])
    assert.equal(requests[0]?.cdpUrl, undefined); assert.equal(requests[1]?.cdpUrl, undefined)
    assert.equal(requests[2]?.cdpUrl, refreshed); assert.equal(requests[2]?.legacyEndpointVerified, true)
    assert.equal(requests[2]?.controllerReleased, true)
    lease.status = "ended"; await writeLease()
    await runtime.managedWindowAction({ action: "end", ownerId, leaseId: ownerId, browserMode: "daily" })
    assert.equal(calls.length, 3); assert.equal(requests[3]?.cdpUrl, undefined)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
