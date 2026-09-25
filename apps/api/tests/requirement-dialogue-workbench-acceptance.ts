// R1 正式入口验收：所有任务/消息/Question/确认动作都经 headless Workbench，服务对象只用于等待和审计。
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import type { InterviewState } from "@browser-capture/contracts/interview"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import {
  Cdp,
  devtoolsPort,
  evaluate,
  launchChrome,
  pause,
  screenshot,
  waitDom,
  waitExit,
} from "./minimum-product-loop-workbench.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-")
const caseId = process.env.BAT_R1_SOURCE_CASE ?? "unique"
const scenarios = {
  unique: {
    initial: "我只知道业务名称是哔哩哔哩，不知道它的技术地址。请先使用可用的只读网页搜索核对官方网站入口，展示来源候选让我确认；确认后读取首页底部的备案号并返回实际页面链接，没有结果时明确说明为空。",
    correction: "补充：结果必须明确写出实际页面链接；如果没有备案号，返回空结果和原因，不要改用其他网站。",
    clarification: "哔哩哔哩官方网站，业务来源为 bilibili.com；不需要填写技术入口或选择器。",
    expectedInitialOutcomes: ["unique", "multiple"],
  },
  multiple: {
    initial: "我要从名为 Mercury 的网站读取首页标题并返回实际链接；请先给出公开来源候选让我选择，没有结果时明确说明。",
    clarification: "选择当前推荐的 Mercury 来源；不需要填写技术入口或选择器。",
    expectedInitialOutcomes: ["multiple"],
  },
  none: {
    initial: "打开 Qzxv-Source-20260920 网站，读取首页标题并返回实际链接；如果找不到，先让我补充业务身份。",
    clarification: "实际业务身份是哔哩哔哩官方网站，任务改为读取官网首页标题并返回实际页面链接；不需要我提供 URL。",
    expectedInitialOutcomes: ["none"],
  },
} as const
if (!(caseId in scenarios)) throw new Error(`unknown_r1_source_case:${caseId}`)
const scenario = scenarios[caseId as keyof typeof scenarios]
const resumeTaskId = process.env.BAT_R1_RESUME_TASK_ID
const directory = process.env.BAT_R1_RESUME_DIRECTORY
  ? path.resolve(root, process.env.BAT_R1_RESUME_DIRECTORY)
  : path.join(root, "work", `requirement-dialogue-workbench-${caseId}-${stamp}`)
assert(Boolean(resumeTaskId) === Boolean(process.env.BAT_R1_RESUME_DIRECTORY), "resume_identity_incomplete")
const profile = path.join(directory, "chrome")
const evidencePath = path.join(directory, "acceptance.json")
const screenshotPath = path.join(directory, "confirmed-requirement.png")

await mkdir(profile, { recursive: true })
process.env.BAT_ACCEPTANCE_BROWSER_EXECUTABLE ??= "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const selection = persistedSelection()
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
let browserCommands = 0
const service = await createApplication({
  root,
  directory,
  ai,
  serveUi: true,
  browserExecutor: async () => { browserCommands += 1; throw new Error("r1_workbench_browser_forbidden") },
})
service.store.saveSharedModelSelection(SHARED_AI_SUBJECT, selection)
const base = await service.app.listen({ host: "127.0.0.1", port: 0 })
const chrome = launchChrome(profile)
let browser: Cdp | undefined
let page: Cdp | undefined
let taskId: string | undefined = resumeTaskId
let phase = "workbench_bootstrap"
process.stdout.write(`EVIDENCE ${directory}\n`)
try {
  const port = await devtoolsPort(profile)
  const browserInfo = await getJson<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${port}/json/version`)
  browser = await Cdp.connect(browserInfo.webSocketDebuggerUrl)
  const target = await getJson<{ webSocketDebuggerUrl: string }>(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: "PUT" })
  page = await Cdp.connect(target.webSocketDebuggerUrl)
  await page.send("Page.enable"); await page.send("Runtime.enable")
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await page.send("Page.navigate", { url: base })
  await waitDom(page, "document.querySelector('.new-task') && !document.querySelector('.new-task').disabled", 30_000)
  if (!taskId) {
    await evaluate(page, "document.querySelector('.new-task').click()")
    taskId = await waitForTask(service.coordinator.list.bind(service.coordinator))
  } else assert(service.coordinator.list().some((task) => task.id === taskId), "resume_task_missing")
  await waitDom(page, `document.querySelector('[data-task-id=${JSON.stringify(taskId)}]:not([hidden])')`, 30_000)

  phase = "initial_source_dialogue"
  if (!resumeTaskId) await sendComposer(page, scenario.initial)
  const initialState = resumeTaskId ? service.store.snapshot(taskId)
    : await waitForRevision(service.store.snapshot.bind(service.store), taskId, 0)
  if (resumeTaskId) assert(!initialState.active && initialState.unresolved.some((item) => item.status === "open"), "resume_pending_question_missing")
  await recordInitialSourceGate(page, taskId, initialState)
  const first = await advanceUntilDraft(page, service.store.snapshot.bind(service.store), taskId, [], scenario.clarification)
  const firstMarkdownDigest = digest(first.draft.markdown)
  let final = first
  if ("correction" in scenario) {
    phase = "requirement_correction"
    await sendComposer(page, scenario.correction)
    await waitForRevision(service.store.snapshot.bind(service.store), taskId, first.state.revision)
    final = await advanceUntilDraft(page, service.store.snapshot.bind(service.store), taskId, first.trace,
      scenario.clarification, first.draft.version)
    assert(final.draft.version > first.draft.version, "correction_did_not_create_new_draft")
    assert(digest(final.state.drafts.find((item) => item.version === first.draft.version)!.markdown) === firstMarkdownDigest,
      "correction_rewrote_old_draft")
  }

  phase = "requirement_confirmation"
  await openAndConfirmDraft(page)
  const confirmed = await waitForConfirmed(service.store.snapshot.bind(service.store), taskId, final.draft.version)
  const requirement = service.taskChain.repository.requirements(taskId).at(-1)
  const initialSource = confirmed.sourceResolutions[0]
  const source = confirmed.sourceResolutions.findLast((item) => item.status === "selected")
  const expectedInitialOutcomes: readonly string[] = scenario.expectedInitialOutcomes
  assert(initialSource && expectedInitialOutcomes.includes(initialSource.outcome), "initial_source_outcome_mismatch")
  assert(source?.provider === "pi-web-access:web_search" || source?.provider === "bing_rss", "read_only_source_not_selected")
  if (expectedInitialOutcomes.includes("none")) assert(initialSource.status === "superseded", "clarified_source_not_superseded")
  assert(confirmed.unresolved.every((item) => item.status !== "open"), "open_question_after_confirmation")
  const selectedDomain = source.candidates.find((item) => item.id === source.selectedCandidateId)?.domain
  assert(requirement?.confirmationFacts?.sources.some((item) => item.domain === selectedDomain), "requirement_source_fact_missing")
  assert(browserCommands === 0, "requirement_dialogue_started_browser")
  const sourceToolCalls = completedToolCalls(confirmed).filter((name) =>
    name === "web_search" || name === "search_sources" || name === "present_source_candidates")
  const searchTool = source.provider === "pi-web-access:web_search" ? "web_search" : "search_sources"
  assert(sourceToolCalls.includes(searchTool) && sourceToolCalls.includes("present_source_candidates"), "source_tool_protocol_missing")
  assert(sourceToolCalls.indexOf(searchTool) < sourceToolCalls.indexOf("present_source_candidates"), "source_tool_protocol_order_invalid")
  await waitForConfirmedProjection(page)
  await screenshot(page, screenshotPath)
  const visible = String(await evaluate(page, "document.body.innerText"))
  assert(visible.includes("这个版本已确认"), "confirmed_state_not_visible")

  const artifact = {
    status: "passed",
    caseId,
    taskId,
    entry: "headless_workbench",
    model: { modelId: selection.modelId, reasoningEffort: selection.reasoningEffort,
      connectionIdHash: digest(selection.connectionId) },
    source: { initialOutcome: initialSource.outcome, selectedOutcome: source.outcome,
      domain: selectedDomain,
      questionId: source.questionId },
    dialogue: { revisions: confirmed.revision, questions: final.trace, draftVersions: confirmed.drafts.map((item) => item.version),
      confirmedVersion: confirmed.confirmedVersion, modelInvocations: confirmed.audits.reduce((sum, item) => sum + item.invocations, 0) },
    persistence: { requirementId: requirement?.id, requirementVersion: requirement?.version,
      unresolvedItemCount: requirement?.confirmationFacts?.unresolvedItemCount },
    browserCommands, sourceToolCalls,
    screenshot: screenshotPath,
  }
  await writeFile(evidencePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify(artifact)}\nEVIDENCE ${directory}\n`)
} catch (error) {
  const state = taskId ? service.store.snapshot(taskId) : undefined
  const failureScreenshot = path.join(directory, "failure.png")
  if (page) await screenshot(page, failureScreenshot).catch(() => undefined)
  const failure = {
    status: "failed", caseId, taskId, phase, browserCommands,
    error: error instanceof Error ? error.message : String(error),
    screenshot: page ? failureScreenshot : undefined,
    dialogue: state ? { revision: state.revision, active: state.active,
      turns: state.turns.map(({ id, status, reason }) => ({ id, status, reason })),
      sources: state.sourceResolutions, unresolved: state.unresolved,
      draftVersions: state.drafts.map(({ version }) => version),
      confirmedVersion: state.confirmedVersion,
      sourceToolCalls: completedToolCalls(state),
    } : undefined,
  }
  await writeFile(evidencePath, `${JSON.stringify(failure, null, 2)}\n`, "utf8")
  process.stdout.write(`FAILED ${JSON.stringify({ phase, taskId, browserCommands, error: failure.error })}\n`)
  throw error
} finally {
  if (browser) await browser.send("Browser.close").catch(() => undefined)
  page?.close(); browser?.close(); await waitExit(chrome)
  await service.app.close().catch(() => {})
  const cleanup = { chromePid: chrome.pid, exitCode: chrome.exitCode, signalCode: chrome.signalCode,
    closed: chrome.exitCode !== null || chrome.signalCode !== null, browserCommands }
  await writeFile(path.join(directory, "cleanup.json"), `${JSON.stringify(cleanup, null, 2)}\n`, "utf8")
  process.stdout.write(`CLEANUP ${JSON.stringify(cleanup)}\n`)
}

type Snapshot = (taskId: string) => InterviewState
type Trace = Array<{ revision: number; prompt: string; answer: string }>

async function advanceUntilDraft(
  page: Cdp,
  snapshot: Snapshot,
  taskId: string,
  trace: Trace,
  clarification: string,
  afterVersion = 0,
) {
  for (let step = 0; step < 6; step += 1) {
    const state = snapshot(taskId)
    const draft = state.drafts.findLast((item) => item.version > afterVersion && item.revision === state.revision)
    if (draft) return { state, draft, trace }
    const open = state.unresolved.find((item) => item.status === "open")
    if (!open) throw new Error("workbench_round_has_no_question_or_draft")
    const choice = questionChoice(open.question)
    const previousRevision = state.revision
    if (choice) await submitChoice(page, choice.label)
    else await submitFreeForm(page, clarification)
    trace.push({ revision: previousRevision, prompt: questionPrompt(open.question), answer: choice?.label ?? "补充业务来源身份" })
    await waitForRevision(snapshot, taskId, previousRevision)
  }
  throw new Error("workbench_dialogue_exceeded_six_followups")
}

function questionChoice(question: InterviewState["unresolved"][number]["question"]) {
  const options = "prompt" in question ? question.options : question.type === "choice" || question.type === "multi_choice"
    ? question.data.options : []
  const option = options.find((item) => item.recommended) ?? options[0]
  return option ? { label: option.label } : null
}

function questionPrompt(question: InterviewState["unresolved"][number]["question"]) {
  return "prompt" in question ? question.prompt : question.data.stem
}

async function submitChoice(page: Cdp, label: string) {
  // WHY：候选名称也可能出现在任务标题；只在当前需求 Question Panel 内选择，不能命中侧栏导航。
  const options = '.interview-thread label,.interview-thread button,.interview-thread [role="radio"]'
  await waitDom(page, `[...document.querySelectorAll(${JSON.stringify(options)})].some((item)=>item.textContent?.includes(${JSON.stringify(label)}))`, 20_000)
  const clicked = await evaluate(page, `(()=>{const item=[...document.querySelectorAll(${JSON.stringify(options)})]
    .find((node)=>node.textContent?.includes(${JSON.stringify(label)}));if(!item)return false;item.click();return true})()`)
  assert(clicked === true, `question_option_missing:${label}`)
  await waitDom(page, `[...document.querySelectorAll('.interview-thread button')].some((node)=>!node.disabled&&node.textContent?.includes('提交回答'))`, 5_000)
  const submitted = await evaluate(page, `(()=>{const button=[...document.querySelectorAll('button')]
    .find((node)=>!node.disabled&&node.textContent?.includes('提交回答'));if(!button)return false;button.click();return true})()`)
  assert(submitted === true, "question_submit_missing")
}

async function recordInitialSourceGate(page: Cdp, taskId: string, state: InterviewState) {
  await waitDom(page, "document.querySelector('.interview-thread')", 20_000)
  const sources = state.sourceResolutions
  const noSource = sources.some((source) => source.outcome === "none")
  const requirementCount = service.taskChain.repository.requirements(taskId).length
  const confirmationEnabled = await evaluate(page, `[...document.querySelectorAll('button')]
    .some((button)=>!button.disabled&&button.textContent?.includes('确认需求草稿'))`)
  const artifact = { caseId, taskId, sources, confirmedVersion: state.confirmedVersion,
    draftCount: state.drafts.length, requirementCount, confirmationEnabled,
    pendingQuestions: state.unresolved.filter((item) => item.status === "open"), browserCommands }
  await writeFile(path.join(directory, "initial-source-gate.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8")
  await screenshot(page, path.join(directory, "initial-source-gate.png"))
  if (!noSource) return
  assert(state.confirmedVersion === null && requirementCount === 0, "missing_source_requirement_confirmed")
  assert(confirmationEnabled === false && artifact.pendingQuestions.length > 0, "missing_source_confirmation_not_blocked")
}

async function submitFreeForm(page: Cdp, text: string) {
  const fields = ".interview-thread textarea,.interview-thread input:not([type]),.interview-thread input[type=\"text\"],.interview-thread [contenteditable=\"true\"]"
  await waitDom(page, `[...document.querySelectorAll(${JSON.stringify(fields)})].some((item)=>!item.disabled)`, 20_000)
  const focused = await evaluate(page, `(()=>{const items=[...document.querySelectorAll(${JSON.stringify(fields)})]
    .filter((node)=>!node.disabled);const item=items.find((node)=>node.getAttribute('placeholder')?.includes('业务线索'))
      ??items.find((node)=>!node.getAttribute('placeholder')?.includes('回答、补充、纠正'));item?.focus();return Boolean(item)})()`)
  assert(focused === true, "question_free_form_missing")
  await page.send("Input.insertText", { text })
  await waitDom(page, `[...document.querySelectorAll('button')].some((node)=>!node.disabled&&node.textContent?.includes('提交回答'))`, 5_000)
  const submitted = await evaluate(page, `(()=>{const button=[...document.querySelectorAll('button')]
    .find((node)=>!node.disabled&&node.textContent?.includes('提交回答'));if(!button)return false;button.click();return true})()`)
  assert(submitted === true, "question_submit_missing")
}

async function sendComposer(page: Cdp, text: string) {
  await waitDom(page, `(()=>{const item=document.querySelector('.thread-bottom textarea');return Boolean(item&&!item.disabled)})()`, 30_000)
  const focused = await evaluate(page, `(()=>{const item=document.querySelector('.thread-bottom textarea');item?.focus();return Boolean(item)})()`)
  assert(focused === true, "composer_missing")
  await page.send("Input.insertText", { text })
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 })
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 })
}

async function openAndConfirmDraft(page: Cdp) {
  await waitDom(page, "document.querySelector('.draft-artifact')", 20_000)
  await evaluate(page, "[...document.querySelectorAll('.draft-artifact')].at(-1).click()")
  await waitDom(page, `[...document.querySelectorAll('button')].some((item)=>!item.disabled&&item.textContent?.includes('确认需求草稿'))`, 20_000)
  await evaluate(page, `[...document.querySelectorAll('button')].find((item)=>!item.disabled&&item.textContent?.includes('确认需求草稿')).click()`)
}

async function waitForConfirmedProjection(page: Cdp) {
  // WHY：需求事件先于任务列表 1500 ms 轮询到达；等待服务端投影完成，避免截图记录上一轮需求状态。
  await waitDom(page, `(()=>{const row=document.querySelector('.task-list-item[data-selected="true"]');
    return row?.querySelector('.task-status')?.textContent?.trim()==='等待准备'
      &&row?.querySelector('.task-run-action')?.textContent?.trim()==='准备任务'
      &&document.querySelector('.topbar-product-state .rt-Badge')?.textContent?.trim()==='等待准备'})()`, 10_000)
}

async function waitForTask(list: () => Array<{ id: string }>) {
  for (let elapsed = 0; elapsed < 20_000; elapsed += 100) {
    const task = list()[0]
    if (task) return task.id
    await pause(100)
  }
  throw new Error("workbench_task_create_timeout")
}

async function waitForRevision(snapshot: Snapshot, taskId: string, previous: number) {
  for (let elapsed = 0; elapsed < 150_000; elapsed += 200) {
    const state = snapshot(taskId)
    if (state.revision > previous && !state.active) return state
    const turn = state.turns.at(-1)
    if (turn && ["failed", "cancelled", "interrupted"].includes(turn.status)) throw new Error(`workbench_turn_${turn.status}:${turn.reason}`)
    await pause(200)
  }
  throw new Error("workbench_interview_timeout")
}

async function waitForConfirmed(snapshot: Snapshot, taskId: string, version: number) {
  for (let elapsed = 0; elapsed < 20_000; elapsed += 100) {
    const state = snapshot(taskId)
    if (state.confirmedVersion === version) return state
    await pause(100)
  }
  throw new Error("workbench_confirm_timeout")
}

function persistedSelection() {
  const database = new Database(path.join(root, "data", "workbench.sqlite"), { readonly: true, fileMustExist: true })
  try {
    const row = database.prepare("select selection from aiSettings where subjectId = ?").get(SHARED_AI_SUBJECT) as { selection?: string }
    if (!row?.selection) throw new Error("persisted_model_selection_missing")
    return parseModelSelection(JSON.parse(row.selection))
  } finally { database.close() }
}

async function getJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`http_${response.status}:${url}`)
  return response.json() as Promise<T>
}

function digest(value: string) { return createHash("sha256").update(value).digest("hex") }
function completedToolCalls(state: InterviewState) {
  return state.messages.flatMap((message) => message.aiEvents.flatMap((event) => {
    if (event.type !== "extension" || event.name !== "model.tool-request.completed") return []
    const payload = event.payload as { toolName?: unknown }
    return typeof payload.toolName === "string" ? [payload.toolName] : []
  }))
}
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }
