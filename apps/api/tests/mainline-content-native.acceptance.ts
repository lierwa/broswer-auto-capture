// WHY：真实 prepare_task→发布→正式复跑保护整份范围采集、逐项身份和零模型复跑；不注入 source/chain。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { taskRequirementSchema } from "@browser-capture/contracts"
import { browserModeSchema } from "@browser-capture/contracts/browser-profile"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { releaseReference } from "../src/task-chain/chain-revision.js"

if (process.env.BAT_RUN_MAINLINE_NATIVE !== "1") throw Error("explicit_native_acceptance_required")
const root = process.cwd(), mode = process.env.BAT_CONTENT_NATIVE_MODE ?? "fixture"
assert.ok(["fixture", "operation", "jd"].includes(mode))
const parent = path.join(root, "work", "content-capture-proof")
await mkdir(parent, { recursive: true })
const replayDirectory = process.env.BAT_CONTENT_REPLAY_DIRECTORY
const directory = replayDirectory ? path.resolve(replayDirectory) : await mkdtemp(path.join(parent, `${mode}-`))
assert.ok(path.relative(parent, directory) && !path.relative(parent, directory).startsWith(".."), "probe_directory_outside_workspace")
const priorDb = replayDirectory ? new Database(path.join(directory, "workbench.sqlite"), { readonly: true }) : null
const priorRow = priorDb?.prepare("SELECT body FROM taskContracts WHERE kind='requirement' ORDER BY version DESC LIMIT 1").get() as { body: string } | undefined
const priorRequirement = priorRow ? taskRequirementSchema.parse(JSON.parse(priorRow.body)) : null
priorDb?.close()
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")
let count = 3
const server = createServer((req, res) => {
  if (req.url === "/image.png") { res.setHeader("content-type", "image/png"); res.end(image); return }
  res.setHeader("content-type", "text/html; charset=utf-8")
  const index = Number(req.url?.split("/").at(-1))
  if (req.url === "/operation") {
    res.end(`<title>通知设置</title><h1>通知设置</h1><button aria-pressed="false"
      onclick="this.setAttribute('aria-pressed','true');document.querySelector('#status').textContent='通知已启用'">启用通知</button><p id="status">通知尚未启用</p>`)
  } else if (req.url?.startsWith("/detail/")) {
    res.end(`<title>资料 ${index}</title><h1>资料 ${index}</h1><p>此段不是所需内容。</p>
      <button aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');document.querySelector('#content').hidden=false">展开资料内容</button>
      <section id="content" hidden><h2>资料内容 ${index}</h2><table><tr><th>原始属性</th><td>内容 ${index}</td></tr></table><img src="/image.png"></section>`)
  } else {
    res.end(`<title>资料目录</title><h1>按既有顺序排列的资料目录</h1>${Array.from({ length: count }, (_, i) =>
      `<article class="row"><button onclick="window.open('/detail/${i + 1}','_blank')">资料 ${i + 1}</button></article>`).join("")}`)
  }
})
const priorPort = priorRequirement?.confirmationFacts?.entries?.[0]?.url
await new Promise<void>(resolve => server.listen(priorPort ? Number(new URL(priorPort).port) : 0, "127.0.0.1", resolve))
const local = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const entry = mode === "jd" ? "https://www.jd.com/" : mode === "operation" ? `${local}/operation` : `${local}/list`
const db = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true })
const row = db.prepare("SELECT selection FROM aiSettings WHERE subjectId=?").get(SHARED_AI_SUBJECT) as { selection: string }
const configuredBrowser = db.prepare("SELECT mode FROM browserSettings WHERE id IN (?, 'local') ORDER BY id='local' LIMIT 1")
  .get("task:8c89cb43-3719-42a4-a281-552e6e3aa7a0") as { mode: string } | undefined
db.close()
const selection = parseModelSelection(JSON.parse(row.selection))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
const api = await createApplication({ root, directory, ai })
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
const stamp = new Date().toISOString(), taskId = priorRequirement?.taskId ?? api.store.taskAction({ type: "create", requestId: randomUUID() })
const resolutionId = randomUUID()
const operation = mode === "operation"
const title = operation ? "启用通知" : mode === "jd" ? "京东洗碗机销量前5原始详情" : "资料范围原始内容"
const selectionGoal = mode === "jd" ? "在京东搜索洗碗机，按销量排序，选择前5个商品真实详情入口；不足5个时报告实际数量。"
  : "按资料目录当前顺序选择前3个真实资料入口；不足3个时保留实际条目。"
const representative = operation ? "从入口点击启用通知，并观察通知已启用状态。"
  : mode === "jd" ? "进入本项商品详情，打开商品详情/配置所在区域，展开并滚动加载，整体采集其文字、表格及原图。不要逐个参数采集，不清洗。"
    : "进入本项资料页，点击展开资料内容，整体采集资料内容区域的文字、表格与原图；排除页标题、按钮和其它区域。不清洗，不逐字段采集。"
const body = `# 目标
${title}
## 试做入口
1. ${entry}
## 运行输入
- 无
## 任务步骤
1. ${operation ? "启用通知" : "选择实际入口"}
- 输入：任务输入
- 执行：一次执行
- 产出：${operation ? "最终结果" : "入口集合"}
- 目标：${operation ? representative : selectionGoal}
${operation ? "" : `
2. 保存每项原始内容
- 输入：步骤 1 的结果
- 执行：逐项执行
- 产出：最终结果
- 目标：${representative}
`}
## 代表试做
${representative}
## 结果与完成
- 交付：${operation ? "完成状态" : "页面内容"}
- 执行方式：${operation ? "一次执行" : "逐项执行"}
${operation ? "" : `- 来源选择：${selectionGoal}\n- 结果数量：最多 ${mode === "jd" ? 5 : 3} 条\n`}- 页面交付：无需保留
完成标准：${operation ? "通知状态为已启用。" : "每个已选入口交付相关区域原始图文及来源，保留未知参数。缺少条目如实报告；登录或访问限制等待用户，不绕过。"}`
if (!priorRequirement) {
api.store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
api.store.saveBrowserEnvironment(mode === "jd" ? browserModeSchema.parse(configuredBrowser?.mode ?? "daily") : "dedicated-headless", 0)
api.store.mutate(taskId, state => {
  state.revision = 1; state.confirmedVersion = 1
  state.drafts.push({ version: 1, revision: 1, title, markdown: body, brief: null })
  state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "范围采集整改真实验收",
    messageId: null, questionId: null, draftVersion: 1, createdAt: stamp })
})
api.taskChain.repository.saveRequirement(taskRequirementSchema.parse({ ...extractionFixture.requirement,
  id: randomUUID(), taskId, goal: title, inputContract: null, outputContract: null,
  definition: { format: "markdown", body }, confirmation: { confirmedAt: stamp, requestId: randomUUID() },
  confirmationFacts: { decisions: [], sources: [{ resolutionId, label: title, url: entry,
    origin: new URL(entry).origin, domain: new URL(entry).hostname, provider: "user_provided", query: entry }],
    entries: [{ url: entry, resolutionId }], resultExpectation: representative, unresolvedItemCount: 0 } }))
}
console.log(JSON.stringify({ stage: "start", mode, directory, taskId, model: selection.modelId,
  browser: api.store.executionBrowser(undefined, taskId).mode }))
async function settle() {
  const deadline = Date.now() + 420_000
  let previous = ""
  while (api.taskChain.isAnyActive()) {
    const job = api.taskChain.repository.jobs(taskId).at(-1)
    const state = `${job?.status}/${job?.authoring?.build?.stepId ?? ""}/${job?.authoring?.stage ?? ""}/${job?.authoring?.progress?.actionsStarted ?? 0}`
    if (state !== previous) { console.log(JSON.stringify({ stage: state })); previous = state }
    if (Date.now() > deadline) throw Error("native_content_mainline_timeout")
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}
function assertContent(expectedCount: number) {
  const execution = api.taskChain.repository.executions(taskId).at(-1)!
  assert.equal(execution.status, "completed", `execution_failed:${execution.reason}`)
  const value = execution.output?.kind === "value" ? execution.output.value : null
  if (operation) { assert.equal(value, null); return }
  assert.ok(Array.isArray(value) && value.length === expectedCount)
  for (const [index, item] of value.entries()) {
    assert.ok(item && typeof item === "object" && !Array.isArray(item) && typeof item.content === "string")
    const content = JSON.parse(item.content) as { url: string; html: string; images: { body: string }[]; coverage: { complete: boolean } }
    assert.equal(content.coverage.complete, true)
    if (mode === "fixture") {
      assert.equal(content.url, `${local}/detail/${index + 1}`)
      assert.ok(content.html.includes(`内容 ${index + 1}`) && content.html.includes("<table"))
      assert.ok(!content.html.includes("此段不是"))
      assert.deepEqual(Buffer.from(content.images[0]!.body, "base64"), image)
    } else assert.ok(content.html.length > 100 && content.images.length > 0)
  }
  const runIds = new Set(execution.steps.flatMap(step => step.runIds))
  const evidence = api.taskChain.repository.runs(taskId).filter(run => runIds.has(run.binding.runId))
    .flatMap(run => run.outcome?.evidence ?? [])
  assert.ok(evidence.length >= expectedCount, "content_artifact_receipts_missing")
  for (const reference of evidence) api.taskChain.repository.artifact(taskId, reference.artifactId)
}
async function exercise() {
  if (process.env.BAT_CONTENT_EXISTING_RELEASE_ONLY === "1") {
    assert.ok(priorRequirement && mode === "fixture", "existing_fixture_release_required")
    const release = api.taskChain.repository.releases(taskId).at(-1)!
    assert.ok(release, "existing_release_missing")
    count = 2
    api.taskChain.dispatch(taskId, { type: "run_task", requestId: randomUUID(), input: null, release: releaseReference(release) })
    await settle(); assertContent(2)
    assert.ok(api.taskChain.repository.runs(taskId).every(run => run.modelCalls.length === 0))
    await save("receipt-replay-executions.json", api.taskChain.repository.executions(taskId))
    console.log(JSON.stringify({ stage: "passed", mode, directory, modelCalls: 0, reusedRelease: release.id }))
    return
  }
  const previousDraft = priorRequirement ? api.taskChain.repository.draft(taskId) : null
  const previousExecution = api.taskChain.repository.executions(taskId).at(-1)
  const reuseSample = priorRequirement && previousExecution?.status === "completed"
  if (priorRequirement) {
    assert.ok(previousDraft, "cached_draft_required")
    if (!reuseSample) api.taskChain.dispatch(taskId, { type: "trial_task_draft", requestId: randomUUID(), input: null,
      draftId: previousDraft.id, expectedRevision: previousDraft.revision, expectedChecksum: previousDraft.checksum })
  } else api.taskChain.dispatch(taskId, { type: "prepare_task", requestId: randomUUID(), requirementVersion: 1 })
  await settle()
  await save("preparation.json", api.taskChain.repository.jobs(taskId))
  const draft = api.taskChain.repository.draft(taskId)
  assert.ok(draft, `native_draft_missing:${api.taskChain.repository.jobs(taskId).at(-1)?.reason}`)
  await save("draft.json", draft)
  assertContent(mode === "jd" ? 5 : operation ? 0 : 3)
  if (mode === "fixture") count = 2
  api.taskChain.dispatch(taskId, { type: "trial_task_draft", requestId: randomUUID(), input: null,
    draftId: draft.id, expectedRevision: draft.revision, expectedChecksum: draft.checksum })
  await settle()
  assertContent(mode === "jd" ? 5 : operation ? 0 : 2)
  api.taskChain.dispatch(taskId, { type: "publish_task_draft", requestId: randomUUID(), draftId: draft.id,
    expectedRevision: draft.revision, expectedChecksum: draft.checksum })
  const release = api.taskChain.repository.releases(taskId).at(-1)!
  assert.ok(release, "published_release_missing")
  if (mode === "fixture") count = 2
  api.taskChain.dispatch(taskId, { type: "run_task", requestId: randomUUID(), input: null,
    release: releaseReference(release) })
  await settle()
  assertContent(mode === "jd" ? 5 : operation ? 0 : 2)
  const runs = api.taskChain.repository.runs(taskId)
  assert.ok(runs.every(run => run.modelCalls.length === 0), "ordinary_replay_called_model")
  await save("runs.json", runs)
  await save("executions.json", api.taskChain.repository.executions(taskId))
  console.log(JSON.stringify({ stage: "passed", mode, directory, modelCalls: 0, releaseId: release.id }))
}
try { await exercise() } catch (error) {
  const failure = { error: error instanceof Error ? error.message : "unknown",
    jobs: api.taskChain.repository.jobs(taskId), executions: api.taskChain.repository.executions(taskId) }
  await save(`failure-${Date.now()}.json`, failure)
  await save("failure.json", failure)
  console.error(JSON.stringify({ stage: "failed", mode, directory, error: error instanceof Error ? error.message : "unknown" }))
  process.exitCode = 1
} finally {
  await api.app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
}
