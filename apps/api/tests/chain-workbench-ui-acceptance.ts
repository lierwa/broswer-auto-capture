import { copyFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createApplication } from "../src/app.js"
import { Cdp, devtoolsPort, evaluate, launchChrome, pause, screenshot, waitDom, waitExit } from "./minimum-product-loop-workbench.js"
import { startMinimumProductSite } from "./minimum-product-loop-site.js"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const source = required("BAT_I5_SOURCE_DIRECTORY"), taskId = required("BAT_I5_TASK_ID")
const directory = path.join(root, "work", `i5-chain-workbench-${Date.now()}`)
await mkdir(directory, { recursive: true })
await copyFile(path.join(path.resolve(source), "workbench.sqlite"), path.join(directory, "workbench.sqlite"))
process.env.BAT_UPSTREAM_BROWSER_HEADLESS = "1"
const application = await createApplication({ root, directory, serveUi: true })
let chrome: ReturnType<typeof launchChrome> | undefined, browser: Cdp | undefined, page: Cdp | undefined
let site: Awaited<ReturnType<typeof startMinimumProductSite>> | undefined
try {
  await application.app.listen({ host: "127.0.0.1", port: 0 })
  const address = application.app.server.address()
  if (!address || typeof address === "string") throw new Error("i5_listen_address_missing")
  const base = `http://127.0.0.1:${address.port}`
  const title = (await json<Array<{ id: string; title: string }>>(`${base}/api/tasks`))
    .find((item) => item.id === taskId)?.title
  if (!title) throw new Error("i5_task_missing")
  const before = await chainState(base)
  const sourceUrl = before.chains.flatMap((chain) => chain.nodes).flatMap((node) => Object.values(node.input ?? {}))
    .map((binding) => binding && typeof binding === "object" && "value" in binding ? binding.value : null)
    .find((value): value is string => typeof value === "string" && /^http:\/\/127\.0\.0\.1:\d+\//.test(value))
  if (sourceUrl) site = await startMinimumProductSite(Number(new URL(sourceUrl).port))

  const profile = path.join(directory, "headless-chrome")
  await mkdir(profile, { recursive: true }); chrome = launchChrome(profile)
  const port = await devtoolsPort(profile)
  const browserInfo = await json<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${port}/json/version`)
  browser = await Cdp.connect(browserInfo.webSocketDebuggerUrl)
  const target = await json<{ webSocketDebuggerUrl: string }>(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: "PUT" })
  page = await Cdp.connect(target.webSocketDebuggerUrl)
  await page.send("Page.enable"); await page.send("Runtime.enable")
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await page.send("Page.navigate", { url: base })
  await waitDom(page, "document.querySelector('.task-list') && document.querySelector('#main-workspace')")
  await openTaskChain(page, title, taskId)

  const listAction = await evaluate(page, `(()=>{const item=[...document.querySelectorAll('.task-list-item')]
    .find((root)=>root.querySelector('.task-select')?.getAttribute('aria-label')===${JSON.stringify(`打开任务：${title}`)});
    return item?.querySelector('.task-run-action')?.textContent?.trim()})()`)
  assert(listAction === "打开链路", "i5_sidebar_must_only_navigate")
  await waitDom(page, "document.querySelector('.chain-stage-card')")
  assert(await evaluate(page, "document.querySelectorAll('.chain-stage-preview').length") === 0,
    "i5_stage_preview_must_not_be_resident")
  await evaluate(page, "document.querySelector('.chain-stage-card footer button')?.click()")
  await waitDom(page, "document.querySelectorAll('.chain-stage-preview').length === 1")
  const doubleClicked = await evaluate(page, `(()=>{const target=document.querySelector('.chain-stage-card');
    return Boolean(target?.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0,detail:2})))})()`)
  assert(doubleClicked === true, "i5_stage_double_click_missing")
  await waitDom(page, "document.querySelector('.chain-action-card') && document.querySelector('.chain-inspector')")
  const focusedActions = await evaluate(page, "document.querySelectorAll('.chain-action-card').length")
  await clickButton(page, "任务链路"); await waitDom(page, "document.querySelector('.chain-stage-card')")

  await clickButton(page, "再次运行")
  await waitDom(page, "document.querySelector('.task-run-dialog form')")
  await clickButton(page, "开始运行")
  await waitDom(page, "document.querySelector('.execution-strip')?.textContent?.includes('execution') === true", 30_000)
  const execution = await waitNewExecution(base, before.executions.length)
  await waitDom(page, `document.querySelector('.execution-strip')?.textContent?.includes(${JSON.stringify(execution.id.slice(0, 8))}) === true`, 30_000)
  await waitDom(page, "document.querySelector('.execution-strip')?.textContent?.match(/[1-9][0-9]* 条动作事件/)", 30_000)
  await page.send("Page.reload")
  await waitDom(page, "document.querySelector('.task-list')")
  await openTaskChain(page, title, taskId)
  await waitDom(page, `document.querySelector('.execution-strip')?.textContent?.includes(${JSON.stringify(execution.id.slice(0, 8))}) === true`, 30_000)
  await waitDom(page, "document.querySelector('.chain-stage-card[data-tone=success]')", 30_000)

  const image = path.join(directory, "chain-workbench-1440.png")
  await screenshot(page, image)
  const after = await chainState(base), persisted = after.executions.find((item) => item.id === execution.id)
  assert(persisted?.consumed.llmCalls === 0, "i5_ordinary_replay_called_model")
  const runIds = persisted.steps.flatMap((step) => step.runIds)
  assert(after.runs.filter((run) => runIds.includes(run.binding.runId))
    .every((run) => run.modelCalls.length === 0), "i5_run_model_audit_not_empty")
  const result = { mode: "i5-chain-workbench/v1", taskId, executionId: execution.id,
    executionStatus: execution.status, focusedActions, eventCount: await evaluate(page,
      "Number(document.querySelector('.execution-strip small')?.textContent?.match(/(\\d+) 条动作事件/)?.[1] ?? 0)"),
    sidebarAction: listAction, persistedAfterRefresh: true, modelCalls: persisted.consumed.llmCalls, screenshot: image }
  await writeFile(path.join(directory, "result.json"), JSON.stringify(result, null, 2), "utf8")
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  if (browser) await browser.send("Browser.close").catch(() => undefined)
  page?.close(); browser?.close(); if (chrome) await waitExit(chrome)
  await site?.close().catch(() => undefined)
  await application.app.close().catch(() => undefined)
}

async function openTaskChain(page: Cdp, title: string, id: string) {
  await evaluate(page, `(()=>{const button=[...document.querySelectorAll('.task-select')]
    .find((item)=>item.getAttribute('aria-label')===${JSON.stringify(`打开任务：${title}`)});button?.click();return Boolean(button)})()`)
  await waitDom(page, `document.querySelector('[data-task-id=${JSON.stringify(id)}]:not([hidden])')`)
  await evaluate(page, `(()=>{const item=[...document.querySelectorAll('.task-list-item')]
    .find((root)=>root.querySelector('.task-select')?.getAttribute('aria-label')===${JSON.stringify(`打开任务：${title}`)});
    const primary=item?.querySelector('.task-run-action');
    if(primary?.textContent?.includes('打开链路')){primary.click();return true}
    const tab=[...document.querySelectorAll('[role=tab]')].find((candidate)=>candidate.textContent?.includes('链路画布'));
    tab?.click();return Boolean(tab)})()`)
  await waitDom(page, `document.querySelector('[data-task-id=${JSON.stringify(id)}]:not([hidden]) [role=tab][data-state=active]')?.textContent?.includes('链路画布') === true`)
}

async function clickButton(page: Cdp, text: string) {
  const clicked = await evaluate(page, `(()=>{const button=[...document.querySelectorAll('button')]
    .find((item)=>item.textContent?.trim()===${JSON.stringify(text)});button?.click();return Boolean(button&&!button.disabled)})()`)
  assert(clicked === true, `i5_button_missing:${text}`)
}
async function waitNewExecution(base: string, count: number) {
  const started = Date.now()
  for (;;) {
    const state = await chainState(base), execution = state.executions.at(-1)
    if (state.executions.length > count && execution && ["completed", "cleanup_required"].includes(execution.status)) return execution
    if (state.executions.length > count && execution && ["failed", "blocked", "cancelled"].includes(execution.status)) {
      throw new Error(`i5_execution_failed:${execution.status}:${execution.reason}`)
    }
    if (Date.now() - started > 60_000) throw new Error("i5_execution_timeout")
    await pause(100)
  }
}
async function chainState(base: string) {
  return json<{ executions: Array<{ id: string; status: string; reason: string; consumed: { llmCalls: number };
    steps: Array<{ runIds: string[] }> }>;
    runs: Array<{ binding: { runId: string }; modelCalls: unknown[] }>;
    chains: Array<{ nodes: Array<{ input?: Record<string, unknown> }> }> }>(
    `${base}/api/task-chain?taskId=${encodeURIComponent(taskId)}`)
}
async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init); if (!response.ok) throw new Error(`i5_http_${response.status}:${url}`)
  return response.json() as Promise<T>
}
function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name}_missing`); return value }
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }
