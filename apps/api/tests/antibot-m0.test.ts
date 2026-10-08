import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { analyze, compare, inputs, type Sample } from "./antibot-m0/report.js"
import { createFixture } from "./antibot-m0/fixture.js"

function raw(value: unknown = false) {
  return { status: "observed", elapsedMs: 1, fingerprint: { signals: {
    automation: { webdriver: value, selenium: false, playwright: false, cdp: false }, contexts: { iframe: { webdriver: false } },
  }, fastBotDetection: false, fastBotDetectionDetails: Object.fromEntries([
    ...Object.keys(inputs).map(name => [name, { detected: false, severity: "high" }]),
    ["complexRule", { detected: false, severity: "low" }],
  ]) } }
}

test("M0 keeps swallowed errors, absent fields and unsupervised rules distinct from negative detections", () => {
  for (const [value, state] of [["ERROR", "invalid"], ["INIT", "unavailable"], ["SKIPPED", "unavailable"],
    ["NA", "unavailable"], [undefined, "unavailable"], ["false", "invalid"], [false, "observed"]]) {
    const result = analyze(raw(value))
    // undefined passed to a default argument is tested via deletion below.
    if (value !== undefined) assert.equal(result.rules.find(rule => rule.name === "hasWebdriver")?.state, state)
  }
  const absent = raw(); delete (absent.fingerprint.signals.automation as Partial<typeof absent.fingerprint.signals.automation>).webdriver
  assert.equal(analyze(absent).rules.find(rule => rule.name === "hasWebdriver")?.state, "unavailable")
  assert.equal(analyze(raw()).rules.find(rule => rule.name === "complexRule")?.state, "unknown")
  assert.equal(analyze({ status: "unavailable", reason: "probe_timeout" }).status, "unavailable")
  assert.equal(analyze({ status: "observed", fingerprint: {} }).status, "invalid")
})

test("M0 does not promote missing human/positive samples or manufacture a product improvement", () => {
  const samples: Sample[] = [1, 2, 3].map(round => ({ id: String(round), mode: "bu-connect", round,
    environment: "controlled", finding: analyze(raw()), business: "not_run", commands: 0,
    modelCalls: 0, cleanup: true, documentRequests: 1, probeSubmissions: 1 }))
  const report = compare(samples)
  assert.equal(report.baseline, "incomplete_or_invalid")
  assert.equal(report.productImprovement, "not_tested")
  assert.equal(report.differences[0]!.byMode.find(row => row.mode === "manual")?.TN, 0)
  assert.equal(report.registeredReferences[0]!.status, "incomplete_or_invalid")
})

test("M0 keeps manual choice failures separate from matched webdriver calibration and rejects mismatched environments", () => {
  const samples: Sample[] = ["manual", "positive"].flatMap(mode => [1, 2, 3].map(round => {
    const observation = raw(mode === "positive")
    observation.fingerprint.fastBotDetectionDetails.hasWebdriver = { detected: mode === "positive", severity: "high" }
    return { id: `${mode}-${round}`, mode: mode as "manual" | "positive", round, environment: "same-chrome-visible-fresh",
      finding: analyze(observation), business: mode === "manual" ? "failed" as const : "not_run" as const,
      commands: 0, modelCalls: 0, cleanup: true, documentRequests: 1, probeSubmissions: 1 }
  }))
  const report = compare(samples)
  assert.equal(report.registeredReferences[0]!.status, "valid_positive_and_manual_reference")
  assert.equal(report.business.find(value => value.mode === "manual")?.failed, 3)
  assert.equal(report.baseline, "incomplete_or_invalid")
  const complete: Sample[] = [...samples, ...(["debug-host", "bu-connect", "bu-observe", "bat-execute"] as const)
    .flatMap(mode => [1, 2, 3].map(round => ({ ...samples[0]!, id: `${mode}-${round}`, mode, round,
      business: mode === "bat-execute" ? "passed" as const : "not_run" as const })))]
  assert.equal(compare(complete).baseline, "webdriver_baseline_valid_other_rules_uncalibrated")
  complete.find(sample => sample.mode === "bat-execute")!.business = "failed"
  assert.equal(compare(complete).baseline, "incomplete_or_invalid")
  samples[0]!.environment = "different-chrome"
  assert.equal(compare(samples).registeredReferences[0]!.status, "incomplete_or_invalid")
})

test("M0 accepts one same-origin result, rejects duplicate and cross-origin evidence, and keeps labels outside page", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-m0-unit-"))
  const fixture = await createFixture(Buffer.from("export default class {}"), directory)
  try {
    const { item, url } = fixture.add("bu-connect", 1)
    const page = await (await fetch(url)).text()
    assert(!page.includes("bu-connect"))
    const post = (origin: string, value: unknown) => fetch(url + "/result", { method: "POST",
      headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) })
    assert.equal((await post("http://other.invalid", raw())).status, 403)
    assert.equal(item.result, null)
    assert.equal((await post(fixture.origin, raw())).status, 204)
    assert.equal((await post(fixture.origin, raw())).status, 409)
    assert.equal(item.submissions, 2)
    assert.equal((item.result as ReturnType<typeof analyze> | null)?.status, "observed")
  } finally {
    await fixture.close()
    assert(path.resolve(directory).startsWith(path.resolve(tmpdir(), "bat-m0-unit-")))
    await rm(directory, { recursive: true })
  }
})
