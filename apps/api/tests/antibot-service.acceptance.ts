// WHY：访问独立常驻保护入口，复用正常准备/发布/复跑，不以手编 Runner 动作代替产品链路。
import assert from "node:assert/strict"
import { randomUUID, createHash, X509Certificate } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import Database from "better-sqlite3"
import { z } from "zod"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { taskRequirementSchema } from "@browser-capture/contracts"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import { DailyChromeExtension } from "../src/browser/daily-extension.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/python-runtime.js"
import { RunnerProcess } from '../src/upstream-browser/service.js'
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createTaskDraft, releaseReference } from "../src/task-chain/chain-revision.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { validateSelectionFunctions } from "../src/upstream-browser/hybrid-selection.js"
import { validateHybridResponse } from "../src/upstream-browser/hybrid-response.js"
import { jsonValueSchema } from "@browser-capture/contracts"

const dedicated = process.argv.includes('--dedicated-visible-session')
const fullTls = process.argv.includes('--full-tls')
if (fullTls && !dedicated) throw Error('tls_acceptance_requires_owned_profile')
if (!dedicated && !process.argv.includes("--daily-visible-session")) throw Error("explicit_owned_session_required")
const root = process.cwd(), admin = "http://127.0.0.1:4188"
const labData = path.resolve(process.env.BAT_ANTIBOT_DATA ?? path.join(root, 'work/antibot-service'))
const product = "http://127.0.0.1:4175"
if (!dedicated) {
  const preflight = await fetch(`${product}/api/browser/daily-chrome`, { headers: { origin: product, "sec-fetch-site": "same-origin" } })
  z.object({ paired: z.literal(true), connected: z.literal(false), busy: z.literal(false), popupRequest: z.null() }).parse(await preflight.json())
}
const browserMode = dedicated ? 'dedicated-visible' : 'daily'
const resumePath = process.argv.find(value => value.startsWith('--resume-directory='))?.split('=')[1]
const resume = resumePath ? path.resolve(resumePath) : null
const variantArg = process.argv.find(value => value.startsWith('--frozen-variant='))?.split('=')[1]
const variants = variantArg ? [z.coerce.number().int().min(1).max(4).parse(variantArg)] : [1, 2, 3, 4]
if (variantArg && !resume) throw Error('frozen_variant_requires_saved_release')
if (resume && (!dedicated || path.dirname(resume) !== path.join(root, 'work/antibot-service')
  || !path.basename(resume).startsWith('product-'))) throw Error('owned_resume_directory_required')
await mkdir(path.join(root, "work/antibot-service"), { recursive: true })
const directory = resume ?? await mkdtemp(path.join(root, "work/antibot-service/product-"))
const saved = resume ? z.object({ taskId: z.uuid(), root: z.literal(root), browser: z.literal('dedicated-visible'),
  case: z.object({ id: z.uuid(), url: z.url() }) }).parse(JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))) : null
const save = (name: string, value: unknown) => writeFile(path.join(directory, `${resume ? 'resume-' : ''}${name}`), JSON.stringify(value, null, 2))
async function local(route: string, value?: unknown) {
  const response = await fetch(admin + route, { ...(value === undefined ? {} : { method: "POST", body: JSON.stringify(value) }),
    headers: { origin: admin, "content-type": "application/json" } })
  if (!response.ok) throw Error(`lab_request_${response.status}`)
  return await response.json() as unknown
}
const caseSchema = z.object({ id: z.uuid(), url: z.url() })
const item = saved?.case ?? caseSchema.parse(await local("/api/cases", { kind: "catalog", variant: 1 }))
const tlsUrl = item.url.replace('http:', 'https:').replace(':4187/', ':4183/')
if (saved && fullTls && saved.case.url !== tlsUrl) throw Error('resume_entry_changed')
if (fullTls) item.url = tlsUrl
const origin = new URL(item.url).origin
const db = new Database(path.join(root, "data/workbench.sqlite"), { readonly: true })
const row = db.prepare("SELECT selection FROM aiSettings WHERE subjectId=?").get(SHARED_AI_SUBJECT) as { selection: string }
db.close()
const selection = parseModelSelection(JSON.parse(row.selection))
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data/ai-connect") }) })
const extension = new DailyChromeExtension(root, path.join(root, "data"), () => { throw Error("existing_relay_must_stay_idle") })
const endpoint = async (ownerId?: string) => {
  if (dedicated) throw Error('personal_browser_forbidden')
  if (!ownerId) throw Error("owner_required")
  const value = await extension.endpoint(false, ownerId)
  if (!value) throw Error("daily_authorization_unavailable")
  return value
}
const runtime = new PythonUpstreamBrowserRuntime({ root, directory, subject: ai.forSubject(SHARED_AI_SUBJECT),
  browserMode: () => browserMode, dailyChromeEndpoint: endpoint, dailyChromeInspectionEndpoint: endpoint })
const api = await createApplication({ root, directory, ai, upstreamBrowserRuntime: runtime })
// WHY：只给此验收进程创建的精确Profile信任本地证书；复用既有诊断runner，产品控制/采集均不改。
const originalStart = RunnerProcess.prototype.startHybrid
if (fullTls) {
  const certificate = new X509Certificate(await readFile(path.join(labData, 'tls/cert.pem')))
  const pin = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
  RunnerProcess.prototype.startHybrid = function(config) {
    const lifecycle = Reflect.get(this, 'lifecycle')
    lifecycle.runnerScript = path.join(root, 'apps/api/tests/antibot-m0/diagnostic_runner.py')
    lifecycle.runnerEnvironment = { ...lifecycle.runnerEnvironment, BAT_LOCAL_TLS_SPKI: pin,
      BAT_LOCAL_TLS_PROFILE: config.profilePath,
      ...(process.argv.includes('--diagnose-challenge') ? { BAT_CHALLENGE_DIAGNOSTIC_PATH: path.join(directory, 'challenge-diagnostic.json') } : {}) }
    return originalStart.call(this, config)
  }
}
if (!saved) {
  api.store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
  api.store.saveBrowserEnvironment(browserMode, 0)
}
const taskId = saved?.taskId ?? api.store.taskAction({ type: "create", requestId: randomUUID() })
const goal = "在当前页面全部资料版本中，打开版本号最大的已发布资料，排除预告未发布版本。"
const body = `# 目标\n${goal}\n## 试做入口\n1. ${item.url}\n## 运行输入\n- 无\n## 任务步骤\n1. 选择并打开目标\n- 输入：任务输入\n- 执行：一次执行\n- 产出：最终结果\n- 目标：${goal}\n## 代表试做\n${goal}\n## 结果与完成\n- 交付：完成状态\n- 执行方式：一次执行\n- 页面交付：无需保留\n完成标准：每次根据当次页面候选重新选择并打开目标；若没有合格候选，明确失败，不得打开不合格条目。`
const stamp = new Date().toISOString(), resolutionId = randomUUID()
if (!saved) {
api.store.mutate(taskId, state => {
  state.revision = 1; state.confirmedVersion = 1
  state.drafts.push({ version: 1, revision: 1, title: goal, markdown: body, brief: null })
  state.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "已授权的本机检测服务联调",
    messageId: null, questionId: null, draftVersion: 1, createdAt: stamp })
})
api.taskChain.repository.saveRequirement(taskRequirementSchema.parse({ ...extractionFixture.requirement, id: randomUUID(), taskId,
  goal, inputContract: null, outputContract: null, definition: { format: "markdown", body },
  confirmation: { confirmedAt: stamp, requestId: randomUUID() }, confirmationFacts: { decisions: [],
    sources: [{ resolutionId, label: goal, url: item.url, origin, domain: new URL(item.url).hostname, provider: "user_provided", query: item.url }],
    entries: [{ url: item.url, resolutionId }], resultExpectation: goal, unresolvedItemCount: 0 } }))
}
async function settle() {
  const end = Date.now() + 300_000; let previous = ""
  while (api.taskChain.isAnyActive()) {
    const job = api.taskChain.repository.jobs(taskId).at(-1)
    if (job?.status === 'waiting_for_human') throw Error(`product_acceptance_human_wait:${job.reason}`)
    const stage = `${job?.status}/${job?.authoring?.stage}/${job?.authoring?.progress?.actionsStarted}`
    if (stage !== previous) { console.log(JSON.stringify({ stage })); previous = stage }
    if (Date.now() > end) throw Error("product_acceptance_timeout")
    await new Promise(resolve => setTimeout(resolve, 500))
  }
}
async function rematerializeSavedDraft() {
  const current = api.taskChain.repository.draft(taskId)
  assert.ok(current, 'resume_draft_missing')
  const sourceDb = new Database(path.join(directory, 'workbench.sqlite'), { readonly: true })
  const rows = sourceDb.prepare('SELECT artifactId,body FROM taskArtifacts WHERE taskId=? AND mediaType=?')
    .all(taskId, 'application/vnd.bat.workflow-use+json;version=2')
  sourceDb.close()
  const sources = z.array(z.object({ artifactId: z.string(), body: z.string() })).parse(rows)
  assert.equal(sources.length, current.content.steps.length, 'saved_compilation_count_mismatch')
  const chains = []
  for (const source of sources) {
    const artifact = z.object({ compilationRequest: z.record(z.string(), jsonValueSchema), compilerResponse: z.unknown(),
      task: z.object({ stepId: z.string() }).passthrough() }).passthrough().parse(JSON.parse(source.body))
    const step = current.content.plan.steps.find(item => item.id === artifact.task.stepId)
    assert.ok(step, 'saved_step_missing')
    await validateSelectionFunctions(validateHybridResponse(artifact.compilerResponse), artifact.compilationRequest, new AbortController().signal)
    chains.push(materializeHybridChain({ response: artifact.compilerResponse, request: artifact.compilationRequest,
      plan: current.content.plan, step, version: step.chain.version, model: selection.modelId }))
  }
  const next = createTaskDraft({ taskId, requirement: api.taskChain.repository.requirement(taskId),
    baseRelease: current.baseRelease, plan: current.content.plan, chains, current })
  api.taskChain.repository.saveDraft(next)
  await save('rematerialized.json', { sourceArtifacts: sources.map(item => item.artifactId),
    previousRevision: current.revision, revision: next.revision, checksum: next.checksum, modelCalls: 0 })
  return next
}
async function business(expected: number | null) {
  const execution = api.taskChain.repository.executions(taskId).at(-1)!
  assert.equal(execution.status, expected === null ? "failed" : "completed", JSON.stringify(execution.reason))
  const report = z.object({ business: z.array(z.object({ case_id: z.string(), action: z.string(), value: z.string() })) }).parse(await local("/api/report"))
  const selected = report.business.filter(event => event.case_id === item.id && event.action === "selected")
  if (expected !== null) assert.equal(JSON.parse(selected[0]!.value).version, expected)
  assert.ok(selected.every(event => JSON.parse(event.value).version !== 99), "ineligible_document_opened")
}
console.log(JSON.stringify({ stage: "start", directory, taskId, case: item, model: selection.modelId, browser: browserMode }))
try {
  await save("manifest.json", { taskId, case: item, startedAt: stamp, browser: browserMode, model: selection.modelId, root, fullTls })
  await save("detector-before.json", await local("/api/report"))
  const frozen = saved && !api.taskChain.repository.draft(taskId) ? api.taskChain.repository.releases(taskId).at(-1) : undefined
  if (variantArg && !frozen) throw Error('frozen_variant_requires_saved_release')
  let release = frozen
  if (frozen) {
    // WHY：已发布成功样本没有活动草稿；底层回归直接复跑不可变发布版，不重新问模型或重编译。
    assert.ok(frozen.content.steps.some(step => step.chain.nodes.some(node => node.kind === 'function')), 'dynamic_function_missing')
    for (const variant of variants) {
      await local(`/api/cases/${item.id}/variant`, { variant })
      api.taskChain.dispatch(taskId, { type: 'run_task', requestId: randomUUID(), input: null, release: releaseReference(frozen) })
      await settle(); await business([7, 11, 13, null][variant - 1]!)
    }
  } else {
  if (saved) {
    const existing = await rematerializeSavedDraft()
    await local(`/api/cases/${item.id}/variant`, { variant: 1 })
    api.taskChain.dispatch(taskId, { type: "trial_task_draft", requestId: randomUUID(), input: null,
      draftId: existing.id, expectedRevision: existing.revision, expectedChecksum: existing.checksum })
  } else api.taskChain.dispatch(taskId, { type: "prepare_task", requestId: randomUUID(), requirementVersion: 1 })
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
  release = api.taskChain.repository.releases(taskId).at(-1)!
  assert.ok(release, "published_release_missing")
  for (const variant of [3, 4]) {
    await local(`/api/cases/${item.id}/variant`, { variant })
    api.taskChain.dispatch(taskId, { type: "run_task", requestId: randomUUID(), input: null, release: releaseReference(release) })
    await settle(); await business(variant === 3 ? 13 : null)
  }
  }
  assert.ok(release)
  assert.ok(api.taskChain.repository.runs(taskId).every(run => run.modelCalls.length === 0), "ordinary_replay_called_model")
  await save("release.json", release)
  if (fullTls) {
    const observations = (await readFile(path.join(labData, 'logs/observations.jsonl'), 'utf8'))
      .trim().split('\n').map(line => JSON.parse(line)).filter(row => row.site === item.id && row.at >= stamp)
    const h2 = observations.filter(row => row.category === 'h2-coherence' && row.entry === 'full-shield')
    assert.ok(h2.length > 0 && h2.every(row => row.valid === 'true' && row.outcome === 'consistent'))
    assert.ok(!observations.some(row => row.outcome === 'detected'))
    await save('integrated-h2.json', h2)
  }
  await save("proof.json", { passed: true, zeroReplayModelCalls: true,
    values: variants.filter(value => value !== 4).map(value => [7, 11, 13][value - 1]), ineligible99Rejected: variants.includes(4),
    fullTls, frozenReleaseReused: Boolean(frozen), freshPreparationPerformed: !saved })
  console.log(JSON.stringify({ stage: "passed", taskId, directory }))
} catch (error) {
  await save("failure.json", { type: error instanceof Error ? error.name : "unknown", message: error instanceof Error ? error.message : "unknown" })
  process.exitCode = 1
} finally {
  await save("jobs.json", api.taskChain.repository.jobs(taskId))
  await save("executions.json", api.taskChain.repository.executions(taskId))
  await save("runs.json", api.taskChain.repository.runs(taskId))
  await save("detector-after.json", await local("/api/report"))
  try { await api.app.close() } finally {
    await extension.disconnect()
    if (fullTls) RunnerProcess.prototype.startHybrid = originalStart
  }
  await save("closed.json", { hostClosed: true, ownRelayDisconnected: true, persistentDetectorStopped: false })
  if (dedicated) try {
    // WHY：测试host关闭与临时Profile永久删除分开；只清原manifest拥有且无运行进程的目录。
    const python = path.join(root, 'work/upstream-browser-hybrid/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    await promisify(execFile)(python, [path.join(root, 'apps/api/tests/helpers/owned-profile-cleanup.py'),
      directory, '--antibot-product', resume ? 'resume-' : ''], { cwd: root, timeout: 30_000,
      env: { ...process.env, PYTHONPATH: [path.join(root,'apps/api/python'),path.join(root,'vendor/workflow-use/workflows')].join(path.delimiter) } })
  } catch {
    await save('profile-cleanup-failure.json', { code: 'owned_profile_cleanup_unconfirmed', businessResultPreserved: true })
    process.exitCode = 1
  }
  console.log(JSON.stringify({ stage: "closed", directory }))
}
