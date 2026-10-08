// One actual daily-Chrome task window per variant, three documents; personal tabs remain outside the owner.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { UpstreamProtocolError } from "../src/upstream-browser/service.js"
import { loadProbe, probe } from "./antibot-m0/artifact.js"
import { createFixture } from "./antibot-m0/fixture.js"
import { productHost } from "./antibot-m0/product.js"
import { waitFor } from "./antibot-m0/host.js"
import { createHoldoutFixture, holdoutProbe } from "./antibot-m0/holdout.js"

if (!process.argv.includes("--daily-visible-session")) throw Error("explicit_daily_visible_session_required")
const variant = z.enum(["reference", "candidate"]).parse(process.argv.find(v => v.startsWith("--variant="))?.slice(10))
const independent = process.argv.includes("--independent-probe")
const root = process.cwd(), api = "http://127.0.0.1:4175"
const state = z.object({ paired: z.literal(true), connected: z.literal(false), busy: z.literal(false),
  popupRequest: z.null() }).passthrough()
const current = await fetch(`${api}/api/browser/daily-chrome`, { headers: { origin: api, "sec-fetch-site": "same-origin" } })
if (!current.ok) throw Error("daily_preflight_unavailable")
state.parse(await current.json()) // Existing product connection must be idle; never disconnect it for a test.
const parent = path.join(root, "work/antibot-m0")
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, `daily-${independent ? "holdout-" : ""}${variant}-`))
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const extension = new DailyChromeExtension(root, path.join(root, "data"), () => {
  throw Error("daily_lab_must_not_replace_connected_relay")
})
const fixture = independent ? await createHoldoutFixture(root, directory) : await createFixture(await loadProbe(root), directory)
const product = productHost(root, directory, fixture.origin, false, {
  endpoint: async ownerId => {
    const endpoint = await extension.endpoint(false, ownerId)
    if (!endpoint) throw Error("daily_saved_authorization_unavailable")
    return endpoint
  }, reference: variant === "reference",
})
await save("manifest.json", { schemaVersion: 1, variant, probe: independent ? holdoutProbe : probe, headless: false, mode: "daily",
  transport: "existing DailyChromeExtension owner-scoped relay", profilePolicy: "existing-user-selected",
  dataScope: "local fixture only", modelCalls: 0, personalProfileDeleted: false, retentionDays: 7,
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  phase: "Runner abilities, no preparation or published TaskRun", documents: "three fresh documents in one continued session" })
const samples: unknown[] = []
try {
  for (const round of [1, 2, 3]) {
    const { item, url } = fixture.add("bat-execute", round)
    if (round === 1) await product.ready(url)
    else await product.navigate(url)
    await product.execute()
    item.collect = true
    await waitFor(() => item.result !== null)
    const business = item.action?.version === [7, 11, 13][round - 1] && item.action?.trusted === true
    samples.push({ id: item.id, round, finding: item.result, business, requests: item.requests,
      documentRequests: item.documentRequests, probeSubmissions: item.submissions, cspViolations: item.violations })
    await save("samples.json", samples)
    assert.equal(business, true)
    assert.equal(item.documentRequests, 1)
    assert.equal(item.submissions, 1)
    assert.equal(item.result?.status, "observed")
    assert.ok(item.result)
    const cdp = "rules" in item.result ? item.result.rules.find(rule => rule.name === "hasCDP")
      : { state: item.result.status, detected: item.result.detected }
    assert.equal(cdp?.state, "observed")
    assert.equal(cdp?.detected, variant === "reference")
    console.log(JSON.stringify({ variant, round, business, signalStatus: item.result?.status }))
  }
} catch (error) {
  // WHY：只保留协议的固定标识符，传输异常正文可能含个人 URL 或 token。
  const safe = (value: unknown) => typeof value === "string"
    && /^[a-zA-Z][a-zA-Z_0-9]{1,100}(?::[a-z][a-z_0-9]{1,100})?$/.test(value) ? value : null
  const failure = { type: error instanceof Error ? error.name : "unknown", completedSamples: samples.length,
    code: error instanceof UpstreamProtocolError ? safe(error.code) : null,
    reason: error instanceof UpstreamProtocolError ? safe(error.reason) : null }
  await save("failure.json", failure)
  console.log(JSON.stringify(failure))
  process.exitCode = 1
} finally {
  try {
    const cleanup = await product.close()
    await save("cleanup.json", cleanup)
    assert.equal(cleanup.report.status, "confirmed")
    assert.equal(cleanup.report.activeResources, false)
  } finally {
    await extension.disconnect()
    await fixture.close()
    await save("lab-closed.json", { labProcessId: process.pid, localServerClosed: true,
      ownRelayDisconnected: true, personalBrowserClosed: false, at: new Date().toISOString() })
  }
}
console.log(JSON.stringify({ directory, variant, samples: samples.length }))
