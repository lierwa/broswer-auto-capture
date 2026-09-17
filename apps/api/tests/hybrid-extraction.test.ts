import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import test from "node:test"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { withHybridAuthoring, recompileHybridSource } from "../src/upstream-browser/hybrid-exploration.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { projectRoot } from "./helpers.js"

// Native extract uses the real upstream metadata envelope; only provider responses are scripted.
test("原生 extract 元数据进入字段证明，真实 Chrome 同链换输入输出变化且零模型", {
  skip: process.env.BAT_REAL_BROWSER_TEST !== "1", timeout: 90000,
}, async () => {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html")
    response.end('<!doctype html><title>Record</title><main id="record"><b>'
      + (request.url === "/other" ? "Different" : "Source") + '</b><i>First</i><i>Second</i></main>')
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address(); assert.ok(address && typeof address !== "string")
  const origin = `http://127.0.0.1:${address.port}`, url = origin + "/sample", raw = hybridFixture(), plan = hybridPlan(raw)
  const schema = { type: "object" as const, properties: { name: { type: "string" as const, maxLength: 100 },
    values: { type: "array" as const, items: { type: "string" as const, maxLength: 100 }, maxItems: 4 } },
    required: ["name", "values"], additionalProperties: false }
  const fields = { name: "Source", values: ["First", "Second"] }
  const read = { container: "#record", fields: { name: { selector: "b", valueType: "string" },
    values: { selector: "i", valueType: "string", multiple: true, maxValues: 4 } },
    maxItems: 1, maxInputBytes: 2048, outputSchema: schema }
  const clauses = [...raw.request.requirement.clauses, { id: "record", kind: "output", expression: { read } }]
  let agents = 0, extracts = 0, judges = 0
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false }
  const subject = { async verifyCapabilities() {}, async generate() { throw new Error("unexpected_text_generation") },
    async generateObject(input: { schema: { jsonSchema: { properties: Record<string, unknown> } }; onEvent(event: unknown): void }) {
      input.onEvent({ type: "generation.started" })
      let object: unknown
      const properties = input.schema.jsonSchema.properties
      if ("verdict" in properties) { judges++; object = { verdict: true, reasoning: "Scripted local fixture" } }
      else if ("name" in properties) { extracts++; object = fields }
      else {
        const stage = agents++
        assert.ok(stage < 3, "native_extraction_did_not_complete")
        object = { evaluation_previous_goal: "Fixture", memory: "Fixture", next_goal: "Fixture", action: [stage === 0
          ? { navigate: { url, new_tab: false } } : stage === 1 ? { extract: { query: "Read the name in the record", output_schema: schema } }
          : { done: { success: true, data: fields } }] }
      }
      input.onEvent({ type: "generation.completed" })
      return { object, usage }
    } }
  try {
    const source = await withHybridAuthoring({ root: projectRoot, subject: subject as never,
      selection: { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "high" },
      signal: new AbortController().signal, allowedOrigins: [origin] }, (session) => session.author({
      task: "Open the URL, extract the name using the supplied output schema, then finish.", input: { url },
      inputSchema: raw.request.runtimeInputSchema, outputSchema: schema,
      requirementId: plan.requirement.id, requirementVersion: plan.requirement.version,
      requirementText: "Open the URL and extract the record fields.", requirementDigest: plan.requirement.digest,
      planId: plan.id, planVersion: plan.version, planDigest: "2".repeat(64),
      stepId: "perform", callMode: "once", maxSteps: 4 }))
    assert.deepEqual(source.response.compilation.gaps, [])
    assert.deepEqual(source.response.compilation.coverage.map((item) => item.disposition), ["compiled", "compiled", "agent_internal"])
    assert.deepEqual([agents, extracts, judges], [3, 1, 1])
    const recompiled = await recompileHybridSource({ root: projectRoot, signal: new AbortController().signal,
      request: source.request, sourceResponse: source.response, outputSchema: schema, verifiedChildren: [] })
    assert.deepEqual(recompiled.response, source.response)
    assert.deepEqual([agents, extracts, judges], [3, 1, 1])
    plan.outputContract = { ...plan.outputContract, schema }
    plan.steps[0]!.outputContract = plan.outputContract
    plan.steps[0]!.completion = [{ id: "record", description: "Declared fields read", predicate: {
      operator: "exists", value: { source: "node", nodeId: "perform", path: ["name"] } } }]
    plan.completion = plan.steps[0]!.completion
    const chain = materializeHybridChain({ request: source.request, response: source.response,
      plan, step: plan.steps[0]!, version: 1, model: "fixture" })
    for (const [suffix, expected] of [["/sample", "Source"], ["/other", "Different"]]) {
      const run = await withHybridCapabilities({ root: projectRoot, allowedOrigins: [origin], signal: new AbortController().signal },
        (capabilities) => new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: origin + suffix }, "sample"),
          capabilities: { ...capabilities, llm: async () => { throw new Error("ordinary_read_called_model") } } }))
      assert.equal(run.status, "completed", JSON.stringify(run.outcome))
      assert.deepEqual(run.outputs.result?.kind === "value" && run.outputs.result.value, { ...fields, name: expected })
      assert.equal(run.consumed.browserCommands, 2)
      assert.deepEqual(run.modelCalls, [])
    }
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
})
