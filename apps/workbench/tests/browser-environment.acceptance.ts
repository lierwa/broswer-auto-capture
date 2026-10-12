// WHY：保护统一设置入口、跨弹框输入保留和运行约束；真实配置 API，运行命令只捕获。
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createServer, type ViteDevServer } from "vite"
import { createApplication } from "../../api/src/app.js"
import { Cdp, devtoolsPort, evaluate, launchChrome, pause, screenshot, waitDom, waitExit } from "../../api/tests/minimum-product-loop-workbench.js"

if (process.env.BAT_RUN_BROWSER_SETTINGS_UI !== "1") throw Error("explicit_ui_acceptance_required")
const root = process.cwd(), directory = path.join(root, "work", "browser-settings-ui-" + Date.now())
await mkdir(directory, { recursive: true })
const api = await createApplication({ root, directory: path.join(directory, "data"), serveUi: false,
  upstreamBrowserRuntime: { } })
api.dailyChrome.profiles = async () => [{ id: "Default", name: "测试 Chrome" }]
let vite: ViteDevServer | undefined, browser: Cdp | undefined, page: Cdp | undefined, chrome: ReturnType<typeof launchChrome> | undefined
const proof: Record<string, unknown> = { mode: "isolated Windows UI with persisted browser settings; run commands captured only", steps: [] }
function log(step: string) { (proof.steps as string[]).push(step); console.log(step) }
const settings = '.browser-environment-dialog[data-state="open"]', run = '.task-run-dialog[data-state="open"]'
async function click(selector: string) {
  await waitDom(page!, "document.querySelector(" + JSON.stringify(selector) + ")", 8000)
  await evaluate(page!, "document.querySelector(" + JSON.stringify(selector) + ").click()")
}
async function button(text: string) {
  const expression = '[...document.querySelectorAll("button")].find(b=>b.textContent===' + JSON.stringify(text) + '&&!b.disabled)'
  await waitDom(page!, expression, 8000); await evaluate(page!, expression + ".click()")
}
async function waitMode(mode: string) {
  for (let i = 0; i < 100; i++) {
    if (api.browserEnvironment.snapshot().mode === mode) {
      await waitDom(page!, 'document.querySelector(' + JSON.stringify(settings) + ')?.innerText.includes("已自动保存")', 5000)
      return
    }
    await pause(60)
  }
  throw Error("saved_mode_timeout:" + mode)
}
async function runSummary(label: string) {
  await waitDom(page!, 'document.querySelector(' + JSON.stringify(run + " .run-browser-summary") + ')?.innerText.includes(' + JSON.stringify(label) + ')', 6000)
}
async function setInput(value: string) {
  await click(run + ' input[name="task-input"]')
  await page!.send("Input.insertText", { text: value })
}
async function captureDialog(selector: string, file: string) {
  await waitDom(page!, '(()=>{const d=document.querySelector(' + JSON.stringify(selector) + ');return d&&getComputedStyle(d).opacity==="1"})()', 5000)
  // 等待 Radix 进入动画与浏览器合成完成，避免截图停在内容尚未绘制的一帧。
  await pause(180)
  const clip = await evaluate(page!, '(()=>{const r=document.querySelector(' + JSON.stringify(selector) + ').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()')
  const result = await page!.send<{ data: string }>("Page.captureScreenshot", { format: "png", clip })
  await writeFile(path.join(directory, file), Buffer.from(result.data, "base64"))
}
async function verifyGlobalSettings() {
  await button("打开浏览器设置")
  await waitMode("daily")
  assert.equal(await evaluate(page!, 'document.querySelectorAll(".browser-environment-choices [role=radio]").length'), 2)
  assert.equal(await evaluate(page!, 'document.querySelector(".browser-window-setting")'), null)
  await screenshot(page!, path.join(directory, "settings-daily-dark.png"))
  await click(settings + ' [role="radio"][value="dedicated"]'); await waitMode("dedicated-visible")
  assert.equal(await evaluate(page!, 'document.querySelector(".browser-window-setting [role=switch]").getAttribute("aria-checked")'), "true")
  await click(settings + ' [role="switch"]'); await waitMode("dedicated-headless")
  await screenshot(page!, path.join(directory, "settings-dedicated-dark.png"))
  await button("完成")
  log("two browser sources; dedicated visibility switch persists through the actual API")
}
async function verifyRunSettings() {
  await button("打开运行确认"); await runSummary("后台运行")
  assert.equal(await evaluate(page!, 'document.querySelector(' + JSON.stringify(run + ' [role="combobox"]') + ')'), null)
  assert.equal(await evaluate(page!, 'document.querySelector(' + JSON.stringify(run + ' button[type="submit"]') + ').disabled'), true)
  await setInput("保留这次业务输入")
  await click(run + " .run-settings summary")
  await evaluate(page!, 'document.querySelector(' + JSON.stringify(run + ' [role="slider"]') + ').focus()')
  await page!.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36 })
  for (let i = 0; i < 8; i++) await page!.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 })
  const pacing = await evaluate(page!, 'document.querySelector(".pacing-value").textContent')
  assert.equal(pacing, "1.6 秒")
  await click(run + ' [aria-label="更改浏览器设置"]')
  await waitMode("dedicated-headless")
  await click(settings + ' [role="switch"]'); await waitMode("dedicated-visible")
  await button("返回运行"); await runSummary("显示窗口")
  assert.equal(await evaluate(page!, 'document.querySelector("input[name=task-input]").value'), "保留这次业务输入")
  assert.equal(await evaluate(page!, 'document.querySelector(".pacing-value").textContent'), pacing)
  assert.equal(await evaluate(page!, 'document.querySelector(' + JSON.stringify(run + ' button[type="submit"]') + ').disabled'), false)
  await click(run + " .run-settings summary")
  await screenshot(page!, path.join(directory, "run-unified-dark.png"))
  await button("开始运行")
  const commands = await evaluate(page!, "window.__browserSettingsCommands") as any[]
  assert.equal(commands.length, 1); assert.equal(commands[0].type, "run_task")
  assert.deepEqual(commands[0].browser, { mode: "dedicated-visible", headless: false })
  assert.equal(commands[0].input, "保留这次业务输入"); assert.equal(commands[0].pacing.nodeDelayMs, 1600)
  proof.command = commands[0]
  log("run uses saved setting; change roundtrip preserves input/pacing; keep-open prevents headless start")
}
async function verifyFailedSaveAndTrial() {
  await button("打开浏览器设置"); await waitMode("dedicated-visible")
  const revision = api.browserEnvironment.snapshot().revision
  api.store.saveBrowserEnvironment("dedicated-headless", revision)
  api.store.saveBrowserEnvironment("dedicated-visible", revision + 1)
  await click(settings + ' [role="radio"][value="daily"]')
  await waitDom(page!, 'document.querySelector(' + JSON.stringify(settings) + ')?.innerText.includes("更改未保存")', 6000)
  assert.equal(api.browserEnvironment.snapshot().mode, "dedicated-visible")
  assert.equal(await evaluate(page!, 'document.querySelector(".browser-environment-choices [value=dedicated]").getAttribute("aria-checked")'), "true")
  await button("完成"); await button("打开浏览器设置"); await waitMode("dedicated-visible")
  await click(settings + ' [role="radio"][value="daily"]'); await waitMode("daily")
  await button("完成"); await button("打开试跑确认"); await runSummary("日常 Chrome")
  await setInput("试跑保留输入")
  await click(run + ' [aria-label="更改浏览器设置"]'); await waitMode("daily")
  await click(settings + ' [role="radio"][value="dedicated"]'); await waitMode("dedicated-visible")
  await button("返回试跑"); await runSummary("显示窗口")
  assert.equal(await evaluate(page!, 'document.querySelector("input[name=task-input]").value'), "试跑保留输入")
  await button("取消")
  log("failed save keeps old selection; trial shares the same global settings and preserves inputs")
}
async function verifyLightAndNarrow() {
  await button("切换主题"); await button("打开浏览器设置"); await waitMode("dedicated-visible")
  await screenshot(page!, path.join(directory, "settings-dedicated-light.png"))
  await page!.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await pause(150)
  const bounds = await evaluate(page!, '(()=>{const d=document.querySelector(' + JSON.stringify(settings) + '),r=d.getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth,scroll:d.scrollWidth,width:d.clientWidth}})()') as any
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport && bounds.scroll <= bounds.width)
  proof.narrow = bounds; await screenshot(page!, path.join(directory, "settings-narrow.png"))
  await button("完成")
  await page!.send("Page.reload")
  await button("打开浏览器设置"); await waitMode("dedicated-visible")
  log("light theme and 390px layout verified; reload retains saved browser choice")
}
async function verifyVisualFocus() {
  await button("打开浏览器设置"); await waitMode("daily")
  await captureDialog(settings, "settings-daily-dark.png")
  await click(settings + ' [role="radio"][value="dedicated"]'); await waitMode("dedicated-visible")
  await evaluate(page!, 'document.querySelector(' + JSON.stringify(settings) + ').focus()')
  // Radix 的可见轨道由 ::before 绘制，外层 button 仅提供交互边界。
  const style = await evaluate(page!, '(()=>{const dialog=document.querySelector(' + JSON.stringify(settings) + '),track=getComputedStyle(dialog.querySelector("[role=switch]"),"::before");return {outline:getComputedStyle(dialog).outlineStyle,radius:parseFloat(track.borderRadius),height:parseFloat(track.height)}})()') as any
  proof.focus = style
  assert.equal(style.outline, "none"); assert.ok(style.radius >= style.height / 2)
  await captureDialog(settings, "settings-dedicated-dark.png")
  await button("完成"); await button("打开运行确认"); await runSummary("显示窗口")
  await setInput("保留这次业务输入"); await click(run + " .run-settings summary")
  await captureDialog(run, "run-unified-dark.png"); await button("取消")
  await verifyLightAndNarrow()
  log("Radix dialog has no fallback outline; dedicated switch uses full radius")
}
// WHY：真实配置 API + 受控授权状态；验证 UI 不把传输连接当成用户操作，不模拟授权已被 Chrome 批准。
async function verifyAuthorizationSettings() {
  const base = await api.dailyChrome.snapshot(), actions: string[] = []
  let connected = false, paired = true, authorizing = false, finishAuthorization: (() => void) | undefined
  api.dailyChrome.snapshot = async () => ({ ...base, connected, paired, busy: authorizing, profileDirectory: paired ? "Default" : null })
  api.dailyChrome.connectSaved = async () => { actions.push("connect"); throw Error("settings_must_not_connect") }
  api.dailyChrome.pair = async () => {
    actions.push("authorize"); authorizing = true
    await new Promise<void>(resolve => { finishAuthorization = resolve })
    authorizing = false; return { paired }
  }
  api.dailyChrome.revoke = async () => {
    actions.push("revoke"); paired = false; authorizing = false; finishAuthorization?.(); return { paired: false }
  }
  const originalActive = api.taskChain.isAnyActive, originalProfileBusy = api.browserProfile.isBusy
  api.taskChain.isAnyActive = () => true; api.browserProfile.isBusy = () => true
  try {
    await button("打开浏览器设置"); await waitMode("daily")
    await waitDom(page!, 'document.querySelector(".browser-connection-panel")?.innerText.includes("已授权")', 6000)
    const panel = () => evaluate(page!, 'document.querySelector(".browser-connection-panel").innerText')
    const disconnected = await panel()
    assert.ok(!String(disconnected).includes("连接状态") && !String(disconnected).includes("连接 Chrome"))
    await captureDialog(settings, "authorization-saved-dark.png")
    connected = true; await pause(2700)
    assert.equal(await panel(), disconnected)
    await click(settings + ' [role="radio"][value="dedicated"]'); await waitMode("dedicated-visible")
    await click(settings + ' [role="switch"]'); await waitMode("dedicated-headless")
    await click(settings + ' [role="radio"][value="daily"]'); await waitMode("daily")
    assert.deepEqual(actions, [])
    log("busy task/profile do not block saved settings; connected/disconnected authorization UI is identical; no connection request")
    await button("撤销授权")
    await waitDom(page!, 'document.querySelector(".browser-connection-panel")?.innerText.includes("未授权")', 6000)
    await captureDialog(settings, "authorization-required-dark.png")
    await button("授权 Chrome")
    await waitDom(page!, 'document.querySelector(".browser-connection-panel")?.innerText.includes("等待批准")', 6000)
    await button("取消授权")
    await waitDom(page!, '[...document.querySelectorAll("button")].some(b=>b.textContent==="授权 Chrome"&&!b.disabled)', 6000)
    assert.equal(paired, false)
    await button("授权 Chrome")
    await waitDom(page!, 'document.querySelector(".browser-connection-panel")?.innerText.includes("等待批准")', 6000)
    paired = true; finishAuthorization!()
    await waitDom(page!, 'document.querySelector(".browser-connection-panel")?.innerText.includes("已授权")', 6000)
    assert.deepEqual(actions, ["revoke", "authorize", "revoke", "authorize"])
    assert.ok(!String(await panel()).includes("连接 Chrome"))
    proof.authorizationActions = actions
    await button("完成"); await button("切换主题"); await button("打开浏览器设置"); await waitMode("daily")
    await waitDom(page!, 'document.querySelector(".browser-connection-panel")?.innerText.includes("已授权")', 6000)
    await captureDialog(settings, "authorization-saved-light.png")
    await button("完成")
    log("authorization entry/cancel/revoke stay available; mocked authorization outcomes never create a manual connect action")
  } finally { api.taskChain.isAnyActive = originalActive; api.browserProfile.isBusy = originalProfileBusy }
  await button("打开浏览器设置"); await waitMode("daily")
  await click(settings + ' [role="radio"][value="dedicated"]'); await waitMode("dedicated-visible"); await button("完成")
  await verifyFailedSaveAndTrial()
}
try {
  await api.app.listen({ host: "127.0.0.1", port: 0 })
  const address = api.app.server.address(); assert.ok(address && typeof address !== "string")
  vite = await createServer({ root: path.join(root, "apps/workbench"), configFile: path.join(root, "apps/workbench/vite.config.ts"),
    server: { host: "127.0.0.1", port: 0, proxy: { "/api": { target: "http://127.0.0.1:" + address.port, changeOrigin: false } } },
    plugins: [{ name: "browser-settings-fixture", configureServer(server) {
      server.middlewares.use("/__browser-settings", async (_request, response) => {
        response.setHeader("Content-Type", "text/html")
        response.end(await server.transformIndexHtml("/__browser-settings", '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tests/fixtures/browser-environment-screen.tsx"></script></body></html>'))
      })
    } }] })
  await vite.listen()
  const webAddress = vite.httpServer!.address(); assert.ok(webAddress && typeof webAddress !== "string")
  chrome = launchChrome(path.join(directory, "chrome"))
  const port = await devtoolsPort(path.join(directory, "chrome"))
  const info = await fetch("http://127.0.0.1:" + port + "/json/version").then(r => r.json()) as any
  proof.chrome = info.Browser; browser = await Cdp.connect(info.webSocketDebuggerUrl)
  const target = await fetch("http://127.0.0.1:" + port + "/json/new?" + encodeURIComponent("http://127.0.0.1:" + webAddress.port + "/__browser-settings"), { method: "PUT" }).then(r => r.json()) as any
  page = await Cdp.connect(target.webSocketDebuggerUrl)
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] })
  if (process.env.BAT_BROWSER_SETTINGS_SCOPE === "authorization") await verifyAuthorizationSettings()
  else if (process.env.BAT_BROWSER_SETTINGS_SCOPE === "visual") await verifyVisualFocus()
  else { await verifyGlobalSettings(); await verifyRunSettings(); await verifyFailedSaveAndTrial(); await verifyLightAndNarrow() }
  proof.passed = true
} catch (error) {
  proof.passed = false; proof.error = error instanceof Error ? error.message : String(error)
  if (page) await screenshot(page, path.join(directory, "failure.png")).catch(() => {})
  console.error(error); process.exitCode = 1
} finally {
  await writeFile(path.join(directory, "result.json"), JSON.stringify(proof, null, 2))
  console.log(JSON.stringify({ directory, passed: proof.passed }))
  if (browser) await browser.send("Browser.close").catch(() => {})
  page?.close(); browser?.close(); if (chrome) await waitExit(chrome)
  await vite?.close(); await api.app.close()
}
