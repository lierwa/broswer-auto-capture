// 隔离 UI 场景：复用真实 G5 链的结构，执行/验证状态是夹具，不属于 G6 自然入口或运行证明。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { taskChainSchema, taskPlanSchema, taskRunSchema } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createApplication } from "../../api/src/app.js"
import { createTaskDraft, draftReference, recordDraftTrial } from "../../api/src/task-chain/chain-revision.js"
import { queuedDraftExecution } from "../../api/src/task-chain/queued-runs.js"
import { testAIModel } from "../../api/tests/fixtures/ai-model.js"
import { Cdp, devtoolsPort, evaluate, launchChrome, pause, screenshot, waitDom, waitExit } from "../../api/tests/minimum-product-loop-workbench.js"

if (process.env.BAT_RUN_CANVAS_UI !== "1") throw new Error("explicit_canvas_ui_required")
const source = process.env.BAT_CANVAS_SOURCE_DIRECTORY
if (!source) throw new Error("real_g5_source_directory_required")
const root = process.cwd(), directory = await mkdtemp(path.join(tmpdir(), "bat-canvas-ui-"))
let modelCalls = 0, productBrowserCalls = 0
const application = await createApplication({ root, directory, serveUi: true,
  aiModel: testAIModel(async function* () { modelCalls++; throw new Error("ui_must_not_call_model") }),
  browserExecutor: async () => { productBrowserCalls++; throw new Error("ui_must_not_start_product_browser") } })
const repository = application.taskChain.repository
let browser: Cdp | undefined, page: Cdp | undefined, chrome: ReturnType<typeof launchChrome> | undefined
let base = "", phase = "seed"
const writes: Array<{ method: string; url: string }> = []
const attentionOnly = process.env.BAT_CANVAS_UI_SCOPE === "attention"
const proof: Record<string, unknown> = { mode: "isolated-ui-state-fixture", source, directory,
  scope: attentionOnly ? "attention-only" : "view-and-attention" }
const save = (name: string, value: unknown) => writeFile(path.join(directory, name), JSON.stringify(value, null, 2))
console.log(JSON.stringify({ stage: "start", directory }))
try {
  const canvas = await installScene("只读画布隔离核验", true)
  const waiting = await installScene("人工等待隔离状态", false)
  const wait = queuedDraftExecution(waiting.taskId, randomUUID(), waiting.draft, null, { nodeDelayMs: 0 })
  wait.status = "waiting_for_human"; wait.sequence = 1
  wait.reason = "隔离状态场景：请处理人工等待后继续"; wait.result!.summary = wait.reason
  repository.saveExecution(wait)
  application.app.server.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method ?? "")) writes.push({ method: request.method!, url: request.url! })
  })
  await application.app.listen({ host: "127.0.0.1", port: 0 })
  const address = application.app.server.address()
  assert.ok(address && typeof address !== "string"); base = `http://127.0.0.1:${address.port}`
  phase = "ui-start"
  page = await openUi(base)
  await click(`button[aria-label="打开任务：只读画布隔离核验"]`)
  await click(`section[data-task-id="${canvas.taskId}"] [role="tab"][aria-label="链路"]`)
  await waitDom(page, "document.querySelector('.task-workspace:not([hidden]) .chain-stage-card')")
  writes.length = 0
  if (!attentionOnly) {
    const before = await snapshot(canvas.taskId)
    assert.equal((before.api as any).draftReadiness.phase, "ready")
    phase = "keyboard-and-view"
    proof.view = await verifyView(canvas.taskId)
    const after = await snapshot(canvas.taskId)
    assert.deepEqual(after, before, "view_changed_draft_or_validation")
    assert.deepEqual(writes, [], "readonly_ui_sent_write")
    proof.draft = { before, after, writeRequests: [...writes] }
  }
  phase = "attention"
  proof.attention = await verifyAttention(waiting.taskId, wait)
  assert.deepEqual(writes, [], "attention_ui_sent_write")
  assert.equal(modelCalls, 0); assert.equal(productBrowserCalls, 0)
  proof.status = "passed"; proof.modelCalls = modelCalls; proof.productBrowserCalls = productBrowserCalls
  await save("result.json", proof)
  console.log(JSON.stringify({ stage: "passed", directory, modelCalls, productBrowserCalls }))
} catch (error) {
  proof.status = "failed"; proof.phase = phase; proof.error = error instanceof Error ? error.message : String(error)
  if (page) {
    await screenshot(page, path.join(directory, "failure.png")).catch(() => {})
    proof.ui = await evaluate(page, `({text:document.body.innerText.slice(-3500),active:document.activeElement?.outerHTML,
      keys:globalThis.__canvasKeys?.slice(-18)})`).catch(() => null)
  }
  await save("result.json", proof)
  console.error(JSON.stringify({ stage: "failed", directory, phase, error: proof.error })); process.exitCode = 1
} finally {
  if (browser) await browser.send("Browser.close").catch(() => {})
  page?.close(); browser?.close(); if (chrome) await waitExit(chrome)
  await application.app.close()
  await save("cleanup.json", { uiChromeExitCode: chrome?.exitCode, uiChromeStopped: !chrome || chrome.exitCode !== null,
    serverListening: application.app.server.listening, directoryRetained: true })
}

async function installScene(title: string, validated: boolean) {
  const taskId = application.store.taskAction({ type: "create", requestId: randomUUID() }) as string
  application.store.taskAction({ type: "rename", id: taskId, title })
  const plan = taskPlanSchema.parse(JSON.parse(await readFile(path.join(source!, "sample-plan.json"), "utf8")))
  const chain = taskChainSchema.parse(JSON.parse(await readFile(path.join(source!, "chain.json"), "utf8")))
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.taskId = taskId; requirement.id = randomUUID(); requirement.goal = plan.summary
  requirement.definition.body = plan.summary; requirement.confirmation = { confirmedAt: new Date().toISOString(), requestId: randomUUID() }
  plan.taskId = taskId; plan.requirement = { id: requirement.id, version: 1, revision: 1, digest: digestJson(requirement) }
  chain.taskId = taskId; chain.plan.digest = digestJson(plan)
  repository.saveRequirement(requirement)
  let draft = createTaskDraft({ taskId, requirement, baseRelease: null, plan, chains: [chain] })
  repository.saveDraft(draft)
  if (validated) for (const mode of ["sample", "verification"] as const) {
    const execution = queuedDraftExecution(taskId, randomUUID(), draft, null, { nodeDelayMs: 0 }, mode)
    const run = taskRunSchema.parse(JSON.parse(await readFile(path.join(source!, "run.json"), "utf8")))
    run.binding = { ...run.binding, taskId, runId: randomUUID(), authorizationId: execution.authorizationId,
      plan: execution.plan, chain: execution.steps[0]!.chain }
    execution.status = "completed"; execution.sequence = 1
    execution.steps[0]!.status = "completed"; execution.steps[0]!.runIds = [run.binding.runId]
    repository.saveRun(run); repository.saveExecution(execution)
    repository.saveCandidate({ taskId, executionId: execution.id, draft: draftReference(draft),
      content: draft.content, createdAt: execution.createdAt })
    draft = recordDraftTrial(draft, execution); repository.saveDraft(draft)
  }
  return { taskId, draft }
}

async function openUi(url: string) {
  const profile = path.join(directory, "headless-ui-profile")
  await mkdir(profile); chrome = launchChrome(profile)
  const port = await devtoolsPort(profile)
  const browserInfo = await json(`http://127.0.0.1:${port}/json/version`)
  browser = await Cdp.connect(browserInfo.webSocketDebuggerUrl)
  const target = await json(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })
  const client = await Cdp.connect(target.webSocketDebuggerUrl)
  await client.send("Page.enable"); await client.send("Runtime.enable")
  await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `globalThis.__canvasKeys=[];
    for(const type of ['keydown','keypress','keyup','click'])addEventListener(type,e=>{
      globalThis.__canvasKeys.push({type,key:e.key,label:e.target.getAttribute?.('aria-label')||e.target.textContent?.slice(0,60)})},true)` })
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await client.send("Page.navigate", { url })
  await waitDom(client, "document.querySelector('.task-list') && document.querySelector('#main-workspace')")
  return client
}

async function verifyView(taskId: string) {
  const scope = `.task-workspace[data-task-id="${taskId}"]`
  const tabsToStage = await tabTo(`${scope} .chain-stage-card footer button`)
  await key("Enter"); await waitDom(page!, `document.querySelector(${JSON.stringify(`${scope} .chain-action-card`)})`)
  const tabsToAction = await tabTo(`${scope} .chain-action-card h3 button`)
  const label = await evaluate(page!, "document.activeElement.getAttribute('aria-label')")
  await key("Enter"); await waitDom(page!, `document.querySelector(${JSON.stringify(`${scope} aside[aria-label="动作说明"]`)})`)
  await screenshot(page!, path.join(directory, "keyboard-detail.png"))
  await click(`${scope} button[aria-label="关闭检查器"]`)
  await tabTo(`${scope} .chain-action-card h3 button`); await key(" ")
  await waitDom(page!, `document.querySelector(${JSON.stringify(`${scope} aside[aria-label="动作说明"]`)})`)
  const nodeCount = await evaluate(page!, `document.querySelectorAll(${JSON.stringify(`${scope} .react-flow__node`)}).length`)
  await key("Delete")
  assert.equal(await evaluate(page!, `document.querySelectorAll(${JSON.stringify(`${scope} .react-flow__node`)}).length`), nodeCount)
  const transform = () => evaluate(page!, `document.querySelector(${JSON.stringify(`${scope} .react-flow__viewport`)}).style.transform`)
  const beforeZoom = await transform()
  await click(`${scope} button[aria-label="放大"]`); await pause(400)
  const afterZoom = await transform(); assert.notEqual(afterZoom, beforeZoom, "zoom_did_not_change_view")
  await click(`${scope} button[aria-label="缩小"]`); await click(`${scope} button[aria-label="适应视图"]`)
  const themes: unknown[] = []
  for (const target of ["light", "dark"]) {
    const current = await evaluate(page!, "document.querySelector('.app-shell').dataset.theme")
    if (current !== target) await click(`button[aria-label="切换为${target === "light" ? "浅" : "深"}色主题"]`)
    await waitDom(page!, `document.querySelector('.app-shell').dataset.theme === '${target}'`)
    themes.push(await evaluate(page!, `({theme:document.querySelector('.app-shell').dataset.theme,
      flow:document.querySelector(${JSON.stringify(`${scope} .react-flow`)}).className,
      color:getComputedStyle(document.querySelector(${JSON.stringify(`${scope} .chain-action-card`)})).color,
      background:getComputedStyle(document.querySelector(${JSON.stringify(`${scope} .chain-action-card`)})).backgroundColor})`))
    await screenshot(page!, path.join(directory, `theme-${target}.png`))
  }
  assert.notDeepEqual(themes[0], themes[1])
  const description = await evaluate(page!, `document.querySelector(${JSON.stringify(`${scope} [id^="react-flow__node-desc"]`)}).textContent`)
  assert.match(String(description), /画布只读/)
  return { tabsToStage, tabsToAction, label, enterAndSpaceOpenDetails: true, deleteDidNotRemoveNode: true,
    beforeZoom, afterZoom, themes, description, keyboardEvents: await evaluate(page!, "globalThis.__canvasKeys.filter(e=>e.key==='Enter'||e.key===' ').slice(-15)") }
}

async function verifyAttention(taskId: string, waiting: ReturnType<typeof queuedDraftExecution>) {
  const bell = 'button[aria-label="任务提醒，1 项待处理"]'
  await waitDom(page!, `document.querySelector(${JSON.stringify(bell)})`)
  await click(bell)
  await click('[role="menuitem"]', "人工等待隔离状态")
  await waitDom(page!, `document.querySelector('[data-task-id="${taskId}"]:not([hidden])')`)
  await page!.send("Page.reload")
  await waitDom(page!, `document.querySelector(${JSON.stringify(bell)})`)
  await click(`[data-task-id="${taskId}"] .execution-strip`)
  await waitDom(page!, "[...document.querySelectorAll('button')].some(b=>b.textContent==='处理后继续')")
  await screenshot(page!, path.join(directory, "waiting-after-reload.png"))
  const before = await json(`${base}/api/tasks`)
  waiting.status = "running"; waiting.sequence++; waiting.updatedAt = new Date().toISOString()
  repository.saveExecution(waiting)
  await waitDom(page!, `!document.querySelector(${JSON.stringify(bell)}) && document.title === '浏览器工作台'`, 8000)
  await waitDom(page!, "![...document.querySelectorAll('button')].some(b=>b.textContent==='处理后继续')", 8000)
  const after = await json(`${base}/api/tasks`)
  assert.equal(before.find((t: any) => t.id === taskId).attention.kind, "action_required")
  assert.ok(after.find((t: any) => t.id === taskId).attention == null)
  await screenshot(page!, path.join(directory, "waiting-cleared.png"))
  return { taskId, executionId: waiting.id, crossedTask: true, reloadRetainsWaiting: true,
    stateTransition: "repository fixture waiting_for_human -> running", reminderAndContinueCleared: true,
    beforeAttention: before.find((t: any) => t.id === taskId).attention,
    afterAttentionPresent: "attention" in after.find((t: any) => t.id === taskId) }
}

async function snapshot(taskId: string) {
  const value = await json(`${base}/api/task-chain?taskId=${taskId}`)
  const db = new Database(path.join(directory, "workbench.sqlite"), { readonly: true })
  let row
  try { row = db.prepare("SELECT revision,checksum,body FROM taskDrafts WHERE taskId=?").get(taskId) }
  finally { db.close() }
  assert.deepEqual(value.draft, JSON.parse((row as { body: string }).body), "api_sqlite_draft_mismatch")
  return { api: { draft: value.draft, draftReadiness: value.draftReadiness }, sqlite: row,
    ui: await evaluate(page!, `document.querySelector('[data-task-id="${taskId}"] .draft-controls').textContent`) }
}
async function click(selector: string, text?: string) {
  const target = `([...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text ? `e.textContent.includes(${JSON.stringify(text)})` : "e.getClientRects().length"}))`
  await waitDom(page!, target)
  const point = await evaluate(page!, `(()=>{const e=${target};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`) as { x: number; y: number }
  await page!.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 })
  await page!.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 })
}
async function tabTo(selector: string) {
  for (let count = 0; count < 90; count++) {
    await key("Tab")
    if (await evaluate(page!, `document.activeElement?.matches(${JSON.stringify(selector)})`)) return count + 1
  }
  throw new Error(`keyboard_target_unreachable:${selector}`)
}
async function key(value: string) {
  const code = value === " " ? "Space" : value
  const keyCode = { Tab: 9, Enter: 13, Space: 32, Delete: 46 }[code]!
  await page!.send("Input.dispatchKeyEvent", { type: "keyDown", key: value, code, windowsVirtualKeyCode: keyCode,
    ...(value === " " ? { text: " " } : value === "Enter" ? { text: "\r" } : {}) })
  await page!.send("Input.dispatchKeyEvent", { type: "keyUp", key: value, code, windowsVirtualKeyCode: keyCode })
}
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  assert.ok(response.ok, `HTTP ${response.status}: ${url}`)
  return response.json()
}
