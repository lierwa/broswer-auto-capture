import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import { createServer } from "node:http"
import { directoryFixture } from "./helpers/account-directory-fixture.js"
import { seedRunControl } from "./helpers/run-control-fixture.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"

// WHY：真实 UI/API/SQLite 验收使用独立数据库和零模型执行器，绝不打开个人浏览器。
const fixture = await directoryFixture(true), { api, state, upstream } = fixture
const seeded = seedRunControl(api.store, api.taskChain, "http://127.0.0.1:4198")
api.store.taskAction({ type: "rename", id: seeded.taskId, title: "受控恢复与通知样本" })
await api.browserEnvironment.select({ mode: "daily", expectedRevision: api.browserEnvironment.snapshot().revision })
await fixture.command("add")
let firstFailure = true
upstream.withCapabilities = async (input, work) => {
  state.calls++
  if (firstFailure) throw Error("synthetic_startup_connection_refused")
  const result = await work({ capability: async () => ({ outcome: "success", output: null }) })
  input.onHandoff?.(input.handoffPurpose?.() ?? "delivery", {
    ownerId: input.ownerId, leaseId: input.ownerId, active: true, targetDigest: "b".repeat(64), reason: null })
  input.onCleanup?.(cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "confirmed", code: null })), false))
  return result
}
state.refusal = true
const initial = await api.taskChain.dispatchAsync(seeded.taskId, { type: "run_task", requestId: randomUUID(),
  release: seeded.release, input: null, browser: { mode: "daily", headless: false }, pacing: { nodeDelayMs: 0 } })
const executionId = initial.acceptedExecution!.executionId
for (let attempt = 0; attempt < 100; attempt++) {
  const execution = api.taskChain.repository.execution(seeded.taskId, executionId)
  if (execution.status === "cleanup_required" && execution.cleanup.status === "unconfirmed" && !api.taskChain.isAnyActive()) break
  await new Promise(resolve => setTimeout(resolve, 50))
}
firstFailure = false; state.refusal = false
const steering = createServer((request, response) => {
  if (request.method === "POST") {
    const execution = api.taskChain.repository.execution(seeded.taskId, executionId)
    api.taskChain.repository.saveExecution({ ...execution, sequence: execution.sequence + 1, updatedAt: new Date().toISOString() })
  }
  response.setHeader("Content-Type", "application/json")
  response.end(JSON.stringify({ taskId: seeded.taskId, executionId, calls: state.calls,
    executions: api.taskChain.repository.executions(seeded.taskId) }))
})
await new Promise<void>(resolve => steering.listen(4199, "127.0.0.1", resolve))
await api.app.listen({ host: "127.0.0.1", port: 4198 })
console.log(JSON.stringify({ port: 4198, fixtureOnly: true }))
async function close() { steering.close(); await api.app.close(); await api.store.close(); await rm(fixture.directory, { recursive: true, force: true }); process.exit() }
process.on("SIGINT", () => void close()); process.on("SIGTERM", () => void close())
