import assert from "node:assert/strict"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { capabilityEffectChain, requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"

// WHY：真正消费产品适配和原 LangGraph runtime，保护普通复跑 0 模型与同一专属 Profile。
const root = process.cwd(), probeRoot = path.join(root, "work", "dedicated-runtime-proof")
await mkdir(probeRoot, { recursive: true })
const directory = await mkdtemp(path.join(probeRoot, "probe-")), visits: number[] = []
const server = createServer((request, response) => {
  if (request.method === "POST") {
    let body = ""; request.on("data", chunk => { body += chunk })
    request.on("end", () => { visits.push(Number(body)); response.end("ok") }); return
  }
  response.writeHead(200, { "content-type": "text/html" })
  response.end(`<title>Local runtime proof</title><script>
    const count = Number(localStorage.getItem('bat-runtime-proof') || 0);
    localStorage.setItem('bat-runtime-proof', String(count + 1));
    fetch('/proof', {method:'POST', body:String(count)});
    </script>`)
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const chain = capabilityEffectChain()
chain.entry = "capability"; chain.nodes = chain.nodes.filter(node => node.id !== "observe")
chain.edges = chain.edges.filter(edge => edge.from !== "observe"); chain.budget.maxLlmCalls = 0
const navigate = chain.nodes.find(node => node.id === "capability")!
if (navigate.kind !== "capability") throw new Error("fixture_capability_missing")
navigate.input = { url: { source: "constant", value: `${origin}/fixture` }, new_tab: { source: "constant", value: false } }
navigate.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
navigate.timeoutMs = 30_000
const upstream = new PythonUpstreamBrowserRuntime({ root, directory, subject: {} as never })
let cleanupConfirmed = true
try {
  for (const browserMode of ["dedicated-visible", "dedicated-headless"] as const) {
    let report: RunnerCleanupReport | undefined
    const ownerId = randomUUID(), before = visits.length
    cleanupConfirmed = false
    const run = await upstream.withCapabilities({ ownerId, signal: new AbortController().signal,
      allowedOrigins: [origin], browserMode, headless: browserMode === "dedicated-headless",
      managedWindow: { ownerId, resume: false }, onCleanup: value => {
        report = value; cleanupConfirmed = value.status === "confirmed"
      } }, capabilities =>
      new TaskChainRuntime().execute({ chain, request: requestFor(chain, null, "replay", randomUUID(), randomUUID()),
        capabilities: { ...capabilities, llm: async () => { throw new Error("ordinary_node_called_model") } } }))
    assert.equal(run.status, "completed", JSON.stringify(run.outcome))
    assert.equal(run.consumed.llmCalls, 0); assert.deepEqual(run.modelCalls, [])
    assert.equal(run.auditComplete, true); assert.equal(report?.status, "confirmed")
    const observed = visits.slice(before)
    assert.ok(observed.length > 0)
    assert.equal(observed[0], before === 0 ? 0 : visits[before - 1]! + 1,
      "the next mode must read the storage persisted by the preceding mode")
    assert.ok(observed.every((value, index) => index === 0 || value === observed[index - 1]! + 1))
    process.stdout.write(JSON.stringify({ browserMode, run: run.status, llmCalls: run.consumed.llmCalls,
      browserCommands: run.consumed.browserCommands, pageVisits: observed, cleanup: report?.status }) + "\n")
  }
  process.stdout.write(JSON.stringify({ sharedProfile: "passed", runtime: "LangGraph", modelCalls: 0 }) + "\n")
} finally {
  await upstream.close()
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  if (cleanupConfirmed) await rm(directory, { recursive: true, force: true })
}
