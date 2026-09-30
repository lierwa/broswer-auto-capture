import assert from "node:assert/strict"
import test from "node:test"
import type { JsonValue } from "@browser-capture/contracts"
import { cleanupReport, RUNNER_CLEANUP_STAGES, RuntimeCleanupRequiredError,
  type RunnerCleanupStage } from "../src/upstream-browser/cleanup.js"
import { withHybridAuthoring } from "../src/upstream-browser/hybrid-exploration.js"
import { hybridAuthorSourceSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { naturalSourceFixture } from "./helpers/natural-source.js"
import type { RunnerProcess } from "../src/upstream-browser/service.js"

const hash = "1".repeat(64)
const source = hybridAuthorSourceSchema.parse({ task: "Open the confirmed page", input: null,
  inputSchema: { type: "null" }, outputSchema: { type: "null" },
  resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" },
  requirementId: "requirement", requirementVersion: 1, requirementText: "Open the confirmed page",
  requirementDigest: hash, planId: "plan", planVersion: 1, planDigest: hash, stepId: "step",
  callMode: "once", entryUrls: ["https://example.test/"], maxSteps: 1 })
const captured = naturalSourceFixture({ trace: {
  mediaType: "application/vnd.bat.browser-use-trace+json;version=2",
  source: { provider: "browser-use", version: "fixture", historyRef: "synthetic" },
  completed: true, actions: [], observations: [], finalResultRef: null,
  redactionManifestRef: { ref: "fixture:redaction", digest: hash },
} })
const traceDigest = (captured.request.trace as Record<string, JsonValue>).digest
const rawResult = { output: null, canonicalRequest: captured.canonicalRequest, sourceGaps: [] } as JsonValue

function report(confirmed: boolean) {
  const stages: RunnerCleanupStage[] = RUNNER_CLEANUP_STAGES.map((stage) => stage === "browser_close" && !confirmed
    ? { stage, status: "unconfirmed", code: "cleanup_browser_close_failed" }
    : { stage, status: "confirmed", code: null })
  return cleanupReport(stages, !confirmed)
}

function harness(confirmed = true) {
  const events: string[] = []
  const starts: Parameters<RunnerProcess["startHybrid"]>[0][] = []
  let closed = false, closeCount = 0
  let settled: Promise<ReturnType<typeof report>> | undefined
  const runner = {
    envBoolean: (_name: string, fallback: boolean) => fallback,
    startHybrid: async (config: Parameters<RunnerProcess["startHybrid"]>[0]) => { starts.push(config); events.push("start") },
    startCompiler: async () => { events.push("compiler") },
    request: async () => { assert.equal(closed, false); events.push("response"); return rawResult },
    close: () => settled ??= Promise.resolve().then(() => {
      closeCount++; closed = true; events.push("close"); return report(confirmed)
    }),
  }
  const dependencies = {
    verifySource: async () => hash,
    openBridge: async () => ({ url: "http://127.0.0.1:1/", token: "test",
      close: async () => { events.push("bridge-close") } }),
    createRunner: () => runner,
  } as unknown as NonNullable<Parameters<typeof withHybridAuthoring>[2]>
  const input = { root: process.cwd(), directory: "", ownerId: "synthetic-owner",
    signal: new AbortController().signal, allowedOrigins: ["https://example.test"],
    selection: { modelId: "test" }, subject: {} } as Parameters<typeof withHybridAuthoring>[0]
  return { events, starts, runner, dependencies, input, get closed() { return closed }, get closeCount() { return closeCount } }
}

test("preparation passes its product owner to the daily Chrome task window", async () => {
  const h = harness()
  await withHybridAuthoring(h.input, async () => null, h.dependencies)
  assert.deepEqual(h.starts[0]?.managedWindow, { ownerId: h.input.ownerId, resume: false })
})

test("final B-U source is saved before its Browser owner closes without compilation", async () => {
  const h = harness()
  let saved: unknown
  const result = await withHybridAuthoring(h.input, async (session) => session.author(source, {
    closeAfterResponse: true, onSource: (value) => { h.events.push("source"); saved = value },
  }), h.dependencies)
  assert.equal(result.sourceSuccess, true)
  assert.deepEqual(result.history, { localRef: "synthetic", digest: traceDigest })
  assert.equal(result.browserCommands, 0)
  assert.deepEqual(saved, { result: rawResult, forkSourceDigest: hash, modelCalls: [] })
  assert.deepEqual(h.events, ["start", "response", "source", "close", "bridge-close"])
  assert.equal(h.closeCount, 1)
})

test("intermediate B-U steps keep one owner until the final response", async () => {
  const h = harness()
  await withHybridAuthoring(h.input, async (session) => {
    await session.author(source, { onSource: () => { h.events.push("source") } })
    assert.equal(h.closed, false)
    await session.author(source, { closeAfterResponse: true,
      onSource: () => { h.events.push("source") } })
  }, h.dependencies)
  assert.deepEqual(h.events, ["start", "response", "source", "response", "source", "close", "bridge-close"])
  assert.equal(h.closeCount, 1)
})

test("unconfirmed final owner close still delivers its captured source", async () => {
  const h = harness(false)
  const saved: unknown[] = []
  await assert.rejects(withHybridAuthoring(h.input, async (session) => session.author(source, {
    closeAfterResponse: true, onSource: (value) => { h.events.push("source"); saved.push(value) },
  }), h.dependencies), RuntimeCleanupRequiredError)
  assert.equal(saved.length, 1)
  assert.deepEqual(saved[0], { result: rawResult, forkSourceDigest: hash, modelCalls: [] })
  assert.deepEqual(h.events, ["start", "response", "source", "close", "bridge-close"])
  assert.equal(h.closeCount, 1)
})

test("schema rejection preserves the only source receipt and closes the owner without acceptance", async () => {
  const h = harness()
  const invalid = { ...rawResult as Record<string, JsonValue>, sourceGaps: "invalid" }
  h.runner.request = async () => { h.events.push("response"); return invalid }
  const saved: unknown[] = []
  await assert.rejects(withHybridAuthoring(h.input, async (session) => session.author(source, {
    closeAfterResponse: true, onSource: (value) => { h.events.push("source"); saved.push(value) },
  }), h.dependencies))
  assert.deepEqual(saved, [{ result: invalid, forkSourceDigest: hash, modelCalls: [] }])
  assert.deepEqual(h.events, ["start", "response", "source", "close", "bridge-close"])
  assert.equal(h.closeCount, 1)
})
