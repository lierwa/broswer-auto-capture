import assert from "node:assert/strict"
import test from "node:test"
import { once } from "node:events"
import { randomUUID } from "node:crypto"
import { ws } from "../../../vendor/daily-chrome-extension/wsServer.js"
import { CDPRelayServer } from "../../../vendor/daily-chrome-extension/cdpRelay.js"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

// WHY：实际 WS + 原 BrowserModel，保护请求 ID 碰撞、事件隔离及单客户端退出后的另一个会话。
test("原 relay 的两个 owner 客户端同时创建目标，响应/目标隔离且独立退出", async () => {
  const relay = new CDPRelayServer("chrome", undefined, undefined, undefined, { extensionId: "fixture" })
  await relay.start()
  const extension = new ws(relay.extensionEndpoint(), { origin: "chrome-extension://fixture" })
  let nextTab = 0
  const tabs = new Map<number, string>()
  await once(extension, "open")
  extension.on("message", (raw: Buffer) => {
    const { id, method, params } = JSON.parse(raw.toString())
    let result: unknown = {}
    if (method === "chrome.tabs.create") { const tab = ++nextTab; tabs.set(tab, `target-${tab}`); result = { id: tab, windowId: tab, url: "about:blank" } }
    if (method === "chrome.debugger.sendCommand" && params[1] === "Target.getTargetInfo") {
      result = { targetInfo: { targetId: tabs.get(params[0].tabId), type: "page", title: "fixture", url: "about:blank" } }
    }
    if (method === "chrome.tabs.remove") tabs.delete(params[0])
    extension.send(JSON.stringify({ id, result }))
  })
  extension.send(JSON.stringify({ method: "extension.initialized", params: [] }))
  await relay.extensionReady()
  const ownerA = randomUUID(), ownerB = randomUUID()
  const a = new ws(relay.cdpEndpoint(ownerA)), b = new ws(relay.cdpEndpoint(ownerB))
  let reconnected: typeof a | undefined
  await Promise.all([once(a, "open"), once(b, "open")])
  function request(client: typeof a, id: number, method: string, params: unknown = {}) {
    return new Promise<any>(resolve => {
      const listener = (raw: Buffer) => { const response = JSON.parse(raw.toString()); if (response.id === id) { client.off("message", listener); resolve(response) } }
      client.on("message", listener); client.send(JSON.stringify({ id, method, params }))
    })
  }
  try {
    await Promise.all([request(a, 0, "Target.setAutoAttach", { autoAttach: true }), request(b, 0, "Target.setAutoAttach", { autoAttach: true })])
    const [ra, rb] = await Promise.all([request(a, 1, "Target.createTarget", { url: "about:blank" }), request(b, 1, "Target.createTarget", { url: "about:blank" })])
    assert.ok(ra.result?.targetId); assert.ok(rb.result?.targetId); assert.notEqual(ra.result.targetId, rb.result.targetId)
    const [ta, tb] = await Promise.all([request(a, 2, "Target.getTargets"), request(b, 2, "Target.getTargets")])
    assert.deepEqual(ta.result.targetInfos.map((t: any) => t.targetId), [ra.result.targetId])
    assert.deepEqual(tb.result.targetInfos.map((t: any) => t.targetId), [rb.result.targetId])
    // 保护真实首败：Playwright 无 target 握手只能解析本 owner，不能读取全局首 tab。
    const [infoA, infoB] = await Promise.all([request(a, 21, "Target.getTargetInfo"), request(b, 21, "Target.getTargetInfo")])
    assert.equal(infoA.result.targetInfo.targetId, ra.result.targetId)
    assert.equal(infoB.result.targetInfo.targetId, rb.result.targetId)
    assert.match((await request(a, 22, "Target.getTargetInfo", { targetId: rb.result.targetId })).error.message, /not_authorized/)
    assert.match((await request(a, 23, "Target.closeTarget")).error.message, /target_required/)
    assert.match((await request(a, 3, "Target.closeTarget", { targetId: rb.result.targetId })).error.message, /not_authorized/)
    a.close(); await once(a, "close")
    const remaining = await request(b, 4, "Target.getTargets")
    assert.equal(remaining.result.targetInfos[0].targetId, rb.result.targetId)
    assert.equal(relay.isConnected(), true)
    const notifications: any[] = [], foreignNotifications: any[] = []
    b.on("message", (raw: Buffer) => { const value = JSON.parse(raw.toString()); if (value.method) foreignNotifications.push(value) })
    reconnected = new ws(relay.cdpEndpoint(ownerA))
    reconnected.on("message", (raw: Buffer) => { const value = JSON.parse(raw.toString()); if (value.method) notifications.push(value) })
    await once(reconnected, "open")
    await request(reconnected, 5, "Target.setAutoAttach", { autoAttach: true })
    assert.deepEqual(notifications.filter(e => e.method === "Target.attachedToTarget").map(e => e.params.targetInfo.targetId), [ra.result.targetId])
    assert.equal(foreignNotifications.length, 0, "重连不得重发其他 owner 的通知")
    const second = await request(reconnected, 6, "Target.createTarget", { url: "about:blank" })
    await request(reconnected, 7, "Target.closeTarget", { targetId: ra.result.targetId })
    const current = await request(reconnected, 8, "Target.getTargetInfo")
    assert.equal(current.result.targetInfo.targetId, second.result.targetId, "历史首目标已关闭时选择本 owner 当前活目标")
  } finally { reconnected?.close(); a.close(); b.close(); extension.close(); await relay.close() }
})

test("冷启动两个任务复用一次 relay 连接；授权修改仍互斥", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-shared-relay-connect-"))
  const manager = new DailyChromeExtension(process.cwd(), directory, () => {})
  let release!: () => void, started!: () => void, calls = 0
  const gate = new Promise<void>(resolve => { release = resolve }), beginning = new Promise<void>(resolve => { started = resolve })
  const internal = manager as unknown as { credentials: { get(): Promise<unknown> }; relay: unknown; connect(): Promise<string> }
  internal.credentials.get = async () => ({ type: "api", key: "synthetic", env: { PROFILE_DIRECTORY: "Default" } })
  internal.connect = async () => { calls++; started(); await gate
    internal.relay = { isConnected: () => true, cdpEndpoint: () => "ws://127.0.0.1:12345/devtools/browser/synthetic", stop() {} }
    return "ws://127.0.0.1:12345/devtools/browser/synthetic"
  }
  try {
    const a = manager.endpoint(false, randomUUID()); await beginning
    assert.doesNotThrow(() => manager.assertStable(true)); assert.throws(() => manager.assertStable(), /授权正在处理中/)
    const b = manager.endpoint(false, randomUUID()); release()
    const result = await Promise.all([a, b]); assert.equal(calls, 1); assert(result.every(Boolean))
  } finally { release(); manager.close(); await rm(directory, { recursive: true, force: true }) }
})
