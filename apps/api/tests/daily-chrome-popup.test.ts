import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { once } from "node:events"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { ws } from "../../../vendor/daily-chrome-extension/wsServer.js"

const token = "P".repeat(43)
type Request = { url: string; extensionId: string; openPopup: boolean }
function manager(directory: string) {
  const current = new DailyChromeExtension(process.cwd(), directory, () => {})
  current.profiles = async () => [{ id: "Default", name: "Fixture Chrome" }]
  return current
}
async function request(current: DailyChromeExtension): Promise<Request> {
  for (let count = 0; count < 100; count++) {
    const state = await current.snapshot()
    if (state.popupRequest) return state.popupRequest
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error("popup_request_missing")
}
function headers(current: Request) {
  return { "x-bat-extension": current.extensionId, origin: `chrome-extension://${current.extensionId}` }
}
async function handshake(current: Request, first: boolean) {
  const configuration = await fetch(current.url, { headers: headers(current) }).then(response => response.json())
  const socket = new ws(configuration.mcpRelayUrl, { origin: `chrome-extension://${current.extensionId}` })
  await once(socket, "open")
  socket.on("message", (data: Buffer) => {
    const command = JSON.parse(data.toString())
    socket.send(JSON.stringify({ id: command.id, result: command.method === "chrome.debugger.sendCommand"
      ? { targetInfo: { targetId: "fixture-bootstrap", type: "page", url: "about:blank" } } : {} }))
  })
  socket.send(JSON.stringify({ method: "chrome.tabs.onCreated", params: [{ id: 7, windowId: 9 }] }))
  socket.send(JSON.stringify({ method: "extension.initialized", params: first ? [{ token }] : [] }))
  return { socket, configuration }
}

// WHY：取消必须真实结束原待批准握手；公开状态及非扩展 HTTP 读取不能带出原 token。
test("native popup rejection ends first authorization without saving a credential", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-popup-reject-"))
  const current = manager(directory)
  const operation = current.pair({ profileDirectory: "Default" }).then(() => null, error => error)
  try {
    const pending = await request(current)
    assert.equal(pending.openPopup, true)
    assert.equal((await fetch(pending.url)).status, 404)
    assert.equal((await fetch(pending.url, { headers: { ...headers(pending), origin: "http://127.0.0.1:4173" } })).status, 404)
    const rejected = await fetch(pending.url, { method: "DELETE", headers: headers(pending) })
    assert.equal(rejected.status, 204)
    assert.match((await operation).message, /已拒绝本次授权/)
    const state = await current.snapshot()
    assert.equal(state.paired, false); assert.equal(state.connected, false); assert.equal(state.busy, false)
    assert.equal(state.popupRequest, null)
    assert.equal(JSON.stringify(state).includes(token), false)
  } finally {
    current.close(); await operation
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
    await rm(directory, { recursive: true, force: true })
  }
})

// WHY：浮窗只更换入口，握手/保存/服务重启后的 token 复用仍是原协议，不按任务重新批准。
test("popup handshake saves the original token and restores it without another authorization popup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-popup-persist-"))
  let current = manager(directory), socket: any
  try {
    const operation = current.pair({ profileDirectory: "Default" }); void operation.catch(() => {})
    const pending = await request(current)
    const first = await handshake(pending, true); socket = first.socket
    assert.equal(first.configuration.persistAuthorization, true)
    assert.equal(first.configuration.token, undefined)
    await operation
    assert.equal((await current.snapshot()).paired, true)
    assert.equal(JSON.stringify(await current.snapshot()).includes(token), false)
    await current.disconnect(); socket.close()
    const paused = current.endpoint().then(() => null, error => error)
    const pausedRequest = await request(current)
    await fetch(pausedRequest.url, { method: "DELETE", headers: { ...headers(pausedRequest), "x-bat-decline-reason": "paused" } })
    assert.equal((await paused).code, "daily_chrome_connection_paused")
    assert.equal((await current.snapshot()).paired, true)
    assert.equal((await current.snapshot()).busy, false)
    current = manager(directory)
    const restored = current.endpoint(); void restored.catch(() => {})
    const reconnect = await request(current)
    assert.equal(reconnect.openPopup, false)
    assert.equal(JSON.stringify(reconnect).includes(token), false)
    const saved = await handshake(reconnect, false); socket = saved.socket
    assert.equal(saved.configuration.token, token)
    assert.equal(saved.configuration.persistAuthorization, false)
    assert.ok((await restored)?.startsWith("ws://127.0.0.1:"))
    assert.equal((await current.snapshot()).paired, true)
    assert.equal((await current.snapshot()).popupRequest, null)
  } finally {
    socket?.close(); await current.disconnect()
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep))
    await rm(directory, { recursive: true, force: true })
  }
})
