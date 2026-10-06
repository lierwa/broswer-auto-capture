import assert from "node:assert/strict"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { capabilityEffectChain, requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"

// WHY：新独立 Profile 的登录复用适配必须真实消费 SDK storage_state；只注入合成 Cookie/存储。
const root = process.cwd(), parent = path.join(root, "work", "execution-storage-proof")
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, "probe-")), ownerId = randomUUID()
let cookie = false, storage = false, report: RunnerCleanupReport | undefined
const server = createServer((req, res) => {
  if (req.url === "/storage?present=true") storage = true
  if (req.url === "/fixture") cookie = req.headers.cookie?.includes("bat-synthetic-session=fixture") ?? false
  res.setHeader("content-type", "text/html")
  res.end(`<title>Owned auth fixture</title><script>fetch('/storage?present=' + (localStorage.getItem('bat-synthetic-login') === 'fixture'))</script>`)
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const upstream = new PythonUpstreamBrowserRuntime({ root, directory, subject: {} as never })
upstream.setAccountPreparation(async () => ({ cookies: [{ name: "bat-synthetic-session", value: "fixture", domain: "127.0.0.1",
  path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
  origins: [{ origin, localStorage: [{ name: "bat-synthetic-login", value: "fixture" }] }] }))
const chain = capabilityEffectChain(), node = chain.nodes.find(n => n.id === "capability")!
if (node.kind !== "capability") throw Error("fixture_missing")
chain.entry = node.id; chain.nodes = chain.nodes.filter(n => n.id !== "observe"); chain.edges = chain.edges.filter(e => e.from !== "observe")
node.input = { url: { source: "constant", value: `${origin}/fixture` }, new_tab: { source: "constant", value: false } }
node.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }; node.timeoutMs = 30000
try {
  const run = await upstream.withCapabilities({ ownerId, allowedOrigins: [origin], signal: AbortSignal.timeout(45000),
    browserMode: "dedicated-headless", onCleanup: value => { report = value } }, capabilities =>
    new TaskChainRuntime().execute({ chain, request: requestFor(chain, null, "replay", randomUUID(), randomUUID()), capabilities }))
  assert.equal(run.status, "completed"); assert.equal(cookie, true); assert.equal(storage, true)
  assert.equal(run.consumed.llmCalls, 0); assert.equal(report?.status, "confirmed")
  process.stdout.write(JSON.stringify({ passed: true, scopedCookieSeed: true, scopedStorageSeed: true, modelCalls: 0 }) + "\n")
} finally {
  await upstream.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  if (report?.status === "confirmed") await rm(directory, { recursive: true, force: true })
}
