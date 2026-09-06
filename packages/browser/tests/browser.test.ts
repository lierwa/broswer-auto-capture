import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { BrowserHost, BrowserError, type BrowserGrant, type BrowserSession, type CommandExecutor } from "../src/index.js"

const grant = (): BrowserGrant => ({ taskId: "task-a", runId: randomUUID(), requirementVersion: 1, purpose: "verification",
  allowedOrigins: ["https://example.com"], actions: ["navigate", "observe", "click", "fill", "press"], maxCommands: 60, timeoutMs: 10_000 })
const code = (value: string) => (error: unknown) => error instanceof BrowserError && error.code === value
async function fixture(run: (context: { directory: string; host: BrowserHost; calls: string[][]; fake: { text: string; tabUrl: string; badStop: boolean; badStart: boolean; observeCount: number }; execute: CommandExecutor }) => Promise<void>) {
  const prefix = path.join(tmpdir(), "browser-capture-f2-")
  const directory = await mkdtemp(prefix), calls: string[][] = []
  const fake = { text: "", tabUrl: "https://example.com/page", badStop: false, badStart: false, observeCount: 0 }
  const execute: CommandExecutor = async (args) => {
    calls.push([...args])
    let value: unknown = { tab_id: 17 }
    if (args[1] === "session" && args[2] === "start") {
      if (fake.badStart) return { stdout: "not a session response", exitCode: -1 }
      value = { session_id: "abcd" }
    } else if (args[1] === "session") value = { stopped: fake.badStop ? [] : ["abcd"], failed: fake.badStop ? ["fixture failure"] : [], return_failures: [] }
    else if (args[1] === "tab") value = { tabs: [{ tab_id: 17, url: fake.tabUrl, scope: "agent", active: true }] }
    else if (args[1] === "observe") value = { tab_id: 17, truncated: false, text: fake.text || `@e${++fake.observeCount} link "下一页"` }
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

test("重定向越界时停止读取页面；重复或缺失语义目标不盲点", async () => fixture(async ({ host, fake, calls }) => {
  fake.tabUrl = "https://outside.example/"
  await assert.rejects(host.run(grant(), (session) => session.command({ type: "navigate", url: "https://example.com/page" })), code("origin_denied"))
  assert.ok(!calls.some((args) => args[1] === "observe"))
  fake.tabUrl = "https://example.com/"
  for (const [text, expected] of [["@e1 link \"下一页\"\n@e2 link \"下一页\"", "target_ambiguous"], ["@e1 link \"上一页\"", "target_missing"]]) {
    fake.text = text!
    await assert.rejects(host.run(grant(), (session) => session.command({ type: "click", target: { role: "link", name: "下一页" } })), code(expected!))
  }
  assert.ok(!calls.some((args) => args[1] === "click"))
}))

test("访问闸门变为待人工，同会话不可继续尝试，审计不泄漏敏感页面或值", async () => fixture(async ({ host, fake, calls, directory }) => {
  fake.text = "@e1 textbox \"搜索\""
  const value = "sensitive-test-value"
  await host.run(grant(), async (session) => { await session.command({ type: "fill", target: { role: "textbox", name: "搜索" }, value }) })
  fake.text = "请输入验证码 sensitive-private-page"
  await host.run(grant(), async (session) => {
    await assert.rejects(session.command({ type: "observe" }), code("manual_required"))
    const previous = calls.length
    await assert.rejects(session.command({ type: "observe" }), code("manual_required"))
    assert.equal(calls.length, previous)
  })
  const audit = await readFile(path.join(directory, "browser-audit.jsonl"), "utf8")
  assert.doesNotMatch(audit, /sensitive-test-value|sensitive-private-page|验证码|搜索/)
  assert.match(audit, /"phase":"intended"/)
  assert.match(audit, /"purpose":"verification"/)
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
  const binding = grant(); fake.badStop = true
  await assert.rejects(host.run(binding, async () => {}), code("cleanup_required"))
  const restarted = new BrowserHost(directory, execute), previous = calls.length
  await assert.rejects(restarted.run(grant(), async () => {}), code("cleanup_required"))
  assert.equal(calls.length, previous)
  await assert.rejects(restarted.cleanupOwned(randomUUID()), code("permission_denied"))
  fake.badStop = false
  await restarted.cleanupOwned(binding.runId)
  await restarted.run(grant(), async () => {})
  await restarted.close()
}))

test("启动响应丢失保留不确定事实，不枚举并关闭不属于自己的会话", async () => fixture(async ({ host, fake, calls }) => {
  fake.badStart = true
  await assert.rejects(host.run(grant(), async () => {}))
  fake.badStart = false
  await assert.rejects(host.run(grant(), async () => {}), code("cleanup_required"))
  assert.equal(calls.length, 1)
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
