import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"
import test from "node:test"
import { jsonValueSchema, requiredNodeOutcomes, type JsonValue, type TaskChain, type ValueSchema } from "@browser-capture/contracts"
import { compileTaskChain, digestJson, TaskChainRuntime } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { digestCanonicalJson, materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { naturalSourceFixture, canonical } from "./helpers/natural-source.js"
import { HybridRuntimeScopeState } from "../src/upstream-browser/hybrid-runtime-scope.js"
import { validateNaturalRepeats } from "../src/upstream-browser/hybrid-natural-repeat.js"
import { hybridCompilerResponseSchema, hybridNaturalRequestSchema } from "../src/upstream-browser/hybrid-schema.js"

const hash = "a".repeat(64), origin = "https://example.test/"
const digest = (value: unknown) => digestCanonicalJson(jsonValueSchema.parse(value))
const fact = (id: string, kind: string, value: unknown) => ({ id, kind, value: jsonValueSchema.parse(value),
  sourceRefs: [{ ref: `fixture:${id}`, digest: digest(value) }] })
const item: ValueSchema = { type: "object", properties: { id: { type: "string" }, title: { type: "string" } },
  required: ["id", "title"], additionalProperties: false }
const records: ValueSchema = { type: "array", items: item, minItems: 0, maxItems: 300 }
const querySchema: ValueSchema = { type: "array", items: { type: "object", properties: {
  attribute_href: { type: "string" } }, required: ["attribute_href"], additionalProperties: false }, minItems: 0, maxItems: 300 }
const specification = { container: ".record", fields: {
  id: { selector: ":scope", attribute: "data-id", valueType: "string" },
  title: { selector: ".title", attribute: null, valueType: "string" } }, maxItems: 300, requireComplete: true,
  maxInputBytes: 128000, outputSchema: records }
const querySpecification = { container: "a.next", fields: {
  attribute_href: { selector: ":scope", attribute: "href", valueType: "string", resolveUrl: true } },
  maxItems: 300, requireComplete: true, maxInputBytes: 128000, outputSchema: querySchema }

function fixture(minItems = 0, maxCommands = 40, sourceNextUrls?: string[]) {
  const outputSchema: ValueSchema = { type: "array", items: item, minItems, maxItems: 2000 }
  const plan = structuredClone(extractionFixture.plan), step = plan.steps[0]!
  plan.inputContract.schema = { type: "null" }; step.inputContract = plan.inputContract
  plan.outputContract.schema = outputSchema; step.outputContract = plan.outputContract
  plan.budget.maxBrowserCommands = maxCommands; step.budget = structuredClone(plan.budget)
  step.resultSpec = { contractVersion: "bat-result-spec/v1", mode: "data", schema: outputSchema,
    fields: [{ path: [], description: "All selected records", producerRef: "records" }], derivations: [], edgeCases: [] }
  const evidence = sourceEvidence(outputSchema, sourceNextUrls)
  const source = naturalSourceFixture({ trace: evidence.trace,
    requirement: { id: plan.requirement.id, version: plan.requirement.version,
      text: "Read all records on successive pages until there is no Next link.",
      taskText: "Read all records on successive pages until there is no Next link.", sourceDigest: plan.requirement.digest },
    plan: { id: plan.id, version: plan.version, sourceDigest: digestJson(plan), stepId: step.id,
      inputSchemaDigest: digest({ type: "null" }), outputSchemaDigest: digest(outputSchema), callMode: "once",
      entryUrls: [`${origin}1`], resultSpec: jsonValueSchema.parse(step.resultSpec) } })
  const base = compilation(evidence, source.sourcePayloads, outputSchema)
  const materialize = (change?: (value: typeof base) => void) => {
    const body = structuredClone(base); change?.(body)
    const canonicalPayload = canonical(jsonValueSchema.parse(body))
    return materializeHybridChain({ request: source.request, response: { compilation: {
      ...body, canonicalDigest: digest(body) }, canonicalPayload, sourcePayloads: source.sourcePayloads },
    plan, step, version: 1, model: "unused" })
  }
  return { materialize, base, source, plan }
}

function sourceEvidence(schema: ValueSchema, sourceNextUrls = [`${origin}2`]) {
  const actions: Array<Record<string, JsonValue>> = [], observations: Array<Record<string, JsonValue>> = []
  const add = (id: string, name: string, args: JsonValue, from: number, to: number, facts: ReturnType<typeof fact>[]) => {
    actions.push({ id, name, args, status: "succeeded", preObservationRef: `pre-${id}`, postObservationRef: `post-${id}`,
      resultRef: { ref: `result-${id}`, digest: hash } })
    observations.push({ id: `pre-${id}`, url: `${origin}${from}`, tabId: "tab", facts: [] },
      { id: `post-${id}`, url: `${origin}${to}`, tabId: "tab", facts: jsonValueSchema.parse(facts) })
  }
  const binding = fact("binding-nav", "natural_binding", { actionRef: "nav", argumentPath: "url",
    binding: { source: "constant", value: `${origin}1` }, provenance: "plan_entry_url" })
  add("nav", "navigate", { url: `${origin}1` }, 0, 1, [binding])
  const read = (id: string, page: number, query = false) => {
    const output = query ? page === 1 ? sourceNextUrls.map((attribute_href) => ({ attribute_href })) : []
      : [{ id: `sample-${page}`, title: `Page ${page}` }]
    const value = { actionRef: id, specification: query ? querySpecification : specification, readPath: [], outputPath: [],
      output, stable: true, targetId: "tab", urlDigest: digest(`${origin}${page}`), resultDigest: hash,
      ...(query ? {} : { coverage: { scope: "current_dom_matches", total: 1, sampled: 1, runtimeTruncated: false } }) }
    const reading = fact(`read-${id}`, "verified_natural_read", value)
    const facts = query ? [reading, fact(`query-${id}`, "dom_query", { actionRef: id, complete: true,
      total: output.length, query: { kind: "css", value: querySpecification.container }, maxResults: 300,
      requestedAttributes: ["href"], scope: { url: `${origin}${page}`, urlDigest: digest(`${origin}${page}`),
        tabId: "tab", frameId: null } })] : [reading]
    add(id, query ? "find_elements" : "bat_read_fields", query ? { selector: "a.next", attributes: ["href"], max_results: 300 } : {}, page, page, facts)
    return reading
  }
  const firstRead = read("r1", 1), firstQuery = read("q1", 1, true)
  add("advance", "navigate", { url: `${origin}2` }, 1, 2, [])
  read("r2", 2); read("q2", 2, true)
  const repeat = fact("repeat-proof", "repeat_method", { requirementDigest: hash, outputPath: [], stableKeyPath: ["id"],
    iterations: [{ readActionRef: "r1", continuationActionRef: "q1", advanceActionRef: "advance" },
      { readActionRef: "r2", continuationActionRef: "q2", advanceActionRef: null }] })
  const fields = [{ path: [], binding: { source: "node", nodeId: "r1", path: [] } }]
  const assembly = fact("output-proof", "verified_output_assembly", { fields, schema, outputDigest: hash })
  add("done", "done", { success: true, readRefs: ["r1"] }, 2, 2, [repeat, assembly])
  return { firstRead, firstQuery, binding, repeat, assembly, fields,
    trace: { source: { historyRef: "fixture:repeat" }, completed: true, actions, observations,
      finalResultRef: { ref: "fixture:result", digest: hash } } }
}

function compilation(value: ReturnType<typeof sourceEvidence>, sourcePayloads: string[], schema: ValueSchema) {
  const readSegment = (id: string, proof: ReturnType<typeof fact>, query = false) => ({ id, kind: "deterministic",
    operation: { name: "browser.read-fields", version: 2, specification: query ? querySpecification : specification },
    target: { strategy: "css", value: query ? "a.next" : ".record", scope: { url: `${origin}1`, urlDigest: digest(`${origin}1`) } },
    preconditions: [], bindings: [], expectedEffect: { kind: "read" },
    postconditions: [{ kind: "output_schema", schemaDigest: digest(query ? querySchema : records) }],
    outputs: [{ schema: query ? querySchema : records, sourceRef: proof.id }], proofRefs: proof.sourceRefs })
  const navigate = (id: string, binding: unknown, proof: ReturnType<typeof fact>, derivation?: string) => ({ id: `s-${id}`,
    kind: "deterministic", operation: { name: "browser.workflow-step", version: 2, actionName: "navigate" },
    target: null, preconditions: [], bindings: [{ id: `binding-${id}`, actionRef: id, argumentPath: "url",
      kind: id === "nav" ? "authorized_constant" : "prior_output", sourceRef: proof.id, transform: null,
      proofRefs: proof.sourceRefs, binding, ...(derivation ? { derivation } : {}) }], expectedEffect: { kind: "navigation" },
    postconditions: [{ kind: "url", bindingArgument: "url" }], outputs: [], proofRefs: proof.sourceRefs })
  const method = { id: "repeat-r1", sourceRef: value.repeat.id, proofRefs: value.repeat.sourceRefs,
    readSegmentId: "s-r1", continuationSegmentId: "s-q1", advanceSegmentId: "s-advance",
    outputPath: [], readPath: [], stableKeyPath: ["id"], sampleActionRefs: ["r1", "q1", "advance", "r2", "q2"] }
  const advance = navigate("advance", { source: "node", nodeId: "q1", path: [0, "attribute_href"] }, value.repeat, "repeat_destination")
  advance.bindings[0]!.proofRefs = [...value.repeat.sourceRefs, ...value.firstQuery.sourceRefs]
  const segments = [navigate("nav", { source: "constant", value: `${origin}1` }, value.binding),
    readSegment("s-r1", value.firstRead), readSegment("s-q1", value.firstQuery, true),
    advance]
  const success = { "s-nav": "loop-repeat-r1", "s-r1": "s-q1", "s-q1": "loop-repeat-r1", "s-advance": "s-r1" }
  const edges = Object.entries(success).flatMap(([from, to]) => [{ from, outcome: "success", to },
    ...requiredNodeOutcomes.capability.filter((outcome) => outcome !== "success").map((outcome) => ({ from, outcome, to: outcome }))])
  edges.push(...[["loop-repeat-r1", "body", "first-repeat-r1"], ["loop-repeat-r1", "done", "completed"],
    ["loop-repeat-r1", "limit", "failed"], ["loop-repeat-r1", "failed", "failed"],
    ["first-repeat-r1", "true", "s-r1"], ["first-repeat-r1", "false", "s-advance"], ["first-repeat-r1", "failed", "failed"]]
    .map(([from, outcome, to]) => ({ from: from!, outcome: outcome!, to: to! })))
  return { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: [...sourcePayloads.map((source) => digest(JSON.parse(source))), "4".repeat(64)], segments,
    controlGraph: { entry: "s-nav", edges, terminals: ["completed", ...requiredNodeOutcomes.capability.filter((outcome) => outcome !== "success")]
      .map((id) => ({ id, status: id })) },
    coverage: ["nav", "r1", "q1", "advance", "r2", "q2"].map((actionRef) => ({ actionRef,
      disposition: actionRef.endsWith("2") ? "supporting" : "compiled",
      ownerSegmentId: `s-${actionRef.replace("2", "1")}`, exclusionRule: actionRef.endsWith("2") ? "repeat_method_sample/v1" : null,
      evidenceRefs: [value.repeat.sourceRefs[0]!] })), gaps: [], repeatMethods: [method], resultBranches: [],
    outputAssembly: { sourceRef: value.assembly.id, proofRefs: value.assembly.sourceRefs, fields: value.fields, schema },
    resultBinding: { contractVersion: "bat-result-binding/v1", sourceRef: value.assembly.id, proofRefs: value.assembly.sourceRefs,
      schema, assignments: [{ to: [], from: value.fields[0]!.binding, producerRef: "records" }] } }
}

async function runPages(pages: JsonValue[][], options: { minItems?: number; maxCommands?: number; nextForever?: boolean;
  chain?: TaskChain; nextUrls?: string[][] } = {}) {
  const chain = options.chain ?? fixture(options.minItems, options.maxCommands).materialize()
  compileTaskChain(chain)
  let page = 0, advances = 0, calls = 0
  const scope = new HybridRuntimeScopeState()
  const state = () => ({ sessionId: "test-session", tabId: "test-tab", url: `${origin}${page + 1}`,
    observationDigest: hash, observedAt: "2026-09-27T00:00:00.000Z" })
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
    browserCommandCount: () => calls,
    capability: async ({ node, config, input }) => {
      calls++
      await scope.commandConfig(node.capability.name, config as Record<string, unknown>, async () => { calls++; return state() })
      let output: JsonValue = null
      if (node.id === "s-nav") page = 0
      else if (node.id === "s-advance") { assert.equal(input.url, `${origin}${page + 2}`); page++; advances++ }
      else if (node.id === "s-r1") output = pages[Math.min(page, pages.length - 1)]!
      else if (node.id === "s-q1") output = (options.nextUrls?.[page]
        ?? (page < pages.length - 1 || options.nextForever ? [`${origin}${page + 2}`] : [])).map((attribute_href) => ({ attribute_href }))
      else throw new Error(`unexpected_browser_node:${node.id}`)
      scope.succeed(node.id, state())
      return { outcome: "success", output }
    },
  } })
  return { chain, run, advances, calls }
}

test("重复方法生成真实受限IR，三页动态数据去重且末页先累计，复跑零模型", async () => {
  const pages = [[{ id: "one", title: "first" }], [{ id: "one", title: "same" }, { id: "two", title: "second" }],
    [{ id: "three", title: "last" }]]
  const result = await runPages(pages, { minItems: 3 })
  assert.equal(result.run.status, "completed", JSON.stringify(result.run.outcome))
  assert.equal(result.advances, 2)
  assert.deepEqual(result.run.outputs.result, { kind: "value", contract: { id: "extracted-result", version: 1 },
    value: [pages[0]![0], pages[1]![1], pages[2]![0]] })
  assert.deepEqual(result.run.modelCalls, [])
  const changedRows = [{ id: "changed-1", title: "new one" }, { id: "changed-2", title: "new two" }, { id: "changed-3", title: "new three" }]
  const changed = await runPages([changedRows], { chain: result.chain })
  assert.equal(changed.run.status, "completed")
  assert.equal(changed.advances, 0)
  assert.equal(changed.chain, result.chain)
  assert.deepEqual(changed.run.outputs.result, { kind: "value", contract: { id: "extracted-result", version: 1 },
    value: changedRows })
})

test("重复方法预算在下一次翻页前终止，保留已累计输出且不冒充完成", async () => {
  const result = await runPages([[{ id: "one", title: "first" }], [{ id: "two", title: "last allowed" }]],
    { maxCommands: 11, nextForever: true })
  assert.equal(result.run.status, "failed", JSON.stringify(result.run.outcome))
  assert.equal(result.advances, 1)
  assert.equal(result.run.outputs.result, undefined)
  assert.deepEqual(result.run.checkpoint?.variables["items-repeat-r1"], [{ id: "one", title: "first" }, { id: "two", title: "last allowed" }])
})

test("重复方法拒绝缺证、篡改路径、绕过body与首次预算不足", () => {
  assert.throws(() => fixture().materialize((value) => { value.repeatMethods[0]!.sourceRef = "missing" }), /source_missing/)
  assert.throws(() => fixture().materialize((value) => { value.repeatMethods[0]!.stableKeyPath = ["title"] }), /source_mismatch/)
  assert.throws(() => fixture().materialize((value) => { value.controlGraph.edges.push({ from: "s-nav", outcome: "true", to: "s-r1" }) }), /graph_external_body_entry/)
  assert.throws(() => fixture(0, 2).materialize(), /budget_insufficient/)
})

test("代表每页数量可小于最终minItems，最终真实集合仍须通过完整合同", async () => {
  const result = await runPages([[{ id: "one", title: "only" }]], { minItems: 3 })
  assert.equal(result.run.status, "failed")
  assert.equal(result.advances, 0)
})

test("重复布局共享同一下一页地址可继续，不同目的地在去重合同处失败且不翻页", async () => {
  const copies = Array<string>(4).fill(`${origin}2`)
  const chain = fixture(0, 40, copies).materialize()
  const pages = [[{ id: "one", title: "first" }], [{ id: "two", title: "last" }]]
  const same = await runPages(pages, { chain, nextUrls: [copies, []] })
  assert.equal(same.run.status, "completed", JSON.stringify(same.run.outcome))
  assert.equal(same.advances, 1)
  assert.deepEqual(same.run.modelCalls, [])
  const different = await runPages(pages, { chain, nextUrls: [[`${origin}2`, `${origin}99`], []] })
  assert.equal(different.run.status, "failed", JSON.stringify(different.run.outcome))
  assert.equal(different.advances, 0)
  assert.equal(different.run.outputs.result, undefined)
  assert.ok(different.run.events.some((event) => event.nodeId === "unique-next-repeat-r1" && event.status === "started"))
  assert.throws(() => fixture(0, 40, [`${origin}2`, `${origin}99`]).materialize(), /continuation_destination_ambiguous/)
})

function productionBridge(extra: Record<string, boolean | number> = {}) {
  const root = path.resolve(import.meta.dirname, "../../.."), plan = structuredClone(extractionFixture.plan), step = plan.steps[0]!
  const schema: ValueSchema = { type: "array", items: { type: "object", properties: {
    title: { type: "string" }, url: { type: "string" } }, required: ["title", "url"], additionalProperties: false } }
  plan.inputContract.schema = { type: "null" }; step.inputContract = plan.inputContract
  plan.outputContract.schema = schema; step.outputContract = plan.outputContract
  step.resultSpec = { contractVersion: "bat-result-spec/v1", mode: "data", schema,
    fields: [{ path: [], description: "Visible records", producerRef: "records" }], derivations: [], edgeCases: [] }
  const configuration = { duplicateLinks: 4, ...extra, requirement: { id: plan.requirement.id, version: plan.requirement.version, sourceDigest: plan.requirement.digest },
    plan: { id: plan.id, version: plan.version, sourceDigest: digestJson(plan), stepId: step.id,
      inputSchemaDigest: digest(step.inputContract.schema), outputSchemaDigest: digest(schema), resultSpec: step.resultSpec,
      entryUrls: ["https://example.test/list/1"] } }
  const python = path.join(root, "work/upstream-browser-hybrid/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
  const raw = JSON.parse(execFileSync(python, [path.join(root, "apps/api/tests/fixtures/natural_repeat_bridge.py")], {
    cwd: root, input: JSON.stringify(configuration), encoding: "utf8", env: { PATH: process.env.PATH,
      PYTHONPATH: ["vendor/workflow-use/workflows", "vendor/workflow-use/workflows/tests", "apps/api/python"]
        .map((part) => path.join(root, part)).join(path.delimiter), PYTHONDONTWRITEBYTECODE: "1",
      ANONYMIZED_TELEMETRY: "false", BROWSER_USE_CLOUD_SYNC: "false", BROWSER_USE_SETUP_LOGGING: "false" } }))
  assert.deepEqual(raw.response.compilation.gaps, [])
  return { raw, plan, step, schema }
}

test("Python生产normalizer和compiler产物通过TS边界并编译为可运行TaskChain", () => {
  const { raw, plan, step } = productionBridge()
  const chain = materializeHybridChain({ ...raw, plan, step, version: 1, model: "unused" })
  assert.equal(compileTaskChain(chain).chain.nodes.filter((node) => node.kind === "loop").length, 1)
  assert.equal(chain.budget.maxLlmCalls, 0)
})

test("生产桥保留完整分页探查证据但不复跑探查并拒绝篡改", () => {
  const { raw, plan, step, schema } = productionBridge({ terminalProbe: true, lookupProbes: true })
  const chain = materializeHybridChain({ ...raw, plan, step, version: 1, model: "unused" })
  assert.equal(compileTaskChain(chain).chain.nodes.filter((node) => node.kind === "loop").length, 1)
  assert.equal(chain.nodes.filter((node) => node.kind === "capability" && node.capability.name === "browser.read-fields").length, 2)
  assert.equal(chain.budget.maxLlmCalls, 0)
  const request = hybridNaturalRequestSchema.parse(raw.request)
  const compilation = hybridCompilerResponseSchema.parse(raw.response).compilation
  if (compilation.compilerVersion !== "bat-hybrid/2") throw new Error("natural_fixture_required")
  for (const mutation of ["effect", "name", "read_spec", "incomplete", "document", "coverage"]) {
    const changed = structuredClone(request), compiled = structuredClone(compilation)
    const lookup = changed.trace.actions.find((action) => action.id === "a-0006")!
    const post = changed.trace.observations.find((observation) => observation.id === lookup.postObservationRef)!
    if (mutation === "effect") lookup.effect = "navigation"
    else if (mutation === "name") lookup.name = "send_keys"
    else if (mutation === "coverage") compiled.coverage.find((row) => row.actionRef === lookup.id)!.evidenceRefs = []
    else {
      const kind = mutation === "read_spec" ? "verified_natural_read" : mutation === "incomplete" ? "dom_query" : "document_identity"
      const value = post.facts.find((fact) => fact.kind === kind)!.value
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("fixture_fact_object_required")
      if (mutation === "incomplete") value.complete = false
      else if (mutation === "document") value.documentDigest = "e".repeat(64)
      else {
        const spec = value.specification
        if (!spec || typeof spec !== "object" || Array.isArray(spec)) throw new Error("fixture_spec_required")
        spec.container = "unproven"
      }
    }
    // 正例已过真实 payload 门；这里独立检验 TS 语义门，避免仅靠摘要失配掩盖跨层遗漏。
    assert.throws(() => validateNaturalRepeats({ request: changed, compilation: compiled,
      assertFact: () => {}, outputSchema: schema }), mutation)
  }
})

test("两页全正代表通过生产桥且末查询仍拒绝非法或不同继续地址", () => {
  const { raw, plan, step, schema } = productionBridge({ finalPositive: true })
  const chain = materializeHybridChain({ ...raw, plan, step, version: 1, model: "unused" })
  assert.equal(compileTaskChain(chain).chain.nodes.filter((node) => node.kind === "loop").length, 1)
  assert.equal(chain.budget.maxLlmCalls, 0)
  const request = hybridNaturalRequestSchema.parse(raw.request)
  const compilation = hybridCompilerResponseSchema.parse(raw.response).compilation
  if (compilation.compilerVersion !== "bat-hybrid/2") throw new Error("natural_fixture_required")
  const lastQuery = compilation.repeatMethods![0]!.sampleActionRefs.at(-1)!
  const queryOutput = (trace: typeof request.trace) => {
    const action = trace.actions.find((item) => item.id === lastQuery)!
    const post = trace.observations.find((item) => item.id === action.postObservationRef)!
    const value = post.facts.find((item) => item.kind === "verified_natural_read")!.value
    if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.output)) {
      throw new Error("fixture_query_output_required")
    }
    return value.output
  }
  assert.equal(queryOutput(request.trace).length, 4, "terminalObserved=false: 最后代表页仍有完整Next正例")
  for (const malformed of ["javascript:invalid", "https://example.test/different-next"]) {
    const changed = structuredClone(request), record = queryOutput(changed.trace)[1]!
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("fixture_record_required")
    record.attribute_href = malformed
    assert.throws(() => validateNaturalRepeats({ request: changed, compilation,
      assertFact: () => {}, outputSchema: schema }), /continuation_destination_ambiguous/)
  }
})

test("生产桥允许完整Next样本预算不同但保留首次预算并拒绝语义变化", () => {
  const { raw, plan, step, schema } = productionBridge({ finalPositive: true, finalQueryBudget: 100 })
  const before = JSON.stringify(raw.request)
  const chain = materializeHybridChain({ ...raw, plan, step, version: 1, model: "unused" })
  compileTaskChain(chain)
  assert.equal(JSON.stringify(raw.request), before)
  const request = hybridNaturalRequestSchema.parse(raw.request)
  const compilation = hybridCompilerResponseSchema.parse(raw.response).compilation
  if (compilation.compilerVersion !== "bat-hybrid/2") throw new Error("natural_fixture_required")
  const method = compilation.repeatMethods![0]!
  const query = compilation.segments.find((segment) => segment.id === method.continuationSegmentId)!
  if (query.kind !== "deterministic" || query.operation.name !== "browser.read-fields") throw new Error("query_required")
  assert.equal(query.operation.specification.maxItems, 4)
  const objectValue = (value: JsonValue | undefined) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("fixture_object_required")
    return value
  }
  for (const mutation of ["selector", "attributes", "include_text", "incomplete", "field", "ordinal", "over_first_budget"]) {
    const changed = structuredClone(request)
    const action = changed.trace.actions.find((item) => item.id === method.sampleActionRefs.at(-1))!
    const post = changed.trace.observations.find((item) => item.id === action.postObservationRef)!
    const read = objectValue(post.facts.find((item) => item.kind === "verified_natural_read")!.value)
    const dom = objectValue(post.facts.find((item) => item.kind === "dom_query")!.value)
    const spec = objectValue(read.specification), args = objectValue(jsonValueSchema.parse(action.args))
    action.args = args
    assert.equal(spec.maxItems, 100)
    if (mutation === "selector") args.selector = "unproven"
    else if (mutation === "attributes") args.attributes = ["title"]
    else if (mutation === "include_text") args.include_text = false
    else if (mutation === "incomplete") dom.complete = false
    else if (mutation === "field") objectValue(objectValue(spec.fields).text).textSource = "rendered"
    else if (mutation === "ordinal") {
      objectValue(objectValue(objectValue(objectValue(spec.outputSchema).items).properties).ordinal).maximum = 50
    } else {
      if (!Array.isArray(read.output)) throw new Error("fixture_array_required")
      read.output.push({ ...objectValue(read.output[0]), ordinal: 5 })
      dom.total = 5; dom.showing = 5
    }
    assert.throws(() => validateNaturalRepeats({ request: changed, compilation,
      assertFact: () => {}, outputSchema: schema }), mutation)
  }
})

test("推进可显式绑定已证明的new_tab=false且不放行其他参数或伪造证明", () => {
  const { raw, plan, step } = productionBridge({ finalPositive: true, sameTabAdvance: true })
  const chain = materializeHybridChain({ ...raw, plan, step, version: 1, model: "unused" })
  compileTaskChain(chain)
  const node = chain.nodes.find((item) => item.id === "s-a-0004")!
  assert.equal(node.kind, "capability")
  if (node.kind !== "capability") throw new Error("fixture_advance_required")
  assert.deepEqual(node.input.new_tab, { source: "constant", value: false })
  for (const mutation of ["true", "unknown", "duplicate", "source", "proof"]) {
    const response = hybridCompilerResponseSchema.parse(raw.response)
    if (response.compilation.compilerVersion !== "bat-hybrid/2") throw new Error("natural_fixture_required")
    const advance = response.compilation.segments.find((item) => item.id === "s-a-0004")!
    if (advance.kind !== "deterministic") throw new Error("fixture_advance_required")
    const tab = advance.bindings.find((item) => item.argumentPath === "new_tab")!
    if (mutation === "true") tab.binding = { source: "constant", value: true }
    else if (mutation === "unknown") tab.argumentPath = "unproven"
    else if (mutation === "duplicate") advance.bindings.push(structuredClone(tab))
    else if (mutation === "source") tab.sourceRef = "unproven"
    else tab.proofRefs[0]!.digest = hash
    const { canonicalDigest: _previous, ...body } = response.compilation
    response.compilation = { ...body, canonicalDigest: digest(body) }
    response.canonicalPayload = canonical(jsonValueSchema.parse(body))
    const expected = mutation === "source" ? /hybrid_natural_binding_fact_missing/
      : mutation === "proof" ? /hybrid_natural_binding_proof_mismatch/ : /hybrid_repeat_advance_binding_invalid/
    assert.throws(() => materializeHybridChain({ request: raw.request, response,
      plan, step, version: 1, model: "unused" }), expected, mutation)
  }
})
