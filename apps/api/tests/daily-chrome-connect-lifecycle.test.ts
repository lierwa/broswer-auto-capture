import assert from "node:assert/strict"
import { test } from "node:test"

// WHY：连接页不应承担常驻保活；清理只能关闭本次握手页，不能退出冷启动浏览器或关闭用户导航后的页。
test("successful handshake closes only its page and keeps the worker alive until disconnect", async (t) => {
  const moduleUrl = new URL("../../../vendor/daily-chrome-extension/extension/src/relayConnection.ts", import.meta.url).href
  const { RelayConnection } = await import(moduleUrl)
  const previous = (globalThis as any).chrome
  const event = { addListener() {}, removeListener() {} }
  let tabs = [{ id: 1, url: "chrome-extension://fixture/connect.html?private=omitted" }]
  const removed: number[] = [], messages: any[] = []
  ;(globalThis as any).chrome = {
    runtime: { getURL: (path: string) => "chrome-extension://fixture/" + path },
    debugger: { onEvent: event, onDetach: event },
    tabs: { onCreated: event, onRemoved: event, query: async () => tabs,
      get: async (id: number) => tabs.find(tab => tab.id === id),
      remove: async (id: number) => { removed.push(id); tabs = tabs.filter(tab => tab.id !== id) } },
    windows: { create: async () => { const tab = { id: 2, url: "about:blank", windowId: 2 }; tabs.push(tab); return { tabs: [tab] } } },
  }
  t.mock.timers.enable({ apis: ["setInterval"] })
  const socket: any = { readyState: WebSocket.OPEN, send: (raw: string) => messages.push(JSON.parse(raw)), close() {} }
  const relay = new RelayConnection(socket)
  try {
    relay.didInitialize()
    await relay.releaseConnectPage(1)
    assert.deepEqual(removed, [], "last Chrome page must survive until a task page exists")
    socket.onmessage({ data: JSON.stringify({ id: 1, method: "chrome.tabs.create", params: [{}] }) })
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(removed, [1])
    assert.equal(messages.find(message => message.id === 1)?.result.id, 2)
    t.mock.timers.tick(40_000)
    assert.equal(messages.filter(message => message.method === "extension.keepalive").length, 2)
    relay.close("finished")
    t.mock.timers.tick(40_000)
    assert.equal(messages.filter(message => message.method === "extension.keepalive").length, 2)
  } finally { relay.close("fixture"); t.mock.timers.reset(); (globalThis as any).chrome = previous }
})

test("an existing user page permits immediate handshake cleanup but a navigated handshake is protected", async () => {
  const moduleUrl = new URL("../../../vendor/daily-chrome-extension/extension/src/relayConnection.ts", import.meta.url).href
  const { RelayConnection } = await import(moduleUrl)
  const previous = (globalThis as any).chrome, removed: number[] = []
  const event = { addListener() {}, removeListener() {} }
  let url = "chrome-extension://fixture/connect.html?private=omitted"
  ;(globalThis as any).chrome = {
    runtime: { getURL: (path: string) => "chrome-extension://fixture/" + path },
    debugger: { onEvent: event, onDetach: event },
    tabs: { onCreated: event, onRemoved: event, query: async () => [{ id: 1 }, { id: 9 }],
      get: async () => ({ id: 1, url }), remove: async (id: number) => removed.push(id) },
  }
  const relay = new RelayConnection({ readyState: WebSocket.OPEN, send() {}, close() {} })
  try {
    await relay.releaseConnectPage(1)
    assert.deepEqual(removed, [1])
    url = "https://personal.invalid/"
    await relay.releaseConnectPage(1)
    assert.deepEqual(removed, [1])
  } finally { relay.close("fixture"); (globalThis as any).chrome = previous }
})
