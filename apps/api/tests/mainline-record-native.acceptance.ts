// 显式真实模型/浏览器验收；正式 prepare_task 入口，不注入最终 source/chain/draft。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { taskRequirementSchema } from "@browser-capture/contracts"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"

if (process.env.BAT_RUN_MAINLINE_NATIVE !== "1") throw Error("explicit_native_acceptance_required")
const root = process.cwd(), parent = path.join(root, "work", "mainline-contract-proof")
const detailsOnly = process.env.BAT_RECORD_DETAILS_ONLY === "1"
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, "probe-"))
let count = 30
const server = createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8")
  const index = Number(req.url?.split("/").at(-1))
  res.end(req.url?.startsWith("/detail/")
    ? `<title>详情 ${index}</title><h1>记录 ${index}</h1><p class="size">规格 ${index}</p>${index === 2 ? "" : `<p class="price">${index * 10}</p>`}`
    : `<title>已按序排列的记录目录</title><h1>记录目录</h1><p>以下记录已经按名次排序。</p>${Array.from({ length: count }, (_, i) => `<article class="row"><a class="name" href="/detail/${i + 1}">记录 ${i + 1}</a></article>`).join("")}`)
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const entry = `http://127.0.0.1:${(server.address() as { port: number }).port}/list`
const db = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true })
const row = db.prepare("SELECT selection FROM aiSettings WHERE subjectId=?").get(SHARED_AI_SUBJECT) as { selection: string }
db.close()
const selection = parseModelSelection(JSON.parse(row.selection))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const api = await createApplication({ root, directory, ai })
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const stamp = new Date().toISOString(), taskId = api.store.taskAction({ type: "create", requestId: randomUUID() })
const resolutionId = randomUUID()
let body = `# 目标
按目录已有顺序采集前 5 条记录，逐条进入该记录详情读取规格及价格；价格缺失时标记缺失。
## 试做入口
1. ${entry}
## 运行输入
- 无
## 代表试做
调查列表并选择一个真实条目，研究详情读取方法；正式运行处理前 5 条，少于 5 条时返回实际条数。
## 结果与完成
- 交付：数据结果
- 结果形状：记录列表
- 结果数量：最多 5 条
- 字段：名次（整数）：目录中从 1 开始的顺序。
- 字段：名称（文本）：目录中的记录名称。
- 字段：链接（文本）：该记录详情链接。
- 字段：规格（文本）：详情展示的规格。
- 字段：价格（数字）：详情展示的价格；缺失时标记缺失。
- 页面交付：无需保留
- 完成标准：返回最多 5 条对应真实详情的记录；不足时返回已观察记录。`
if (detailsOnly) body = body.replace(/^- 字段：(名次|名称|链接).*\r?\n/gmu, "")
api.store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
api.store.saveBrowserEnvironment("dedicated-headless", 0)
api.store.mutate(taskId, state => {
  state.revision = 1; state.confirmedVersion = 1
  state.drafts.push({ version: 1, revision: 1, title: "列表到详情原生闭环", markdown: body, brief: null })
  state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "合成受控验收",
    messageId: null, questionId: null, draftVersion: 1, createdAt: stamp })
})
api.taskChain.repository.saveRequirement(taskRequirementSchema.parse({ ...extractionFixture.requirement,
  id: randomUUID(), taskId, goal: "列表到详情原生闭环", inputContract: null, outputContract: null,
  definition: { format: "markdown", body }, confirmation: { confirmedAt: stamp, requestId: randomUUID() },
  confirmationFacts: { decisions: [], sources: [{ resolutionId, label: "受控目录", url: entry,
    origin: new URL(entry).origin, domain: "127.0.0.1", provider: "user_provided", query: entry }],
    entries: [{ url: entry, resolutionId }], resultExpectation: "真实记录与详情对应", unresolvedItemCount: 0 } }))
console.log(JSON.stringify({ stage: "start", directory, taskId, model: selection.modelId }))
async function settle() {
  const deadline = Date.now() + 360_000
  let previous = ""
  while (api.taskChain.isAnyActive()) {
    const job = api.taskChain.repository.jobs(taskId).at(-1)!
    const state = `${job.status}/${job.authoring?.build?.stepId ?? ""}/${job.authoring?.stage ?? ""}/${job.authoring?.progress?.actionsStarted ?? 0}`
    if (state !== previous) { console.log(JSON.stringify({ stage: state })); previous = state }
    if (Date.now() > deadline) throw Error("native_mainline_timeout")
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
try {
  api.taskChain.dispatch(taskId, { type: "prepare_task", requestId: randomUUID(), requirementVersion: 1 })
  await settle()
  const job = api.taskChain.repository.jobs(taskId).at(-1)!
  await save("preparation.json", job)
  const draft = api.taskChain.repository.draft(taskId)
  assert.ok(draft, `native_draft_missing:${job.reason}`)
  await save("draft.json", draft)
  let executions = api.taskChain.repository.executions(taskId)
  await save("sample-executions.json", executions)
  assert.equal(executions.at(-1)?.status, "completed", "native_sample_failed")
  const firstResult = executions.at(-1)!.output
  const first = firstResult?.kind === "value" ? firstResult.value : null
  assert.ok(Array.isArray(first) && first.length === 5)
  assert.deepEqual(first.map(item => (item as Record<string, unknown>).规格), ["规格 1", "规格 2", "规格 3", "规格 4", "规格 5"])
  assert.ok(!Object.hasOwn(first[1] as object, "价格"))
  count = 2
  api.taskChain.dispatch(taskId, { type: "trial_task_draft", requestId: randomUUID(), draftId: draft.id,
    expectedRevision: draft.revision, expectedChecksum: draft.checksum, input: null })
  await settle()
  executions = api.taskChain.repository.executions(taskId)
  await save("executions.json", executions)
  const runs = api.taskChain.repository.runs(taskId)
  await save("runs.json", runs)
  assert.ok(executions.every(run => run.status === "completed"), "native_variable_count_failed")
  const secondResult = executions.at(-1)!.output
  const second = secondResult?.kind === "value" ? secondResult.value : null
  assert.ok(Array.isArray(second) && second.length === 2)
  if (!detailsOnly) assert.deepEqual(second.map(item => (item as Record<string, unknown>).名次), [1, 2])
  else assert.ok(second.every(item => !Object.hasOwn(item as object, "__batRecordEntry")))
  assert.ok(runs.every(run => run.modelCalls.length === 0), "ordinary_replay_called_model")
  console.log(JSON.stringify({ stage: "passed", directory, executions: executions.map(run => ({ id: run.id, status: run.status,
    output: run.output, items: run.steps.map(step => step.runIds.length) })), modelCalls: 0 }))
} catch (error) {
  await save("failure.json", { error: error instanceof Error ? error.message : "unknown",
    jobs: api.taskChain.repository.jobs(taskId), executions: api.taskChain.repository.executions(taskId) })
  console.error(JSON.stringify({ stage: "failed", directory, error: error instanceof Error ? error.message : "unknown" })); process.exitCode = 1
} finally {
  await api.app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
}
