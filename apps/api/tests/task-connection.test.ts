import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { TaskConnection } from "../src/upstream-browser/task-connection.js"
import { PythonUpstreamBrowserRuntime, RunnerProcess } from "../src/upstream-browser/service.js"
import { hybridStartRequestSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES, runnerCleanupReportSchema, RuntimeCleanupRequiredError } from "../src/upstream-browser/cleanup.js"

const parent = "a81d8a80-50ae-48aa-a06c-558ccf08f76a"
const other = "acf401e3-caed-40d9-8c1b-5d1d753f2194"
const first = "b1167767-e7de-4767-8c67-182a59895228"
const second = "96efa0a6-8a8a-4938-83d4-69c37de80495"
const config = (ownerId: string) => ({ allowedOrigins: ["https://example.test"],
  profilePath: "/tmp/bat-connection-metadata/default", headless: false,
  managedWindow: { ownerId, resume: false } })
const finalReport = () => cleanupReport(RUNNER_CLEANUP_STAGES.map(stage =>
  ({ stage, status: "confirmed", code: null })), false)

function harness() {
  let creates = 0, finalCloses = 0, releases = 0
  const starts: unknown[] = []
  let releaseFailure = false, finalFailure = false, wrongRetainedOwner = false
  const connection = new TaskConnection(process.cwd(), (_root, signal) => {
    creates++
    return {
      envBoolean: (_name: string, fallback: boolean) => fallback,
      startHybrid: async (value) => { signal.throwIfAborted(); starts.push(value) },
      request: async (request) => {
        assert.equal(request.type, "hybrid_release")
        releases++
        return { closed: !releaseFailure, retainedConnectionOwnerId: releaseFailure ? null : wrongRetainedOwner ? other : parent,
          stages: ["capability_close", "browser_close"].map(stage => ({ stage,
            status: releaseFailure ? "unconfirmed" : "confirmed",
            code: releaseFailure ? "cleanup_browser_close_failed" : null })) }
      },
      close: async () => { finalCloses++; return finalFailure ? cleanupReport(RUNNER_CLEANUP_STAGES.map(stage =>
        stage === "browser_close" ? { stage, status: "unconfirmed", code: "cleanup_browser_close_failed" }
          : { stage, status: "confirmed", code: null }), true) : finalReport() },
    }
  })
  return { connection, starts, counts: () => ({ creates, finalCloses, releases }),
    failRelease: () => { releaseFailure = true }, failFinal: () => { finalFailure = true },
    wrongOwner: () => { wrongRetainedOwner = true } }
}

// WHY：运行结束必须释放各自页面，但连续阶段不得再建 Python/浏览器连接；保留资源必须归父任务审计。
test("two operations reuse one task connection and final replay closes it", async () => {
  const h = harness()
  const a = h.connection.borrow({ connectionOwnerId: parent, signal: new AbortController().signal })
  await a.startHybrid(config(first))
  const released = await a.close()
  assert.equal(released.status, "confirmed")
  assert.equal(released.activeResources, false)
  assert.deepEqual(released.retainedConnection, { ownerId: parent, scope: "task" })
  assert.equal(released.stages.find(stage => stage.stage === "child_exit")?.status, "not_required")
  assert.deepEqual(await a.close(), released)
  const b = h.connection.borrow({ connectionOwnerId: parent, signal: new AbortController().signal,
    closeAfterOperation: true })
  await b.startHybrid(config(second))
  assert.equal((await b.close()).retainedConnection, undefined)
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 1, releases: 1 })
  assert.deepEqual(h.starts, [first, second].map(owner => ({ ...config(owner), connectionOwnerId: parent })))
})

test("a competing operation is rejected without closing the current owner's resources", async () => {
  const h = harness(), signal = new AbortController().signal
  const a = h.connection.borrow({ connectionOwnerId: parent, signal })
  await a.startHybrid(config(first))
  const b = h.connection.borrow({ connectionOwnerId: parent, signal })
  await assert.rejects(b.startHybrid(config(second)), /hybrid_task_connection_busy/)
  await b.close()
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 0, releases: 0 })
  await a.close(); await h.connection.close()
})

test("failed phase release does not retain or lend unconfirmed resources", async () => {
  const h = harness()
  const a = h.connection.borrow({ connectionOwnerId: parent, signal: new AbortController().signal })
  await a.startHybrid(config(first)); h.failRelease()
  const report = await a.close()
  assert.equal(report.retainedConnection, undefined)
  assert.equal(report.status, "confirmed") // final close proves recovery, not the failed release.
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 1, releases: 1 })
})

test("cancellation closes the task-owned worker rather than retaining it", async () => {
  const h = harness(), abort = new AbortController()
  const a = h.connection.borrow({ connectionOwnerId: parent, signal: abort.signal })
  await a.startHybrid(config(first)); abort.abort(new Error("cancelled"))
  assert.equal((await a.close()).retainedConnection, undefined)
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 1, releases: 0 })
})

test("a different task must close the previous parent before starting", async () => {
  const h = harness(), signal = new AbortController().signal
  const a = h.connection.borrow({ connectionOwnerId: parent, signal })
  await a.startHybrid(config(first)); await a.close()
  const b = h.connection.borrow({ connectionOwnerId: other, signal, closeAfterOperation: true })
  await b.startHybrid(config(second)); await b.close()
  assert.deepEqual(h.counts(), { creates: 2, finalCloses: 2, releases: 1 })
})

test("unconfirmed final cleanup blocks further borrowing and preserves its owner", async () => {
  const h = harness(), signal = new AbortController().signal
  const a = h.connection.borrow({ connectionOwnerId: parent, signal })
  await a.startHybrid(config(first)); h.failRelease(); h.failFinal()
  const report = await a.close()
  assert.equal(report.status, "unconfirmed")
  const b = h.connection.borrow({ connectionOwnerId: other, signal })
  await assert.rejects(b.startHybrid(config(second)), error =>
    error instanceof Error && !(error instanceof RuntimeCleanupRequiredError)
      && "ownerId" in error && error.ownerId === parent)
  await b.close()
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 1, releases: 1 })
})

test("a response naming another parent is not accepted as retained cleanup proof", async () => {
  const h = harness(), signal = new AbortController().signal
  const a = h.connection.borrow({ connectionOwnerId: parent, signal })
  await a.startHybrid(config(first)); h.wrongOwner()
  assert.equal((await a.close()).retainedConnection, undefined)
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 1, releases: 1 })
})

test("retained connection ownership is part of the digest and cannot claim child exit", () => {
  const stages = RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "not_required" as const, code: null }))
  const old = cleanupReport(stages, false)
  const retained = cleanupReport(stages, false, { ownerId: parent, scope: "task" })
  assert.notEqual(old.evidenceDigest, retained.evidenceDigest)
  assert.equal(runnerCleanupReportSchema.safeParse({ ...retained,
    retainedConnection: { ownerId: other, scope: "task" } }).success, false)
  assert.throws(() => cleanupReport(stages.map(stage => ({ ...stage, status: "confirmed" })),
    false, { ownerId: parent, scope: "task" }))
})

test("production runtime uses the shared connection for independent operations", async t => {
  const h = harness(), directory = await mkdtemp(path.join(tmpdir(), "bat-connection-runtime-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const runtime = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory,
    subject: {} as ConstructorParameters<typeof PythonUpstreamBrowserRuntime>[0]["subject"] }, h.connection)
  const signal = new AbortController().signal
  const reports: unknown[] = []
  for (const ownerId of [first, second]) {
    const result = await runtime.withCapabilities({ ownerId, signal, connectionOwnerId: parent,
      allowedOrigins: ["https://example.test"], closeAfterOperation: ownerId === second,
      onCleanup: report => reports.push(report) }, async () => "business-output")
    assert.equal(result, "business-output")
  }
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 1, releases: 1 })
  assert.equal(reports.length, 2)
  const starts = h.starts as { managedWindow: { ownerId: string } }[]
  assert.deepEqual(starts.map(value => value.managedWindow.ownerId), [first, second])
  const diagnostics = (await readFile(path.join(directory, "source-lifecycle-diagnostics", first + ".jsonl"), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line) as { phase: string; cleanup?: { retainedConnection?: unknown } })
  assert.deepEqual(diagnostics.find(value => value.phase === "runtime_outcome")?.cleanup?.retainedConnection,
    { ownerId: parent, scope: "task" })
})

test("actual fd3 child survives phase release and closes only at the final boundary", async () => {
  let creates = 0
  const connection = new TaskConnection(process.cwd(), (root, signal, diagnostic) => {
    creates++
    const runner = new RunnerProcess(root, signal, diagnostic, {
      runnerScript: fileURLToPath(new URL("runner-process-child.py", import.meta.url)),
      resolveBrowserEndpoint: async () => "ws://127.0.0.1:12345/devtools/browser/controlled",
    })
    runner.envValue = () => undefined
    return runner
  })
  try {
    const signal = new AbortController().signal
    const a = connection.borrow({ connectionOwnerId: parent, signal })
    await a.startHybrid(config(first))
    assert.equal((await a.close()).retainedConnection?.ownerId, parent)
    const b = connection.borrow({ connectionOwnerId: parent, signal, closeAfterOperation: true })
    await b.startHybrid(config(second))
    const report = await b.close()
    assert.equal(creates, 1)
    assert.equal(report.status, "confirmed")
    assert.equal(report.stages.find(stage => stage.stage === "child_exit")?.status, "confirmed")
    assert.equal(report.stages.find(stage => stage.stage === "temporary_directory")?.status, "confirmed")
  } finally { await connection.close() }
})

test("service owner closes an idle retained task connection exactly once", async () => {
  const h = harness(), signal = new AbortController().signal
  const a = h.connection.borrow({ connectionOwnerId: parent, signal })
  await a.startHybrid(config(first)); await a.close()
  const report = await h.connection.close()
  assert.equal(report.status, "confirmed")
  assert.equal(report.retainedConnection, undefined)
  await h.connection.close()
  assert.deepEqual(h.counts(), { creates: 1, finalCloses: 1, releases: 1 })
})

test("human handoff resume keeps its original lease protocol without a new operation group", async t => {
  const h = harness(), directory = await mkdtemp(path.join(tmpdir(), "bat-connection-resume-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const starts: Parameters<RunnerProcess["startHybrid"]>[0][] = []
  t.mock.method(RunnerProcess.prototype, "startHybrid", async (value: Parameters<RunnerProcess["startHybrid"]>[0]) => {
    starts.push(value)
  })
  t.mock.method(RunnerProcess.prototype, "close", async () => finalReport())
  const runtime = new PythonUpstreamBrowserRuntime({ root: process.cwd(), directory,
    subject: {} as ConstructorParameters<typeof PythonUpstreamBrowserRuntime>[0]["subject"] }, h.connection)
  await runtime.withCapabilities({ ownerId: first, signal: new AbortController().signal,
    connectionOwnerId: parent, closeAfterOperation: true, allowedOrigins: ["https://example.test"],
    managedWindow: { ownerId: first, resume: true } }, async () => null)
  assert.deepEqual(starts[0]?.managedWindow, { ownerId: first, resume: true })
  assert.equal(starts[0]?.connectionOwnerId, undefined)
  assert.deepEqual(h.counts(), { creates: 0, finalCloses: 0, releases: 0 })
})

test("the TS boundary admits task groups only for fresh attached operation leases", () => {
  const value = { id: first, type: "hybrid_start", config: {
    ...config(first), managedWindow: undefined, connectionOwnerId: parent,
    allowedSites: [{ scheme: "https", domain: "example.test", port: null, includeSubdomains: false }],
    existingBrowser: { ownerId: first, resume: false, cdpUrl: "ws://127.0.0.1:12345/devtools/browser/controlled" },
  } }
  assert.equal(hybridStartRequestSchema.safeParse(value).success, true)
  assert.equal(hybridStartRequestSchema.safeParse({ ...value, config: { ...value.config,
    existingBrowser: { ...value.config.existingBrowser, resume: true } } }).success, false)
  assert.equal(hybridStartRequestSchema.safeParse({ ...value, config: { ...value.config,
    existingBrowser: undefined, managedWindow: config(first).managedWindow } }).success, false)
})
