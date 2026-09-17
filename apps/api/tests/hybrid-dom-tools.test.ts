import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { z } from "zod"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { createApplication } from "../src/app.js"
import { assertHybridSampleBindings, hybridArtifactMediaType, readHybridArtifact } from "../src/upstream-browser/hybrid-artifact.js"
import { PythonUpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { materializeHybridWorkflowCommand } from "../src/upstream-browser/hybrid-runtime.js"
import { hybridTargetSchema } from "../src/upstream-browser/hybrid-schema.js"
import { confirmedDraft, preexecutionModel, waitFor } from "./task-chain-test-support.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
import { projectRoot } from "./helpers.js"

const outputSchema = { type: "object" as const, properties: { selected: { type: "string" as const, maxLength: 100 } },
  required: ["selected"], additionalProperties: false }

function pythonEvidenceDigest(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)])) : item
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")
}

function recordAuthority(base: ReturnType<typeof hybridFixture>, url: string) {
  const settle = { maxMs: 5000, maxAttempts: 30, intervalMs: 100 }
  const readyRead = { container: "body", fields: { ready: { selector: "#load", attribute: "data-ready", valueType: "string" } },
    maxItems: 1, maxInputBytes: 5000, outputSchema: { type: "array", maxItems: 1,
      items: { type: "object", properties: { ready: { type: "string", maxLength: 10 } },
        required: ["ready"], additionalProperties: false } } }
  const resultRead = { container: "body", fields: { selected: { selector: "#result", attribute: "data-selected", valueType: "string" } },
    maxItems: 1, maxInputBytes: 5000, outputSchema }
  const loadTarget = { strategy: "css", value: "#load", scope: { url } }
  const recordTarget = { strategy: "structure", scope: { url },
    container: { kind: "css", value: "#list" }, items: { kind: "css", value: ".record" }, ordinal: 1,
    ordinalBinding: { source: "input", path: ["itemOrdinal"] }, withinItem: { kind: "css", value: ".open" } }
  const clauses = [...base.request.requirement.clauses,
    { id: "load-target", kind: "selection", expression: { strategy: "locator", target: loadTarget } },
    { id: "load-ready", kind: "completion", expression: { selectionRef: "load", factKind: "read_fields",
      equals: [{ ready: "true" }], read: readyRead, settle } },
    { id: "record-target", kind: "selection", expression: { strategy: "ordinal", target: recordTarget } },
    { id: "record-selected", kind: "completion", expression: { selectionRef: "record", factKind: "read_fields",
      changed: true, read: resultRead, settle } },
    { id: "selected-output", kind: "output", expression: { read: resultRead } }]
  const selections = [
    { id: "load", clauseRefs: ["load-target"], strategy: "locator", target: loadTarget },
    { id: "record", clauseRefs: ["record-target"], strategy: "ordinal", target: recordTarget },
  ]
  return { clauses, control: { selections, branches: [], loops: [], invokes: [] }, acceptedAnnotations: [] }
}

function scriptedSubject(url: string) {
  let agents = 0, extracts = 0, judges = 0
  let observedStalePageTwo = false
  const failures: string[] = []
  const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: false }
  const subject = { async verifyCapabilities() {}, async generate() { throw new Error("fixture_text_call_unexpected") },
    async generateObject(input: { schema: { jsonSchema: { properties: Record<string, unknown> } }; messages: unknown[];
      onEvent(event: unknown): void }) {
      input.onEvent({ type: "generation.started" })
      const properties = input.schema.jsonSchema.properties
      let object: unknown
      if ("verdict" in properties) { judges++; object = { verdict: true, reasoning: "Local scripted fixture" } }
      else if ("selected" in properties) { extracts++; object = { selected: "Fresh Alpha" } }
      else {
        const stage = agents++
        const messages = z.array(z.object({ role: z.string(), content: z.union([z.string(), z.array(z.object({
          type: z.string(), text: z.string().optional() }).passthrough())]) }).passthrough()).parse(input.messages)
        const message = messages.filter((item) => item.role === "user").at(-1)
        const content = typeof message?.content === "string" ? message.content
          : message?.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n") ?? ""
        const lines = (pattern: RegExp) => content.split("\n").filter((value) => /\[\d+\]/.test(value) && pattern.test(value))
        const indexed = stage === 1 ? lines(/Load records/i)[0] : stage === 3 ? lines(/Open Fresh Alpha/i).at(-1) : undefined
        const index = indexed?.match(/\[(\d+)\]/)?.[1]
        if (stage === 2) {
          observedStalePageTwo = content.includes("Page 2 loading old-list") && content.includes("Open Old Alpha")
          if (!observedStalePageTwo) failures.push("source_did_not_observe_stale_page_two")
        }
        if (stage === 3 && !content.includes("Page 2 ready true")) failures.push("structure_click_observed_unready_list")
        if (((stage === 1 || stage === 3) && !index) || failures.length) {
          failures.push(JSON.stringify({ stage, lines: content.split("\n").filter((value) => /Load|Fresh|Old|Open|\[\d+\]/i.test(value)) }))
          throw new Error("fixture_observed_target_missing")
        }
        const action = stage === 0 ? { navigate: { url, new_tab: false } }
          : stage === 1 || stage === 3 ? { click: { index: Number(index) } }
          : stage === 2 ? { wait: { seconds: 2 } }
          : stage === 4 ? { extract: { query: "Read the selected record", output_schema: outputSchema } }
          : stage === 5 ? { done: { success: true, data: { selected: "Fresh Alpha" } } }
          : (() => { throw new Error("fixture_agent_did_not_finish") })()
        object = { evaluation_previous_goal: "Fixture", memory: "Fixture", next_goal: "Fixture", action: [action] }
      }
      input.onEvent({ type: "generation.completed" })
      return { object, usage }
    } }
  return { subject, failures, counts: () => [agents, extracts, judges], sawStalePageTwo: () => observedStalePageTwo }
}

function recordsPage() {
  return `<!doctype html><title>Records page 1</title><span id="page">1</span><span id="status">Page 1 ready false</span>
    <button id="load" aria-label="Load records" data-ready="false" onclick="loadRecords()">Load records</button><output id="result" data-selected="Empty">Empty</output>
    <aside id="nearby"><article class="record"><button class="open" aria-label="Open Fresh Alpha" data-value="STALE"
      onclick="selectRecord(this)">Open Fresh Alpha</button></article><article class="record"><button class="open"
      aria-label="Open Fresh Beta" data-value="STALE" onclick="selectRecord(this)">Open Fresh Beta</button></article></aside>
    <main id="list" data-ready="false"><div class="wrapper"><article class="record" title="old-a"><button class="open" aria-label="Open Old Alpha"
      data-value="STALE" onclick="selectRecord(this)">Open Old Alpha</button></article><article class="record"
      title="old-b"><button class="open" aria-label="Open Old Beta" data-value="STALE" onclick="selectRecord(this)">Open Old Beta</button></article></div></main>
    <script>let render=0;function selectRecord(button){const output=document.getElementById('result');output.textContent=button.dataset.value;output.dataset.selected=button.dataset.value}
      function loadRecords(){const state=document.getElementById('status'),load=document.getElementById('load'),listNode=document.getElementById('list');document.title='Records page 2';document.getElementById('page').textContent='2';state.textContent='Page 2 loading old-list';load.setAttribute('aria-label','Page 2 loading old-list');load.setAttribute('data-ready','false');listNode.setAttribute('data-ready','false');
      setTimeout(()=>{const key=String(++render)+'-'+String(performance.now());listNode.innerHTML='<section class="wrapper" id="wrap-'+key+'"><div class="region"><article class="record" id="a-'+key+'" title="fresh-a-'+key+'"><button class="open" aria-label="Open Fresh Alpha" data-value="Fresh Alpha" onclick="selectRecord(this)">Open Fresh Alpha</button></article><article class="record" id="b-'+key+'" title="fresh-b-'+key+'"><button class="open" aria-label="Open Fresh Beta" data-value="Fresh Beta" onclick="selectRecord(this)">Open Fresh Beta</button></article></div></section>';listNode.setAttribute('data-ready','true');load.setAttribute('data-ready','true');state.textContent='Page 2 ready true';load.setAttribute('aria-label','Page 2 ready true')},900)}</script>`
}

test("structure target schema keeps legacy targets readable and bounds ordinal bindings", () => {
  assert.equal(hybridTargetSchema.parse({ strategy: "css", value: "#legacy" }).strategy, "css")
  const target = hybridTargetSchema.parse({ strategy: "structure", scope: { url: "https://fixture.invalid/records" },
    container: { kind: "css", value: "#list" }, items: { kind: "css", value: ".record" }, ordinal: 1,
    ordinalBinding: { source: "input", path: ["itemOrdinal"] }, withinItem: null })
  assert.equal(target.strategy, "structure")
  assert.throws(() => hybridTargetSchema.parse({ ...target, ordinalBinding: { source: "node", nodeId: "x", path: [] } }))
  const sampleRequest = { requirement: { clauses: [] }, trace: { actions: [] }, control: { selections: [{ id: "record",
    actionRefs: [], target: { ordinal: 1, ordinalBinding: { source: "input", path: ["itemOrdinal"] } } }] } }
  assert.throws(() => assertHybridSampleBindings(sampleRequest, { itemOrdinal: 2 }), /hybrid_sample_target_ordinal_mismatch/)
  assert.doesNotThrow(() => assertHybridSampleBindings(sampleRequest, { itemOrdinal: 1 }))
  const command = materializeHybridWorkflowCommand({ actionName: "click", targetOrdinalInput: "targetOrdinal",
    target: { strategy: "structure", scope: { url: "https://fixture.invalid/records" },
      container: { kind: "css", value: "#list" }, items: { kind: "css", value: ".record" }, ordinal: 1,
      withinItem: null } }, { targetOrdinal: 2 })
  assert.equal((command.target as { ordinal: number }).ordinal, 2)
  assert.deepEqual(command.args, {})
  assert.throws(() => materializeHybridWorkflowCommand({ actionName: "click", target: null }, { targetOrdinal: 2 }),
    /hybrid_reserved_target_input/)
  assert.throws(() => materializeHybridWorkflowCommand({ actionName: "click", targetOrdinalInput: "targetOrdinal",
    target: command.target }, { targetOrdinal: 0 }), /hybrid_target_ordinal_invalid/)
})

// The provider is scripted; Application/SQLite, native Agent/Browser, fork compiler, persistence and both replays are real.
test("DOM structure candidate persists and replays a rebuilt list with a different ordinal and zero model calls", {
  skip: process.env.BAT_REAL_BROWSER_TEST !== "1", timeout: 120000,
}, async () => {
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end(recordsPage()) })
  const directory = await mkdtemp(path.join(tmpdir(), "bat-hybrid-dom-tools-"))
  let application: Awaited<ReturnType<typeof createApplication>> | undefined
  let listening = false
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); listening = true
    const address = server.address(); assert.ok(address && typeof address !== "string")
    const origin = `http://127.0.0.1:${address.port}`, url = origin + "/records"
    const raw = hybridFixture(), authority = recordAuthority(raw, url), scripted = scriptedSubject(url)
    application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
      upstreamBrowserRuntime: new PythonUpstreamBrowserRuntime({ root: projectRoot, directory, subject: scripted.subject as never }) })
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    application.store.mutate(taskId, (state) => { state.drafts[0]!.markdown = '# Load records and select one\n```bat-compilation/v1\n'
      + JSON.stringify({ version: 1, steps: { perform: authority } }) + '\n```' })
    const requirement = application.taskChain.snapshot(taskId).requirement!, repository = application.taskChain.repository
    let plan = hybridPlan(raw)
    plan.taskId = taskId; plan.requirement = { id: requirement.id, version: requirement.version,
      revision: requirement.revision, digest: digestJson(requirement) }
    plan.inputContract.schema = { type: "object", properties: { url: { type: "string" },
      itemOrdinal: { type: "integer", minimum: 1 } }, required: ["url", "itemOrdinal"], additionalProperties: false }
    plan.outputContract = { id: "selected-record", version: 1, dialect: "bat-value-schema/v1", schema: outputSchema }
    plan.steps[0]!.inputContract = plan.inputContract; plan.steps[0]!.outputContract = plan.outputContract
    plan.steps[0]!.completion = [{ id: "selected", description: "Selected record is read", predicate: {
      operator: "exists", value: { source: "node", nodeId: "perform", path: ["selected"] } } }]
    plan.completion = structuredClone(plan.steps[0]!.completion)
    plan = repository.savePlan(plan)
    const sample = { url, itemOrdinal: 1 }
    application.taskChain.dispatch(taskId, { type: "generate_chain", requestId: randomUUID(),
      plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, stepId: "perform", input: sample })
    await waitFor(() => ["completed", "failed"].includes(repository.jobs(taskId)[0]?.status ?? ""), 90000)
    const job = repository.jobs(taskId)[0]!
    const sourceRefs = z.object({ sources: z.array(z.object({ artifact: z.object({ artifactId: z.string() }) })) })
      .parse(job.authoring?.exploration)
    const sourceRows = sourceRefs.sources.map(({ artifact }) => repository.artifact(taskId, artifact.artifactId).body as {
      result: { response: { compilation: { gaps: unknown; coverage: unknown } }; request: { control: unknown; trace: {
        actions: unknown; observations: Array<{ id: string; facts: Array<{ kind: string; value: unknown }> }> } } } })
    assert.equal(job.status, "completed", JSON.stringify({ reason: job.reason, fixtureFailures: scripted.failures,
      compiler: sourceRows.map((row) => row.result.response.compilation), source: sourceRows.map((row) => ({
        control: row.result.request.control, actions: row.result.request.trace.actions,
        facts: row.result.request.trace.observations.map((observation) => ({ id: observation.id,
          facts: observation.facts.filter((fact) => ["read_fields", "dom_structure", "resolved_target"].includes(fact.kind)) })) })) }))
    const source = z.object({ result: z.object({ request: z.object({ trace: z.object({ observations: z.array(z.object({
      facts: z.array(z.object({ kind: z.string(), value: z.json(), sourceRefs: z.array(z.object({ digest: z.string() })) })) })) }) }) }) })
      .parse(repository.artifact(taskId, sourceRefs.sources[0]!.artifact.artifactId).body)
    const structures = source.result.request.trace.observations.flatMap((item) => item.facts)
      .filter((fact) => fact.kind === "dom_structure" && (fact.value as { queryCandidate?: { complete?: boolean } }).queryCandidate?.complete)
    assert.equal(structures.length, 1)
    assert.equal(structures[0]!.sourceRefs[0]!.digest, pythonEvidenceDigest(structures[0]!.value))
    const stored = repository.chains(taskId)[0]!
    const chain = repository.chain(taskId, stored.id, stored.version)
    assert.equal(chain.nodes.filter((node) => node.kind === "llm").length, 0)
    assert.equal(chain.nodes.filter((node) => node.kind === "capability"
      && node.capability.name.startsWith("browser.")).length, 4)
    const click = chain.nodes.find((node) => node.kind === "capability" && node.capability.name === "browser.workflow-step"
      && (node.config as { target?: { strategy?: string } }).target?.strategy === "structure")
    assert.ok(click && click.kind === "capability")
    assert.deepEqual(click.input.targetOrdinal, { source: "input", path: ["itemOrdinal"] })
    assert.equal((click.config as { target: { ordinalBinding?: unknown } }).target.ordinalBinding, undefined)
    const annotations = job.authoring!.annotations as { artifacts: Array<{ artifact: { artifactId: string } }> }
    const artifactRow = repository.artifact(taskId, annotations.artifacts[0]!.artifact.artifactId)
    assert.equal(artifactRow.mediaType, hybridArtifactMediaType)
    assert.equal(readHybridArtifact(artifactRow.body).source.closed, true)
    for (const [mode, input, expected] of [["sample", sample, "Fresh Alpha"],
      ["verification", { url, itemOrdinal: 2 }, "Fresh Beta"]] as const) {
      const requestId = randomUUID()
      application.taskChain.dispatch(taskId, { type: "validate_chain", requestId, mode, input,
        chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) } })
      await waitFor(() => {
        const run = repository.runs(taskId).find((item) => item.binding.authorizationId === requestId)
        return run?.status === "failed" || repository.chain(taskId, chain.id, chain.version).validation.evidence
          .some((item) => item.runId === run?.binding.runId)
      }, 30000)
      const run = repository.runs(taskId).find((item) => item.binding.authorizationId === requestId)!
    assert.equal(run.status, "completed", JSON.stringify(run.outcome))
      assert.deepEqual(run.outputs.result?.kind === "value" && run.outputs.result.value, { selected: expected })
      assert.equal(run.consumed.browserCommands, 4)
      assert.equal(run.consumed.llmCalls, 0); assert.deepEqual(run.modelCalls, [])
    }
    assert.equal(scripted.sawStalePageTwo(), true)
    assert.deepEqual(scripted.counts(), [6, 1, 1])
  } finally {
    try { if (application) await application.app.close() }
    finally {
      try { await rm(directory, { recursive: true, force: true }) }
      finally { if (listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
    }
  }
})
