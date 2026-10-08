// WHY：只检验产品底层浏览器控制的可观察差异；不把编译/发布能力混作检测结果。
import assert from "node:assert/strict"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { productHost } from "./antibot-m0/product.js"

if (!process.argv.includes("--daily-visible-session")) throw Error("explicit_daily_session_required")
const variant = z.enum(["reference", "candidate"]).parse(process.argv.find(v => v.startsWith("--variant="))?.slice(10))
const root = process.cwd(), admin = "http://127.0.0.1:4188", api = "http://127.0.0.1:4175"
const preflight = await fetch(`${api}/api/browser/daily-chrome`, { headers: { origin: api, "sec-fetch-site": "same-origin" } })
z.object({ paired: z.literal(true), connected: z.literal(false), busy: z.literal(false), popupRequest: z.null() }).parse(await preflight.json())
const reportSchema = z.object({ createdAt: z.string(), submissions: z.array(z.object({ at: z.string().nullable(), result: z.string(), score: z.string().nullable(), signals: z.string().nullable() })),
  business: z.array(z.object({ case_id: z.string(), at: z.string(), action: z.string(), value: z.string() })),
  access: z.array(z.object({ RequestHost: z.string(), RequestPath: z.string(), RequestMethod: z.string(), DownstreamStatus: z.number(), OriginStatus: z.number(), StartUTC: z.string() })),
  detectorMetrics: z.unknown() })
async function local(route: string, body?: unknown) {
  const response = await fetch(admin + route, { ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }),
    headers: { origin: admin, "content-type": "application/json" } })
  if (!response.ok) throw Error(`lab_http_${response.status}`)
  return await response.json() as unknown
}
await mkdir(path.join(root, "work/antibot-service"), { recursive: true })
const directory = await mkdtemp(path.join(root, `work/antibot-service/control-${variant}-`))
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const samples: unknown[] = []
const extension = new DailyChromeExtension(root, path.join(root, "data"), () => { throw Error("existing_connection_must_stay_idle") })
await save("manifest.json", { variant, browser: "daily", headless: false, rounds: 3, modelCalls: 0,
  control: "actual RunnerProcess / Browser-Use / owner-scoped daily relay", freshCookieDomains: true,
  reference: "4304981 native Browser + original event capture; same current relay", threshold: 75 })

async function round(number: number) {
  const item = z.object({ id: z.uuid(), url: z.url() }).parse(await local("/api/cases", { kind: "catalog", variant: number }))
  const origin = new URL(item.url).origin, host = new URL(item.url).hostname
  const roundDirectory = path.join(directory, `round-${number}`)
  await mkdir(roundDirectory)
  const product = productHost(root, roundDirectory, origin, false, { reference: variant === "reference",
    endpoint: owner => extension.endpoint(false, owner) })
  const before = reportSchema.parse(await local("/api/report"))
  const started = new Date().toISOString()
  let reached = false
  try {
    await product.ready(item.url)
    const end = Date.now() + 45_000
    while (Date.now() < end) {
      const report = reportSchema.parse(await local("/api/report"))
      reached = report.business.some(event => event.case_id === item.id && event.action === "opened")
      if (reached || report.submissions.length > before.submissions.length) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    if (reached) {
      const result = await product.command({ name: "browser.read-fields", version: 2, specification: {
        container: "tbody tr", fields: { version: { selector: ":scope", attribute: "data-version", valueType: "integer" },
          status: { selector: ":scope", attribute: "data-status", valueType: "string" } }, maxItems: 10,
        outputSchema: { type: "array", items: { type: "object", properties: { version: { type: "integer" }, status: { type: "string" } },
          required: ["version", "status"], additionalProperties: false } } } })
      const rows = z.array(z.object({ version: z.number(), status: z.string() })).parse(result.output)
      const selected = rows.filter(row => row.status === "已发布").sort((a, b) => b.version - a.version)[0]!
      assert.equal(selected.version, [7, 11, 13][number - 1])
      await product.command({ name: "browser.workflow-step", version: 2, actionName: "click", args: {},
        target: { strategy: "css", value: `tr[data-version="${selected.version}"] a` }, postconditions: [] })
    }
    const after = reportSchema.parse(await local("/api/report"))
    const requests = after.access.filter(request => request.RequestHost === host)
    const business = after.business.filter(event => event.case_id === item.id)
    const submissions = after.submissions.slice(before.submissions.length)
    const challenged = requests.some(request => request.RequestPath.startsWith("/crowdsec-internal/challenge/") && request.RequestMethod === "POST")
    const selected = business.some(event => event.action === "selected" && JSON.parse(event.value).correct === true)
    const sample = { number, case: item, started, challenged, reached, selected, requests, business, submissions,
      metricsBefore: before.detectorMetrics, metricsAfter: after.detectorMetrics }
    samples.push(sample); await save("samples.json", samples)
    console.log(JSON.stringify({ variant, number, challenged, reached, selected, submissions }))
    assert.equal(challenged, true, "fresh_challenge_not_observed")
    assert.equal(reached, variant === "candidate", "detector_result_unexpected")
    assert.equal(selected, variant === "candidate", "control_result_unexpected")
    if (!reached) assert.ok(submissions.some(value => value.result === "rejected"), "rejection_evidence_missing")
  } finally {
    await writeFile(path.join(roundDirectory, "detector-after.json"), JSON.stringify(await local("/api/report"), null, 2))
    await writeFile(path.join(roundDirectory, "cleanup.json"), JSON.stringify(await product.close(), null, 2))
    await extension.disconnect()
  }
}
try {
  for (const number of [1, 2, 3]) await round(number)
  await save("proof.json", { passed: true, variant, rounds: 3, modelCalls: 0, scope: "bottom-level browser control, not task-chain compilation" })
} catch (error) {
  await save("failure.json", { type: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : "unknown" })
  process.exitCode = 1
} finally {
  await extension.disconnect()
  await save("closed.json", { ownRelayDisconnected: true, personalBrowserClosed: false, detectorStopped: false })
  console.log(JSON.stringify({ directory, samples: samples.length }))
}
