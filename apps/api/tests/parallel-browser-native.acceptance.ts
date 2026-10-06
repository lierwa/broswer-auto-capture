import assert from "node:assert/strict"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { capabilityEffectChain, requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"

// WHY：只创建自己的空 Profile/本地页面，证明 SDK 原生并行和独立关窗，不接触用户 Chrome。
const root = process.cwd(), parent = path.join(root, "work", "parallel-browser-proof")
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, "probe-")), owners = [randomUUID(), randomUUID()]
const upstream = new PythonUpstreamBrowserRuntime({ root, directory, subject: {} as never })
const server = createServer((_req, res) => { res.setHeader("content-type", "text/html"); res.end("<title>Owned parallel proof</title><p>fixture</p>") })
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`, entered = new Set<string>()
const reports = new Map<string, RunnerCleanupReport>(), releases = new Map<string, () => void>()
let ready!: () => void
const both = new Promise<void>(resolve => { ready = resolve })
function run(ownerId: string) {
  const chain = capabilityEffectChain(), node = chain.nodes.find(n => n.id === "capability")!
  if (node.kind !== "capability") throw Error("fixture_missing")
  chain.entry = node.id; chain.nodes = chain.nodes.filter(n => n.id !== "observe"); chain.edges = chain.edges.filter(e => e.from !== "observe")
  node.input = { url: { source: "constant", value: `${origin}/fixture` }, new_tab: { source: "constant", value: false } }
  node.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
  node.timeoutMs = 30000
  return upstream.withCapabilities({ ownerId, allowedOrigins: [origin], signal: AbortSignal.timeout(90000),
    browserMode: "dedicated-headless", managedWindow: { ownerId, resume: false }, onCleanup: value => reports.set(ownerId, value) }, async capabilities => {
    entered.add(ownerId)
    await new Promise<void>(resolve => { releases.set(ownerId, resolve); if (entered.size === 2) ready() })
    return new TaskChainRuntime().execute({ chain, request: requestFor(chain, null, "replay", randomUUID(), randomUUID()),
      capabilities: { ...capabilities, llm: async () => { throw Error("implicit_model_forbidden") } } })
  })
}
let clean = false
try {
  const first = run(owners[0]!), second = run(owners[1]!)
  await Promise.race([both, Promise.all([first, second]), new Promise((_, reject) => setTimeout(() => reject(Error("native_parallel_timeout")), 60000))])
  assert.equal(entered.size, 2)
  const receipts = await Promise.all(owners.map(owner => readFile(path.join(directory, "browser-profile", "runs", owner, "managed-window-lease.json"), "utf8").then(JSON.parse)))
  assert.notEqual(receipts[0].browserPid, receipts[1].browserPid); assert.notEqual(receipts[0].profilePath, receipts[1].profilePath)
  releases.get(owners[0]!)!()
  const a = await first; assert.equal(a.status, "completed"); assert.equal(a.consumed.llmCalls, 0)
  assert.equal(reports.get(owners[0]!)?.status, "confirmed")
  const alive = JSON.parse(await readFile(path.join(directory, "browser-profile", "runs", owners[1]!, "managed-window-lease.json"), "utf8"))
  assert.equal(alive.status, "running")
  releases.get(owners[1]!)!()
  const b = await second; assert.equal(b.status, "completed"); assert.equal(b.consumed.llmCalls, 0)
  assert.equal(reports.get(owners[1]!)?.status, "confirmed")
  const ended = await upstream.managedWindowAction({ action: "verify_closed", ownerId: owners[1]!, leaseId: owners[1]!, browserMode: "dedicated-headless" })
  assert.equal(ended.window.active, false); clean = true
  process.stdout.write(JSON.stringify({ passed: true, simultaneousSessions: 2, independentProfiles: true,
    firstClosedSecondAlive: true, automaticCleanup: true, modelCalls: 0 }) + "\n")
} finally {
  releases.forEach(resolve => resolve()); await upstream.close(); server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (clean) await rm(directory, { recursive: true, force: true })
}
