// WHY：从正常 prepare_task 到发布和变化复跑；只使用本地页面、独立数据库和 headless 专属浏览器。
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
import { releaseReference } from "../src/task-chain/chain-revision.js"

if (process.env.BAT_RUN_METHOD_NATIVE !== "1") throw Error("explicit_local_acceptance_required")
const root = process.cwd(), parent = path.join(root, "work", "method-completion-proof")
await mkdir(parent, { recursive: true })
const directory = await mkdtemp(path.join(parent, "native-"))
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const hits: string[] = []
let variant = 0
const server = createServer((req, res) => {
  const route = req.url ?? "/", kind = route.startsWith("/record") ? "record" : "document"
  const id = route.split("/").at(-1) ?? "7"
  if (route === "/favicon.ico") { res.writeHead(404); res.end(); return }
  hits.push(route)
  const eligible = variant === 2 ? [] : variant === 0 ? [4, 7, 2] : [11, 4, 7]
  const rows = [...eligible.map(n => ({ n, available: true })), { n: 99, available: false }]
  if (variant === 1) rows.reverse()
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(`<title>${kind === "record" ? "待办记录" : "资料版本"}</title>
    <h1>当前已打开：${kind === "record" ? "记录" : "资料版本"} ${id}</h1>
    <p>${kind === "record" ? "优先级数值越大，优先级越高。" : "版本号越大，版本越新。"}</p>
    <main><h2>全部候选</h2>${rows.map(r => `<article><a class="item" href="/${kind}/${r.n}">
      ${kind === "record" ? `记录 ${r.n}，优先级 ${r.n}，${r.available ? "未关闭" : "已关闭"}`
        : `资料版本 ${r.n}，${r.available ? "已发布" : "预告未发布"}`}</a></article>`).join("")}</main>`)
})
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
const local = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const db = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true })
const row = db.prepare("SELECT selection FROM aiSettings WHERE subjectId=?").get(SHARED_AI_SUBJECT) as { selection: string }
db.close()
const selection = parseModelSelection(JSON.parse(row.selection))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const api = await createApplication({ root, directory, ai })
api.store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
api.store.saveBrowserEnvironment("dedicated-headless", 0)

async function settle(taskId: string) {
  const deadline = Date.now() + 240000
  let previous = ""
  while (api.taskChain.isAnyActive()) {
    const job = api.taskChain.repository.jobs(taskId).at(-1)
    const state = `${job?.status}/${job?.authoring?.stage}/${job?.authoring?.progress?.actionsStarted}`
    if (state !== previous) { console.log(JSON.stringify({ taskId, stage: state })); previous = state }
    if (Date.now() > deadline) throw Error("method_acceptance_timeout")
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}

async function exercise(kind: "document" | "record") {
  variant = 0
  const taskId = api.store.taskAction({ type: "create", requestId: randomUUID() }), entry = `${local}/${kind}/7`
  const stamp = new Date().toISOString(), resolutionId = randomUUID()
  const goal = kind === "document" ? "在当前页面全部资料版本中，打开版本号最大的已发布资料，排除预告未发布版本。"
    : "在当前页面全部记录中，打开优先级数值最大的未关闭记录，排除已关闭记录。"
  const body = `# 目标\n${goal}\n## 试做入口\n1. ${entry}\n## 运行输入\n- 无\n## 任务步骤\n1. 选择并打开目标\n- 输入：任务输入\n- 执行：一次执行\n- 产出：最终结果\n- 目标：${goal}\n## 代表试做\n${goal}\n## 结果与完成\n- 交付：完成状态\n- 执行方式：一次执行\n- 页面交付：无需保留\n完成标准：每次根据当次页面候选重新选择并打开目标；若没有合格候选，明确失败，不得打开不合格条目。`
  api.store.mutate(taskId, state => {
    state.revision = 1; state.confirmedVersion = 1
    state.drafts.push({ version: 1, revision: 1, title: goal, markdown: body, brief: null })
    state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "本地动态方法验收",
      messageId: null, questionId: null, draftVersion: 1, createdAt: stamp })
  })
  api.taskChain.repository.saveRequirement(taskRequirementSchema.parse({ ...extractionFixture.requirement,
    id: randomUUID(), taskId, goal, inputContract: null, outputContract: null, definition: { format: "markdown", body },
    confirmation: { confirmedAt: stamp, requestId: randomUUID() }, confirmationFacts: { decisions: [],
      sources: [{ resolutionId, label: goal, url: entry, origin: local, domain: "127.0.0.1", provider: "user_provided", query: entry }],
      entries: [{ url: entry, resolutionId }], resultExpectation: goal, unresolvedItemCount: 0 } }))
  const settled = (expected: number | null) => {
    const execution = api.taskChain.repository.executions(taskId).at(-1)!
    assert.equal(execution.status, expected === null ? "failed" : "completed", JSON.stringify(execution.reason))
    if (expected !== null) assert.equal(hits.at(-1), `/${kind}/${expected}`)
  }
  try {
    api.taskChain.dispatch(taskId, { type: "prepare_task", requestId: randomUUID(), requirementVersion: 1 })
    await settle(taskId)
    await save(`${kind}-preparation.json`, api.taskChain.repository.jobs(taskId))
    const draft = api.taskChain.repository.draft(taskId)
    assert.ok(draft, `draft_missing:${api.taskChain.repository.jobs(taskId).at(-1)?.reason}`)
    assert.ok(draft.content.steps.some(step => step.chain.nodes.some(n => n.kind === "function")), "dynamic_function_missing")
    settled(7)
    variant = 1; hits.length = 0
    api.taskChain.dispatch(taskId, { type: "trial_task_draft", requestId: randomUUID(), input: null,
      draftId: draft.id, expectedRevision: draft.revision, expectedChecksum: draft.checksum })
    await settle(taskId); settled(11)
    api.taskChain.dispatch(taskId, { type: "publish_task_draft", requestId: randomUUID(), draftId: draft.id,
      expectedRevision: draft.revision, expectedChecksum: draft.checksum })
    const release = api.taskChain.repository.releases(taskId).at(-1)!
    assert.ok(release, "published_release_missing")
    for (const next of [0, 2]) {
      variant = next; hits.length = 0
      api.taskChain.dispatch(taskId, { type: "run_task", requestId: randomUUID(), input: null, release: releaseReference(release) })
      await settle(taskId); settled(next === 2 ? null : 7)
      if (next === 2) assert.ok(!hits.some(h => h.endsWith("/99")), "ineligible_target_opened")
    }
    assert.ok(api.taskChain.repository.runs(taskId).every(run => run.modelCalls.length === 0), "replay_called_model")
    await save(`${kind}-release.json`, release)
    console.log(JSON.stringify({ stage: "passed", kind, taskId, zeroReplayModelCalls: true }))
  } finally {
    await save(`${kind}-jobs.json`, api.taskChain.repository.jobs(taskId))
    await save(`${kind}-executions.json`, api.taskChain.repository.executions(taskId))
    await save(`${kind}-runs.json`, api.taskChain.repository.runs(taskId))
  }
}

console.log(JSON.stringify({ stage: "start", directory, headless: true, localOnly: true, model: selection.modelId }))
try {
  await exercise("document")
  await exercise("record")
  await save("proof.json", { passed: true, headless: true, localOnly: true, zeroReplayModelCalls: true })
} catch (error) {
  await save("failure.json", { error: error instanceof Error ? error.message : "unknown" })
  console.error(error instanceof Error ? error.message : "unknown"); process.exitCode = 1
} finally {
  await api.app.close(); server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => resolve()))
  console.log(JSON.stringify({ stage: "closed", directory }))
}
