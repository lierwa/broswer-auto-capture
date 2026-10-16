import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { lstat, mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test, { type TestContext } from "node:test"
import { digestJson } from "@browser-capture/runtime"
import { hybridExecuteRequestSchema, hybridExecuteResultSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import { resolveNativeFileReceipts } from "../src/upstream-browser/content-receipts.js"
import { SourceLifecycleDiagnostics } from "../src/upstream-browser/source-lifecycle-diagnostics.js"
import { projectRoot } from "./helpers.js"
import { startMinimumProductSite } from "./minimum-product-loop-site.js"

type Execute = (command: unknown) => Promise<ReturnType<typeof hybridExecuteResultSchema.parse>>
type Scope = { url: string; urlDigest: string }
const sceneNames = ["read", "find_text", "upload", "pdf", "close", "search"] as const
type SceneName = typeof sceneNames[number]

function requestedScenes() {
  const raw = process.env.BAT_NATIVE_SCENES?.trim() || "all"
  if (raw === "all") return new Set<SceneName>(sceneNames)
  const values = raw.split(",").map(value => value.trim())
  assert.ok(values.length && values.every(value => sceneNames.includes(value as SceneName)),
    "controlled_scene_selection_invalid")
  return new Set(values as SceneName[])
}

test("原生工具与正式读取使用同一专属无头 Runner 和独立 owner", { timeout: 180_000 }, async context => {
  const selected = requestedScenes()
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "bat-hybrid-acceptance-")))
  const profilePath = path.join(directory, "profile"), ownerId = randomUUID()
  const controller = new AbortController()
  const abort = () => controller.abort(context.signal.reason)
  context.signal.addEventListener("abort", abort, { once: true })
  let diagnostics: SourceLifecycleDiagnostics | undefined
  const runner = new RunnerProcess(projectRoot, controller.signal, line => {
    diagnostics?.acceptPythonLine(line)
  }, { browserMode: "dedicated-headless", closeTimeoutMs: 30_000, childCloseTimeoutMs: 10_000 })
  let site: Awaited<ReturnType<typeof startMinimumProductSite>> | undefined, started = false
  let sessionId: string | undefined, browserCommands = 0, requestSequence = 0
  const failures: unknown[] = []
  const execute = async (command: unknown) => {
    const parsed = hybridExecuteRequestSchema.parse({ id: randomUUID(), type: "hybrid_execute",
      actionRef: `controlled-${++requestSequence}`, command })
    try {
      const result = hybridExecuteResultSchema.parse(await runner.request(parsed))
      sessionId ??= result.browser.sessionId
      assert.equal(result.browser.sessionId, sessionId, "all scenes must retain the same browser session")
      assert.ok(result.browserCommands > browserCommands, "native command counter must keep increasing")
      browserCommands = result.browserCommands
      return result
    }
    catch (error) { throw new Error(`focused_${parsed.command.name}_failed:${error instanceof Error ? error.message : "unknown"}`) }
  }
  try {
    const diagnosticDirectory = path.join(projectRoot, "work", "native-remediation-implementation-20261013")
    assert.equal(await realpath(diagnosticDirectory), path.resolve(diagnosticDirectory))
    // WHY：只消费 Runner 专用诊断通道，经既有严格 schema 脱敏后落盘；不复制 stdout、页面或原始异常。
    diagnostics = SourceLifecycleDiagnostics.open(diagnosticDirectory, ownerId)
    assert.ok(diagnostics && (await lstat(diagnostics.file)).isFile(), "controlled_diagnostics_unavailable")
    context.diagnostic(JSON.stringify({ phase: "controlled_diagnostics", ownerId,
      file: diagnostics.file, scenes: [...selected] }))
    await mkdir(profilePath)
    site = await startMinimumProductSite()
    context.diagnostic(JSON.stringify({ phase: "controlled_owner", ownerId, directory, profilePath,
      browserMode: "dedicated-headless" }))
    await runner.startHybrid({ allowedOrigins: [new URL(site.base).origin, "https://duckduckgo.com"],
      profilePath, headless: true, managedWindow: { ownerId, resume: false } })
    started = true
    assert.equal(runner.managedWindowOwner(), ownerId)
    if (selected.has("read")) await scene(context, "点击后的就绪读取与正式读取一致", () => verifyTemplateRead(execute, site!))
    if (selected.has("find_text")) await scene(context, "find_text 真实滚动及未找到反例", () => verifyFindText(execute, site!.base))
    if (selected.has("upload")) await scene(context, "本 owner 文本文件真实上传及缺失和越界反例", () => verifyUpload(execute, site!.base))
    if (selected.has("pdf")) await scene(context, "PDF 真实字节回执及 owner 和摘要反例", () => verifyPdf(execute, site!.base, profilePath, ownerId))
    if (selected.has("close")) await scene(context, "多个 owned tab 关闭及最后一页和陈旧引用反例", () => verifyClose(execute, site!.base))
    if (selected.has("search")) await scene(context, "原生公共搜索及非法 engine 反例", () => verifySearch(execute, site!.base))
  } catch (error) { failures.push(error) }
  finally {
    context.diagnostic(JSON.stringify({ phase: "controlled_commands", ownerId, sessionId,
      reportedBrowserCommands: browserCommands, attemptedRequests: requestSequence, modelCalls: 0 }))
    try { await closeOwnedRunner(context, runner, directory, profilePath, ownerId, started) }
    catch (error) { failures.push(error) }
    try { await site?.close() } catch (error) { failures.push(error) }
    diagnostics?.close()
    context.signal.removeEventListener("abort", abort)
  }
  if (failures.length) throw new AggregateError(failures, "controlled_acceptance_or_cleanup_failed")
})

async function scene(context: TestContext, name: string, run: () => Promise<void>) {
  await context.test(name, async child => {
    const started = performance.now()
    let status = "failed"
    try { await run(); status = "passed" }
    finally { child.diagnostic(JSON.stringify({ phase: "controlled_scene", scene: name, status,
      elapsedMs: Math.round(performance.now() - started) })) }
  })
}

async function closeOwnedRunner(context: TestContext, runner: RunnerProcess, directory: string,
  profilePath: string, ownerId: string, started: boolean) {
  const startedAt = performance.now(), report = await runner.close()
  context.diagnostic(JSON.stringify({ phase: "controlled_cleanup", ownerId, directory,
    elapsedMs: Math.round(performance.now() - startedAt), ...report }))
  // WHY：关闭回执中的 owner/PID 核验和 child exit 才允许删本次目录；失败保留目录用于同 owner 恢复。
  assert.equal(report.status, "confirmed", `cleanup_unconfirmed: retained ${directory}`)
  assert.equal(report.activeResources, false)
  if (started) {
    assert.equal(report.stages.find(stage => stage.stage === "browser_close")?.status, "confirmed")
    assert.equal(report.stages.find(stage => stage.stage === "child_exit")?.status, "confirmed")
    assert.ok((await readdir(profilePath)).length > 0, "persistent profile should remain after runner close")
  }
  assert.equal(await realpath(directory), directory)
  assert.ok(!((await lstat(directory)).isSymbolicLink()))
  assert.equal(path.dirname(profilePath), directory)
  assert.ok(path.basename(directory).startsWith("bat-hybrid-acceptance-"))
  await rm(directory, { recursive: true })
  await assert.rejects(lstat(directory), { code: "ENOENT" })
  context.diagnostic(JSON.stringify({ phase: "controlled_directory", ownerId, directory, status: "deleted" }))
}

async function verifyTemplateRead(execute: Execute, site: Awaited<ReturnType<typeof startMinimumProductSite>>) {
    const url = `${site.base}/catalog`, scope = { url, urlDigest: digestJson(url) }
    const specification = readSpecification()
    await execute({ name: "browser.workflow-step", version: 2, actionName: "navigate",
      args: { url, new_tab: false }, target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] })
    await execute({ name: "browser.workflow-step", version: 2, actionName: "input", args: { text: "alpha" },
      target: inputTarget(scope), postconditions: [{ kind: "target_value", bindingArgument: "text" }] })
    const alreadyReady = await execute({ name: "browser.target-readiness", version: 1,
      actionName: "click", target: buttonTarget(scope) })
    assert.deepEqual(alreadyReady.output, { status: "ready", documentId: (alreadyReady.output as { documentId: string }).documentId })
    await execute({ name: "browser.workflow-step", version: 2, actionName: "click", args: {},
      target: buttonTarget(scope), postconditions: [{ kind: "read_fields", transition: true,
        read: specification, scope, settle: { maxMs: 30_000, maxAttempts: 100, intervalMs: 300 },
        consumerRef: "s-a-0004" }] })
    const result = await execute({ name: "browser.read-fields", version: 2, specification, scope })
    assert.deepEqual(result.output, { keyword: "alpha", message: "Catalog result for alpha" })
    assert.equal(result.modelCalls, 0)

    site.state.catalogInterference = "dynamic-overlay"
    await execute({ name: "browser.workflow-step", version: 2, actionName: "navigate",
      args: { url, new_tab: false }, target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] })
    await execute({ name: "browser.workflow-step", version: 2, actionName: "input", args: { text: "alpha" },
      target: inputTarget(scope), postconditions: [{ kind: "target_value", bindingArgument: "text" }] })
    const blocked = await execute({ name: "browser.target-readiness", version: 1,
      actionName: "click", target: buttonTarget(scope) })
    assert.ok(["missing", "blocked"].includes((blocked.output as { status: string }).status))
    assert.equal(typeof (blocked.output as { documentId: string }).documentId, "string")
    await execute({ name: "browser.workflow-step", version: 2, actionName: "click", args: {},
      target: overlayTarget(scope), postconditions: [{ kind: "visible_overlays",
        equals: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945" }] })
    const prepared = await execute({ name: "browser.target-readiness", version: 1,
      actionName: "click", target: buttonTarget(scope) })
    assert.deepEqual(prepared.output, { status: "ready", documentId: (prepared.output as { documentId: string }).documentId })
    assert.equal((blocked.output as { documentId: string }).documentId,
      (prepared.output as { documentId: string }).documentId)
    await execute({ name: "browser.workflow-step", version: 2, actionName: "click", args: {},
      target: buttonTarget(scope), postconditions: [{ kind: "read_fields", transition: true,
        read: specification, scope, settle: { maxMs: 30_000, maxAttempts: 100, intervalMs: 300 },
        consumerRef: "s-a-0004" }] })
    const preparedResult = await execute({ name: "browser.read-fields", version: 2, specification, scope })
    assert.deepEqual(preparedResult.output, { keyword: "alpha", message: "Catalog result for alpha" })
    assert.equal(preparedResult.modelCalls, 0)
}

async function navigate(execute: Execute, url: string, newTab = false) {
  return execute({ name: "browser.workflow-step", version: 2, actionName: "navigate",
    args: { url, new_tab: newTab }, target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] })
}

async function step(execute: Execute, actionName: string, args: Record<string, unknown>,
  target: unknown = null, postconditions: unknown[] = []) {
  const result = await execute({ name: "browser.workflow-step", version: 2, actionName, args, target, postconditions })
  assert.equal(result.modelCalls, 0)
  return result
}

async function verifyFindText(execute: Execute, base: string) {
  const url = `${base}/native-tools`, scope = { url, urlDigest: digestJson(url) }
  const before = await navigate(execute, url)
  const found = await step(execute, "find_text", { text: "Native tool viewport marker" }, null,
    [{ kind: "scroll_position", changed: true }])
  assert.equal(found.browser.sessionId, before.browser.sessionId)
  assert.equal(found.browser.tabId, before.browser.tabId)
  const state = await execute({ name: "browser.read-fields", version: 2, scope,
    specification: markerSpecification() })
  assert.deepEqual(state.output, { marker: "Native tool viewport marker", visible: true })
  await assert.rejects(step(execute, "find_text", { text: "Absent native tool marker" }), /native_find_text_not_visible/)
  assert.deepEqual((await execute({ name: "browser.read-fields", version: 2, scope,
    specification: markerSpecification() })).output, { marker: "Native tool viewport marker", visible: true })
}

async function verifyUpload(execute: Execute, base: string) {
  const url = `${base}/native-tools`, scope = { url, urlDigest: digestJson(url) }
  await navigate(execute, url)
  const fileName = "owned-upload.txt", content = "Only this run owns these upload bytes."
  await step(execute, "write_file", { file_name: fileName, content, trailing_newline: false })
  assert.match(JSON.stringify((await step(execute, "read_file", { file_name: fileName })).output), /Only this run/)
  const target = { strategy: "css", value: "#native-upload", scope }
  const specification = uploadSpecification()
  await step(execute, "upload_file", { path: fileName }, target,
    [{ kind: "read_fields", read: specification, scope,
      equals: { fileName, size: Buffer.byteLength(content), content, changes: 1 },
      settle: { maxMs: 5_000, maxAttempts: 20, intervalMs: 100 } }])
  const expected = { fileName, size: Buffer.byteLength(content), content, changes: 1 }
  assert.deepEqual((await execute({ name: "browser.read-fields", version: 2, specification, scope })).output, expected)
  await assert.rejects(step(execute, "upload_file", { path: "missing-upload.txt" }, target), /native_file_missing/)
  await assert.rejects(step(execute, "upload_file", { path: `../${fileName}` }, target), /native_file_name_invalid/)
  assert.deepEqual((await execute({ name: "browser.read-fields", version: 2, specification, scope })).output, expected)
}

async function verifyPdf(execute: Execute, base: string, profilePath: string, ownerId: string) {
  await navigate(execute, `${base}/native-tools`)
  const result = await step(execute, "save_as_pdf", { file_name: "owned-report.pdf", print_background: true })
  const raw = result.output as { text: string; files: Array<{ ownerId: string; digest: string }> }
  assert.equal(raw.files.length, 1)
  const resolved = await resolveNativeFileReceipts(result.output, profilePath, ownerId) as {
    text: string; files: Array<{ fileName: string; mediaType: string; byteLength: number; bytesBase64: string }>
  }
  const file = resolved.files[0]!
  assert.equal(file.fileName, "owned-report.pdf")
  assert.equal(file.mediaType, "application/pdf")
  const bytes = Buffer.from(file.bytesBase64, "base64")
  assert.equal(bytes.length, file.byteLength)
  assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-")
  await assert.rejects(resolveNativeFileReceipts({ ...raw,
    files: raw.files.map(file => ({ ...file, ownerId: randomUUID() })) }, profilePath, ownerId), /native_file_receipt_owner_mismatch/)
  await assert.rejects(resolveNativeFileReceipts({ ...raw,
    files: raw.files.map(file => ({ ...file, digest: "0".repeat(64) })) }, profilePath, ownerId), /native_file_receipt_digest_mismatch/)
}

async function verifyClose(execute: Execute, base: string) {
  const first = await navigate(execute, `${base}/native-tools`)
  const second = await navigate(execute, `${base}/native-tools?owned=2`, true)
  const third = await navigate(execute, `${base}/native-tools?owned=3`, true)
  assert.equal(second.browser.sessionId, first.browser.sessionId)
  assert.equal(third.browser.sessionId, first.browser.sessionId)
  assert.equal(new Set([first.browser.tabId, second.browser.tabId, third.browser.tabId]).size, 3)
  const closed = await step(execute, "close", { tab_id: second.browser.tabId })
  assert.ok([first.browser.tabId, third.browser.tabId].includes(closed.browser.tabId))
  await assert.rejects(step(execute, "switch", { tab_id: second.browser.tabId }), /switch_runtime_target_missing_or_ambiguous/)
  await step(execute, "switch", { tab_id: third.browser.tabId })
  const last = await step(execute, "close", { tab_id: third.browser.tabId })
  assert.equal(last.browser.tabId, first.browser.tabId)
  await assert.rejects(step(execute, "close", { tab_id: first.browser.tabId }), /native_close_last_owned_tab_unsupported/)
  const retained = await navigate(execute, `${base}/native-tools`)
  assert.equal(retained.browser.tabId, first.browser.tabId)
}

async function verifySearch(execute: Execute, base: string) {
  const before = await navigate(execute, `${base}/native-tools`)
  await assert.rejects(step(execute, "search", { query: "browser-use documentation", engine: "unsupported" }), /ordinary_action_failed/)
  const retained = await execute({ name: "browser.read-fields", version: 2, specification: uploadSpecification(),
    scope: { url: before.browser.url, urlDigest: digestJson(before.browser.url) } })
  assert.equal(retained.browser.url, before.browser.url)
  assert.equal(retained.browser.tabId, before.browser.tabId)
  assert.deepEqual(retained.output, { fileName: "none", size: 0, content: "none", changes: 0 })
  const query = "browser-use documentation"
  const searched = await step(execute, "search", { query, engine: "duckduckgo" })
  const actual = new URL(searched.browser.url)
  assert.equal(actual.origin, "https://duckduckgo.com")
  assert.equal(actual.searchParams.get("q"), query)
  assert.equal(searched.browser.tabId, before.browser.tabId)
  assert.equal(searched.browser.sessionId, before.browser.sessionId)
}

function markerSpecification() {
  return { container: "#native-marker", fields: {
    marker: { selector: ":scope", attribute: null, valueType: "string" },
    visible: { selector: ":scope", attribute: "data-in-view", valueType: "boolean" },
  }, maxItems: 1, maxInputBytes: 128_000, outputSchema: { type: "object", properties: {
    marker: { type: "string" }, visible: { type: "boolean" },
  }, required: ["marker", "visible"], additionalProperties: false } }
}

function uploadSpecification() {
  return { container: "#upload-result", fields: {
    fileName: { selector: "#upload-name", attribute: null, valueType: "string" },
    size: { selector: "#upload-size", attribute: null, valueType: "integer" },
    content: { selector: "#upload-content", attribute: null, valueType: "string" },
    changes: { selector: "#upload-count", attribute: null, valueType: "integer" },
  }, maxItems: 1, maxInputBytes: 128_000, outputSchema: { type: "object", properties: {
    fileName: { type: "string" }, size: { type: "integer" }, content: { type: "string" }, changes: { type: "integer" },
  }, required: ["fileName", "size", "content", "changes"], additionalProperties: false } }
}

function readSpecification() {
  return { container: "body > main > section > p", fields: {
    keyword: { selector: ":scope", attribute: null, valueType: "string", textPrefix: "Catalog result for ",
      normalizeWhitespace: true },
    message: { selector: ":scope", attribute: null, valueType: "string" },
  }, maxItems: 1, maxInputBytes: 128_000, outputSchema: { type: "object", properties: {
    keyword: { type: "string", minLength: 1 }, message: { type: "string" },
  }, required: ["keyword", "message"], additionalProperties: false } }
}

function inputTarget(scope: Scope) {
  const digest = "d6d198dd68bbff3e3fef3ae8aa7c4d9608c0b13cc99e15077b82dfa3233be364"
  return { strategy: "history", scope, identity: { schemaVersion: "browser-use.dom-interacted-element/v1",
    nodeName: "input", xPath: "html/body/main/section[1]/form/input", elementHash: "1430976413907220296",
    stableHash: "15266034469189384002", axNameDigest: "a668022aed26067debf017f10c180d4b9dd4e29b8c0b9b75b4ee115db5c0b78a",
    attributes: [{ name: "name", digest }, { name: "id", digest }] } }
}

function buttonTarget(scope: Scope) {
  return { strategy: "history", scope, identity: { schemaVersion: "browser-use.dom-interacted-element/v1",
    nodeName: "button", xPath: "html/body/main/section[1]/form/button", elementHash: "564506924097849311",
    stableHash: "14399564979380013017", axNameDigest: "504101bcda9ef600213365b1202275ff3bd90def90eb55dab2debb097b94c3e6",
    attributes: [] } }
}

function overlayTarget(scope: Scope) {
  return { strategy: "history", scope, identity: { schemaVersion: "browser-use.dom-interacted-element/v1",
    nodeName: "button", xPath: "html/body/div[1]/button", elementHash: "1799079030610498794",
    stableHash: "11022451067465274598", axNameDigest: "31fbef162594de01bab0cd525c51f74de7bcb15063029fa1a54b2cf5944c80d8",
    attributes: [{ name: "id", digest: "c80aa99c3883de0a77036337890b877c4983c80a7bbbfb5a455288d2a46921a6" }] } }
}
