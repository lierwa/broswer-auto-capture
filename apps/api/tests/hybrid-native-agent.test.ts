import assert from "node:assert/strict"
import { createServer } from "node:http"
import test from "node:test"
import { withHybridAuthoring } from "../src/upstream-browser/hybrid-exploration.js"
import { hybridFixture } from "./fixtures/hybrid-compilation.js"
import { projectRoot } from "./helpers.js"
import { randomUUID } from "node:crypto"

// Native Agent/Browser/Tools and model bridge are real; scripted model values are fixture I/O, not provider acceptance.
test("真实原生 Agent 连续两步保留同一 tab；各自 history 编译并经 owner 清理", {
  skip: process.env.BAT_REAL_BROWSER_TEST !== "1", timeout: 60000,
}, async () => {
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Fixture</title><h1>Ready</h1>") })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const origin = `http://127.0.0.1:${address.port}`, raw = hybridFixture()
  let target = origin + "/first", agentCalls = 0, judgeCalls = 0
  const subject = { async verifyCapabilities() {}, async generate() { throw new Error("unplanned_text_model") },
    async generateObject(input: { schema: { jsonSchema: { properties: Record<string, unknown> } } }) {
      const judge = "verdict" in input.schema.jsonSchema.properties
      if (judge) judgeCalls++
      const object = judge ? { verdict: true, reasoning: "Scripted local fixture verdict" }
        : { evaluation_previous_goal: "Fixture", memory: "Fixture", next_goal: "Fixture", action: [agentCalls++ % 2 === 0
          ? { navigate: { url: target, new_tab: false } } : { done: { success: true, data: { value: null } } }] }
      return { object, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false } }
    } }
  try {
    const result = await withHybridAuthoring({ root: projectRoot, subject: subject as never,
      selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
      signal: new AbortController().signal, allowedOrigins: [origin] }, async (session) => {
      const steps = []
      for (const path of ["/first", "/second"]) {
        target = origin + path
        steps.push(await session.author({ task: "Open the supplied URL and finish with null: " + target, input: { url: target },
          inputSchema: raw.request.runtimeInputSchema, outputSchema: { type: "null" }, requirementId: "req", requirementVersion: 1,
          requirementText: "Open the supplied URL and finish with null.", requirementDigest: "1".repeat(64),
          planId: "plan", planVersion: 1, planDigest: "2".repeat(64), stepId: "step", callMode: "once", maxSteps: 3 }))
      }
      return steps
    })
    for (const step of result) {
      assert.deepEqual(step.response.compilation.gaps, [])
      assert.equal(step.response.compilation.segments.length, 1)
      assert.equal(step.browserCommands, 1)
    }
    const first = result[0]!.request as { trace: { observations: Array<{ tabId: string }> } }
    const second = result[1]!.request as typeof first
    assert.equal(first.trace.observations.at(-1)!.tabId, second.trace.observations[0]!.tabId)
    assert.deepEqual([agentCalls, judgeCalls], [4, 2])
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
})
