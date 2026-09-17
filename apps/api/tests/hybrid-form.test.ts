import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { z } from "zod"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { confirmedDraft, preexecutionModel, waitFor } from "./task-chain-test-support.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { projectRoot } from "./helpers.js"

function formAuthority(base: ReturnType<typeof hybridFixture>) {
  const clauses = [...base.request.requirement.clauses], selections = []
  const settle = { maxMs: 5000, maxAttempts: 30, intervalMs: 100 }
  for (const field of ["first", "second", "save"]) {
    const target = { strategy: "css", value: "#" + field }
    selections.push({ id: field, clauseRefs: [field + "-target"], strategy: "locator", target })
    clauses.push({ id: field + "-target", kind: "selection", expression: { strategy: "locator", target } })
    if (field !== "save") clauses.push({ id: field + "-value", kind: "input", expression: {
      actionName: "input", argumentPath: "text", selectionRef: field, binding: { source: "input", path: [field] } } })
    clauses.push({ id: field + "-done", kind: "completion", expression: field === "save"
      ? { selectionRef: field, factKind: "title", changed: true, settle }
      : { selectionRef: field, factKind: "target_value", bindingArgument: "text" } })
  }
  clauses.push({ id: "saved-state", kind: "completion", expression: { selectionRef: "save", factKind: "read_fields",
    read: { container: "#save", fields: { pressed: { selector: "button", attribute: "aria-pressed", valueType: "boolean" } },
      maxItems: 1, maxInputBytes: 2048, outputSchema: { type: "array", maxItems: 1,
        items: { type: "object", properties: { pressed: { type: "boolean" } }, required: ["pressed"], additionalProperties: false } } },
    equals: [{ pressed: true }], settle } })
  const source = { source: "input", path: ["enabled"] }
  const branch = { id: "enabled", clauseRefs: ["enabled-rule"], predicateSource: source,
    predicate: { operator: "equals", left: source, right: { source: "constant", value: true } },
    outcomes: { true: "clause:url", false: "completed" } }
  const { id: _, clauseRefs: __, ...intent } = branch
  clauses.push({ id: "enabled-rule", kind: "constraint", expression: { branch: intent } })
  return { clauses, control: { selections, branches: [branch], loops: [], invokes: [] }, acceptedAnnotations: [] }
}

function scriptedSubject(url: string) {
  let calls = 0, judges = 0
  const failures: string[] = []
  const subject = { async verifyCapabilities() {}, async generate() { throw new Error("fixture_text_call_unexpected") },
    async generateObject(input: { schema: { jsonSchema: { properties: Record<string, unknown> } }; messages: unknown[];
      onEvent: (event: unknown) => void }) {
      input.onEvent({ type: "generation.started" })
      let object: unknown
      if ("verdict" in input.schema.jsonSchema.properties) { judges++; object = { verdict: true, reasoning: "Local scripted fixture" } }
      else {
        const stage = calls++
        const messages = z.array(z.object({ content: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough())]) }).passthrough()).parse(input.messages)
        const message = messages.filter((message) => message.role === "user").at(-1)
        const content = typeof message?.content === "string" ? message.content
          : message?.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") ?? ""
        const field = stage === 1 ? "first" : stage === 2 ? "second" : "save"
        const line = content.split("\n").find((line) => /\[\d+\]/.test(line) && line.toLowerCase().includes(field))
        const index = line?.match(/\[(\d+)\]/)?.[1]
        const action = stage === 0 ? { navigate: { url, new_tab: false } } : stage === 5 ? { done: { success: true, data: { value: null } } }
          : stage === 4 ? { wait: { seconds: 1 } }
          : stage === 3 ? { click: { index: Number(index) } } : { input: { index: Number(index), text: field === "first" ? "Source first" : "Source second" } }
        if (stage > 5 || stage > 0 && stage < 4 && !index) {
          failures.push(JSON.stringify({ stage, field, lines: content.split("\n").filter((line) => /first|second|save|\[\d+\]/i.test(line)) }))
          throw new Error("fixture_observed_target_missing")
        }
        object = { evaluation_previous_goal: "Fixture", memory: "Fixture", next_goal: "Fixture", action: [action] }
      }
      input.onEvent({ type: "generation.completed" })
      return { object, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false } }
    } }
  return { subject, count: () => [calls, judges], failures }
}

// The provider is scripted; HTTP authoring, native Agent/Browser, fork, database and both replays are real.
test("本地表单正式入口：原生探索后生成候选，真实 Chrome 样本与换输入零模型复跑", {
  skip: process.env.BAT_REAL_BROWSER_TEST !== "1", timeout: 90000,
}, async () => {
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(
    '<!doctype html><title>Form</title><input id="first" aria-label="First"><input id="second" aria-label="Second">'
    + '<button id="save" aria-pressed="false" onclick="if(first.value && second.value) setTimeout(() => {document.title=first.value+second.value;this.setAttribute(\'aria-pressed\',\'true\')}, 500)">Save</button>') })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address(); assert.ok(address && typeof address !== "string")
  const url = `http://127.0.0.1:${address.port}/form`, directory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-form-"))
  const scripted = scriptedSubject(url), raw = hybridFixture(), authority = formAuthority(raw)
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
    upstreamBrowserRuntime: new PythonUpstreamBrowserRuntime({ root: projectRoot, directory, subject: scripted.subject as never }) })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.store.mutate(taskId, (state) => { state.drafts[0]!.markdown = '# Fill the two fields and save\n```bat-compilation/v1\n'
      + JSON.stringify({ version: 1, steps: { perform: authority } }) + '\n```' })
    const requirement = application.taskChain.snapshot(taskId).requirement!, repository = application.taskChain.repository
    let plan = hybridPlan(raw)
    plan.taskId = taskId; plan.requirement = { id: requirement.id, version: requirement.version, revision: requirement.revision, digest: digestJson(requirement) }
    plan.inputContract.schema = { type: "object", properties: { url: { type: "string" }, first: { type: "string" }, second: { type: "string" }, enabled: { type: "boolean" } },
      required: ["url", "first", "second", "enabled"], additionalProperties: false }
    plan.steps[0]!.inputContract = plan.inputContract
    plan = repository.savePlan(plan)
    const input = { url, first: "Source first", second: "Source second", enabled: true }
    application.taskChain.dispatch(taskId, { type: "generate_chain", requestId: randomUUID(),
      plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, stepId: "perform", input })
    await waitFor(() => ["completed", "failed"].includes(repository.jobs(taskId)[0]?.status ?? ""), 60000)
    const job = repository.jobs(taskId)[0]!
    const sources = z.object({ sources: z.array(z.object({ artifact: z.object({ artifactId: z.string() }) })) })
      .safeParse(job.authoring?.exploration)
    const diagnostics = sources.success ? sources.data.sources.map(({ artifact }) => {
      const source = z.object({ result: z.object({ response: z.object({ compilation: z.object({ gaps: z.json() }) }),
        request: z.object({ trace: z.object({ actions: z.array(z.object({ id: z.string(), name: z.string(), args: z.json() })),
          observations: z.array(z.object({ id: z.string(), facts: z.json() })) }) }) }) })
        .parse(repository.artifact(taskId, artifact.artifactId).body)
      return { gaps: source.result.response.compilation.gaps, trace: source.result.request.trace }
    }) : []
    assert.equal(job.status, "completed", JSON.stringify({ reason: job.reason, diagnostics, fixtureFailures: scripted.failures }))
    const chain = repository.chains(taskId)[0]!
    assert.equal(chain.nodes.filter((node) => node.kind === "llm").length, 0)
    for (const [mode, value] of [["sample", input],
      ["verification", { url, first: "Different first", second: "Different second", enabled: true }],
      ["verification", { ...input, enabled: false }]] as const) {
      const requestId = randomUUID()
      application.taskChain.dispatch(taskId, { type: "validate_chain", requestId, mode, input: value,
        chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) } })
      // Validation evidence is published only after Browser finally has returned.
      await waitFor(() => {
        const run = repository.runs(taskId).find((run) => run.binding.authorizationId === requestId)
        return run?.status === "failed" || repository.chain(taskId, chain.id, chain.version).validation.evidence.some((item) => item.runId === run?.binding.runId)
      }, 25000)
      const run = repository.runs(taskId).find((run) => run.binding.authorizationId === requestId)!
      assert.equal(run.status, "completed", JSON.stringify(run.outcome))
      assert.equal(run.consumed.browserCommands, value.enabled ? 4 : 0)
      assert.equal(run.consumed.llmCalls, 0)
      assert.deepEqual(run.modelCalls, [])
      assert.equal(repository.chain(taskId, chain.id, chain.version).validation.evidence.find((item) => item.runId === run.binding.runId)?.passed, true)
    }
    assert.equal(repository.chain(taskId, chain.id, chain.version).validation.status, "verified")
    assert.deepEqual(scripted.count(), [6, 1])
    assert.equal(job.audit?.reportedInvocations, 7)
  } finally {
    await application.app.close(); await rm(directory, { recursive: true, force: true })
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
