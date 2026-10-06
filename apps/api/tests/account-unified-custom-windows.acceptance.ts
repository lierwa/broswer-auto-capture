import { accountOwnedCore } from "./helpers/account-owned-core.js"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createApplication } from "../src/app.js"
import { accountFixtureChain, accountFixtureSite } from "./browser-account-fixture.js"
import { digestJson } from "@browser-capture/runtime"
import { Cdp, devtoolsPort, evaluate, waitDom, launchChrome, waitExit, screenshot, pause } from "./minimum-product-loop-workbench.js"

if (process.env.BAT_RUN_ACCOUNT_UNIFIED !== "1") throw Error("explicit_owned_windows_gate_required")
const root = process.cwd(), out = path.resolve(root, process.env.BAT_ACCOUNT_EVIDENCE_DIR ?? "work/account-unified-20261003/native-custom"), data = path.join(out, randomUUID())
await mkdir(out, { recursive: true })
const site = await accountFixtureSite(), chrome = launchChrome(path.join(data, "ui-chrome"))
let api = await createApplication({ root, directory: data, serveUi: true }), ui: Cdp | undefined, page: Cdp | undefined, uiBrowser: Cdp | undefined
const proof = { passed: false, personalProfileTouched: false, modelCalls: 0, steps: [] as string[], dataPath: data }
const click = async (text: string) => {
  const predicate = `(b.getAttribute('aria-label')===${JSON.stringify(text)}||b.textContent?.trim()===${JSON.stringify(text)})&&!b.disabled&&b.getClientRects().length>0`
  await waitDom(ui!, `[...document.querySelectorAll('button')].some(b=>${predicate})`, 15000)
  assert(await evaluate(ui!, `(()=>{const b=[...document.querySelectorAll('button')].find(b=>${predicate});b.click();return true})()`))
}
const settle = async () => { for (let i = 0; i < 360; i++) {
  if (!api.accounts.isBusy()) return
  await pause(250)
} throw Error("owned_custom_timeout") }
const act = async (body: object) => { await api.accounts.directoryCommand({ requestId: randomUUID(), ...body }); await api.accounts.settled() }
async function login() {
  await evaluate(page!, `(()=>{document.querySelector('[name=password]').value=${JSON.stringify(site.password)};document.querySelector('form').requestSubmit();return true})()`)
  await waitDom(page!, "document.querySelector('#account-name')?.textContent==='Test Alpha'", 15000)
}
try {
  await api.app.listen({ host: "127.0.0.1", port: 0 })
  const port = (api.app.server.address() as { port: number }).port, chromePort = await devtoolsPort(path.join(data, "ui-chrome"))
  const info = await fetch(`http://127.0.0.1:${chromePort}/json/version`).then(r => r.json()) as { webSocketDebuggerUrl: string }
  uiBrowser = await Cdp.connect(info.webSocketDebuggerUrl)
  const target = await fetch(`http://127.0.0.1:${chromePort}/json/new?http://127.0.0.1:${port}/`, { method: "PUT" }).then(r => r.json()) as { webSocketDebuggerUrl: string }
  ui = await Cdp.connect(target.webSocketDebuggerUrl)
  await click("浏览器设置"); await click("管理账号"); await click("其他网站"); await click("打开网站窗口"); await settle()
  const managedPort = await devtoolsPort(path.join(data, "browser-profile/default"))
  const targets = await fetch(`http://127.0.0.1:${managedPort}/json/list`).then(r => r.json()) as { type: string; webSocketDebuggerUrl: string }[]
  page = await Cdp.connect(targets.find(t => t.type === "page")!.webSocketDebuggerUrl)
  await evaluate(page, `location.href=${JSON.stringify(site.url)}`); await waitDom(page, "document.querySelector('#login-entry')", 15000)
  await login(); await click("读取当前页面"); await settle()
  assert.equal(api.accounts.directory.snapshot().customPage?.url, site.url)
  assert.equal(api.accounts.custom.choices(site.url).length, 0)
  await click("选择登录标识")
  for (let i = 0; i < 50; i++) {
    const point = await evaluate(page, "(()=>{const r=document.querySelector('#account-name').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()") as { x: number; y: number }
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point })
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point })
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point })
    if (api.accounts.custom.markerSelection()) break
    await pause(250)
  }
  await settle(); assert(api.accounts.custom.markerSelection())
  await click("使用这个标识"); await settle()
  const binding = api.accounts.repository.list("binding")[0]!, account = api.accounts.directory.current(binding.id)!
  assert.equal(account.state, "ready"); assert.equal(account.displayIdentity, "Test Alpha"); assert.equal(account.identityKey, null)
  assert.equal(api.accounts.repository.list("platformCheck").at(-1)!.run?.consumed.llmCalls, 0)
  await waitDom(ui, "document.querySelector('.identity-block h3')?.textContent==='Test Alpha'", 15000)
  await screenshot(ui, path.join(out, "native-account.png"))
  proof.steps.push("actual compact UI → own native window → server-backed login → native overlay → immutable check → canonical source-bound account")
  await click("打开网站"); await settle()
  assert.equal(api.accounts.repository.list("directoryOperation").at(-1)!.status, "completed")
  const check = api.accounts.repository.list("platformCheck").at(-1)!
  assert(!JSON.stringify(check.run).includes("signed-in"))
  const chain = accountFixtureChain(site.url)
  api.accounts.repository.save("platformMethod", { schemaVersion: 1, id: randomUUID(), platformId: binding.id, platformVersion: "fixture",
    sourceDigest: digestJson(chain), chain, createdAt: new Date().toISOString() })
  await act({ type: "custom_attach", platformId: binding.id, revision: binding.revision, chainId: chain.id, chainVersion: 1 })
  await act({ type: "custom_check", platformId: binding.id, revision: 1 })
  assert.equal(api.accounts.directory.current(binding.id)!.state, "ready")
  site.expire(); await act({ type: "custom_check", platformId: binding.id, revision: 1 })
  assert.equal(api.accounts.directory.current(binding.id)!.state, "expired")
  site.state.broken = true; await act({ type: "custom_check", platformId: binding.id, revision: 1 })
  assert.equal(api.accounts.directory.current(binding.id)!.state, "unconfirmed")
  proof.steps.push("existing original read-only chain fallback → authenticated / unauthenticated / changed structure; zero models and raw-page redaction")
  site.state.broken = false
  await act({ type: "remove", platformId: binding.id, revision: 1 })
  const owner = api.accounts.repository.active()!
  await accountOwnedCore(api.accounts).windows.finish(owner)
  page.close(); page = undefined
  await api.app.close(); api = await createApplication({ root, directory: data })
  assert.ok(api.accounts.directory.current(binding.id)!.deletedAt)
  assert.equal(api.accounts.directory.current(binding.id)!.revision, 2)
  assert(api.accounts.repository.list("platformCheck").every(c => c.run?.auditComplete && c.run.consumed.llmCalls === 0))
  assert.equal(api.accounts.repository.get("maintenance", owner.id).status, "closed")
  proof.steps.push("SQLite reopen preserves tombstone/revision/immutable chains/independent redacted runs; owned window closed, no personal Profile")
  proof.passed = true
} catch (error) {
  if (ui) await screenshot(ui, path.join(out, "failure.png")).catch(() => undefined)
  throw error
} finally {
  if (uiBrowser) await uiBrowser.send("Browser.close").catch(() => undefined)
  ui?.close(); uiBrowser?.close(); page?.close(); await waitExit(chrome)
  for (const w of api.accounts.repository.list("maintenance").filter(w => w.status !== "closed"))
    await accountOwnedCore(api.accounts).windows.finish(w).catch(() => undefined)
  await api.app.close(); await site.close()
  await writeFile(path.join(out, "result.json"), JSON.stringify(proof, null, 2) + "\n")
}
