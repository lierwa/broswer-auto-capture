import assert from "node:assert/strict"
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import { hybridExecuteRequestSchema, hybridExecuteResultSchema } from "../src/upstream-browser/hybrid-protocol.js"

const root = process.cwd(), probeRoot = path.join(root, "work", "dedicated-browser-modes")
await mkdir(probeRoot, { recursive: true })
const directory = await mkdtemp(path.join(probeRoot, "probe-")), profilePath = path.join(directory, "profile")
const visits: number[] = []
const server = createServer((request, response) => {
  if (request.method === "POST") {
    let body = ""
    request.on("data", chunk => { body += chunk })
    request.on("end", () => { visits.push(Number(body)); response.end("ok") })
    return
  }
  response.writeHead(200, { "content-type": "text/html" })
  response.end(`<title>B-A-T environment proof</title><main>Local fixture</main><script>
    const count = Number(localStorage.getItem('bat-mode-proof') || 0);
    localStorage.setItem('bat-mode-proof', String(count + 1));
    fetch('/proof', {method:'POST', body:String(count)});
    </script>`)
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
let cleanupConfirmed = true
try {
  for (const mode of ["dedicated-visible", "dedicated-headless"] as const) {
    const ownerId = randomUUID()
    const runner = new RunnerProcess(root, new AbortController().signal, undefined, { browserMode: mode })
    try {
      await runner.startHybrid({ headless: mode === "dedicated-headless", profilePath,
        allowedOrigins: [origin], managedWindow: { ownerId, resume: false } })
      const result = hybridExecuteResultSchema.parse(await runner.request(hybridExecuteRequestSchema.parse({
        id: randomUUID(), type: "hybrid_execute", command: { name: "browser.workflow-step", version: 2,
          actionName: "navigate", args: { url: `${origin}/fixture`, new_tab: false }, target: null,
          postconditions: [{ kind: "url", bindingArgument: "url" }] } })))
      assert.equal(result.modelCalls, 0)
      assert.equal(new URL(result.browser.url).origin, origin)
      process.stdout.write(JSON.stringify({ mode, navigation: "passed", modelCalls: result.modelCalls }) + "\n")
    } finally {
      const report = await runner.close()
      cleanupConfirmed &&= report.status === "confirmed"
      assert.equal(report.status, "confirmed", JSON.stringify(report.stages))
    }
  }
  assert.deepEqual(visits, [0, 1], "both modes must retain exactly the same dedicated Profile")
  process.stdout.write(JSON.stringify({ sharedProfile: "passed", cleanup: "confirmed" }) + "\n")
} finally {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  if (cleanupConfirmed) await rm(directory, { recursive: true, force: true })
}
