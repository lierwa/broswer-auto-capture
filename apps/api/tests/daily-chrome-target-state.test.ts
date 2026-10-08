import assert from "node:assert/strict"
import { test } from "node:test"
import { ExtensionProtocolV2 } from "../../../vendor/daily-chrome-extension/cdpRelayV2.js"
import { CDPOwnerScopes } from "../../../vendor/daily-chrome-extension/cdpOwnerScopes.js"

// WHY：B-U 的 DOM 入口消费 Target 事件缓存；查询成功却未同步会让页面一直被视为 about:blank。
test("daily target queries update SDK facts without reattaching or crossing owners", async () => {
  const calls: string[] = [], ownEvents: any[] = [], otherEvents: any[] = []
  let url = "about:blank", title = "", wrongIdentity = false, failedQuery = false
  const handler = new ExtensionProtocolV2(async (method, params) => {
    calls.push(method)
    assert.equal(params[0].tabId, 7)
    if (method === "chrome.debugger.attach") return undefined
    assert.equal(method, "chrome.debugger.sendCommand")
    assert.equal(params[1], "Target.getTargetInfo")
    if (failedQuery) throw Error("fixture_query_failed")
    return { targetInfo: { targetId: wrongIdentity ? "personal-target" : "owned-target", type: "page", url, title } }
  })
  handler.handleExtensionEvent("chrome.tabs.onCreated", [{ id: 7 }])
  handler.handleExtensionEvent("extension.initialized", [])
  await handler.ready()
  const scopes = new CDPOwnerScopes()
  const owner = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002"
  scopes.register(owner, ["owned-target"]); scopes.register(other, ["personal-target"])
  scopes.connect({ readyState: 1, send: (line: string) => ownEvents.push(JSON.parse(line)) }, owner)
  scopes.connect({ readyState: 1, send: (line: string) => otherEvents.push(JSON.parse(line)) }, other)
  handler.connectOverCDP(event => scopes.event(event))
  await handler.handleCDPCommand("Target.setDiscoverTargets", { discover: true }, undefined)
  const query = () => handler.handleCDPCommand("Target.getTargetInfo", { targetId: "owned-target" }, undefined)
  const changes = () => ownEvents.filter(event => event.method === "Target.targetInfoChanged")
  assert.equal(ownEvents[0].params.targetInfo.url, "about:blank")
  url = "https://fixture.test/updated"
  assert.equal((await query())?.result.targetInfo.url, url)
  assert.equal(changes().at(-1)?.params.targetInfo.url, url)
  await handler.handleCDPCommand("Target.getTargets", {}, undefined)
  assert.equal(changes().length, 1, "unchanged facts must not duplicate notifications")
  title = "Updated fixture"
  await query()
  assert.equal(changes().at(-1)?.params.targetInfo.title, title)
  assert.equal(changes().length, 2)
  assert.equal(otherEvents.length, 0, "another owner must not receive target facts")
  wrongIdentity = true
  await assert.rejects(query(), /target_identity_changed/)
  assert.equal(changes().length, 2)
  wrongIdentity = false; failedQuery = true
  await assert.rejects(query(), /fixture_query_failed/)
  assert.equal(changes().length, 2, "failed native queries must preserve the last known facts")
  failedQuery = false
  await query()
  assert.equal(changes().length, 2)
  assert.equal(calls.filter(method => method === "chrome.debugger.attach").length, 1)
})
