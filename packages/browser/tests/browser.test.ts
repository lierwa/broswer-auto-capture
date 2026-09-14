import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { BrowserHost, BrowserError, type BrowserGrant, type BrowserSession, type CommandExecutor } from "../src/index.js"
import { CommandLaunchError } from "../src/transport.js"

const grant = (): BrowserGrant => ({ taskId: "task-a", runId: randomUUID(), requirementVersion: 1, purpose: "verification",
  allowedOrigins: ["https://example.com"], actions: ["navigate", "observe", "click", "fill", "press", "page", "request_help"], maxCommands: 60, timeoutMs: 10_000 })
const code = (value: string) => (error: unknown) => error instanceof BrowserError && error.code === value
async function fixture(run: (context: { directory: string; host: BrowserHost; calls: string[][]; fake: { text: string; tabUrl: string; truncated: boolean; badStop: boolean; badStart: boolean; badNavigate: boolean; observeCount: number; activeSessions: unknown[]; networkEntries: unknown[]; actionDestination: string | null; actionDelayMs: number; helpOutcome: "completed" | "timed_out"; helpDelayMs: number }; execute: CommandExecutor }) => Promise<void>) {
  const prefix = path.join(tmpdir(), "browser-capture-f2-")
  const directory = await mkdtemp(prefix), calls: string[][] = []
  const fake = { text: "", tabUrl: "https://example.com/page", truncated: false, badStop: false, badStart: false, badNavigate: false, observeCount: 0, activeSessions: [] as unknown[],
    networkEntries: [] as unknown[], actionDestination: null as string | null, actionDelayMs: 0,
    helpOutcome: "completed" as "completed" | "timed_out", helpDelayMs: 0 }
  const execute: CommandExecutor = async (args) => {
    calls.push([...args])
    let value: unknown = { tab_id: 17 }
    if (args[1] === "session" && args[2] === "start") {
      if (fake.badStart) return { stdout: "not a session response", exitCode: -1 }
      value = { session_id: "abcd" }
    } else if (args[1] === "session" && args[2] === "list") value = fake.activeSessions
    else if (args[1] === "session") value = { stopped: fake.badStop ? [] : ["abcd"], failed: fake.badStop ? ["fixture failure"] : [], return_failures: [] }
    else if (args[1] === "navigate" && fake.badNavigate) return { stdout: "", exitCode: 4 }
    else if (args[1] === "tab") value = { tabs: [{ tab_id: 17, url: fake.tabUrl, scope: "agent", active: true }] }
    else if (args[1] === "network") value = { tab_id: 17, entries: fake.networkEntries, next_since: 1 }
    else if (args[1] === "observe") value = { tab_id: 17, truncated: fake.truncated, text: fake.text || `@e${++fake.observeCount} link "下一页"` }
    else if (args[1] === "wait-for-navigation" && args.includes("commit") && fake.actionDestination && fake.actionDelayMs > 0) {
      await delay(fake.actionDelayMs); fake.tabUrl = fake.actionDestination
    } else if (["click", "press"].includes(args[1]!) && fake.actionDestination && fake.actionDelayMs === 0) fake.tabUrl = fake.actionDestination
    else if (args[1] === "request-help") { await delay(fake.helpDelayMs); value = { outcome: fake.helpOutcome }; if (fake.helpOutcome === "completed") fake.text = "登录后的业务页面" }
    return { stdout: JSON.stringify(value), exitCode: 0 }
  }
  const host = new BrowserHost(directory, execute)
  try { await run({ directory, host, calls, fake, execute }) }
  finally { await host.close(); assert.ok(path.resolve(directory).startsWith(path.resolve(prefix))); await rm(directory, { recursive: true, force: true }) }
}

test("语义目标在每个动作前重新定位，命令只进入所属 session/tab，退出回收", async () => fixture(async ({ host, calls, directory }) => {
  let escaped: BrowserSession | undefined
  await host.run(grant(), async (session) => {
    escaped = session
    await session.command({ type: "click", target: { role: "link", name: "下一页" } })
    await session.command({ type: "click", target: { role: "link", name: "下一页" } })
  })
  assert.deepEqual(calls.filter((args) => args[1] === "click").map((args) => args[2]), ["@e1", "@e2"])
  for (const args of calls.filter((args) => args[1] !== "session")) assert.equal(args[args.indexOf("--session") + 1], "abcd")
  assert.equal(calls.at(-1)?.[2], "stop")
  assert.equal(JSON.parse(await readFile(path.join(directory, "browser-owner.json"), "utf8")).state, "closed")
  await assert.rejects(escaped!.command({ type: "observe" }), code("session_closed"))
}))

test("拒绝原始引用、脚本、跨域、未授权动作和来源凭证；错误后仍关闭", async () => fixture(async ({ host, calls }) => {
  await host.run({ ...grant(), actions: ["observe", "navigate"] }, async (session) => {
    await assert.rejects(session.command({ type: "evaluate", script: "document.cookie" }))
    await assert.rejects(session.command({ type: "click", target: { role: "link", name: "下一页" } }), code("permission_denied"))
    await assert.rejects(session.command({ type: "click", ref: "@e1" }))
    await assert.rejects(session.command({ type: "navigate", url: "https://outside.example/page" }), code("origin_denied"))
    await assert.rejects(session.command({ type: "navigate", url: "https://user:password@example.com/page" }), code("origin_denied"))
  })
  assert.equal(calls.length, 2)
}))

test("重定向到未授权页面只返回访问边界且不擅自请求人工；重名语义目标只按显式顺序消歧", async () => fixture(async ({ host, fake, calls }) => {
  fake.tabUrl = "https://outside.example/"
  await assert.rejects(host.run(grant(), (session) => session.command({ type: "navigate", url: "https://example.com/page" })), code("origin_denied"))
  fake.badNavigate = true
  await assert.rejects(host.run(grant(), (session) => session.command({ type: "navigate", url: "https://example.com/page" })), code("origin_denied"))
  fake.tabUrl = "https://example.com/"
  await assert.rejects(host.run(grant(), (session) => session.command({ type: "navigate", url: "https://example.com/page" })), code("command_failed"))
  assert.equal(calls.filter((args) => args[1] === "request-help").length, 0)
  assert.ok(!calls.some((args) => args[1] === "observe"))
  fake.badNavigate = false
  for (const [text, expected] of [["@e1 link \"下一页\"\n@e2 link \"下一页\"", "target_ambiguous"], ["@e1 link \"上一页\"", "target_missing"]]) {
    fake.text = text!
    await assert.rejects(host.run(grant(), (session) => session.command({ type: "click", target: { role: "link", name: "下一页" } })), code(expected!))
  }
  fake.text = "@e1 link \"下一页\"\n@e2 link \"下一页\""
  await host.run(grant(), (session) => session.command({ type: "click", target: { role: "link", name: "下一页", occurrence: 1 } }))
  assert.equal(calls.find((args) => args[1] === "click")?.[2], "@e2")
  await assert.rejects(host.run(grant(), (session) => session.command({ type: "click",
    target: { role: "link", name: "下一页", occurrence: 2 } })), code("target_missing"))
}))

test("直接导航的同站验证落点可在原会话观察并显式交给人工", async () => fixture(async ({ host, fake, calls }) => {
  fake.tabUrl = "https://verify.example.com/challenge"; fake.text = "页面要求完成真人验证"
  await host.run(grant(), async (session) => {
    await session.command({ type: "navigate", url: "https://example.com/page" })
    assert.match((await session.command({ type: "observe" }))!, /真人验证/)
    await session.command({ type: "request_help", reason: "captcha", timeoutMs: 1_000 })
    assert.match((await session.command({ type: "observe" }))!, /登录后的业务页面/)
  })
  assert.equal(calls.filter((args) => args[1] === "navigate").length, 1)
  assert.equal(calls.filter((args) => args[1] === "request-help").length, 1)
}))

test("显式人工决策在同会话等待，完成后重新观察；超时不自动重试", async () => fixture(async ({ host, fake, calls, directory }) => {
  fake.text = "@e1 textbox \"搜索\""
  const value = "sensitive-test-value"
  await host.run(grant(), async (session) => { await session.command({ type: "fill", target: { role: "textbox", name: "搜索" }, value }) })
  fake.text = "请输入验证码 sensitive-private-page"; fake.helpDelayMs = 500
  const states: string[] = []
  await host.run(grant(), async (session) => {
    session.beginStep(20, 250, new AbortController().signal, () => {})
    assert.equal(await session.command({ type: "request_help", reason: "captcha" }), null)
    assert.match((await session.command({ type: "observe" }))!, /登录后的业务页面/)
    assert.ok(session.stepElapsedMs() < 250)
  }, undefined, (state) => { states.push(state.status) })
  assert.deepEqual(states, ["waiting", "completed"])
  fake.tabUrl = "https://verification.example/challenge"; fake.text = "需要人工验证"
  const redirected: Array<{ status: string; origin: string | null }> = []
  await host.run(grant(), async (session) => {
    assert.equal(await session.command({ type: "request_help", reason: "access" }), null)
    assert.match((await session.command({ type: "observe" }))!, /登录后的业务页面/)
  }, undefined, (state) => {
    redirected.push({ status: state.status, origin: state.origin })
    if (state.status === "waiting") fake.tabUrl = "https://example.com/resumed"
  })
  assert.deepEqual(redirected, [
    { status: "waiting", origin: "https://verification.example" },
    { status: "completed", origin: "https://verification.example" },
  ])
  fake.text = "请输入验证码 sensitive-private-page"; fake.helpDelayMs = 0; fake.helpOutcome = "timed_out"
  await host.run(grant(), async (session) => {
    assert.match((await session.command({ type: "observe" }))!, /sensitive-private-page/)
    await assert.rejects(session.command({ type: "request_help", reason: "captcha" }), code("manual_required"))
    const previous = calls.length
    await assert.rejects(session.command({ type: "observe" }), code("manual_required"))
    assert.equal(calls.length, previous)
  })
  assert.equal(calls.filter((args) => args[1] === "request-help").length, 3)
  const audit = await readFile(path.join(directory, "browser-audit.jsonl"), "utf8")
  assert.doesNotMatch(audit, /sensitive-test-value|sensitive-private-page|验证码|搜索/)
  assert.match(audit, /"phase":"intended"/)
  assert.match(audit, /"purpose":"verification"/)
}))

test("站点节流等待不消耗浏览器活动时间预算", async () => fixture(async ({ host }) => {
  await host.run(grant(), async (session) => {
    session.beginStep(20, 100, new AbortController().signal, () => {})
    await session.waitOutsideBudget(() => new Promise<void>((resolve) => setTimeout(resolve, 150)))
    assert.ok(session.stepElapsedMs() < 100)
    await session.command({ type: "observe" })
  })
}))

test("同一数据目录的两个 host 互斥，预算和取消均保留 finally 关闭", async () => fixture(async ({ host, directory, execute, calls }) => {
  const other = new BrowserHost(directory, execute)
  await host.run(grant(), async () => {
    await assert.rejects(other.run(grant(), async () => {}), code("busy"))
    await assert.rejects(host.run(grant(), async () => {}), code("busy"))
  })
  await assert.rejects(host.run({ ...grant(), maxCommands: 1 }, (session) => session.command({ type: "observe" })), code("budget_exceeded"))
  const controller = new AbortController()
  await assert.rejects(host.run(grant(), async () => { controller.abort() }, controller.signal), code("cancelled"))
  assert.equal(calls.at(-1)?.[2], "stop")
  await other.close()
}))

test("关闭失败保留所属会话，新进程替身不能开新任务，按原 run 清理后解锁", async () => fixture(async ({ host, fake, directory, execute, calls }) => {
  const binding = grant(); fake.badStop = true; fake.activeSessions = [{ session_id: "abcd" }]
  await assert.rejects(host.run(binding, async () => {}), code("cleanup_required"))
  const restarted = new BrowserHost(directory, execute), previous = calls.length
  await assert.rejects(restarted.run(grant(), async () => {}), code("cleanup_required"))
  assert.equal(calls.length, previous)
  await assert.rejects(restarted.cleanupOwned(randomUUID()), code("permission_denied"))
  fake.activeSessions = []
  await restarted.cleanupOwned(binding.runId)
  fake.badStop = false
  await restarted.run(grant(), async () => {})
  await restarted.close()
}))

test("启动响应丢失后仅在官方枚举确认没有活动会话时解除阻塞", async () => fixture(async ({ directory, host, fake, calls }) => {
  fake.badStart = true
  await assert.rejects(host.run(grant(), async () => {}))
  fake.badStart = false
  await assert.rejects(host.run(grant(), async () => {}), code("cleanup_required"))
  assert.equal(calls.length, 1)
  const owner = JSON.parse(await readFile(path.join(directory, "browser-owner.json"), "utf8"))
  fake.activeSessions = [{ session_id: "wxyz" }]
  await assert.rejects(host.cleanupOwned(owner.runId), code("cleanup_required"))
  fake.activeSessions = []
  await host.cleanupOwned(owner.runId)
  await host.run(grant(), async () => {})
}))

test("授权页面上的用户动作只扩展实际到达的当前会话 origin", async () => fixture(async ({ host, fake, calls }) => {
  fake.text = '@e1 button "搜索"'
  fake.actionDestination = "https://search.example/Search?keyword=test"
  await host.run(grant(), async (session) => {
    await assert.rejects(session.command({ type: "navigate", url: "https://search.example/before-action" }), code("origin_denied"))
    await session.command({ type: "click", target: { role: "button", name: "搜索" } })
    assert.match((await session.command({ type: "observe" }))!, /搜索/)
    await session.command({ type: "navigate", url: "https://search.example/after-action" })
    await assert.rejects(session.command({ type: "navigate", url: "https://outside.example/" }), code("origin_denied"))
  })
  const click = calls.findIndex((args) => args[1] === "click")
  const network = calls.findIndex((args, index) => index > click && args[1] === "network")
  assert.ok(click >= 0 && network > click)
}))

test("同标签动作在 click 返回后才导航时等待一次 commit 再观察", async () => fixture(async ({ host, fake, calls }) => {
  fake.text = '@e1 button "搜索"'; fake.actionDestination = "https://example.com/results"; fake.actionDelayMs = 20
  await host.run(grant(), async (session) => {
    await session.command({ type: "click", target: { role: "button", name: "搜索" } })
    await session.command({ type: "observe" })
    assert.equal(session.state()?.url, "https://example.com/results")
  })
  const click = calls.findIndex((args) => args[1] === "click")
  const waits = calls.filter((args, index) => index > click && args[1] === "wait-for-navigation")
  assert.ok(click >= 0)
  assert.deepEqual(waits.map((args) => args[args.indexOf("--wait-until") + 1]), ["commit", "load", "networkidle"])
  assert.equal(calls.filter((args) => args[1] === "click").length, 1)
}))

test("动态控件延迟出现时只重新观察并执行一次语义动作", async () => fixture(async ({ directory, execute, fake, calls }) => {
  fake.text = "页面骨架加载中"
  let observations = 0
  const host = new BrowserHost(directory, async (args, signal) => {
    if (args[1] === "observe" && ++observations === 2) fake.text = '@e2 textbox "搜索"'
    return execute(args, signal)
  })
  try {
    await host.run(grant(), (session) => session.command({ type: "fill", target: { role: "textbox", name: "搜索" }, value: "query" }))
    assert.ok(observations >= 2)
    assert.equal(calls.filter((args) => args[1] === "fill").length, 1)
  } finally { await host.close() }
}))

test("首屏外语义目标经有界向下揭示后只执行一次业务动作", async () => fixture(async ({ directory, execute, fake, calls }) => {
  fake.text = "列表顶部"
  let pageDowns = 0
  const host = new BrowserHost(directory, async (args, signal) => {
    if (args[1] === "press" && args[2] === "PageDown" && ++pageDowns === 3) fake.text = '@e7 button "第七项"'
    return execute(args, signal)
  })
  try {
    await host.run(grant(), (session) => session.command({ type: "click", target: { role: "button", name: "第七项" } }))
    assert.equal(pageDowns, 4)
    assert.ok(calls.filter((args) => args[1] === "observe").every((args) => args[args.indexOf("--max-tokens") + 1] === "50000"))
    assert.equal(calls.filter((args) => args[1] === "click").length, 1)
    assert.equal(calls.find((args) => args[1] === "click")?.[2], "@e7")
  } finally { await host.close() }
}))

test("完整语义名称变化时只按唯一稳定子串回退", async () => fixture(async ({ host, fake, calls }) => {
  fake.text = '@e8 button "新促销文案 MODEL-7 国家补贴"'
  await host.run(grant(), (session) => session.command({ type: "click",
    target: { role: "button", name: "旧促销文案 MODEL-7", fallbackName: "MODEL-7" } }))
  assert.equal(calls.filter((args) => args[1] === "click").length, 1)
  assert.equal(calls.find((args) => args[1] === "click")?.[2], "@e8")
}))

test("旧会话未授权活动标签不阻断新导航且新建标签在 finally 回收", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-capture-stale-tab-")), calls: string[][] = []
  let tabs = [{ tab_id: 16, url: "https://outside.example.net/old", scope: "agent" as const, active: true }]
  const execute: CommandExecutor = async (args) => {
    calls.push([...args])
    if (args[1] === "session" && args[2] === "start") return { stdout: JSON.stringify({ session_id: "abcd" }), exitCode: 0 }
    if (args[1] === "session") return { stdout: JSON.stringify({ stopped: ["abcd"], failed: [], return_failures: [] }), exitCode: 0 }
    if (args[1] === "tab" && args[2] === "list") return { stdout: JSON.stringify({ tabs }), exitCode: 0 }
    if (args[1] === "tab" && args[2] === "create") {
      tabs = [{ ...tabs[0]!, active: false }, { tab_id: 17, url: "https://verify.example.com/challenge", scope: "agent", active: true }]
      return { stdout: JSON.stringify({ tab_id: 17 }), exitCode: 0 }
    }
    if (args[1] === "tab" && args[2] === "close") {
      tabs = tabs.filter((tab) => tab.tab_id !== Number(args[3])); return { stdout: JSON.stringify({ tab_id: Number(args[3]) }), exitCode: 0 }
    }
    return { stdout: JSON.stringify({ tab_id: 17 }), exitCode: 0 }
  }
  const host = new BrowserHost(directory, execute)
  try {
    await host.run(grant(), (session) => session.command({ type: "navigate", url: "https://example.com/", reuseOpenTab: true }))
    assert.equal(calls.filter((args) => args[1] === "navigate").length, 0)
    assert.equal(calls.filter((args) => args[1] === "tab" && args[2] === "create").length, 1)
    assert.deepEqual(tabs.map((tab) => tab.tab_id), [16])
  } finally { await host.close(); await rm(directory, { recursive: true, force: true }) }
})

test("恢复已观察来源 URL 时复用原标签且点击新标签在切换输入及 finally 中回收", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-capture-tab-bound-"))
  const calls: string[][] = []
  let nextTabId = 18
  let tabs = [{ tab_id: 16, url: "https://unrelated.example.net/old", scope: "agent" as const, active: false },
    { tab_id: 17, url: "https://example.com/source", scope: "agent" as const, active: true }]
  const execute: CommandExecutor = async (args) => {
    calls.push([...args])
    if (args[1] === "session" && args[2] === "start") return { stdout: JSON.stringify({ session_id: "abcd" }), exitCode: 0 }
    if (args[1] === "session") return { stdout: JSON.stringify({ stopped: ["abcd"], failed: [], return_failures: [] }), exitCode: 0 }
    if (args[1] === "tab" && args[2] === "list") return { stdout: JSON.stringify({ tabs }), exitCode: 0 }
    if (args[1] === "tab" && args[2] === "select") {
      const id = Number(args[3]); tabs = tabs.map((tab) => ({ ...tab, active: tab.tab_id === id }))
      return { stdout: JSON.stringify({ tab_id: id }), exitCode: 0 }
    }
    if (args[1] === "tab" && args[2] === "close") {
      const id = Number(args[3]); tabs = tabs.filter((tab) => tab.tab_id !== id)
      return { stdout: JSON.stringify({ tab_id: id }), exitCode: 0 }
    }
    const active = tabs.find((tab) => tab.active)!
    if (args[1] === "observe") return { stdout: JSON.stringify({ tab_id: active.tab_id,
      truncated: false, text: '@e1 link "打开详情"' }), exitCode: 0 }
    if (args[1] === "click") {
      tabs = tabs.map((tab) => ({ ...tab, active: false }))
      const id = nextTabId++; tabs.push({ tab_id: id, url: `https://example.com/detail-${id}`, scope: "agent", active: true })
      return { stdout: JSON.stringify({ tab_id: id }), exitCode: 0 }
    }
    if (args[1] === "network") return { stdout: JSON.stringify({ tab_id: active.tab_id, entries: [], next_since: 1 }), exitCode: 0 }
    return { stdout: JSON.stringify({ tab_id: active.tab_id }), exitCode: 0 }
  }
  const host = new BrowserHost(directory, execute)
  try {
    await host.run({ ...grant(), purpose: "exploration", actions: ["observe", "click", "navigate"] }, async (session) => {
      await session.command({ type: "click", target: { role: "link", name: "打开详情" } })
      await session.command({ type: "navigate", url: "https://example.com/source", reuseOpenTab: true })
      await session.command({ type: "click", target: { role: "link", name: "打开详情" } })
      assert.deepEqual(tabs.map((tab) => tab.tab_id), [16, 17, 19])
    })
    assert.equal(calls.filter((args) => args[1] === "navigate").length, 0)
    assert.equal(calls.filter((args) => args[1] === "tab" && args[2] === "select").length, 1)
    assert.deepEqual(calls.filter((args) => args[1] === "tab" && args[2] === "close").map((args) => args[3]), ["18", "19"])
    assert.deepEqual(tabs.map((tab) => tab.tab_id), [16, 17])
    const finalTabClose = calls.findLastIndex((args) => args[1] === "tab" && args[2] === "close")
    const sessionStop = calls.findIndex((args) => args[1] === "session" && args[2] === "stop")
    assert.ok(finalTabClose >= 0 && sessionStop > finalTabClose)
    assert.ok(calls.find((args) => args[1] === "session" && args[2] === "start")?.includes("--no-focus"))
  } finally { await host.close(); await rm(directory, { recursive: true, force: true }) }
})

test("导航失败先核验实际落点；网络 429 形成类型化事实且不重复导航", async () => fixture(async ({ host, fake, calls }) => {
  fake.badNavigate = true; fake.tabUrl = "https://example.com/page"
  await host.run(grant(), (session) => session.command({ type: "navigate", url: fake.tabUrl, captureNetworkEvidence: true }))
  assert.equal(calls.filter((args) => args[1] === "navigate").length, 1)
  assert.equal(calls.filter((args) => args[1] === "network").length, 1)

  fake.badNavigate = false
  fake.networkEntries = [{ sequence: 1, kind: "response", url: fake.tabUrl, status: 429, resource_type: "Document" }]
  await assert.rejects(host.run(grant(), (session) => session.command({ type: "navigate", url: fake.tabUrl,
    captureNetworkEvidence: true })), (error) => error instanceof BrowserError && error.code === "rate_limited"
      && error.evidence.httpStatus === 429 && error.evidence.origin === "https://example.com")
  assert.equal(calls.filter((args) => args[1] === "navigate").length, 2)
}))

test("断电撕裂所有权日志时仅在官方枚举为空后恢复", async () => fixture(async ({ directory, host, fake, calls }) => {
  await writeFile(path.join(directory, "browser-owner.json"), Buffer.alloc(179))
  fake.activeSessions = [{ session_id: "orphan" }]
  await assert.rejects(host.run(grant(), async () => {}), code("cleanup_required"))
  assert.equal(calls.filter((args) => args[1] === "session" && args[2] === "list").length, 1)
  assert.equal(calls.filter((args) => args[1] === "session" && args[2] === "start").length, 0)
  fake.activeSessions = []
  await host.run(grant(), async () => {})
  assert.equal(calls.filter((args) => args[1] === "session" && args[2] === "list").length, 2)
  assert.equal(JSON.parse(await readFile(path.join(directory, "browser-owner.json"), "utf8")).state, "closed")
}))

test("截断语义树中已返回的唯一精确目标仍可执行", async () => fixture(async ({ host, fake, calls }) => {
  fake.truncated = true
  fake.text = '@e9 link "销量"'
  await host.run(grant(), (session) => session.command({ type: "click", target: { role: "link", name: "销量" } }))
  assert.equal(calls.find((args) => args[1] === "click")?.[2], "@e9")
}))

test("浏览器命令进程未启动时关闭空 owner，后续任务不被假会话永久阻塞", async () => fixture(async ({ directory, execute }) => {
  let launchFails = true
  const launching = new BrowserHost(directory, async (args, signal) => {
    if (launchFails && args[1] === "session" && args[2] === "start") { launchFails = false; throw new CommandLaunchError() }
    return execute(args, signal)
  })
  try {
    await assert.rejects(launching.run(grant(), async () => {}), code("command_failed"))
    assert.equal(JSON.parse(await readFile(path.join(directory, "browser-owner.json"), "utf8")).state, "closed")
    await launching.run(grant(), async () => {})
  } finally { await launching.close() }
}))

test("回调忽略取消时 close 仍回收，回调保留的 session 不能继续发命令", async () => fixture(async ({ host, calls }) => {
  let started!: () => void, escaped!: BrowserSession
  const ready = new Promise<void>((resolve) => { started = resolve })
  const running = host.run(grant(), async (session) => { escaped = session; started(); await new Promise(() => {}) })
  const rejected = assert.rejects(running, code("cancelled"))
  await ready
  await host.close(); await rejected
  assert.equal(calls.at(-1)?.[2], "stop")
  await assert.rejects(escaped.command({ type: "observe" }), code("session_closed"))
}))

test("取消先等待动作子进程退出，再关闭所属会话", async () => fixture(async ({ directory, execute }) => {
  const controller = new AbortController(), order: string[] = []
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  const host = new BrowserHost(directory, async (args, signal) => {
    if (args[1] === "observe") {
      started()
      await new Promise<void>((resolve) => signal!.addEventListener("abort", () => { setTimeout(resolve, 10) }, { once: true }))
      order.push("action-exited")
      return { stdout: "{}", exitCode: -1 }
    }
    if (args[2] === "stop") order.push("session-stop")
    return execute(args, signal)
  })
  const running = host.run(grant(), (session) => session.command({ type: "observe" }), controller.signal)
  const rejected = assert.rejects(running, code("cancelled"))
  await ready; controller.abort(); await rejected; await host.close()
  assert.deepEqual(order, ["action-exited", "session-stop"])
}))

test("异步页面只重新观察等待语义就绪，超时停止且不重复动作", async () => fixture(async ({ directory, execute, fake, calls }) => {
  fake.text = "等待页面加载"
  const host = new BrowserHost(directory, async (args, signal) => {
    const result = await execute(args, signal)
    if (args[1] === "observe") fake.text = "业务页面已就绪"
    return result
  })
  try {
    assert.match((await host.run(grant(), (session) => session.command({ type: "observe", until: { text: "业务页面已就绪", timeoutMs: 1000 } })))!, /已就绪/)
    await assert.rejects(host.run(grant(), (session) => session.command({ type: "observe", until: { text: "不会出现", timeoutMs: 100 } })), code("readiness_timeout"))
    assert.equal(calls.filter((args) => args[1] === "click").length, 0)
  } finally { await host.close() }
}))
