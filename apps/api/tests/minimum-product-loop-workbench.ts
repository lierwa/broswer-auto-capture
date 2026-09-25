import { spawn, type ChildProcess } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import type { VersionReference } from "@browser-capture/contracts"

type Input = {
  apiBase: string
  directory: string
  taskId: string
  release: VersionReference
  executionState: () => Promise<{ count: number; latestStatus: string | null }>
}

/** 从用户实际页面验证交互；浏览器仅作为 headless UI 客户端，不替代产品 Browser runtime。 */
export async function runMinimumProductWorkbenchAcceptance(input: Input) {
  const outputDirectory = path.join(input.directory, "screenshots")
  const profile = path.join(input.directory, "workbench-chrome")
  await mkdir(outputDirectory, { recursive: true }); await mkdir(profile, { recursive: true })
  const chrome = launchChrome(profile)
  let browser: Cdp | undefined, page: Cdp | undefined
  try {
    const port = await devtoolsPort(profile)
    const browserInfo = await json<{ webSocketDebuggerUrl: string }>(`http://127.0.0.1:${port}/json/version`)
    browser = await Cdp.connect(browserInfo.webSocketDebuggerUrl)
    const target = await json<{ webSocketDebuggerUrl: string }>(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(input.apiBase)}`, { method: "PUT" })
    page = await Cdp.connect(target.webSocketDebuggerUrl)
    await page.send("Page.enable"); await page.send("Runtime.enable"); await page.send("Network.enable")
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `globalThis.__batUiErrors=[];
      addEventListener('error',(event)=>globalThis.__batUiErrors.push(String(event.error?.stack||event.message||'error').slice(0,1000)));
      addEventListener('unhandledrejection',(event)=>globalThis.__batUiErrors.push(String(event.reason?.stack||event.reason||'rejection').slice(0,1000)));` })
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await page.send("Page.navigate", { url: input.apiBase })
    try { await waitDom(page, "document.querySelector('.task-list') && document.querySelector('#main-workspace')") }
    catch (error) {
      const failurePath = path.join(outputDirectory, "bootstrap-failure.png")
      await screenshot(page, failurePath).catch(() => undefined)
      const diagnostic = await evaluate(page, `({href:location.href,readyState:document.readyState,
        rootChildren:document.querySelector('#root')?.childElementCount??-1,
        scripts:[...document.scripts].map((item)=>item.src),errors:globalThis.__batUiErrors??[],
        resources:performance.getEntriesByType('resource').map((item)=>({name:item.name,transferSize:item.transferSize}))})`)
      throw new Error(`ui_bootstrap_failed:${JSON.stringify(diagnostic)}`, { cause: error })
    }
    const title = await taskTitle(input.apiBase, input.taskId)
    await evaluate(page, `(()=>{const button=[...document.querySelectorAll('.task-select')].find((item)=>item.getAttribute('aria-label')===${JSON.stringify(`打开任务：${title}`)});if(!button)return false;button.click();return true})()`)
    await waitDom(page, `document.querySelector('[data-task-id=${JSON.stringify(input.taskId)}]:not([hidden])')`)

    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 })
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 })
    const firstFocus = await evaluate(page, "document.activeElement?.className ?? ''")
    assert(String(firstFocus).includes("skip-link"), "skip_link_not_first_focus")
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 })
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 })
    await waitDom(page, "document.activeElement?.id === 'main-workspace'")
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
    const reducedMotion = await evaluate(page, "matchMedia('(prefers-reduced-motion: reduce)').matches")

    const desktopPath = path.join(outputDirectory, "desktop.png")
    await screenshot(page, desktopPath)
    const beforeDouble = await input.executionState()
    await waitRunButton(page, title)
    const doubleClicked = await evaluate(page, `(()=>{const root=[...document.querySelectorAll('.task-list-item')].find((item)=>item.querySelector('.task-select')?.getAttribute('aria-label')===${JSON.stringify(`打开任务：${title}`)});const button=root?.querySelector('.task-run-action');if(!button||button.disabled)return false;button.click();button.click();return true})()`)
    assert(doubleClicked === true, "double_click_button_unavailable")
    await waitExecution(input.executionState, beforeDouble.count + 1)
    await pause(1800); assert((await input.executionState()).count === beforeDouble.count + 1, "double_click_dispatched_twice")

    await waitRunButton(page, title)
    const beforeRecovery = await input.executionState()
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    await evaluate(page, `(()=>{const root=[...document.querySelectorAll('.task-list-item')].find((item)=>item.querySelector('.task-select')?.getAttribute('aria-label')===${JSON.stringify(`打开任务：${title}`)});const button=root?.querySelector('.task-run-action');button?.click();return Boolean(button)})()`)
    await waitDom(page, `[...document.querySelectorAll('[role="alert"]')].some((item)=>item.textContent?.includes('运行请求未完成'))`)
    assert((await input.executionState()).count === beforeRecovery.count, "offline_request_created_execution")
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    const retried = await evaluate(page, `(()=>{const button=[...document.querySelectorAll('button')].find((item)=>item.textContent?.includes('重试同一请求'));button?.click();return Boolean(button)})()`)
    assert(retried === true, "retry_button_missing")
    await waitExecution(input.executionState, beforeRecovery.count + 1)

    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await pause(500)
    const narrowMetrics = await evaluate(page, `({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})`)
    const narrow = narrowMetrics as { innerWidth: number; clientWidth: number; scrollWidth: number }
    assert(narrow.innerWidth === 390 && narrow.clientWidth === 390 && narrow.scrollWidth === 390, "narrow_horizontal_overflow")
    const narrowPath = path.join(outputDirectory, "narrow.png")
    await screenshot(page, narrowPath)
    return { release: input.release, taskTitle: title, keyboard: { firstFocus, skipTarget: "main-workspace" },
      reducedMotion, doubleClick: { before: beforeDouble.count, after: beforeDouble.count + 1 },
      errorRecovery: { before: beforeRecovery.count, after: beforeRecovery.count + 1 }, narrow,
      screenshots: { desktop: desktopPath, narrow: narrowPath } }
  } finally {
    if (browser) await browser.send("Browser.close").catch(() => undefined)
    page?.close(); browser?.close(); await waitExit(chrome)
  }
}

export function launchChrome(profile: string) {
  const executable = process.env.BAT_ACCEPTANCE_BROWSER_EXECUTABLE
  if (!executable) throw new Error("chrome_executable_missing")
  return spawn(executable, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--disable-default-apps", "--disable-background-networking", "--window-size=1440,1000", "about:blank"],
  { stdio: "ignore", windowsHide: true })
}

export async function devtoolsPort(profile: string) {
  const file = path.join(profile, "DevToolsActivePort"), started = Date.now()
  for (;;) {
    try {
      const [port] = (await readFile(file, "utf8")).trim().split(/\r?\n/)
      if (port && (await fetch(`http://127.0.0.1:${Number(port)}/json/version`)).ok) return Number(port)
    } catch { /* startup or stale port */ }
    if (Date.now() - started > 20_000) throw new Error("chrome_devtools_timeout")
    await pause(100)
  }
}

async function taskTitle(base: string, taskId: string) {
  const tasks = await json<Array<{ id: string; title: string }>>(`${base}/api/tasks`)
  const task = tasks.find((item) => item.id === taskId)
  if (!task) throw new Error("ui_task_missing")
  return task.title
}

async function waitRunButton(page: Cdp, title: string) {
  await waitDom(page, `(()=>{const root=[...document.querySelectorAll('.task-list-item')].find((item)=>item.querySelector('.task-select')?.getAttribute('aria-label')===${JSON.stringify(`打开任务：${title}`)});const button=root?.querySelector('.task-run-action');return Boolean(button&&!button.disabled&&(button.textContent?.includes('运行')||button.textContent?.includes('再次运行')))})()`)
}

async function waitExecution(read: Input["executionState"], expectedCount: number) {
  const started = Date.now()
  for (;;) {
    const value = await read()
    if (value.count === expectedCount && value.latestStatus === "completed") return
    if (value.count > expectedCount || value.latestStatus && !["queued", "running", "completed"].includes(value.latestStatus)) {
      throw new Error(`ui_execution_unexpected:${value.count}:${value.latestStatus}`)
    }
    if (Date.now() - started > 600_000) throw new Error("ui_execution_timeout")
    await pause(500)
  }
}

export async function waitDom(page: Cdp, expression: string, timeoutMs = 20_000) {
  const started = Date.now()
  for (;;) {
    if (await evaluate(page, `Boolean(${expression})`)) return
    if (Date.now() - started > timeoutMs) throw new Error(`ui_dom_timeout:${expression}`)
    await pause(100)
  }
}

export async function screenshot(page: Cdp, file: string) {
  const result = await page.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
  await writeFile(file, Buffer.from(result.data, "base64"))
}

export async function evaluate(page: Cdp, expression: string) {
  const result = await page.send<{ result: { value?: unknown }; exceptionDetails?: unknown }>("Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(`ui_evaluate_failed:${JSON.stringify(result.exceptionDetails)}`)
  return result.result.value
}

export class Cdp {
  private sequence = 0
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } }
      if (!message.id) return
      const waiter = this.pending.get(message.id); if (!waiter) return
      this.pending.delete(message.id)
      if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result)
    })
  }
  static async connect(url: string) {
    const socket = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true })
      socket.addEventListener("error", () => reject(new Error("cdp_connection_failed")), { once: true })
    })
    return new Cdp(socket)
  }
  send<T = unknown>(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  close() { this.socket.close() }
}

async function json<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init); if (!response.ok) throw new Error(`http_${response.status}:${url}`)
  return response.json() as Promise<T>
}
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code) }
export function pause(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)) }
export async function waitExit(child: ChildProcess) {
  if (child.exitCode !== null) return
  await Promise.race([new Promise<void>((resolve) => child.once("exit", () => resolve())), pause(5000)])
  if (child.exitCode === null) child.kill()
}
