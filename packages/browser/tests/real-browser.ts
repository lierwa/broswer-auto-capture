import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { BrowserHost, bskExecutor } from "../src/index.js"

if (!process.argv.includes("--real")) throw new Error("真实浏览器验收需要显式 --real")
const root = fileURLToPath(new URL("../../../", import.meta.url))
const directory = path.join(root, "work", `f2-browser-${Date.now()}`)
const requests: string[] = []
const server = createServer((request, response) => {
  requests.push(request.url ?? "")
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(request.url === "/next" ? '<html lang="zh"><h1>语义导航完成</h1><a href="/">返回验收首页</a></html>' : '<html lang="zh"><h1>受控浏览器验收</h1><a href="/next">查看下一页</a></html>')
})
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
if (!address || typeof address === "string") throw new Error("验收页面未启动")
const origin = `http://127.0.0.1:${address.port}`
const host = new BrowserHost(directory, bskExecutor(root))
try {
  await host.run({ taskId: "f2-real-browser", runId: randomUUID(), requirementVersion: 1, purpose: "verification", allowedOrigins: [origin],
    actions: ["navigate", "observe", "press", "click"], maxCommands: 60, timeoutMs: 60_000 }, async (session) => {
    await session.command({ type: "navigate", url: origin })
    const first = await session.command({ type: "observe" })
    assert.match(first!, /受控浏览器验收/)
    await session.command({ type: "press", key: "Enter", target: { role: "link", name: "查看下一页" } })
    const next = await session.command({ type: "observe", until: { text: "语义导航完成", timeoutMs: 5000 } })
    assert.match(next!, /语义导航完成/)
    await session.command({ type: "click", target: { role: "link", name: "返回验收首页" } })
    assert.match((await session.command({ type: "observe", until: { text: "受控浏览器验收", timeoutMs: 5000 } }))!, /受控浏览器验收/)
  })
  const owner = JSON.parse(await readFile(path.join(directory, "browser-owner.json"), "utf8"))
  assert.equal(owner.state, "closed")
  const events = (await readFile(path.join(directory, "browser-audit.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line))
  assert.ok(events.some((event) => event.command === "press" && event.phase === "completed"))
  assert.ok(events.some((event) => event.command === "click" && event.phase === "completed"))
  process.stdout.write(JSON.stringify({ status: "passed", sessionClosed: true, completedCommands: events.filter((event) => event.phase === "completed").length, browserAdapterModelCalls: 0, directory }) + "\n")
} catch (error) {
  process.stderr.write(JSON.stringify({ fixtureRequests: requests }) + "\n")
  throw error
} finally {
  await host.close()
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
    server.closeAllConnections()
  })
}
