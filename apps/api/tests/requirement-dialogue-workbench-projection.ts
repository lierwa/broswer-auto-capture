// R1 已确认数据的只读复核：不发送需求、准备或执行命令，验证轮询后的 UI 与 API 投影一致。
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"
import { createAI, localStore, parseModelSelection } from "@agent-platform/ai-connect/server"
import { createApplication, SHARED_AI_SUBJECT } from "../src/app.js"
import { Cdp, devtoolsPort, evaluate, launchChrome, pause, screenshot, waitDom, waitExit } from "./minimum-product-loop-workbench.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const input = process.env.BAT_R1_PROJECTION_DIRECTORY
if (!input) throw new Error("r1_projection_directory_required")
const directory = path.resolve(root, input)
const taskId = process.env.BAT_R1_PROJECTION_TASK_ID
if (!taskId) throw new Error("r1_projection_task_id_required")
const databasePath = path.join(directory, "workbench.sqlite")
const before = persistedFacts()
const database = new Database(databasePath, { readonly: true, fileMustExist: true })
const row = database.prepare("select selection from aiSettings where subjectId = ?").get(SHARED_AI_SUBJECT) as { selection: string }
const selection = parseModelSelection(JSON.parse(row.selection))
database.close()
const ai = await createAI({ storage: localStore({ directory: path.join(root, "data", "ai-connect") }) })
let modelCalls = 0, browserCommands = 0
const forbidModel = async () => { modelCalls += 1; throw new Error("r1_projection_model_forbidden") }
const service = await createApplication({ root, directory, ai, serveUi: true,
  aiModel: { selection: () => selection, prepare: forbidModel, prepareMain: forbidModel },
  browserExecutor: async () => { browserCommands += 1; throw new Error("r1_projection_browser_forbidden") },
})
const base = await service.app.listen({ host: "127.0.0.1", port: 0 })
const profile = path.join(directory, "projection-chrome")
await mkdir(profile, { recursive: true })
process.env.BAT_ACCEPTANCE_BROWSER_EXECUTABLE ??= "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const chrome = launchChrome(profile)
let browser: Cdp | undefined, page: Cdp | undefined
let result: Record<string, unknown> = { status: "failed", taskId }
try {
  const port = await devtoolsPort(profile)
  browser = await Cdp.connect((await json<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${port}/json/version`)).webSocketDebuggerUrl)
  page = await Cdp.connect((await json<{ webSocketDebuggerUrl: string }>(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).webSocketDebuggerUrl)
  await page.send("Page.enable"); await page.send("Runtime.enable")
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `globalThis.__r1WriteRequests=[];
    const originalFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{
      const method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
      if(!['GET','HEAD'].includes(method)){globalThis.__r1WriteRequests.push(method);return Promise.reject(new Error('r1_readonly_ui'));}
      return originalFetch(input,init);};` })
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await page.send("Page.navigate", { url: base })
  await waitDom(page, `document.querySelector('[data-task-id=${JSON.stringify(taskId)}]:not([hidden])')`, 30_000)
  // WHY：任务列表与标题每 1500 ms 读取服务端投影；需求事件到达不代表这两个视图已刷新。
  await pause(4500)
  const apiTasks = await json<Array<{ id: string; status: string; product?: { status: string; primaryAction: string } }>>(`${base}/api/tasks`)
  const apiTask = apiTasks.find((item) => item.id === taskId)
  const apiInterview = await json<{ revision: number; confirmedVersion: number | null }>(`${base}/api/interview?taskId=${taskId}`)
  const ui = await evaluate(page, `({sidebar:document.querySelector('.task-list-item[data-selected="true"] .task-status')?.textContent?.trim(),
    action:document.querySelector('.task-list-item[data-selected="true"] .task-run-action')?.textContent?.trim(),
    header:document.querySelector('.topbar-product-state .rt-Badge')?.textContent?.trim(),writeRequests:globalThis.__r1WriteRequests})`)
  await waitDom(page, "document.querySelector('.draft-artifact')", 20_000)
  await evaluate(page, "[...document.querySelectorAll('.draft-artifact')].at(-1).click()")
  await waitDom(page, "document.body.innerText.includes('这个版本已确认')", 20_000)
  const screenshotPath = path.join(directory, "confirmed-requirement-settled.png")
  await screenshot(page, screenshotPath)
  result = { status: "observed", taskId, api: { task: apiTask,
    interview: { revision: apiInterview.revision, confirmedVersion: apiInterview.confirmedVersion } }, ui, screenshot: screenshotPath }
  assert(apiTask?.product?.status === "ready_to_prepare", "api_requirement_projection_not_ready")
  assert(apiTask.product.primaryAction === "prepare_task", "api_requirement_action_not_prepare")
  const visible = ui as { sidebar?: string; action?: string; header?: string; writeRequests: string[] }
  assert(visible.sidebar === "等待准备" && visible.header === "等待准备" && visible.action === "准备任务", "ui_requirement_projection_stale")
  assert(visible.writeRequests.length === 0, "read_only_ui_attempted_write")
  result.status = "passed"
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  if (browser) await browser.send("Browser.close").catch(() => undefined)
  page?.close(); browser?.close(); await waitExit(chrome)
  await service.app.close()
  const after = persistedFacts()
  const unchanged = JSON.stringify(before) === JSON.stringify(after)
  const cleanup = { chromePid: chrome.pid, exitCode: chrome.exitCode, signalCode: chrome.signalCode,
    closed: chrome.exitCode !== null || chrome.signalCode !== null }
  result = { ...result, modelCalls, browserCommands, before, after, unchanged, cleanup }
  if (!unchanged || modelCalls !== 0 || browserCommands !== 0 || !cleanup.closed) { result.status = "failed"; process.exitCode = 1 }
  await writeFile(path.join(directory, "projection-acceptance.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ status: result.status, error: result.error, taskId,
    modelCalls, browserCommands, unchanged, cleanup })}\n`)
}

function persistedFacts() {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    return Object.fromEntries(["tasks", "messages", "drafts", "turns", "questions", "decisions", "audits",
      "sourceResolutions", "taskAuthoringJobs", "taskExecutions", "browserRuns"].map((table) => {
      const rows = db.prepare(`select * from ${table}`).all()
      const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex")
      return [table, { count: rows.length, digest }]
    }))
  } finally { db.close() }
}
async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`http_${response.status}`)
  return response.json() as Promise<T>
}
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }
