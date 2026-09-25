import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import Database from "better-sqlite3"
import {
  taskExecutionEventBatchSchema, taskWorkspaceDiagnosticsSchema, taskWorkspaceHistoryPageSchema,
  taskWorkspaceSnapshotSchema, type TaskExecution, type TaskWorkspaceSnapshot,
} from "@browser-capture/contracts"
import { Cdp, devtoolsPort, evaluate, launchChrome, pause, screenshot, waitDom, waitExit }
  from "./minimum-product-loop-workbench.js"

const root = path.resolve(import.meta.dirname, "../../..")
const base = process.env.BAT_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:4173"
const taskId = required("BAT_ACCEPTANCE_TASK_ID")
const dataDirectory = path.resolve(process.env.BAT_ACCEPTANCE_DATA_DIRECTORY ?? path.join(root, "data"))
const evidenceDirectory = path.resolve(process.env.BAT_ACCEPTANCE_EVIDENCE_DIRECTORY
  ?? path.join(root, "work", `workbench-simplification-${Date.now()}`))
const terminal = new Set(["completed", "partial", "blocked", "failed", "cancelled", "stale", "cleanup_required"])
const resumeAfterEdit = process.env.BAT_ACCEPTANCE_RESUME_AFTER_EDIT === "1"
const resumeAfterTrial = process.env.BAT_ACCEPTANCE_RESUME_AFTER_TRIAL === "1"
const resumeAfterPublish = process.env.BAT_ACCEPTANCE_RESUME_AFTER_PUBLISH === "1"
const resumedRunId = process.env.BAT_ACCEPTANCE_RUN_EXECUTION_ID ?? null

async function main() {
  assert(process.env.BAT_ACCEPTANCE_LIVE === "1", "live_acceptance_opt_in_required")
  await mkdir(evidenceDirectory, { recursive: true })
  const before = await currentState()
  assert(before.snapshot.draft || resumeAfterPublish, "active_draft_required")
  assert(before.snapshot.activity === null, "active_preparation_blocks_acceptance")
  assert(!before.snapshot.execution || !isActive(before.snapshot.execution.status)
    || before.snapshot.execution.id === resumedRunId, "active_execution_blocks_acceptance")
  const source = before.snapshot.draft?.content ?? before.snapshot.release?.value.content
  assert(source?.steps.length === 1, "expected_single_step_task")
  const initialDraft = before.snapshot.draft
  const checkpointed = resumeAfterEdit || resumeAfterTrial || resumeAfterPublish
  const baselineReleaseCount = checkpointed
    ? Number(required("BAT_ACCEPTANCE_BASELINE_RELEASES")) : before.releases.items.length
  const baselineExecutionCount = checkpointed
    ? Number(required("BAT_ACCEPTANCE_BASELINE_EXECUTIONS")) : before.executions.items.length
  if (resumeAfterPublish) {
    const trialId = required("BAT_ACCEPTANCE_TRIAL_EXECUTION_ID")
    const releaseVersion = Number(required("BAT_ACCEPTANCE_RELEASE_VERSION"))
    assert(initialDraft === null && before.snapshot.release?.reference.version === releaseVersion,
      "published_checkpoint_source_mismatch")
    assert(before.releases.items.length === baselineReleaseCount + 1
      && before.executions.items.length === baselineExecutionCount + (resumedRunId ? 2 : 1),
      "published_history_checkpoint_mismatch")
    assert(before.snapshot.release.value.validation.some((item) => item.executionId === trialId),
      "published_trial_checkpoint_mismatch")
  } else if (resumeAfterEdit || resumeAfterTrial) {
    assert(initialDraft, "edited_draft_checkpoint_missing")
    const baselineRevision = Number(required("BAT_ACCEPTANCE_BASELINE_DRAFT_REVISION"))
    assert(initialDraft.revision === baselineRevision + 1
      && (resumeAfterTrial || initialDraft.validation.records.length === 0),
      "edited_draft_checkpoint_mismatch")
    assert(before.releases.items.length === baselineReleaseCount
      && before.executions.items.length === baselineExecutionCount + (resumeAfterTrial ? 1 : 0),
      "edited_history_checkpoint_mismatch")
  }
  const chromeProfile = path.join(evidenceDirectory, "ui-client-profile")
  await mkdir(chromeProfile, { recursive: true })
  const chrome = launchChrome(chromeProfile)
  let browser: Cdp | undefined, page: Cdp | undefined
  try {
    const port = await devtoolsPort(chromeProfile)
    const browserInfo = await readJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${port}/json/version`)
    browser = await Cdp.connect(browserInfo.webSocketDebuggerUrl)
    const target = await readJson<{ webSocketDebuggerUrl: string }>(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: "PUT" })
    page = await Cdp.connect(target.webSocketDebuggerUrl)
    await page.send("Page.enable"); await page.send("Runtime.enable"); await page.send("Network.enable")
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `globalThis.__batUiErrors=[];
      addEventListener('error',(event)=>globalThis.__batUiErrors.push(String(event.error?.stack||event.message||'error').slice(0,1000)));
      addEventListener('unhandledrejection',(event)=>globalThis.__batUiErrors.push(String(event.reason?.stack||event.reason||'rejection').slice(0,1000)));` })
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await page.send("Page.navigate", { url: base })
    await waitDom(page, "document.querySelector('.task-list') && document.querySelector('#main-workspace')", 30_000)
    const title = await taskTitle()
    await click(page, `.task-select[aria-label=${quoted(`打开任务：${title}`)}]`)
    await waitDom(page, `document.querySelector('[data-task-id=${quoted(taskId)}]:not([hidden])')`)
    const taskRoot = `[data-task-id=${quoted(taskId)}]:not([hidden])`
    const tabs = await evaluate(page, `[...document.querySelectorAll(${quoted(`${taskRoot} [role="tab"]`)})]
      .map((item)=>item.getAttribute('aria-label'))`)
    assert(JSON.stringify(tabs) === JSON.stringify(["需求对话", "链路画布"]), `unexpected_tabs:${JSON.stringify(tabs)}`)
    await mouseClickText(page, `${taskRoot} [role="tab"]`, "链路画布")
    try {
      await waitDom(page, `document.querySelector(${quoted(taskRoot)})
        && document.querySelectorAll('.chain-stage-card').length===4`, 30_000)
    } catch (error) {
      const diagnostic = await evaluate(page, `({tabs:[...document.querySelectorAll('[role="tab"]')]
        .map((item)=>({label:item.getAttribute('aria-label'),selected:item.getAttribute('aria-selected')})),
        text:document.querySelector(${quoted(taskRoot)})?.innerText??'',
        alerts:[...document.querySelectorAll('[role="alert"]')].map((item)=>item.textContent),
        stages:document.querySelectorAll('.chain-stage-card').length,errors:globalThis.__batUiErrors??[]})`)
      await screenshot(page, path.join(evidenceDirectory, "00-canvas-failure.png")).catch(() => undefined)
      throw new Error(`stage_canvas_unavailable:${JSON.stringify(diagnostic)}`, { cause: error })
    }

    const shell = (await evaluate(page, `(()=>{const canvas=document.querySelector('.chain-workbench');const rect=canvas?.getBoundingClientRect();
      return {innerHeight,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight,
        bodyScrollHeight:document.body.scrollHeight,canvas:rect&&{top:rect.top,bottom:rect.bottom,height:rect.height},
        text:document.querySelector(${quoted(taskRoot)})?.innerText??'',errors:globalThis.__batUiErrors??[]}})()`)) as {
        innerHeight: number; clientHeight: number; scrollHeight: number; bodyScrollHeight: number;
        canvas: { top: number; bottom: number; height: number } | null; text: string; errors: string[] }
    assert(shell.scrollHeight <= shell.clientHeight + 1 && shell.bodyScrollHeight <= shell.innerHeight + 1,
      `page_vertical_scroll:${JSON.stringify(shell)}`)
    assert(shell.canvas && shell.canvas.height >= 700 && shell.canvas.bottom <= shell.innerHeight + 1,
      `canvas_not_full_height:${JSON.stringify(shell.canvas)}`)
    for (const forbidden of ["准备任务", "运行结果", "TASK READINESS", "RUN HISTORY", "Live chain workbench",
      initialDraft?.id, initialDraft?.checksum, before.snapshot.release?.reference.digest].filter(Boolean) as string[]) {
      assert(!shell.text.includes(forbidden), `ordinary_ui_leaked:${forbidden}`)
    }
    await screenshot(page, path.join(evidenceDirectory, "01-four-stage-canvas.png"))

    const actionCounts: number[] = []
    for (let index = 0; index < 4; index++) {
      await clickAt(page, ".chain-stage-card footer button:last-child", index)
      await waitDom(page, "document.querySelectorAll('.chain-action-card').length>0")
      actionCounts.push(Number(await evaluate(page, "document.querySelectorAll('.chain-action-card').length")))
      if (index === 0 && !checkpointed) await moveFirstAction(page)
      await mouseClickText(page, ".canvas-mode-controls button", "任务链路")
      await waitDom(page, "document.querySelectorAll('.chain-stage-card').length===4")
    }
    assert(JSON.stringify(actionCounts) === JSON.stringify([5, 2, 2, 2]), `unexpected_action_counts:${actionCounts}`)
    const afterSave = checkpointed ? await currentState() : await waitFor(async () => {
      const state = await currentState()
      return state.snapshot.draft && state.snapshot.draft.revision === initialDraft!.revision + 1 ? state : null
    }, 20_000, "draft_save_timeout")
    if (!resumeAfterTrial && !resumeAfterPublish) {
      assert(afterSave.snapshot.draft!.validation.records.length === 0, "stale_trial_survived_draft_edit")
    }
    assert(afterSave.releases.items.length === baselineReleaseCount + (resumeAfterPublish ? 1 : 0), "save_created_release")
    assert(afterSave.executions.items.length === baselineExecutionCount
      + (resumedRunId ? 2 : resumeAfterTrial || resumeAfterPublish ? 1 : 0),
      "save_created_execution")

    let trial: TaskExecution
    let settledTrial: TaskExecution
    let afterTrial: Awaited<ReturnType<typeof currentState>>
    if (resumeAfterTrial || resumeAfterPublish) {
      const trialId = required("BAT_ACCEPTANCE_TRIAL_EXECUTION_ID")
      trial = before.executions.items.find((item) => item.id === trialId && item.mode === "sample")
        ?? (() => { throw new Error("trial_checkpoint_missing") })()
      settledTrial = trial; afterTrial = before
      assert(resumeAfterPublish
        ? before.snapshot.release?.value.validation.some((item) => item.executionId === trial.id)
        : initialDraft?.validation.records.some((item) => item.executionId === trial.id), "trial_checkpoint_not_bound")
    } else {
      await clickText(page, ".draft-controls button", "试跑")
      await waitDom(page, "document.querySelector('.task-run-dialog')")
      assert(Number(await evaluate(page, "document.querySelectorAll('.task-run-dialog input,.task-run-dialog textarea').length")) === 0,
        "parameterless_trial_rendered_empty_input")
      await clickText(page, ".task-run-dialog button", "开始试跑")
      trial = await waitForNewExecution(afterSave.executions.items, "sample")
      settledTrial = await waitExecution(trial.id)
      afterTrial = await waitFor(async () => {
        const state = await currentState()
        return state.snapshot.draft?.validation.records.some((item) => item.executionId === trial.id) ? state : null
      }, 20_000, "trial_validation_commit_timeout")
    }
    assert(settledTrial.status === "completed", `draft_trial_not_completed:${settledTrial.status}:${settledTrial.reason}`)
    assert(afterTrial.releases.items.length === baselineReleaseCount + (resumeAfterPublish ? 1 : 0), "trial_created_release")
    assert(afterTrial.executions.items.length === baselineExecutionCount + (resumedRunId ? 2 : 1),
      "trial_execution_count_mismatch")
    assert(resumeAfterPublish
      ? afterTrial.snapshot.release?.value.validation.some((item) => item.executionId === trial.id)
      : afterTrial.snapshot.draft?.validation.records.some((item) => item.executionId === trial.id),
    "trial_not_bound_to_current_source")

    let afterPublish: Awaited<ReturnType<typeof currentState>>
    if (resumeAfterPublish) afterPublish = before
    else {
      await waitDom(page, `[...document.querySelectorAll('.draft-controls button')]
        .some((item)=>item.textContent?.includes('发布')&&!item.disabled)`, 20_000)
      await clickText(page, ".draft-controls button", "发布")
      await waitDom(page, `[...document.querySelectorAll('[role="dialog"] button')]
        .some((item)=>item.textContent?.includes('确认发布'))`)
      await clickText(page, `[role="dialog"] button`, "确认发布")
      afterPublish = await waitFor(async () => {
        const state = await currentState()
        return state.snapshot.draft === null && state.releases.items.length === baselineReleaseCount + 1 ? state : null
      }, 20_000, "manual_publish_timeout")
    }
    assert(afterPublish.executions.items.length === baselineExecutionCount + (resumedRunId ? 2 : 1),
      "publish_created_execution")
    const published = afterPublish.snapshot.release
    assert(published && published.value.validation.some((item) => item.executionId === trial.id), "release_missing_exact_trial")

    let replay: TaskExecution
    if (resumedRunId) replay = before.executions.items.find((item) => item.id === resumedRunId
      && item.release?.id === published.reference.id) ?? (() => { throw new Error("run_checkpoint_missing") })()
    else {
      await waitDom(page, `[...document.querySelectorAll('.chain-run-controls button')]
        .some((item)=>item.textContent?.includes('运行')&&!item.disabled)`, 20_000)
      await mouseClickText(page, ".chain-run-controls button", "运行")
      await waitDom(page, "document.querySelector('.task-run-dialog')")
      const runInputSurface = await evaluate(page, `({forms:document.querySelectorAll('.task-run-dialog .value-form').length,
        fixed:document.querySelector('.task-run-dialog .run-dialog-fixed-input')?.textContent??''})`) as {
          forms: number; fixed: string }
      assert(runInputSurface.forms === 0 && runInputSurface.fixed.includes("没有运行参数"),
        `parameterless_run_rendered_empty_input:${JSON.stringify(runInputSurface)}`)
      await clickText(page, ".task-run-dialog button", "开始运行")
      replay = await waitForNewExecution(afterPublish.executions.items, "release")
    }
    const settledReplay = await waitExecution(replay.id)
    assert(settledReplay.status === "completed", `release_run_not_completed:${settledReplay.status}:${settledReplay.reason}`)
    const afterRun = await currentState()
    assert(afterRun.executions.items.length === baselineExecutionCount + 2, "release_execution_count_mismatch")
    assert(afterRun.snapshot.execution?.id === replay.id, "workspace_not_bound_to_release_execution")
    assert(afterRun.snapshot.execution.steps.every((step) => step.status === "completed"), "execution_steps_not_completed")
    const events = await readEvents(replay.id)
    assert(events.events.length > 0 && events.events.every((event) => event.executionId === replay.id),
      "mixed_or_empty_execution_events")
    await waitDom(page, "document.querySelector('.execution-strip[data-tone=" + JSON.stringify("completed") + "]')", 20_000)

    await mouseClick(page, `.chain-run-controls button[aria-label="更多操作"]`)
    await waitDom(page, `[...document.querySelectorAll('[role="menuitem"]')]
      .some((item)=>item.textContent?.includes('历史记录'))`)
    await mouseClickText(page, `[role="menuitem"]`, "历史记录")
    await waitDom(page, "document.querySelector('[aria-label=" + JSON.stringify("历史记录") + "] .history-list article')")
    await screenshot(page, path.join(evidenceDirectory, "02-completed-execution-history.png"))

    const diagnostics = taskWorkspaceDiagnosticsSchema.parse(await readJson(`${base}/api/task-chain/diagnostics?taskId=${taskId}`))
    const persistence = persistedFacts(trial.id, replay.id, published.reference.version)
    const evidence = { taskId, title, before: summarize(before), afterSave: summarize(afterSave),
      afterTrial: summarize(afterTrial), afterPublish: summarize(afterPublish), afterRun: summarize(afterRun),
      ui: { tabs, shell, actionCounts, visibleActions: actionCounts.reduce((sum, value) => sum + value, 0),
        resumedAfterEdit: checkpointed, resumedAfterTrial: resumeAfterTrial || resumeAfterPublish,
        resumedAfterPublish: resumeAfterPublish, resumedRunId },
      execution: { trialId: trial.id, replayId: replay.id, replayEventCount: events.events.length },
      diagnostics: { capabilityDescriptors: diagnostics.capabilityDescriptors.length, legacy: diagnostics.legacy.length },
      persistence, evidenceDirectory }
    await writeFile(path.join(evidenceDirectory, "acceptance.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8")
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
  } finally {
    if (browser) await browser.send("Browser.close").catch(() => undefined)
    page?.close(); browser?.close(); await waitExit(chrome)
  }
}

async function currentState() {
  const snapshot = taskWorkspaceSnapshotSchema.parse(await readJson(`${base}/api/task-chain?taskId=${taskId}`))
  const releases = taskWorkspaceHistoryPageSchema.parse(await readJson(
    `${base}/api/task-chain/history?taskId=${taskId}&kind=releases&offset=0&limit=100`))
  const executions = taskWorkspaceHistoryPageSchema.parse(await readJson(
    `${base}/api/task-chain/history?taskId=${taskId}&kind=executions&offset=0&limit=100`))
  assert(releases.kind === "releases" && executions.kind === "executions", "history_kind_mismatch")
  return { snapshot, releases, executions }
}

async function waitForNewExecution(previous: TaskExecution[], mode: "sample" | "release") {
  const ids = new Set(previous.map((item) => item.id))
  return waitFor(async () => {
    const state = await currentState()
    return state.executions.items.find((item) => !ids.has(item.id)
      && (mode === "sample" ? item.mode === "sample" : Boolean(item.release))) ?? null
  }, 30_000, `${mode}_execution_not_accepted`)
}

async function waitExecution(executionId: string) {
  return waitFor(async () => {
    const state = await currentState()
    const execution = state.executions.items.find((item) => item.id === executionId)
    return execution && terminal.has(execution.status) ? execution : null
  }, 600_000, `execution_timeout:${executionId}`, 500)
}

async function readEvents(executionId: string) {
  return taskExecutionEventBatchSchema.parse(await readJson(
    `${base}/api/task-chain/events?taskId=${taskId}&executionId=${executionId}&after=0`))
}

async function moveFirstAction(page: Cdp) {
  const box = await evaluate(page, `(()=>{const rect=document.querySelector('.react-flow__node-chain-action')?.getBoundingClientRect();
    return rect&&{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`) as { x: number; y: number } | null
  assert(box, "draggable_action_missing")
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y })
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", buttons: 1, clickCount: 1 })
  for (const delta of [10, 20, 30, 40]) {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + delta, y: box.y + 20,
      button: "left", buttons: 1 })
  }
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + 40, y: box.y + 20,
    button: "left", buttons: 0, clickCount: 1 })
}

function persistedFacts(trialId: string, replayId: string, releaseVersion: number) {
  const db = new Database(path.join(dataDirectory, "workbench.sqlite"), { readonly: true })
  try {
    const table = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type=? AND name=?").get("table", name))
    const scalar = (sql: string, ...values: unknown[]) => Number((db.prepare(sql).get(...values) as { value: number }).value)
    return { userVersion: db.pragma("user_version", { simple: true }), journalMode: db.pragma("journal_mode", { simple: true }),
      taskReleases: scalar("SELECT count(*) value FROM taskReleases WHERE taskId=?", taskId),
      taskDrafts: scalar("SELECT count(*) value FROM taskDrafts WHERE taskId=?", taskId),
      taskExecutions: scalar("SELECT count(*) value FROM taskExecutions WHERE taskId=?", taskId),
      trialCandidate: scalar("SELECT count(*) value FROM taskExecutionCandidates WHERE taskId=? AND executionId=?", taskId, trialId),
      replayExecution: scalar("SELECT count(*) value FROM taskExecutions WHERE taskId=? AND id=?", taskId, replayId),
      publishedVersion: scalar("SELECT count(*) value FROM taskReleases WHERE taskId=? AND version=?", taskId, releaseVersion),
      retiredTables: { taskRunPresets: table("taskRunPresets"), taskChainRevisionDrafts: table("taskChainRevisionDrafts"),
        taskChainPresentations: table("taskChainPresentations") } }
  } finally { db.close() }
}

function summarize(state: Awaited<ReturnType<typeof currentState>>) {
  return { snapshotKeys: Object.keys(state.snapshot), draftRevision: state.snapshot.draft?.revision ?? null,
    draftValidations: state.snapshot.draft?.validation.records.length ?? 0,
    releaseVersion: state.snapshot.release?.reference.version ?? null, executionId: state.snapshot.execution?.id ?? null,
    executionStatus: state.snapshot.execution?.status ?? null, releases: state.releases.items.length,
    executions: state.executions.items.length }
}

async function taskTitle() {
  const tasks = await readJson<Array<{ id: string; title: string }>>(`${base}/api/tasks`)
  const task = tasks.find((item) => item.id === taskId)
  if (!task) throw new Error("acceptance_task_missing")
  return task.title
}

async function click(page: Cdp, selector: string) {
  const found = await evaluate(page, `(()=>{const item=document.querySelector(${quoted(selector)});if(!(item instanceof HTMLElement))return false;item.click();return true})()`)
  assert(found === true, `click_target_missing:${selector}`)
}

async function clickAt(page: Cdp, selector: string, index: number) {
  const found = await evaluate(page, `(()=>{const item=document.querySelectorAll(${quoted(selector)})[${index}];if(!(item instanceof HTMLElement))return false;item.click();return true})()`)
  assert(found === true, `click_index_missing:${selector}:${index}`)
}

async function clickText(page: Cdp, selector: string, text: string, exact = false) {
  const match = exact ? `item.textContent?.trim()===${quoted(text)}` : `item.textContent?.includes(${quoted(text)})`
  const found = await evaluate(page, `(()=>{const item=[...document.querySelectorAll(${quoted(selector)})].find((item)=>${match});
    if(!(item instanceof HTMLElement))return false;item.click();return true})()`)
  assert(found === true, `click_text_missing:${selector}:${text}`)
}

async function mouseClickText(page: Cdp, selector: string, text: string) {
  const box = await evaluate(page, `(()=>{const item=[...document.querySelectorAll(${quoted(selector)})]
    .find((item)=>item.textContent?.includes(${quoted(text)}));const rect=item?.getBoundingClientRect();
    return rect&&{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`) as { x: number; y: number } | null
  assert(box, `mouse_click_text_missing:${selector}:${text}`)
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y })
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y,
    button: "left", buttons: 1, clickCount: 1 })
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y,
    button: "left", buttons: 0, clickCount: 1 })
}

async function mouseClick(page: Cdp, selector: string) {
  const box = await evaluate(page, `(()=>{const rect=document.querySelector(${quoted(selector)})?.getBoundingClientRect();
    return rect&&{x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`) as { x: number; y: number } | null
  assert(box, `mouse_click_missing:${selector}`)
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y })
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y,
    button: "left", buttons: 1, clickCount: 1 })
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y,
    button: "left", buttons: 0, clickCount: 1 })
}

async function waitFor<T>(read: () => Promise<T | null>, timeoutMs: number, code: string, intervalMs = 100) {
  const started = Date.now()
  for (;;) {
    const value = await read()
    if (value !== null) return value
    if (Date.now() - started > timeoutMs) throw new Error(code)
    await pause(intervalMs)
  }
}

async function readJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`http_${response.status}:${url}:${await response.text()}`)
  return response.json() as Promise<T>
}

function quoted(value: string) { return JSON.stringify(value) }
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name}_required`); return value }
function isActive(status: string) { return ["queued", "running", "waiting_for_human", "paused", "cleanup_required"].includes(status) }
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`); process.exitCode = 1 })
