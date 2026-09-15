// 显式真实产品验收入口，不属于 npm test；只访问本机临时页面，产物写入 work/。
import { createHash, randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import type { JsonValue, TaskChainState, TaskRun } from "@browser-capture/contracts"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"

if (!process.argv.includes("--real")) throw new Error("真实上游产品验收需要显式 --real")
const root = fileURLToPath(new URL("../../../", import.meta.url))
const directory = path.join(root, "work", `upstream-product-${Date.now()}`)
const evidencePath = path.join(directory, "result.json")
await mkdir(directory, { recursive: true })
process.env.BAT_UPSTREAM_BROWSER_HEADLESS = "1"
process.env.BAT_UPSTREAM_BROWSER_EXECUTABLE ??= "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

const server = createServer((request, response) => {
  const second = request.url?.startsWith("/second") ?? false
  const component = second ? { name: "Beryl", release: "8.2" } : { name: "Aster", release: "7.4" }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
  response.end(`<!doctype html><html><body><main><h1>${component.name}</h1><p>Component release catalog</p>
    <button id="details">Release details</button><section id="release" hidden><h2>Release details</h2>
    <p>Name: <strong>${component.name}</strong></p><p>Release: <strong>${component.release}</strong></p></section></main>
    <script>document.querySelector('#details').addEventListener('click',()=>document.querySelector('#release').hidden=false)</script>
    </body></html>`)
})

let application: Awaited<ReturnType<typeof createApplication>> | undefined
let ai: Awaited<ReturnType<typeof createAI>> | undefined
const evidence: Record<string, JsonValue> = { mode: "real-upstream-product/v1", startedAt: new Date().toISOString(), closed: false }
try {
  const base = await listen(server), sampleUrl = `${base}/`, verificationUrl = `${base}/second`
  const selection = liveSelection()
  evidence.selection = { connectionIdHash: digest(selection.connectionId), modelId: selection.modelId,
    reasoningEffort: selection.reasoningEffort }
  ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
  application = await createApplication({ root, directory, ai,
    browserExecutor: async () => { throw new Error("legacy_browser_runtime_forbidden") } })
  application.store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
  const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
  confirmRequirement(application.store, taskId)

  application.taskChain.dispatch(taskId, { type: "author_task", requestId: randomUUID(), requirementVersion: 1,
    input: { startUrl: sampleUrl } })
  let state = await waitFor(application.taskChain, taskId, (value) => {
    const job = value.jobs.findLast((item) => item.type === "chain")
    if (!job || ["queued", "running", "waiting_for_human"].includes(job.status)) return false
    return job.status !== "completed"
      || value.runs.some((run) => run.mode === "sample" && !["queued", "running"].includes(run.status))
  })
  const job = state.jobs.findLast((item) => item.type === "chain")!
  if (job.status !== "completed") throw new Error(job.reason ?? "upstream_authoring_failed")
  let chain = state.chains.at(-1)!
  const sample = state.runs.findLast((run) => run.mode === "sample")!
  assertRun(sample, { name: "Aster", release: "7.4" })

  application.taskChain.dispatch(taskId, { type: "validate_chain", requestId: randomUUID(),
    chain: { id: chain.id, version: chain.version, digest: sample.binding.chain.digest },
    mode: "verification", input: { startUrl: verificationUrl } })
  state = await waitFor(application.taskChain, taskId, (value) => value.chains.some((item) => item.id === chain.id
    && item.version === chain.version && item.validation.status === "verified"))
  chain = state.chains.find((item) => item.id === chain.id && item.version === chain.version)!
  const verification = state.runs.findLast((run) => run.mode === "verification")!
  assertRun(verification, { name: "Beryl", release: "8.2" })

  const plan = state.plans.find((item) => item.id === chain.plan.id && item.version === chain.plan.version)!
  application.taskChain.dispatch(taskId, { type: "authorize_plan", requestId: randomUUID(),
    plan: chain.plan, input: { startUrl: sampleUrl } })
  state = await waitFor(application.taskChain, taskId, (value) => value.executions.some((item) =>
    ["completed", "partial", "blocked", "failed", "cancelled", "stale"].includes(item.status)))
  const execution = state.executions.at(-1)!
  if (execution.status !== "completed") throw new Error(execution.reason ?? "authorized_replay_failed")
  const replay = state.runs.findLast((run) => run.mode === "replay")!
  assertRun(replay, { name: "Aster", release: "7.4" })

  evidence.taskId = taskId
  evidence.plan = { id: plan.id, version: plan.version, steps: plan.steps.length }
  evidence.chain = { id: chain.id, version: chain.version, status: chain.validation.status,
    evidence: chain.validation.evidence.map((item) => ({ phase: item.phase, passed: item.passed,
      inputDigest: item.inputDigest, modelCalls: item.modelCalls })) }
  evidence.runs = [sample, verification, replay].map(runSummary)
  evidence.execution = { id: execution.id, status: execution.status, output: execution.output }
  evidence.closed = true
} catch (error) {
  evidence.failure = error instanceof Error ? error.message : "unknown_error"
  process.exitCode = 1
} finally {
  await application?.app.close().catch(() => {})
  if (!application) ai?.close()
  await close(server)
  evidence.completedAt = new Date().toISOString()
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n")
  process.stdout.write(`${JSON.stringify(evidence)}\nEVIDENCE ${evidencePath}\n`)
}

function liveSelection() {
  const database = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true, fileMustExist: true })
  try {
    const row = database.prepare("select selection from aiSettings where subjectId = ?").get(SHARED_AI_SUBJECT) as { selection?: string } | undefined
    if (!row?.selection) throw new Error("live_model_selection_missing")
    return parseModelSelection(JSON.parse(row.selection))
  } finally { database.close() }
}

function confirmRequirement(store: Awaited<ReturnType<typeof createApplication>>["store"], taskId: string) {
  store.mutate(taskId, (state) => {
    state.revision = 1
    state.drafts.push({ version: 1, revision: 1, title: "本地组件版本核验", brief: null,
      markdown: "# 本地组件版本核验\n\n访问运行输入 startUrl，只读打开页面正常提供的 Release details，返回同一组件的非空 name 和完整 release。不得访问其他来源、提交表单或猜测字段。" })
    state.confirmedVersion = 1
    state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
      messageId: null, questionId: null, draftVersion: 1, createdAt: new Date().toISOString() })
  })
}

async function waitFor(service: Awaited<ReturnType<typeof createApplication>>["taskChain"], taskId: string,
  condition: (state: TaskChainState) => boolean) {
  const started = Date.now()
  while (true) {
    const state = service.snapshot(taskId)
    if (condition(state)) return state
    if (Date.now() - started > 480_000) throw new Error("real_upstream_product_timeout")
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

function assertRun(run: TaskRun, expected: JsonValue) {
  if (run.status !== "completed") throw new Error(run.outcome?.reason ?? `run_not_completed:${run.mode}`)
  const output = Object.values(run.outputs).find((item) => item.kind === "value")
  if (!output || output.kind !== "value" || JSON.stringify(output.value) !== JSON.stringify(expected)) {
    throw new Error(`run_output_mismatch:${run.mode}:${JSON.stringify(output)}`)
  }
  const purposes = run.modelCalls.filter((call) => call.status !== "intended").map((call) => call.purpose)
  if (!purposes.includes("extract") || !purposes.includes("output_conversion") || !run.auditComplete) {
    throw new Error(`run_model_audit_incomplete:${run.mode}`)
  }
}

function runSummary(run: TaskRun) {
  const output = Object.values(run.outputs).find((item) => item.kind === "value")
  return { runId: run.binding.runId, mode: run.mode, status: run.status, output: output ?? null,
    consumed: run.consumed, modelCalls: run.modelCalls.map((call) => ({ purpose: call.purpose,
      status: call.status, reportedInvocations: call.reportedInvocations })), auditComplete: run.auditComplete }
}

function digest(value: string) { return createHash("sha256").update(value).digest("hex") }
function listen(server: ReturnType<typeof createServer>) {
  return new Promise<string>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") return reject(new Error("fixture_address_missing"))
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}
function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()))
}
