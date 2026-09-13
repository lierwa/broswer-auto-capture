import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { BrowserSession, type BrowserGrant } from "../src/index.js"

test("扩展命令只生成 BrowserSkill 已声明参数，并始终绑定当前 session/tab", async () => {
  const calls: { name: string; args: string[] }[] = []
  let tabs = [{ tab_id: 1, active: true, scope: "agent" as const, url: "https://example.com/page" }]
  const grant: BrowserGrant = { taskId: "task", runId: randomUUID(), requirementVersion: 1, purpose: "replay",
    allowedOrigins: ["https://example.com"], actions: ["observe", "hover", "press", "select", "upload", "download",
      "tabs", "tab_open", "tab_select", "tab_close"], maxCommands: 100, timeoutMs: 10_000 }
  const session = new BrowserSession(grant, "abcd", async (name, args) => {
    calls.push({ name, args: [...args] })
    if (name === "tab_list") return { tabs }
    if (name === "observe") return { tab_id: tabs.find((tab) => tab.active)!.tab_id, text: '@e1 button "菜单"', truncated: false }
    if (name === "tab_create") {
      tabs = tabs.map((tab) => ({ ...tab, active: false }))
      tabs.push({ tab_id: 2, active: true, scope: "agent", url: "https://example.com/new" })
      return { tab_id: 2 }
    }
    if (name === "tab_select") tabs = tabs.map((tab) => ({ ...tab, active: tab.tab_id === Number(args[2]) }))
    if (name === "tab_close") {
      tabs = tabs.filter((tab) => tab.tab_id !== Number(args[2]))
      if (!tabs.some((tab) => tab.active) && tabs[0]) tabs[0].active = true
    }
    return { tab_id: tabs.find((tab) => tab.active)?.tab_id }
  })
  try {
    await session.command({ type: "select", target: { selector: "#choice" }, values: ["a", "b"] })
    await session.command({ type: "hover", target: { role: "button", name: "菜单" } })
    await session.command({ type: "press", target: { role: "button", name: "菜单" }, key: "Enter" })
    await session.command({ type: "upload", target: { selector: "#file" }, files: ["D:\\tmp\\fixture.txt"], mode: "input" })
    await session.command({ type: "download", out: "D:\\tmp\\result.bin", overwrite: false })
    assert.deepEqual(JSON.parse((await session.command({ type: "tabs" }))!), [{ tabId: 1, url: "https://example.com/page", active: true }])
    assert.deepEqual(JSON.parse((await session.command({ type: "tab_open", url: "https://example.com/new", background: false }))!),
      { tabId: 2, url: "https://example.com/new", active: true })
    await session.command({ type: "tab_select", tabId: 1 })
    await session.command({ type: "tab_close", tabId: 2 })
  } finally { await session.close() }

  assert.ok(calls.some((call) => call.name === "select" && call.args.join(" ")
    === "select --selector #choice --value a --value b --session abcd --tab-id 1"))
  assert.ok(calls.some((call) => call.name === "press" && call.args.join(" ")
    === "press Enter --ref @e1 --session abcd --tab-id 1"))
  assert.ok(calls.some((call) => call.name === "upload" && call.args.join(" ")
    === "upload --selector #file --file D:\\tmp\\fixture.txt --mode input --session abcd --tab-id 1"))
  assert.ok(calls.some((call) => call.name === "download" && call.args.join(" ")
    === "download --out D:\\tmp\\result.bin --session abcd --tab-id 1"))
  assert.ok(calls.some((call) => call.name === "tab_create" && call.args.join(" ")
    === "tab create --session abcd --url https://example.com/new"))
})

test("普通点击无效果后可对已确认语义目标执行一次受控 DOM 激活", async () => {
  const calls: { name: string; args: string[] }[] = []
  let url = "https://example.com/form"
  const grant: BrowserGrant = { taskId: "task", runId: randomUUID(), requirementVersion: 1, purpose: "exploration",
    allowedOrigins: ["https://example.com"], actions: ["click"], maxCommands: 20, timeoutMs: 10_000 }
  const session = new BrowserSession(grant, "abcd", async (name, args) => {
    calls.push({ name, args: [...args] })
    if (name === "tab_list") return { tabs: [{ tab_id: 1, active: true, scope: "agent", url }] }
    if (name === "observe") return { tab_id: 1, text: '@e1 button "搜索"', truncated: false }
    if (name === "evaluate") {
      url = "https://example.com/results?q=test"
      return { ok: true, tab_id: 1, value: { found: true, activated: true, ambiguous: false } }
    }
    if (name === "wait_for_navigation") return { tab_id: 1 }
    if (name === "network") return { tab_id: 1, entries: [], next_since: 1 }
    throw new Error(`unexpected:${name}`)
  })
  try { await session.command({ type: "click", target: { role: "button", name: "搜索" }, dispatch: "dom" }) }
  finally { await session.close() }
  const activation = calls.find((call) => call.name === "evaluate")
  assert.ok(activation)
  assert.equal(activation.args[0], "evaluate")
  assert.match(activation.args[1]!, /"role":"button","name":"搜索"/)
  assert.match(activation.args[1]!, /requestSubmit/)
  assert.deepEqual(activation.args.slice(-4), ["--session", "abcd", "--tab-id", "1"])
})

test("用户动作回包后异步跨域由紧邻观察接续，不使用固定等待", async () => {
  const calls: string[] = []
  let url = "https://example.com/", clicked = false, postClickTabLists = 0
  const grant: BrowserGrant = { taskId: "task", runId: randomUUID(), requirementVersion: 1, purpose: "replay",
    allowedOrigins: ["https://example.com"], actions: ["click", "observe"], maxCommands: 30, timeoutMs: 10_000 }
  const session = new BrowserSession(grant, "abcd", async (name) => {
    calls.push(name)
    if (name === "tab_list") {
      if (clicked && postClickTabLists++ > 0) url = "https://search.example/results?q=test"
      return { tabs: [{ tab_id: 1, active: true, scope: "agent", url }] }
    }
    if (name === "observe") return { tab_id: 1, text: '@e1 button "搜索"', truncated: false }
    if (name === "click") { clicked = true; return { tab_id: 1 } }
    if (name === "network") return { tab_id: 1, entries: [], next_since: 1 }
    throw new Error(`unexpected:${name}`)
  })
  try {
    await session.command({ type: "click", target: { role: "button", name: "搜索" } })
    assert.equal(url, "https://example.com/")
    await session.command({ type: "observe" })
    assert.equal(url, "https://search.example/results?q=test")
    assert.ok(calls.includes("network"))
  } finally { await session.close() }
})

test("授权页面点击打开的新活动标签成为唯一实际落点", async () => {
  let tabs = [{ tab_id: 1, active: true, scope: "agent" as const, url: "https://search.example/results" }]
  const grant: BrowserGrant = { taskId: "task", runId: randomUUID(), requirementVersion: 1, purpose: "replay",
    allowedOrigins: ["https://search.example"], actions: ["click", "observe", "navigate"], maxCommands: 30, timeoutMs: 10_000 }
  const session = new BrowserSession(grant, "abcd", async (name) => {
    if (name === "tab_list") return { tabs }
    if (name === "observe") return { tab_id: tabs.find((tab) => tab.active)!.tab_id,
      text: '    @e1 button "商品详情"\n    group\n      @e2 button "商品详情"', truncated: false }
    if (name === "click") {
      tabs = [{ ...tabs[0]!, active: false }, { tab_id: 2, active: true, scope: "agent", url: "https://item.example/42" }]
      return { tab_id: 2 }
    }
    if (name === "network") return { tab_id: 2, entries: [], next_since: 1 }
    if (name === "navigate") return { tab_id: 2 }
    throw new Error(`unexpected:${name}`)
  })
  try {
    await session.command({ type: "click", target: { role: "button", name: "商品详情" } })
    await session.command({ type: "observe" })
    await session.command({ type: "navigate", url: "https://item.example/43" })
    await assert.rejects(session.command({ type: "navigate", url: "https://outside.example/" }),
      (error: unknown) => error instanceof Error && error.message.includes("origin_denied"))
  } finally { await session.close() }
})

test("新活动标签先暴露空 URL 时等待导航提交而非固定休眠", async () => {
  const calls: { name: string; args: string[] }[] = []
  let productObservations = 0
  let tabs = [{ tab_id: 1, active: true, scope: "agent" as const, url: "https://search.example/results" }]
  const grant: BrowserGrant = { taskId: "task", runId: randomUUID(), requirementVersion: 1, purpose: "replay",
    allowedOrigins: ["https://search.example"], actions: ["click", "observe", "navigate"], maxCommands: 30, timeoutMs: 10_000 }
  const session = new BrowserSession(grant, "abcd", async (name, args) => {
    calls.push({ name, args: [...args] })
    if (name === "tab_list") return { tabs }
    if (name === "observe") {
      const active = tabs.find((tab) => tab.active)!
      if (active.tab_id === 2 && ++productObservations === 1) active.url = "https://item.example/42?landing=1"
      return { tab_id: active.tab_id,
        text: '    @e1 button "商品详情"\n    group\n      @e2 button "商品详情"', truncated: false }
    }
    if (name === "click") {
      tabs = [{ ...tabs[0]!, active: false }, { tab_id: 2, active: true, scope: "agent", url: "" }]
      return { tab_id: 1 }
    }
    if (name === "wait_for_navigation") {
      tabs[1] = { ...tabs[1]!, url: "https://item.example/42" }
      return { tab_id: 2, reached: "commit" }
    }
    if (name === "network") return { tab_id: 2, entries: [], next_since: 1 }
    if (name === "navigate") return { tab_id: 2 }
    throw new Error(`unexpected:${name}`)
  })
  try {
    await session.command({ type: "click", target: { role: "button", name: "商品详情" } })
    await session.command({ type: "observe" })
    await session.command({ type: "navigate", url: "https://item.example/43" })
    const wait = calls.find((call) => call.name === "wait_for_navigation")
    const click = calls.find((call) => call.name === "click")
    assert.ok(wait)
    assert.equal(click?.args[1], "@e1")
    assert.equal(productObservations, 2)
    assert.deepEqual(wait.args.slice(0, 7), ["wait-for-navigation", "--session", "abcd", "--tab-id", "2", "--wait-until", "commit"])
    assert.match(wait.args.at(-1)!, /^\d+ms$/)
  } finally { await session.close() }
})
