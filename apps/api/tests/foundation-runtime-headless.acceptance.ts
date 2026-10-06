// WHY：经生产 runtime、Python IPC、SQLite 和新 runner 恢复验证，禁止模型及日常浏览器。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { access, mkdir, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import path from "node:path"
import { jsonValueSchema, type TaskRun, type TaskDataContract } from "@browser-capture/contracts"
import { TaskChainRuntime, compileTaskChain, executableChainDigest } from "@browser-capture/runtime"
import { capabilityEffectChain, requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import type { RunnerCleanupReport } from "../src/upstream-browser/cleanup.js"

if (process.env.BAT_RUN_FOUNDATION_PROBE !== "1") throw new Error("explicit_headless_probe_required")
// Python 入口用 Playwright 启动独立 headless Chrome；传输层 attached 模式不负责启动或改变其显示模式。
const endpoint = process.env.BAT_FOUNDATION_HEADLESS_ENDPOINT
if (!endpoint?.startsWith("ws://127.0.0.1:")) throw new Error("owned_headless_browser_required")
const root = path.resolve(import.meta.dirname, "../../..")
const directory = path.join(root, "work", "foundation-contract-20261006", `runtime-${Date.now()}`)
await mkdir(directory, { recursive: true })
const server = createServer((_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end('<title>Local runtime fixture</title><main><p>One</p><p>Two</p><p>Three</p></main>')
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
if (!address || typeof address === "string") throw new Error("fixture_address_invalid")
const url = `http://127.0.0.1:${address.port}/fixture`
let store = await ProductStore.open(directory), repository = new TaskContractRepository(store)
const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
const chain = makeChain(taskId, url), frozen = executableChainDigest(chain)
compileTaskChain(chain)
const reports: RunnerCleanupReport[] = [], handoffs: string[] = [], handoffFailures: string[] = [], results: TaskRun[] = []
const owners: Array<{ ownerId: string; profilePath: string }> = []
const persist = async (run: TaskRun) => { repository.saveRun(run) }
try {
  for (const amount of [1, 3]) {
    const ownerId = randomUUID(), runDirectory = path.join(directory, `amount-${amount}`)
    const profilePath = path.join(runDirectory, "browser-profile", "default")
    owners.push({ ownerId, profilePath })
    const request = requestFor(chain, { amount }, "replay", randomUUID(), randomUUID())
    const browserInput = { root, directory: runDirectory, ownerId, profilePath, headless: false,
      allowedOrigins: [new URL(url).origin], signal: AbortSignal.timeout(120_000),
      createRunner: (root: string, signal: AbortSignal, onDiagnostic?: (line: string) => void): RunnerProcess =>
        new RunnerProcess(root, signal, onDiagnostic, { browserMode: "daily", resolveExtensionEndpoint: async (): Promise<string> => endpoint,
          resolveBrowserEndpoint: async () => { throw new Error("personal_browser_lookup_forbidden") } }),
      onCleanup: (report: RunnerCleanupReport) => { reports.push(report) } }
    const stop = new AbortController()
    let last: TaskRun | undefined
    const paused: TaskRun = await withHybridCapabilities({ ...browserInput, managedWindow: { ownerId, resume: false },
      handoffPurpose: () => "human_wait", onHandoff: (_purpose, lease) => { handoffs.push(lease.ownerId) },
      onHandoffFailure: (_purpose, reason) => { handoffFailures.push(reason) } },
    capabilities => new TaskChainRuntime().execute({ chain, request, capabilities: { ...capabilities,
      persist: async run => { last = run; await persist(run) } }, control: { signal: stop.signal,
      pacing: { beforeNode: async () => {
        if (last?.events.some(event => event.nodeId === "observe" && event.status === "finished"
          && event.outcome === "success")) stop.abort()
      } } } }))
    assert.equal(paused.status, "paused", JSON.stringify(paused.outcome))
    assert.equal(paused.checkpoint?.pendingEffect, null)
    assert.equal(handoffs.at(-1), ownerId, JSON.stringify(handoffFailures))
    await writeFile(path.join(runDirectory, "paused.json"), JSON.stringify(paused))
    await store.close()
    store = await ProductStore.open(directory); repository = new TaskContractRepository(store)
    const saved = repository.run(taskId, paused.binding.runId)
    assert.deepEqual(saved, paused)
    const checkpoint = saved.checkpoint!
    const completed = await withHybridCapabilities({ ...browserInput, managedWindow: { ownerId, resume: true } },
      capabilities => new TaskChainRuntime().execute({ chain, request, capabilities: { ...capabilities, persist,
        verifyResume: async (checkpoint, signal) => {
          const result = await capabilities.verifyResume!(checkpoint, signal)
          await writeFile(path.join(runDirectory, "resume-check.json"), JSON.stringify({ expected: checkpoint.browser, result }))
          return result
        } },
        control: { checkpoint, resumeRequest: { contractVersion: checkpoint.contractVersion,
          requestId: randomUUID(), binding: checkpoint.binding, checkpointId: checkpoint.id,
          expectedSequence: checkpoint.sequence } } }))
    assert.equal(completed.status, "completed", JSON.stringify(completed.outcome))
    assert.equal(completed.binding.runId, saved.binding.runId)
    assert.equal(completed.events.filter(event => event.nodeId === "observe" && event.status === "finished"
      && event.outcome === "success").length, 1)
    assert.deepEqual(completed.events.slice(0, saved.events.length), saved.events)
    assert.equal(completed.modelCalls.length, 0)
    assert.equal(executableChainDigest(chain), frozen)
    const read = completed.events.findLast(event => event.nodeId === "capability" && event.status === "finished")
    assert.ok(read)
    const result = completed.outputs.result
    assert.equal(result?.kind, "value")
    assert.ok(result?.kind === "value")
    assert.deepEqual(result.value, ["One", "Two", "Three"].slice(0, amount).map(value => ({ value })))
    results.push(completed)
  }
  assert.notEqual(results[0]!.binding.runId, results[1]!.binding.runId)
  assert.ok(reports.every(report => report.status === "confirmed"))
  const proof = { passed: true, headless: true, personalProfileTouched: false, modelCalls: 0,
    sqliteReopened: true, runnerRecreated: true, sameRunResumed: true, navigationNotRepeated: true,
    inputAmounts: [1, 3], frozenChainDigest: frozen, cleanupConfirmed: true }
  await writeFile(path.join(directory, "proof.json"), JSON.stringify(proof, null, 2))
  console.log(JSON.stringify({ ...proof, directory }))
} finally {
  await store.close()
  // 只核验/结束本样本已知 owner；浏览器服务及用户的 Profile 都不在这个路径。
  try {
    for (const owned of owners) {
      if (!await access(path.join(owned.profilePath, "..", "attached-window-lease.json")).then(() => true, () => false)) continue
      const runner = new RunnerProcess(root, AbortSignal.timeout(30_000))
      try {
        await runner.managedWindowAction({ action: "end", ...owned, leaseId: owned.ownerId,
          browserMode: "daily", cdpUrl: endpoint, controllerReleased: true })
      } finally { await runner.close() }
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
}

function makeChain(taskId: string, url: string) {
  const chain = capabilityEffectChain()
  chain.taskId = taskId; chain.budget.maxActiveMs = 120_000; chain.budget.maxLlmCalls = 0
  const contract = (id: string, schema: TaskDataContract["schema"]): TaskDataContract => ({
    id, version: 1, dialect: "bat-value-schema/v1", schema })
  chain.inputContract = contract("amount-input", { type: "object", properties: {
    amount: { type: "integer", minimum: 1, maximum: 3 } }, required: ["amount"], additionalProperties: false })
  const output = contract("rows", { type: "array", items: { type: "object", properties: { value: { type: "string" } },
    required: ["value"], additionalProperties: false }, maxItems: 3 })
  chain.outputContract = output
  const navigate = chain.nodes[0]!, read = chain.nodes[1]!, done = chain.nodes[2]!
  if (navigate.kind !== "capability" || read.kind !== "capability" || done.kind !== "terminal") throw Error("fixture")
  navigate.capability.name = "browser.workflow-step"; navigate.effect = "idempotent_write"; navigate.timeoutMs = 30_000
  navigate.input = { url: { source: "constant", value: url } }
  navigate.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
  read.capability.name = "browser.read-fields"; read.effect = "read"; read.timeoutMs = 30_000; read.outputContract = output
  read.input = { take: { source: "input", path: ["amount"] } }
  read.config = jsonValueSchema.parse({ readTakeInput: "take", runtimeScopeFrom: "observe", scope: { url }, specification: {
    container: "main p", fields: { value: { selector: ":scope", attribute: null, valueType: "string" } },
    maxItems: 300, take: 2, outputSchema: output.schema } })
  done.result = { name: "result", output: { kind: "value", value: { source: "node", nodeId: read.id, path: [] } }, contract: output }
  done.outputContract = output
  return chain
}
