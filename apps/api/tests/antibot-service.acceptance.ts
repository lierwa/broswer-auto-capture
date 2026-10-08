// WHY：访问独立常驻保护入口，复用正常准备/发布/复跑，不以手编 Runner 动作代替产品链路。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import Database from "better-sqlite3"
import { z } from "zod"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { taskRequirementSchema } from "@browser-capture/contracts"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { releaseReference } from "../src/task-chain/chain-revision.js"

if (!process.argv.includes("--daily-visible-session")) throw Error("explicit_daily_session_required")
const root = process.cwd(), admin = "http://127.0.0.1:4188", origin = "http://127.0.0.1:4187"
const product = "http://127.0.0.1:4175"
const preflight = await fetch(`${product}/api/browser/daily-chrome`, { headers: { origin: product, "sec-fetch-site": "same-origin" } })
z.object({ paired: z.literal(true), connected: z.literal(false), busy: z.literal(false), popupRequest: z.null() }).parse(await preflight.json())
await mkdir(path.join(root, "work/antibot-service"), { recursive: true })
const directory = await mkdtemp(path.join(root, "work/antibot-service/product-"))
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
async function local(route: string, value?: unknown) {
  const response = await fetch(admin + route, { ...(value === undefined ? {} : { method: "POST", body: JSON.stringify(value) }),
    headers: { origin: admin, "content-type": "application/json" } })
  if (!response.ok) throw Error(`lab_request_${response.status}`)
  return await response.json() as unknown
}
const caseSchema = z.object({ id: z.uuid(), url: z.url() })
const item = caseSchema.parse(await local("/api/cases", { kind: "catalog", variant: 1 }))
const db = new Database(path.join(root, "data/workbench.sqlite"), { readonly: true })
const row = db.prepare("SELECT selection FROM aiSettings WHERE subjectId=?").get(SHARED_AI_SUBJECT) as { selection: string }
db.close()
const selection = parseModelSelection(JSON.parse(row.selection))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data/ai-connect") }) })
const extension = new DailyChromeExtension(root, path.join(root, "data"), () => { throw Error("existing_relay_must_stay_idle") })
const endpoint = async (ownerId?: string) => {
  if (!ownerId) throw Error("owner_required")
  const value = await extension.endpoint(false, ownerId)
  if (!value) throw Error("daily_authorization_unavailable")
  return value
}
const runtime = new PythonUpstreamBrowserRuntime({ root, directory, subject: ai.forSubject(SHARED_AI_SUBJECT),
  browserMode: () => "daily", dailyChromeEndpoint: endpoint, dailyChromeInspectionEndpoint: endpoint })
const api = await createApplication({ root, directory, ai, upstreamBrowserRuntime: runtime })
api.store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
api.store.saveBrowserEnvironment("daily", 0)
const taskId = api.store.taskAction({ type: "create", requestId: randomUUID() })
const goal = "在当前页面全部资料版本中，打开版本号最大的已发布资料，排除预告未发布版本。"
const body = `# 目标\n${goal}\n## 试做入口\n1. ${item.url}\n## 运行输入\n- 无\n## 任务步骤\n1. 选择并打开目标\n- 输入：任务输入\n- 执行：一次执行\n- 产出：最终结果\n- 目标：${goal}\n## 代表试做\n${goal}\n## 结果与完成\n- 交付：完成状态\n- 执行方式：一次执行\n- 页面交付：无需保留\n完成标准：每次根据当次页面候选重新选择并打开目标；若没有合格候选，明确失败，不得打开不合格条目。`
const stamp = new Date().toISOString(), resolutionId = randomUUID()
api.store.mutate(taskId, state => {
  state.revision = 1; state.confirmedVersion = 1
  state.drafts.push({ version: 1, revision: 1, title: goal, markdown: body, brief: null })
  state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "已授权的本机检测服务联调",
    messageId: null, questionId: null, draftVersion: 1, createdAt: stamp })
})
api.taskChain.repository.saveRequirement(taskRequirementSchema.parse({ ...extractionFixture.requirement, id: randomUUID(), taskId,
  goal, inputContract: null, outputContract: null, definition: { format: "markdown", body },
  confirmation: { confirmedAt: stamp, requestId: randomUUID() }, confirmationFacts: { decisions: [],
    sources: [{ resolutionId, label: goal, url: item.url, origin, domain: "127.0.0.1", provider: "user_provided", query: item.url }],
    entries: [{ url: item.url, resolutionId }], resultExpectation: goal, unresolvedItemCount: 0 } }))
async function settle() {
  const end = Date.now() + 300_000; let previous = ""
  while (api.taskChain.isAnyActive()) {
    const job = api.taskChain.repository.jobs(taskId).at(-1)
    const stage = `${job?.status}/${job?.authoring?.stage}/${job?.authoring?.progress?.actionsStarted}`
    if (stage !== previous) { console.log(JSON.stringify({ stage })); previous = stage }
    if (Date.now() > end) throw Error("product_acceptance_timeout")
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}
async function business(expected: number | null) {
  const execution = api.taskChain.repository.executions(taskId).at(-1)!
  assert.equal(execution.status, expected === null ? "failed" : "completed", JSON.stringify(execution.reason))
  const report = z.object({ business: z.array(z.object({ case_id: z.string(), action: z.string(), value: z.string() })) }).parse(await local("/api/report"))
  const selected = report.business.filter(event => event.case_id === item.id && event.action === "selected")
  if (expected !== null) assert.equal(JSON.parse(selected[0]!.value).version, expected)
  assert.ok(selected.every(event => JSON.parse(event.value).version !== 99), "ineligible_document_opened")
}
console.log(JSON.stringify({ stage: "start", directory, taskId, case: item, model: selection.modelId, browser: "daily" }))
try {
  await save("manifest.json", { taskId, case: item, startedAt: stamp, browser: "daily", model: selection.modelId, root })
  await save("detector-before.json", await local("/api/report"))
  api.taskChain.dispatch(taskId, { type: "prepare_task", requestId: randomUUID(), requirementVersion: 1 })
  await settle()
  const draft = api.taskChain.repository.draft(taskId)
  assert.ok(draft, `draft_missing:${api.taskChain.repository.jobs(taskId).at(-1)?.reason}`)
  assert.ok(draft.content.steps.some(step => step.chain.nodes.some(n => n.kind === "function")), "dynamic_function_missing")
  await business(7)
  await local(`/api/cases/${item.id}/variant`, { variant: 2 })
  api.taskChain.dispatch(taskId, { type: "trial_task_draft", requestId: randomUUID(), input: null,
    draftId: draft.id, expectedRevision: draft.revision, expectedChecksum: draft.checksum })
  await settle(); await business(11)
  api.taskChain.dispatch(taskId, { type: "publish_task_draft", requestId: randomUUID(), draftId: draft.id,
    expectedRevision: draft.revision, expectedChecksum: draft.checksum })
  const release = api.taskChain.repository.releases(taskId).at(-1)!
  assert.ok(release, "published_release_missing")
  for (const variant of [3, 4]) {
    await local(`/api/cases/${item.id}/variant`, { variant })
    api.taskChain.dispatch(taskId, { type: "run_task", requestId: randomUUID(), input: null, release: releaseReference(release) })
    await settle(); await business(variant === 3 ? 13 : null)
  }
  assert.ok(api.taskChain.repository.runs(taskId).every(run => run.modelCalls.length === 0), "ordinary_replay_called_model")
  await save("release.json", release)
  await save("proof.json", { passed: true, zeroReplayModelCalls: true, values: [7, 11, 13], ineligible99Rejected: true })
  console.log(JSON.stringify({ stage: "passed", taskId, directory }))
} catch (error) {
  await save("failure.json", { type: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : "unknown" })
  process.exitCode = 1
} finally {
  await save("jobs.json", api.taskChain.repository.jobs(taskId))
  await save("executions.json", api.taskChain.repository.executions(taskId))
  await save("runs.json", api.taskChain.repository.runs(taskId))
  await save("detector-after.json", await local("/api/report"))
  try { await api.app.close() } finally { await extension.disconnect() }
  await save("closed.json", { hostClosed: true, ownRelayDisconnected: true, persistentDetectorStopped: false })
  console.log(JSON.stringify({ stage: "closed", directory }))
}
