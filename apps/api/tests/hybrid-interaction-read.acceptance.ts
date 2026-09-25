import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { digestJson } from "@browser-capture/runtime"
import { hybridExecuteRequestSchema, hybridExecuteResultSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { RunnerProcess } from "../src/upstream-browser/service.js"
import { projectRoot } from "./helpers.js"
import { startMinimumProductSite } from "./minimum-product-loop-site.js"

test("点击后的就绪读取与正式读取在同一无头浏览器会话中一致", { timeout: 120_000 }, async () => {
  const site = await startMinimumProductSite(), controller = new AbortController()
  const profilePath = await mkdtemp(path.join(tmpdir(), "bat-hybrid-acceptance-profile-"))
  const runner = new RunnerProcess(projectRoot, controller.signal)
  const url = `${site.base}/catalog`, scope = { url, urlDigest: digestJson(url) }
  const specification = readSpecification()
  let completed = false
  const execute = async (command: unknown) => {
    const parsed = hybridExecuteRequestSchema.parse({ id: randomUUID(), type: "hybrid_execute", command })
    try { return hybridExecuteResultSchema.parse(await runner.request(parsed)) }
    catch (error) { throw new Error(`focused_${parsed.command.name}_failed:${error instanceof Error ? error.message : "unknown"}`) }
  }
  try {
    await runner.startHybrid({ allowedOrigins: [new URL(site.base).origin], profilePath, headless: true })
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
    completed = true
  } finally {
    await runner.close().catch(() => {})
    await site.close()
    if (completed) assert.ok((await readdir(profilePath)).length > 0, "persistent profile should remain after runner close")
    await rm(profilePath, { recursive: true, force: true })
  }
})

function readSpecification() {
  return { container: "body > main > section > p", fields: {
    keyword: { selector: ":scope", attribute: null, valueType: "string", textPrefix: "Catalog result for ",
      normalizeWhitespace: true },
    message: { selector: ":scope", attribute: null, valueType: "string" },
  }, maxItems: 1, maxInputBytes: 128_000, outputSchema: { type: "object", properties: {
    keyword: { type: "string", minLength: 1 }, message: { type: "string" },
  }, required: ["keyword", "message"], additionalProperties: false } }
}

function inputTarget(scope: { url: string; urlDigest: string }) {
  const digest = "d6d198dd68bbff3e3fef3ae8aa7c4d9608c0b13cc99e15077b82dfa3233be364"
  return { strategy: "history", scope, identity: { schemaVersion: "browser-use.dom-interacted-element/v1",
    nodeName: "input", xPath: "html/body/main/section[1]/form/input", elementHash: "1430976413907220296",
    stableHash: "15266034469189384002", axNameDigest: "a668022aed26067debf017f10c180d4b9dd4e29b8c0b9b75b4ee115db5c0b78a",
    attributes: [{ name: "name", digest }, { name: "id", digest }] } }
}

function buttonTarget(scope: { url: string; urlDigest: string }) {
  return { strategy: "history", scope, identity: { schemaVersion: "browser-use.dom-interacted-element/v1",
    nodeName: "button", xPath: "html/body/main/section[1]/form/button", elementHash: "564506924097849311",
    stableHash: "14399564979380013017", axNameDigest: "504101bcda9ef600213365b1202275ff3bd90def90eb55dab2debb097b94c3e6",
    attributes: [] } }
}

function overlayTarget(scope: { url: string; urlDigest: string }) {
  return { strategy: "history", scope, identity: { schemaVersion: "browser-use.dom-interacted-element/v1",
    nodeName: "button", xPath: "html/body/div[1]/button", elementHash: "1799079030610498794",
    stableHash: "11022451067465274598", axNameDigest: "31fbef162594de01bab0cd525c51f74de7bcb15063029fa1a54b2cf5944c80d8",
    attributes: [{ name: "id", digest: "c80aa99c3883de0a77036337890b877c4983c80a7bbbfb5a455288d2a46921a6" }] } }
}
