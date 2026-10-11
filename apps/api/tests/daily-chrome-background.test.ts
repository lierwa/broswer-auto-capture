import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import Fastify from "fastify"
import WS from "ws"
import { ProviderCredentialStore } from "@agent-platform/ai-connect/integration/credentials/provider-credential-store"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { mountDailyChromeBackground } from "../src/browser/daily-extension-background.js"
import { CDPRelayServer } from "../../../vendor/daily-chrome-extension/cdpRelay.js"

const extensionRoot = new URL("../../../vendor/daily-chrome-extension/extension/src/", import.meta.url)
const { BackgroundConnection } = await import(new URL("backgroundConnection.ts", extensionRoot).href)
const { RelayConnection } = await import(new URL("relayConnection.ts", extensionRoot).href)
const token = "T".repeat(43)
async function waitFor(predicate: () => boolean | Promise<boolean>) {
  const end = Date.now() + 8000
  while (!await predicate()) { assert.ok(Date.now() < end, "condition_timeout"); await new Promise(r => setTimeout(r, 20)) }
}
function event() {
  const listeners = new Set<(...args: any[]) => void>()
  return { addListener: (listener: (...args: any[]) => void) => listeners.add(listener),
    removeListener: (listener: (...args: any[]) => void) => listeners.delete(listener),
    emit: (...args: any[]) => { for (const listener of listeners) listener(...args) } }
}

async function fixture(saved = true) {
  const base = path.resolve("work"), directory = await mkdtemp(path.join(base, "bat-background-test-"))
  const credentials = new ProviderCredentialStore({ path: path.join(directory, "daily-chrome/auth.json") })
  if (saved) await credentials.set("daily-chrome", { type: "api", key: token, env: { PROFILE_DIRECTORY: "Default" } })
  let port = 0, wakeups = 0, active: any, background: any, sockets = 0
  const make = async () => {
    const manager = new DailyChromeExtension(process.cwd(), directory, () => {})
    manager.profiles = async () => [{ id: "Default", name: "Fixture" }]
    ;(manager as any).createRelay = async (_profile: string, savedToken?: string) => new CDPRelayServer("chrome", undefined,
      undefined, "Default", { extensionId: await manager.extensionIdentity(), ...(savedToken ? { token: savedToken } : {}),
        requestBackground: () => { wakeups++ } })
    const app = Fastify(), closeBackground = await mountDailyChromeBackground(app, manager)
    app.addHook("preClose", async () => { manager.close(); await closeBackground() })
    await app.listen({ host: "127.0.0.1", port }); port = (app.server.address() as { port: number }).port
    return { manager, app }
  }
  let host = await make()
  const settings: Record<string, unknown> = { "bat-auth-token": token, "bat-authorized": true,
    "bat-connection-enabled": true, "bat-workbench-origin": `http://127.0.0.1:${port}` }
  const originalChrome = (globalThis as any).chrome, originalSocket = globalThis.WebSocket
  const changes = event(), startup = event(), noTab = async () => { throw Error("unexpected_tab_creation") }
  const storage = { get: async () => ({ ...settings }), set: async (patch: Record<string, unknown>) => {
    const changed = Object.fromEntries(Object.entries(patch).map(([key, newValue]) => [key, { oldValue: settings[key], newValue }]))
    Object.assign(settings, patch); changes.emit(changed, "local")
  } }
  ;(globalThis as any).chrome = { runtime: { onStartup: startup }, storage: { local: storage, onChanged: changes },
    alarms: { create() {}, clear: async () => true, onAlarm: event() },
    debugger: { onEvent: event(), onDetach: event(), detach: async () => {} },
    tabs: { onCreated: event(), onRemoved: event(), create: noTab }, windows: { create: noTab } }
  const origin = `chrome-extension://${await host.manager.extensionIdentity()}`
  ;(globalThis as any).WebSocket = class extends WS {
    constructor(url: string) { super(url, { origin }); sockets++ }
  }
  const start = () => {
    background = new BackgroundConnection(() => Boolean(active), async (socket: WebSocket) => {
      const relay = new RelayConnection(socket); active = relay
      relay.onclose = () => { if (active === relay) active = undefined; background.wake() }
      relay.didInitialize()
    })
  }
  start()
  return { settings, storage, credentials, origin, url: `ws://127.0.0.1:${port}/api/browser/daily-chrome/connection`,
    manager: () => host.manager, sockets: () => sockets, wakeups: () => wakeups,
    async restartHost() { await host.app.close(); host = await make() },
    async restartWorker() { background.dispose(); active?.close("worker stopped"); await waitFor(() => !active); start() },
    async close() {
      background.dispose(); active?.close("fixture complete"); await host.app.close()
      ;(globalThis as any).chrome = originalChrome; globalThis.WebSocket = originalSocket
      assert.equal(path.dirname(directory), base); await rm(directory, { recursive: true })
    } }
}

// WHY：真实后台socket进入真实Playwright relay，任何创建tab/window都会令测试失败。
test("后台连接、断线与宿主重启复连均不创建tab，暂停跨worker重启保留", async () => {
  const f = await fixture()
  try {
    await waitFor(async () => (await f.manager().snapshot()).connected)
    await f.manager().endpoint()
    assert.equal(f.sockets(), 1)
    await f.manager().disconnect()
    await waitFor(async () => f.sockets() === 2 && (await f.manager().snapshot()).connected)
    await f.storage.set({ "bat-connection-enabled": false })
    await waitFor(async () => !(await f.manager().snapshot()).connected)
    const before = f.sockets(); await f.restartWorker()
    await new Promise(r => setTimeout(r, 1200)); assert.equal(f.sockets(), before)
    await f.storage.set({ "bat-connection-enabled": true })
    await waitFor(async () => (await f.manager().snapshot()).connected)
    await f.restartHost()
    await waitFor(async () => (await f.manager().snapshot()).connected)
    await f.manager().endpoint()
    assert.ok(f.wakeups() >= 4)
  } finally { await f.close() }
})

// WHY：扩展持有的旧token不是新授权；无授权/撤销后不能通过后台握手重新配对。
test("无保存授权拒绝后台连接且停止重连", async () => {
  const f = await fixture(false)
  try {
    await waitFor(() => f.settings["bat-connection-enabled"] === false)
    assert.equal((await f.manager().snapshot()).paired, false)
    const before = f.sockets(); await new Promise(r => setTimeout(r, 1200))
    assert.equal(f.sockets(), before); assert.equal(f.wakeups(), 0)
  } finally { await f.close() }
})

// WHY：新WS入口不能削弱Origin/消息/token边界，撤销后的自动重连也不能重新授权。
test("错误Origin、格式和token被拒绝，撤销即时断开并停止后台重连", async () => {
  const f = await fixture()
  try {
    await waitFor(async () => (await f.manager().snapshot()).connected)
    const rejected = new WS(f.url, { origin: "http://127.0.0.1:4173" })
    rejected.on("error", () => {})
    const status = await new Promise<number | undefined>(resolve => rejected.once("unexpected-response", (_request, response) => {
      const code = response.statusCode; response.resume(); rejected.terminate(); resolve(code)
    }))
    assert.equal(status, 403)
    for (const message of ["{", JSON.stringify({ event: "bat.authenticate", payload: { token: "X".repeat(43) } })]) {
      const client = new WS(f.url, { origin: f.origin }); client.on("error", () => {})
      await new Promise<void>(resolve => client.once("open", resolve)); client.send(message)
      const code = await new Promise<number>(resolve => client.once("close", resolve))
      assert.equal(code, 1008)
    }
    assert.equal((await f.manager().snapshot()).connected, true)
    await f.manager().revoke()
    await waitFor(() => f.settings["bat-connection-enabled"] === false)
    assert.equal((await f.manager().snapshot()).paired, false)
    const before = f.sockets(); await new Promise(r => setTimeout(r, 1200)); assert.equal(f.sockets(), before)
  } finally { await f.close() }
})
