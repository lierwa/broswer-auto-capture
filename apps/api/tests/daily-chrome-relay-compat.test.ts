import assert from "node:assert/strict"
import { test } from "node:test"
import { ExtensionProtocolV2 } from "../../../vendor/daily-chrome-extension/cdpRelayV2.js"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { mountDailyChromeExtension } from "../src/browser/daily-extension-routes.js"
import { DomainError } from "../src/errors.js"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import Fastify from "fastify"
import { WSServer } from "../../../vendor/daily-chrome-extension/wsServer.js"

// WHY：真实 Chrome 从 HTTP 跳入未声明的扩展页会 ERR_BLOCKED_BY_CLIENT；只开放连接页给 loopback。
test("loopback redirect allows Chrome to load only the extension connection page", async () => {
  const server = new WSServer({ onRequest: (_request, response) => { response.statusCode = 404; response.end() },
    onHeaders: () => {}, onUpgrade: () => {}, isAllowedPathname: () => false, onConnection: () => {} })
  try {
    const host = await server.listen()
    const target = new URL("chrome-extension://fixture/connect.html")
    target.searchParams.set("mcpRelayUrl", host + "/extension/fixture")
    target.searchParams.set("token", "A".repeat(43))
    const launcher = server.browserRedirect(target.href)
    assert.equal(launcher.includes("A".repeat(43)), false)
    const response = await fetch(launcher, { redirect: "manual" })
    assert.equal(response.status, 302)
    assert.equal(response.headers.get("location"), target.href)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal((await fetch(launcher, { redirect: "manual", headers: { origin: "https://other.invalid" } })).status, 404)
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "vendor/daily-chrome-extension/extension/manifest.json"), "utf8"))
    assert.deepEqual(manifest.web_accessible_resources, [{ resources: ["connect.html"], matches: ["http://127.0.0.1/*"] }],
      "Chrome blocks the HTTP-to-extension redirect unless connect.html allows the loopback origin")
  } finally { await server.close() }
})

// 保护实际 SDK 的初始化次序，以及不向调用方泄露/准入非任务目标。
test("daily relay supports browser-use discovery before auto-attach with owned targets only", async () => {
  const calls: string[] = []
  let url = "about:blank"
  const handler = new ExtensionProtocolV2(async (method, params) => {
    calls.push(method)
    assert.equal(params[0].tabId, 7)
    if (method === "chrome.debugger.attach") return undefined
    assert.equal(params[1], "Target.getTargetInfo")
    return { targetInfo: { targetId: "owned-target", type: "page", url } }
  })
  handler.handleExtensionEvent("chrome.tabs.onCreated", [{ id: 7 }])
  handler.handleExtensionEvent("extension.initialized", [])
  await handler.ready()
  handler.connectOverCDP(() => {})
  assert.deepEqual(await handler.handleCDPCommand("Target.setDiscoverTargets", { discover: true }, undefined), { result: {} })
  const targets = await handler.handleCDPCommand("Target.getTargets", {}, undefined)
  assert.deepEqual(targets?.result.targetInfos.map((target: any) => target.targetId), ["owned-target"])
  const attached = await handler.handleCDPCommand("Target.attachToTarget", { targetId: "owned-target", flatten: true }, undefined)
  assert.ok(attached?.result.sessionId)
  assert.deepEqual((await handler.handleCDPCommand("Target.getTargetInfo", { targetId: "owned-target" }, undefined))?.result.targetInfo.targetId, "owned-target")
  url = "https://fixture.test/updated"
  assert.equal((await handler.handleCDPCommand("Target.getTargetInfo", { targetId: "owned-target" }, undefined))?.result.targetInfo.url, url)
  assert.equal((await handler.handleCDPCommand("Target.getTargets", {}, undefined))?.result.targetInfos[0].url, url)
  await assert.rejects(handler.handleCDPCommand("Target.attachToTarget", { targetId: "personal-target" }, undefined), /not_authorized/)
  await assert.rejects(handler.handleCDPCommand("Browser.close", {}, undefined), /browser_close_forbidden/)
  await assert.rejects(handler.handleCDPCommand("Target.activateTarget", { targetId: "personal-target" }, undefined), /not_authorized/)
  assert.equal((await handler.handleCDPCommand("Target.closeTarget", { targetId: "personal-target" }, undefined))?.result.success, false)
  assert.equal(calls.filter(method => method === "chrome.debugger.attach").length, 1)
})

// 保护撤销/迟到配对的真实写入次序，以及公共凭据存储的持久性与文件权限。
test("revoke wins over pending pair and snapshots never expose credentials", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-extension-auth-"))
  const manager = new DailyChromeExtension(process.cwd(), directory, () => {}, "darwin", directory)
  let finish!: () => void
  const wait = new Promise<void>(resolve => { finish = resolve })
  ;(manager as unknown as { connect(): Promise<void> }).connect = () => wait
  try {
    const pair = manager.pair({ profileDirectory: "Default", token: "A".repeat(43) })
    const revoke = manager.revoke()
    finish(); await assert.rejects(pair, /授权操作已撤销/); await revoke
    assert.equal((await manager.snapshot()).paired, false)
    assert.equal((await manager.snapshot()).busy, false)
    assert.equal(await manager.endpoint(), undefined)
    await manager.pair({ profileDirectory: "Default", token: "A".repeat(43) })
    const restored = new DailyChromeExtension(process.cwd(), directory, () => {}, "darwin", directory)
    const snapshot = await restored.snapshot()
    assert.equal(snapshot.paired, true); assert.equal(snapshot.profileDirectory, "Default")
    assert.equal(JSON.stringify(snapshot).includes("A".repeat(43)), false)
    assert.equal((await stat(path.join(directory, "daily-chrome/auth.json"))).mode & 0o777, 0o600)
    restored.close()
  } finally { manager.close(); await rm(directory, { recursive: true, force: true }) }
})

// 保护公共 HTTP 凭据边界；坏 Origin/缺少 Fetch Metadata 都不能连接或保存授权。
test("authorization mutations require the workbench origin; GET returns public status only", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-extension-origin-"))
  const manager = new DailyChromeExtension(process.cwd(), directory, () => {}, "darwin", directory)
  let connected = 0
  ;(manager as unknown as { connect(): Promise<void> }).connect = async () => { connected++ }
  const app = Fastify()
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof DomainError ? error.status : 500)
    .send({ error: error instanceof Error ? error.message : "failed" }))
  mountDailyChromeExtension(app, manager, () => {})
  try {
    const headers = { host: "localhost:4173", origin: "http://localhost:4173", "sec-fetch-site": "same-origin" }
    const body = { profileDirectory: "Default", token: "A".repeat(43) }
    for (const bad of [{ ...headers, origin: "https://other.test" }, { host: headers.host, origin: headers.origin }]) {
      assert.equal((await app.inject({ method: "PUT", url: "/api/browser/daily-chrome", headers: bad, payload: body })).statusCode, 403)
    }
    assert.equal(connected, 0)
    assert.equal((await app.inject({ method: "PUT", url: "/api/browser/daily-chrome", headers, payload: body })).statusCode, 200)
    const status = await app.inject({ url: "/api/browser/daily-chrome", headers: { host: headers.host } })
    assert.equal(status.json().paired, true); assert.equal(status.body.includes(body.token), false)
    assert.equal((await app.inject({ method: "DELETE", url: "/api/browser/daily-chrome", headers })).statusCode, 200)
    assert.equal((await manager.snapshot()).paired, false)
  } finally { manager.close(); await app.close(); await rm(directory, { recursive: true, force: true }) }
})
