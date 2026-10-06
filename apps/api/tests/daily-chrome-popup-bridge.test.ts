import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "node:http"
import { once } from "node:events"
// WHY：Chrome 入口由原扩展构建和实机验证；Node 夹具动态加载，不把 Chrome 全局类型混入服务端。
const { PopupBridge } = await import(new URL("../../../vendor/daily-chrome-extension/extension/src/popupBridge.ts", import.meta.url).href)

async function fixture() {
  const tickets = new Map<string, unknown>()
  const server = createServer((request, response) => {
    const value = tickets.get(request.url!)
    if (!value) { response.writeHead(404).end(); return }
    if (request.method === "DELETE") { tickets.delete(request.url!); response.writeHead(204).end(); return }
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify(value))
  }).listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = (server.address() as { port: number }).port
  const original = (globalThis as any).chrome
  const settings: Record<string, unknown> = { "bat-auth-token": "T".repeat(43) }
  let listener: any, external: any, opened = 0, connected = 0, badge = "", disconnected = 0
  let gate: Promise<void> | undefined
  const declines: unknown[] = []
  ;(globalThis as any).chrome = {
    runtime: { id: "a".repeat(32), onMessageExternal: { addListener(value: unknown) { external = value } },
      onMessage: { addListener(value: unknown) { listener = value } } },
    storage: { local: { async get() { return settings }, async set(value: object) { Object.assign(settings, value) } } },
    action: { async openPopup() { opened++ }, async setBadgeBackgroundColor() {},
      async setBadgeText(value: { text: string }) { badge = value.text } },
  }
  server.on("request", request => { if (request.method === "DELETE") declines.push(request.headers["x-bat-decline-reason"]) })
  const create = () => new PopupBridge(async () => { await gate; connected++ }, () => [], () => { disconnected++ })
  const bridge = create()
  const ticket = (id: string, saved = false) => {
    tickets.set(`/popup/${id}`, { mcpRelayUrl: `ws://127.0.0.1:${port}/extension/${id}`,
      clientName: "Fixture", protocolVersion: 2, persistAuthorization: !saved,
      ...(saved ? { token: settings["bat-auth-token"] } : {}) })
    return { url: `http://127.0.0.1:${port}/popup/${id}`, profileName: "Fixture Chrome", profileDirectory: "Default", openPopup: !saved }
  }
  return { bridge, ticket, tickets, settings, declines, restart: create, setGate: (value: Promise<void>) => { gate = value },
    disconnected: () => disconnected, state: () => ({ opened, connected, badge }),
    message: (type: string, extra: object = {}) => new Promise<any>(resolve => listener({ type, ...extra }, {}, resolve)),
    external: (type: string, state: object, origin = "http://127.0.0.1:4173") =>
      new Promise<any>(resolve => external({ type, state }, { url: origin }, resolve)),
    async close() { (globalThis as any).chrome = original; await new Promise<void>(resolve => server.close(() => resolve())) } }
}

// WHY：宿主取消会使原私有 ticket 失效，扩展不能让它永远阻塞下一次用户授权。
test("workbench cancellation allows a fresh popup request; rejection never approves", async () => {
  const f = await fixture()
  try {
    await f.bridge.receive(f.ticket("aaaa"))
    f.tickets.delete("/popup/aaaa")
    await f.bridge.receive(f.ticket("bbbb"))
    assert.equal((await f.message("bat.getPopupStatus")).pending.profileName, "Fixture Chrome")
    assert.deepEqual(f.state(), { opened: 2, connected: 0, badge: "?" })
    assert.equal((await f.message("bat.reject")).success, true)
    assert.equal((await f.message("bat.getPopupStatus")).pending, null)
    assert.equal(f.state().connected, 0)
    assert.equal(f.tickets.has("/popup/bbbb"), false)
  } finally { await f.close() }
})

// WHY：权限确认来自明确动作；普通已授权重连只复用原 token，不再次展示授权。
test("first popup waits for approval and saved-token reconnect does not open a popup", async () => {
  const f = await fixture()
  try {
    await f.bridge.receive(f.ticket("aaaa"))
    assert.equal(f.state().connected, 0)
    assert.equal((await f.message("bat.setConnectionEnabled", { enabled: true })).success, true)
    assert.equal(f.state().connected, 1)
    await f.bridge.receive(f.ticket("bbbb", true))
    assert.equal(f.state().connected, 2)
    assert.equal(f.state().opened, 1)
    assert.equal((await f.message("bat.getPopupStatus")).pending, null)
  } finally { await f.close() }
})

// WHY：OFF 必须跨 worker 重启保留，票据接收和旧 token 迁移两条入口均不能重连。
test("persistent pause gates ordinary requests and token migration after worker restart", async () => {
  const f = await fixture()
  try {
    await f.bridge.receive(f.ticket("aaaa"))
    await f.message("bat.setConnectionEnabled", { enabled: true })
    await f.message("bat.setConnectionEnabled", { enabled: false })
    assert.equal(f.disconnected(), 1)
    assert.equal(f.settings["bat-authorized"], true)
    const restarted = f.restart()
    await restarted.receive(f.ticket("bbbb", true))
    await f.message("bat.syncToken", { token: f.settings["bat-auth-token"] })
    assert.equal(f.state().connected, 1)
    assert.equal(f.state().opened, 1)
    assert.equal(f.settings["bat-connection-enabled"], false)
    assert.deepEqual(f.declines, ["paused"])
  } finally { await f.close() }
})

test("explicit saved connection remains pending while paused and resumes with the same grant", async () => {
  const f = await fixture()
  try {
    f.settings["bat-connection-enabled"] = false
    const request = { ...f.ticket("aaaa", true), openPopup: true }
    // 手动打开扩展读取票据时不另弹浮窗，也不能把明确连接误当成普通自动任务拒绝。
    await f.message("bat.receiveRequest", { request })
    assert.equal((await f.message("bat.getPopupStatus")).pending.requiresAuthorization, false)
    await f.message("bat.syncToken", { token: f.settings["bat-auth-token"] })
    assert.equal(f.state().connected, 0)
    await f.message("bat.setConnectionEnabled", { enabled: true })
    assert.equal(f.state().connected, 1)
    assert.equal(f.state().opened, 0)
  } finally { await f.close() }
})

test("new authorization never inherits a previous enabled preference", async () => {
  const f = await fixture()
  try {
    f.settings["bat-connection-enabled"] = true
    f.settings["bat-authorized"] = true
    await f.bridge.receive(f.ticket("aaaa"))
    const status = await f.message("bat.getPopupStatus")
    assert.equal(status.enabled, false)
    assert.equal(status.authorized, false)
    assert.equal(f.state().connected, 0)
  } finally { await f.close() }
})

test("legacy matching token migrates enabled preference without another popup", async () => {
  const f = await fixture()
  try {
    await f.bridge.receive(f.ticket("aaaa", true))
    assert.equal(f.settings["bat-connection-enabled"], true)
    assert.equal(f.settings["bat-authorized"], true)
    assert.equal(f.state().connected, 1)
    assert.equal(f.state().opened, 0)
  } finally { await f.close() }
})

test("resume intent is claimed once and legacy workbench theme does not control popup appearance", async () => {
  const f = await fixture()
  const state = { paired: true, connected: false, busy: false, profileName: "Fixture", theme: "light" }
  try {
    f.settings["bat-theme"] = "dark"
    f.settings["bat-authorized"] = true
    f.settings["bat-workbench-origin"] = "http://127.0.0.1:4173"
    await f.message("bat.setConnectionEnabled", { enabled: true })
    assert.equal((await f.external("bat.syncWorkbench", state, "http://127.0.0.1:4999")).resumeRequested, undefined)
    const replies = await Promise.all([f.external("bat.syncWorkbench", state), f.external("bat.syncWorkbench", state)])
    assert.equal(replies.filter(value => value.resumeRequested).length, 1)
    assert.equal((await f.message("bat.getPopupStatus")).theme, undefined)
    assert.equal(f.settings["bat-theme"], "dark")
    assert.equal(f.state().connected, 0)
  } finally { await f.close() }
})

test("pause waits for a connecting owned session and disconnects it before completing", async () => {
  const f = await fixture()
  let finish!: () => void
  try {
    f.setGate(new Promise<void>(resolve => { finish = resolve }))
    await f.bridge.receive(f.ticket("aaaa"))
    const enabling = f.message("bat.setConnectionEnabled", { enabled: true })
    while (!(await f.message("bat.getPopupStatus")).connecting) await new Promise(resolve => setTimeout(resolve, 1))
    const pausing = f.message("bat.setConnectionEnabled", { enabled: false })
    finish()
    await Promise.all([enabling, pausing])
    assert.equal(f.disconnected(), 1)
    assert.equal(f.settings["bat-connection-enabled"], false)
    assert.equal((await f.message("bat.getPopupStatus")).connecting, false)
  } finally { finish?.(); await f.close() }
})

// WHY：旧版本凭据没有 bat-authorized 标记；用户直接开启应复用原 token，不能要求工作台再点一次。
test("legacy host grant allows explicit switch resume without a local authorization marker", async () => {
  const f = await fixture()
  const state = { paired: true, connected: false, busy: false, profileName: "Fixture", theme: "dark" }
  try {
    await f.message("bat.syncHost", { state })
    assert.equal((await f.message("bat.getPopupStatus")).authorized, false)
    const reply = await f.message("bat.setConnectionEnabled", { enabled: true })
    assert.equal(reply.success, true)
    assert.equal(f.settings["bat-authorized"], undefined)
    assert.equal((await f.external("bat.syncWorkbench", state)).resumeRequested, true)
    await f.bridge.receive(f.ticket("aaaa", true))
    assert.equal(f.state().connected, 1)
    assert.equal(f.state().opened, 0)
    assert.equal(f.settings["bat-authorized"], true)
  } finally { await f.close() }
})

test("host paired flag alone never authorizes a different Chrome token", async () => {
  const f = await fixture()
  try {
    await f.message("bat.syncHost", { state: { paired: true, connected: false, busy: false, profileName: "Fixture" } })
    assert.equal((await f.message("bat.setConnectionEnabled", { enabled: true })).success, true)
    const request = f.ticket("aaaa", true)
    f.settings["bat-auth-token"] = "X".repeat(43)
    await f.bridge.receive(request)
    const status = await f.message("bat.getPopupStatus")
    assert.equal(status.authorized, false)
    assert.equal(f.state().connected, 0)
    assert.match(status.error, /授权不匹配/)
  } finally { await f.close() }
})
