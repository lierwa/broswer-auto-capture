import assert from "node:assert/strict"
import { createServer } from "node:http"
import path from "node:path"
import test from "node:test"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"

import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"

const root = path.resolve(import.meta.dirname, "../../..")
// Real browser acceptance is explicitly opt-in and only serves this local non-sensitive fixture.
test("Python v2 普通能力经现有 LangGraph 换输入复跑，完成后关闭唯一会话", { skip: process.env.BAT_REAL_BROWSER_TEST !== "1" }, async () => {
  let pageText = "Ready"
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" }); response.end(`<!doctype html><title>Local protocol fixture</title><p>${pageText}</p>`)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`
    const raw = hybridFixture(), plan = hybridPlan(raw), step = plan.steps[0]!
    const chain = materializeHybridChain({ response: raw.response, request: raw.request, plan, step, version: 1, model: "unavailable" })
    const sessions: string[] = []
    let firstBrowser: unknown
    for (const suffix of ["/alpha", "/beta"]) {
      await withHybridCapabilities({ root, allowedOrigins: [origin], signal: new AbortController().signal }, async (capabilities) => {
        const browsers: Array<{ url: string; sessionId: string }> = []
        const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: origin + suffix }, "sample"),
          capabilities: { ...capabilities, capability: async (invocation) => {
            const result = await capabilities.capability!(invocation)
            firstBrowser ??= result.browser
            if (result.browser) browsers.push(result.browser)
            return result
          }, llm: async () => { throw new Error("unexpected_model") } } })
        assert.equal(run.status, "completed", JSON.stringify(run.externalFailure))
        assert.equal(run.modelCalls.length, 0)
        assert.equal(run.consumed.browserCommands, 1)
        assert.equal(browsers[0]?.url, origin + suffix)
        sessions.push(browsers[0]!.sessionId)
      })
    }
    assert.equal(new Set(sessions).size, 2)
    await withHybridCapabilities({ root, allowedOrigins: [origin], signal: new AbortController().signal,
      canRestoreByNavigation: true }, async (capabilities) => {
      const checkpoint = { browser: firstBrowser, resumeWhen: null, pendingEffect: null }
      await assert.rejects(capabilities.verifyResume!(checkpoint as never, AbortSignal.abort()), /abort/i)
      assert.equal(capabilities.browserCommandCount!(), 0)
      const verified = await capabilities.verifyResume!(checkpoint as never, new AbortController().signal)
      assert.equal(verified.ok, true)
      assert.equal(verified.browser?.url, origin + "/alpha")
      assert.equal(capabilities.browserCommandCount!(), 1)
      pageText = "Changed since checkpoint"
      const changed = await capabilities.verifyResume!(checkpoint as never, new AbortController().signal)
      assert.equal(changed.ok, false)
    })
    const controller = new AbortController()
    await withHybridCapabilities({ root, allowedOrigins: [origin], signal: controller.signal }, async (capabilities) => {
      const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: origin + "/cancel" }, "sample"),
        control: { signal: controller.signal }, capabilities: { ...capabilities, capability: async (invocation) => {
          const timer = setTimeout(() => controller.abort(), 20)
          try { return await capabilities.capability!(invocation) } finally { clearTimeout(timer) }
        } } })
      assert.equal(run.status, "paused")
      assert.ok(run.checkpoint)
      assert.equal(run.modelCalls.length, 0)
    })
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
})
