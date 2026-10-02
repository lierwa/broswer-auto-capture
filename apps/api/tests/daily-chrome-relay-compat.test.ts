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
import { CDPRelayServer } from "../../../vendor/daily-chrome-extension/cdpRelay.js"
import { ws } from "../../../vendor/daily-chrome-extension/wsServer.js"
import { once } from "node:events"

// WHY：真实首败在 CDP 请求派发前断开；旧 owner 必须能核验“未创建”，不能永久锁住复跑。
test("disconnected relay verifies an unstarted task but rejects new browser actions", async () => {
  const relay = new CDPRelayServer("chrome", undefined, undefined, undefined, { extensionId: "fixture" })
  await relay.start()
  const extension = new ws(relay.extensionEndpoint(), { origin: "chrome-extension://fixture" })
  try {
    await once(extension, "open")
    extension.send(JSON.stringify({ method: "extension.initialized", params: [] }))
    await relay.extensionReady()
    extension.close(); await once(extension, "close")
    await new Promise(resolve => setImmediate(resolve))
    const client = new ws(relay.cdpEndpoint())
    const closed = once(client, "close").then(() => { throw new Error("unstarted_owner_verification_rejected") })
    try {
      await once(client, "open")
      const version = once(client, "message")
      client.send(JSON.stringify({ id: 0, method: "Browser.getVersion", params: {} }))
      assert.equal(JSON.parse((await Promise.race([version, closed]))[0].toString()).result.protocolVersion, "1.3")
      const reply = once(client, "message")
      client.send(JSON.stringify({ id: 1, method: "Target.getTargets", params: {} }))
      const [data] = await Promise.race([reply, closed])
      assert.deepEqual(JSON.parse(data.toString()).result.targetInfos, [])
      const rejected = once(client, "message")
      client.send(JSON.stringify({ id: 2, method: "Target.createTarget", params: { url: "about:blank", newWindow: true } }))
      assert.equal(JSON.parse((await rejected)[0].toString()).error.message, "daily_chrome_extension_disconnected")
    } finally { void closed.catch(() => {}); client.close() }
  } finally { extension.close(); await relay.close() }
})

// 创建命令一旦发出，未知回执不能被离线空目标列表“证明”清理；这是复跑所需的所有权反例。
test("disconnected relay cannot verify a target creation whose acknowledgement was lost", async () => {
  const relay = new CDPRelayServer("chrome", undefined, undefined, undefined, { extensionId: "fixture" })
  await relay.start()
  const extension = new ws(relay.extensionEndpoint(), { origin: "chrome-extension://fixture" })
  let client: any, verifier: any
  try {
    await once(extension, "open")
    extension.send(JSON.stringify({ method: "extension.initialized", params: [] }))
    await relay.extensionReady()
    client = new ws(relay.cdpEndpoint()); await once(client, "open")
    const command = once(extension, "message")
    client.send(JSON.stringify({ id: 1, method: "Target.createTarget", params: { url: "about:blank", newWindow: true } }))
    assert.equal(JSON.parse((await command)[0].toString()).method, "chrome.tabs.create")
    const closed = once(client, "close")
    extension.close(); await closed
    verifier = new ws(relay.cdpEndpoint())
    const rejected = once(verifier, "close")
    await once(verifier, "open")
    await rejected
  } finally { verifier?.close(); client?.close(); extension.close(); await relay.close() }
})

// WHY：用户只批准一次 Allow；凭据来自已获准连接，不能要求粘贴或把单次连接冒充持久授权。
test("connection readiness attaches the original owned bootstrap before reporting connected", async () => {
  const relay = new CDPRelayServer("chrome", undefined, undefined, undefined,
    { extensionId: "fixture", token: "H".repeat(43) })
  ;(relay as any)._openConnectPageInBrowser = async () => {}
  await relay.start()
  const extension = new ws(relay.extensionEndpoint(), { origin: "chrome-extension://fixture" })
  const calls: string[] = []
  try {
    await once(extension, "open")
    extension.on("message", (data: Buffer) => {
      const command = JSON.parse(data.toString()); calls.push(command.method)
      extension.send(JSON.stringify({ id: command.id, result: command.method === "chrome.debugger.sendCommand"
        ? { targetInfo: { targetId: "bootstrap", type: "page", url: "about:blank" } } : {} }))
    })
    extension.send(JSON.stringify({ method: "chrome.tabs.onCreated", params: [{ id: 7, windowId: 9 }] }))
    extension.send(JSON.stringify({ method: "extension.initialized", params: [] }))
    await relay.establishExtensionConnection("B-A-T")
    assert.equal(calls.filter(method => method === "chrome.debugger.attach").length, 1)
    assert.ok(calls.includes("chrome.debugger.sendCommand"))
  } finally { extension.close(); await relay.close() }
})

test("first approval stores the original extension token without manual input", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-extension-first-approval-"))
  const manager = new DailyChromeExtension(process.cwd(), directory, () => {}, "darwin", directory)
  ;(manager as any).connect = async () => {
    ;(manager as any).relay = { authorizationToken: () => "B".repeat(43), isConnected: () => true, stop() {} }
  }
  try {
    await manager.pair({ profileDirectory: "Default" })
    const state = await manager.snapshot()
    assert.equal(state.paired, true); assert.equal(state.connected, true)
    assert.equal(JSON.stringify(state).includes("B".repeat(43)), false)
    const restored = new DailyChromeExtension(process.cwd(), directory, () => {}, "darwin", directory)
    assert.equal((await restored.snapshot()).paired, true)
    assert.equal((await restored.snapshot()).profileDirectory, "Default")
    assert.equal((await stat(path.join(directory, "daily-chrome/auth.json"))).mode & 0o777, 0o600)
    restored.close()
  } finally { manager.close(); await rm(directory, { recursive: true, force: true }) }
})

test("an initialized connection without a valid approval token cannot be saved", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-extension-missing-approval-"))
  const manager = new DailyChromeExtension(process.cwd(), directory, () => {}, "darwin", directory)
  ;(manager as any).connect = async () => {}
  try {
    await assert.rejects(manager.pair({ profileDirectory: "Default" }), /未收到扩展的持久授权/)
    assert.equal((await manager.snapshot()).paired, false)
  } finally { manager.close(); await rm(directory, { recursive: true, force: true }) }
})

// 真 WebSocket 边界：首次交接仅供宿主配置，不能被透传为 CDP 数据。
test("approval token travels only on the requested extension handshake", async () => {
  const relay = new CDPRelayServer("chrome", undefined, undefined, undefined,
    { extensionId: "fixture", requestAuthorization: true })
  await relay.start()
  const extension = new ws(relay.extensionEndpoint(), { origin: "chrome-extension://fixture" })
  try {
    await once(extension, "open")
    extension.send(JSON.stringify({ method: "extension.initialized", params: [{ token: "C".repeat(43) }] }))
    await relay.extensionReady()
    assert.equal(relay.authorizationToken(), "C".repeat(43))
    const client = new ws(relay.cdpEndpoint())
    try {
      await once(client, "open")
      const response = once(client, "message")
      client.send(JSON.stringify({ id: 1, method: "Target.getTargets", params: {} }))
      const [body] = await response
      assert.equal(body.toString().includes("C".repeat(43)), false)
      assert.deepEqual(JSON.parse(body.toString()).result.targetInfos, [])
    } finally { client.close() }
  } finally { extension.close(); await relay.close() }
})

test("unsolicited credentials and extension connections without Origin are rejected", async () => {
  for (const missingOrigin of [true, false]) {
    const relay = new CDPRelayServer("chrome", undefined, undefined, undefined, { extensionId: "fixture" })
    await relay.start()
    const extension = new ws(relay.extensionEndpoint(), missingOrigin ? {} : { origin: "chrome-extension://fixture" })
    try {
      const closed = once(extension, "close")
      await once(extension, "open")
      if (!missingOrigin) extension.send(JSON.stringify({ method: "extension.initialized", params: [{ token: "D".repeat(43) }] }))
      await closed
      assert.equal(relay.authorizationToken(), undefined)
    } finally { extension.close(); await relay.close() }
  }
})

test("malformed automatic credentials are rejected at the relay boundary", async () => {
  for (const params of [[{ token: "invalid" }], { token: "E".repeat(43) }]) {
    const relay = new CDPRelayServer("chrome", undefined, undefined, undefined,
      { extensionId: "fixture", requestAuthorization: true })
    await relay.start()
    const extension = new ws(relay.extensionEndpoint(), { origin: "chrome-extension://fixture" })
    try {
      await once(extension, "open")
      const closed = once(extension, "close")
      extension.send(JSON.stringify({ method: "extension.initialized", params }))
      await closed
      assert.equal(relay.authorizationToken(), undefined)
    } finally { extension.close(); await relay.close() }
  }
})

test("cancel wins over a late first approval and does not replace another profile", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-extension-cancel-first-"))
  const manager = new DailyChromeExtension(process.cwd(), directory, () => {}, "darwin", directory)
  let finish!: () => void
  const wait = new Promise<void>(resolve => { finish = resolve })
  ;(manager as any).connect = async () => {
    await wait
    ;(manager as any).relay = { authorizationToken: () => "F".repeat(43), isConnected: () => true, stop() {} }
  }
  try {
    const pending = manager.pair({ profileDirectory: "Default" })
    const revoke = manager.revoke()
    finish(); await assert.rejects(pending, /授权操作已撤销/); await revoke
    assert.equal((await manager.snapshot()).paired, false)
    await manager.pair({ profileDirectory: "Default" })
    await assert.rejects(manager.pair({ profileDirectory: "Profile 2" }), /先撤销原 Profile/)
    assert.equal((await manager.snapshot()).profileDirectory, "Default")
  } finally { manager.close(); await rm(directory, { recursive: true, force: true }) }
})

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
  const events: any[] = []
  let url = "about:blank", removed = false, removeFailure = true
  const handler = new ExtensionProtocolV2(async (method, params) => {
    calls.push(method)
    if (method === "chrome.tabs.remove") {
      assert.equal(params[0], 7)
      if (removeFailure) throw new Error("fixture_remove_failed")
      removed = true; return undefined
    }
    assert.equal(params[0].tabId, 7)
    if (method === "chrome.debugger.attach") return undefined
    assert.equal(params[1], "Target.getTargetInfo")
    if (removed) throw new Error("No tab with id: 7")
    return { targetInfo: { targetId: "owned-target", type: "page", url } }
  })
  handler.handleExtensionEvent("chrome.tabs.onCreated", [{ id: 7 }])
  handler.handleExtensionEvent("extension.initialized", [])
  await handler.ready()
  handler.connectOverCDP(event => events.push(event))
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
  // 保护真实 Chrome 的 remove ACK / onRemoved 事件间隙：仍须能枚举并核验已关闭目标。
  await assert.rejects(handler.handleCDPCommand("Target.closeTarget", { targetId: "owned-target" }, undefined), /fixture_remove_failed/)
  assert.equal((await handler.handleCDPCommand("Target.getTargets", {}, undefined))?.result.targetInfos.length, 1)
  removeFailure = false
  assert.equal((await handler.handleCDPCommand("Target.closeTarget", { targetId: "owned-target" }, undefined))?.result.success, true)
  assert.deepEqual((await handler.handleCDPCommand("Target.getTargets", {}, undefined))?.result.targetInfos, [])
  handler.handleExtensionEvent("chrome.tabs.onRemoved", [7])
  handler.handleExtensionEvent("chrome.debugger.onDetach", [{ tabId: 7 }, "target_closed"])
  assert.equal(events.filter(event => event.method === "Target.detachedFromTarget").length, 1)
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
  ;(manager as unknown as { connect(): Promise<void> }).connect = async () => {
    connected++
    ;(manager as any).relay = { authorizationToken: () => "G".repeat(43), isConnected: () => true,
      cdpEndpoint: () => "ws://127.0.0.1:1234/devtools/browser/fixture", stop() {} }
  }
  const app = Fastify()
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof DomainError ? error.status : 500)
    .send({ error: error instanceof Error ? error.message : "failed" }))
  mountDailyChromeExtension(app, manager, () => {})
  try {
    const headers = { host: "localhost:4173", origin: "http://localhost:4173", "sec-fetch-site": "same-origin" }
    const body = { profileDirectory: "Default", token: "A".repeat(43) }
    for (const bad of [{ ...headers, origin: "https://other.test" }, { host: headers.host, origin: headers.origin }]) {
      assert.equal((await app.inject({ method: "PUT", url: "/api/browser/daily-chrome", headers: bad, payload: body })).statusCode, 403)
      assert.equal((await app.inject({ method: "POST", url: "/api/browser/daily-chrome/authorize", headers: bad,
        payload: { profileDirectory: "Default" } })).statusCode, 403)
      assert.equal((await app.inject({ method: "POST", url: "/api/browser/daily-chrome/connect", headers: bad })).statusCode, 403)
    }
    assert.equal(connected, 0)
    assert.equal((await app.inject({ method: "PUT", url: "/api/browser/daily-chrome", headers, payload: body })).statusCode, 200)
    const status = await app.inject({ url: "/api/browser/daily-chrome", headers: { host: headers.host } })
    assert.equal(status.json().paired, true); assert.equal(status.body.includes(body.token), false)
    const automatic = await app.inject({ method: "POST", url: "/api/browser/daily-chrome/authorize", headers,
      payload: { profileDirectory: "Default" } })
    assert.equal(automatic.statusCode, 200); assert.equal(automatic.body.includes("G".repeat(43)), false)
    assert.equal((await app.inject({ method: "POST", url: "/api/browser/daily-chrome/connect", headers })).statusCode, 200)
    assert.equal((await app.inject({ method: "DELETE", url: "/api/browser/daily-chrome", headers })).statusCode, 200)
    assert.equal((await manager.snapshot()).paired, false)
  } finally { manager.close(); await app.close(); await rm(directory, { recursive: true, force: true }) }
})
