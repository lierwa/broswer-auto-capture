import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { requiredLegacyNodeOutcomes, type ChainNode, type JsonValue } from "@browser-capture/contracts"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"

// Explicit owned browser acceptance; never part of package's ordinary unit-test glob.
const root = fileURLToPath(new URL("../../../", import.meta.url))
const parent = path.join(root, "work", "bsk-removal-20261012")
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, "legacy-live-")), profile = path.join(directory, "profile")
const ownerId = randomUUID(), signal = AbortSignal.timeout(180_000)
const reference = { id: randomUUID(), version: 1, digest: "a".repeat(64) }
const binding = { runId: ownerId, invocationId: randomUUID(), taskId: "legacy-live", authorizationId: randomUUID(),
  plan: reference, chain: reference, inputDigest: "b".repeat(64) }
let cleanup: RunnerCleanupReport | undefined
const requests: string[] = []
const isolatedPath = (process.env.PATH ?? "").split(path.delimiter)
  .filter(directory => !["bsk", "bsk.exe", "bsk.cmd"].some(name => existsSync(path.join(directory, name))))
  .join(path.delimiter)
const unit = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
const html = `<!doctype html><title>Managed compatibility sample</title><h1>Local sample</h1>
<label>Name <input id="name" aria-label="Name"></label><button id="save" onclick="document.querySelector('#result').textContent=document.querySelector('#name').value">Save</button>
<p id="result">before</p><ul><li class="row">one</li><li class="row">two</li></ul>
<select id="choice"><option value="a">Alpha</option><option value="b">Beta</option></select>
<input id="file" type="file" multiple><a id="download" href="/file" download="sample.txt">Download</a>
<button class="repeat" onclick="document.querySelector('#result').textContent='first'">Repeated</button><button class="repeat" onclick="document.querySelector('#result').textContent='second'">Repeated</button>
<div id="drop" style="height:50px" ondragover="event.preventDefault()" ondrop="event.preventDefault();this.textContent='files:'+event.dataTransfer.files.length">Drop here</div>
<form onsubmit="event.preventDefault();document.querySelector('#result').textContent='submitted'"><button id="submit">Submit</button></form>`
const server = createServer((request, response) => {
  if (request.url === "/file") {
    response.writeHead(200, { "content-type": "text/plain", "content-disposition": 'attachment; filename="sample.txt"' })
    response.end("owned download")
  } else { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(html) }
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
if (!address || typeof address === "string") throw Error("fixture_address_unavailable")
const origin = `http://127.0.0.1:${address.port}`
await writeFile(path.join(directory, "owner.json"), JSON.stringify({ ownerId, directory, profile, origin, purpose: "legacy-contract-live", modelCalls: 0 }))
let phase = "start"
try {
  await withHybridCapabilities({ root, directory, ownerId, profilePath: profile, signal, allowedOrigins: [origin],
    headless: true, onCleanup: report => { cleanup = report },
    createRunner: (_root, runnerSignal, diagnostic) => {
      const runner = new RunnerProcess(root, runnerSignal, diagnostic, { browserMode: "dedicated-headless",
        runnerEnvironment: { PATH: isolatedPath, BAT_ACCESS_STATE_DIR: path.join(directory, "access-state") } })
      const request = runner.request.bind(runner)
      runner.request = async value => { requests.push(value.type); return request(value) }
      return runner
    } }, async capabilities => {
    async function action(operation: Extract<ChainNode, { kind: "browser" }>["operation"], args: Record<string, JsonValue>,
      selector?: string | { role: string; name: string; occurrence?: number; fallbackName?: string }, expected = "success") {
      phase = operation
      const result = await capabilities.browser!({ binding, idempotencyKey: randomUUID(), node: { id: operation, label: operation, kind: "browser", operation,
        arguments: {}, timeoutMs: 30_000, outcomes: [...requiredLegacyNodeOutcomes.browser], outputContract: unit, writes: [] },
        arguments: args, ...(selector ? { target: typeof selector === "string"
          ? { kind: "locator" as const, strategy: "css", value: selector } : { kind: "semantic" as const, ...selector } } : {}), signal })
      assert.equal(result.outcome, expected, JSON.stringify(result))
      return result.output
    }
    async function read(scope: "target" | "page" | "tabs", selector?: string) {
      phase = `read-${scope}`
      const result = await capabilities.observe!({ binding, node: { id: "read", label: "read", kind: "observe", scope,
        stableWhen: { operator: "exists", path: [] }, timeoutMs: 30_000, outcomes: [...requiredLegacyNodeOutcomes.observe],
        outputContract: unit, writes: [] }, ...(selector ? { target: { kind: "locator" as const, strategy: "css", value: selector } } : {}), signal })
      assert.equal(result.outcome, "success", JSON.stringify(result))
      return result.output as any
    }
    await action("navigate", { url: origin })
    if (process.argv.includes("--edge-cases")) {
      await action("click", {}, ".absent", "missing")
      await action("click", {}, ".repeat", "failed")
      await action("click", {}, { role: "button", name: "Repeated", occurrence: 1 })
      assert.equal((await read("target", "#result")).matches[0].text, "second")
      await action("click", {}, { role: "button", name: "Absent", fallbackName: "Repeat", occurrence: 0 })
      assert.equal((await read("target", "#result")).matches[0].text, "first")
      await action("click", { dispatch: "dom" }, "#submit")
      assert.equal((await read("target", "#result")).matches[0].text, "submitted")
      const files = [path.join(directory, "a.txt"), path.join(directory, "b.txt")]
      await Promise.all(files.map(file => writeFile(file, "owned upload")))
      await action("upload", { files, mode: "drop" }, "#drop")
      assert.equal((await read("target", "#drop")).matches[0].text, "files:2")
      await action("navigate", { url: "https://example.invalid/" }, undefined, "failed")
      return
    }
    await action("fill", { value: "changed" }, "#name")
    await action("hover", {}, "#save")
    await action("click", {}, "#save")
    assert.equal((await read("target", "#result")).matches[0].text, "changed")
    assert.deepEqual((await read("target", ".row")).matches.map((row: { text: string }) => row.text), ["one", "two"])
    assert.match((await read("page")).text, /changed/)
    await action("select", { values: ["b"] }, "#choice")
    await action("press", { key: "Tab" })
    const tabs = await read("tabs")
    const opened = await action("tab_open", { url: origin + "/second", background: true }) as { tabId: number; active: boolean }
    assert.equal(opened.active, false)
    assert.equal((await read("tabs")).find((tab: { active: boolean }) => tab.active).tabId, tabs[0].tabId)
    await action("tab_select", { tabId: opened.tabId })
    await action("tab_select", { tabId: tabs[0].tabId })
    await action("tab_close", { tabId: opened.tabId })
    const upload = path.join(directory, "upload.txt")
    await writeFile(upload, "owned upload")
    await action("upload", { files: [upload], mode: "input" }, "#file")
    const output = path.join(directory, "download.txt")
    await action("download", { out: output, overwrite: false }, "#download")
    assert.equal(await readFile(output, "utf8"), "owned download")
    assert.equal(requests.filter(type => type === "hybrid_start").length, 1)
  })
  await writeFile(path.join(directory, "passed.json"), JSON.stringify({ modelCalls: 0, requests, cleanup }, null, 2))
  console.log(JSON.stringify({ passed: true, directory, commands: requests.length }))
} catch (error) {
  await writeFile(path.join(directory, "first-failure.json"), JSON.stringify({ phase, reason: String(error), requests, cleanup }, null, 2))
  throw error
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  if (cleanup?.status === "confirmed" && path.dirname(profile) === directory && path.dirname(directory) === parent) {
    await rm(profile, { recursive: true })
    await writeFile(path.join(directory, "cleanup.json"), JSON.stringify({ cleanup, profilePermanentlyDeleted: true, serverClosed: true }))
  }
}
