import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import type { CDPRelayServer } from "../../../vendor/daily-chrome-extension/cdpRelay.js"
import { createApplication } from "../src/app.js"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { DomainError } from "../src/errors.js"

const headers = { host: "127.0.0.1:4175", origin: "http://127.0.0.1:4175", "sec-fetch-site": "same-origin" }
const fixtureToken = "K".repeat(43)

// WHY：替换扩展进程边界，实际运行宿主 HTTP/凭据逻辑；不启动或操作用户 Chrome 的授权窗口。
function extensionFixture(manager: DailyChromeExtension) {
  const calls: Array<{ profile: string; token: string | undefined }> = []
  const connections: Array<{ connected: boolean; stops: number }> = []
  const fixture = { reject: false, calls, connections }
  manager.profiles = async () => [{ id: "Default", name: "Fixture Chrome" }]
  const adapter = manager as unknown as {
    createRelay(profile: string, token?: string): Promise<CDPRelayServer>
  }
  adapter.createRelay = async (profile, token) => {
    calls.push({ profile, token })
    const state = { connected: false, stops: 0 }
    connections.push(state)
    return {
      start: async () => {},
      establishExtensionConnection: async () => {
        if (fixture.reject) throw new Error("fixture_user_rejected")
        state.connected = true
      },
      authorizationToken: () => fixtureToken,
      cdpEndpoint: () => "ws://127.0.0.1:1234/devtools/browser/fixture",
      isConnected: () => state.connected,
      stop: () => { state.connected = false; state.stops++ },
      close: async () => { state.connected = false; state.stops++ },
    } as unknown as CDPRelayServer
  }
  return fixture
}

async function application(directory: string) {
  return createApplication({ root: process.cwd(), directory,
    upstreamBrowserRuntime: { } })
}

test("first authorization ignores retained task leases; reject then allow preserves global state", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-global-authorization-http-"))
  const current = await application(directory)
  const fixture = extensionFixture(current.dailyChrome)
  const retained = { taskId: randomUUID(), executionId: randomUUID() }
  let leaseChecks = 0
  current.store.activeBrowserWindowLease = () => { leaseChecks++; return retained }
  try {
    const before = await current.app.inject({ url: "/api/browser/daily-chrome", headers })
    assert.equal(before.json().paired, false)
    assert.equal(fixture.calls.length, 0, "reading status must not request authorization")
    fixture.reject = true
    const rejected = await current.app.inject({ method: "POST", url: "/api/browser/daily-chrome/authorize",
      headers, payload: { profileDirectory: "Default" } })
    assert.equal(rejected.statusCode, 409)
    assert.equal(rejected.json().code, "daily_chrome_extension_not_connected")
    assert.equal((await current.dailyChrome.snapshot()).paired, false)
    assert.equal((await current.dailyChrome.snapshot()).busy, false)
    fixture.reject = false
    const approved = await current.app.inject({ method: "POST", url: "/api/browser/daily-chrome/authorize",
      headers, payload: { profileDirectory: "Default" } })
    assert.equal(approved.statusCode, 200)
    assert.equal((await current.dailyChrome.snapshot()).paired, true)
    const connected = await current.app.inject({ method: "POST", url: "/api/browser/daily-chrome/connect", headers })
    assert.equal(connected.statusCode, 200)
    assert.equal(fixture.calls.length, 2, "saved connected authorization must not open another approval")
    assert.equal(leaseChecks, 0, "global authorization must not depend on historical task ownership")
    assert.deepEqual(current.store.activeBrowserWindowLease(), retained)
    assert.equal(approved.body.includes(fixtureToken), false)
  } finally { await current.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("one saved authorization is reused across tasks, disconnected transport, and service restart", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-global-authorization-restart-"))
  let current = await application(directory)
  let fixture = extensionFixture(current.dailyChrome)
  try {
    const taskIds = [0, 1].map(() => current.store.taskAction({ type: "create", requestId: randomUUID() }))
    const approved = await current.app.inject({ method: "POST", url: "/api/browser/daily-chrome/authorize",
      headers, payload: { profileDirectory: "Default" } })
    assert.equal(approved.statusCode, 200)
    for (const taskId of taskIds) {
      assert.equal((await current.app.inject({ url: `/api/task-chain?taskId=${taskId}`, headers })).statusCode, 200)
      assert.equal(await current.dailyChrome.endpoint(), "ws://127.0.0.1:1234/devtools/browser/fixture")
    }
    assert.equal(fixture.calls.length, 1)
    fixture.connections[0]!.connected = false
    const reconnect = await current.app.inject({ method: "POST", url: "/api/browser/daily-chrome/connect", headers })
    assert.equal(reconnect.statusCode, 200)
    assert.equal(fixture.calls[1]!.token, fixtureToken)
    await current.app.close()
    current = await application(directory)
    fixture = extensionFixture(current.dailyChrome)
    assert.equal((await current.dailyChrome.snapshot()).paired, true)
    assert.equal((await current.dailyChrome.snapshot()).connected, false)
    assert.equal(fixture.calls.length, 0, "service startup must not automatically request authorization")
    const restored = await current.app.inject({ method: "POST", url: "/api/browser/daily-chrome/connect", headers })
    assert.equal(restored.statusCode, 200)
    assert.deepEqual(fixture.calls, [{ profile: "Default", token: fixtureToken }])
    const publicState = await current.app.inject({ url: "/api/browser/daily-chrome", headers })
    assert.equal(publicState.body.includes(fixtureToken), false)
  } finally { await current.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("saved reuse preserves a busy live relay; replacing it still requires owner availability", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-global-authorization-owner-"))
  let ownershipChecks = 0
  const manager = new DailyChromeExtension(process.cwd(), directory, () => {
    ownershipChecks++
    throw new DomainError("browser_busy", "fixture_owned_connection_busy", 409)
  })
  const fixture = extensionFixture(manager)
  try {
    await manager.pair({ profileDirectory: "Default" })
    assert.equal(ownershipChecks, 0)
    assert.equal(await manager.connectSaved(), "ws://127.0.0.1:1234/devtools/browser/fixture")
    assert.equal(ownershipChecks, 0)
    await assert.rejects(manager.pair({ profileDirectory: "Default" }), /fixture_owned_connection_busy/)
    assert.equal(ownershipChecks, 1)
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.connections[0]!.stops, 0)
    assert.equal((await manager.snapshot()).connected, true)
    assert.equal((await manager.snapshot()).paired, true)
  } finally { manager.close(); await rm(directory, { recursive: true, force: true }) }
})
