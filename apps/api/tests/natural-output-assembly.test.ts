import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { requiredNodeOutcomes, type JsonValue, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { digestJson, TaskChainRuntime } from "@browser-capture/runtime"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { hybridCommandSchema } from "../src/upstream-browser/hybrid-protocol.js"

test("自然v2输出装配仅组合两个已编译read节点的动态值", async () => {
  const raw = naturalAssemblyFixture(), step = raw.plan.steps[0]!
  const chain = materializeHybridChain({ ...raw, step, version: 1, model: "fixture" })
  const reads = chain.nodes.filter((node): node is Extract<(typeof chain.nodes)[number], { kind: "capability" }> =>
    node.kind === "capability").filter((node) => node.capability.name === "browser.read-fields")
  const configs = reads.map((node) => {
    assert.ok(node.config && typeof node.config === "object" && !Array.isArray(node.config))
    return node.config as Record<string, JsonValue>
  })
  assert.deepEqual(configs[0]!.scope, { url: "https://fixture.invalid/list", urlDigest: "c".repeat(64) })
  assert.equal("scope" in configs[1]!, false)
  assert.equal(hybridCommandSchema.safeParse({ ...reads[0]!.capability, ...configs[0] }).success, true)
  assert.equal(hybridCommandSchema.safeParse({ ...reads[1]!.capability, ...configs[1] }).success, true)
  assert.equal(hybridCommandSchema.safeParse({ ...reads[0]!.capability, ...configs[0],
    scope: { url: "https://fixture.invalid/list", unknown: true } }).success, false)
  assert.equal(chain.nodes.filter((node) => node.kind === "capability" && node.capability.name === "data.transform").length, 2)
  assert.doesNotMatch(chain.reuseBoundary.description, /控制合同/)
  let commands = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, {}, "sample"),
    capabilities: { browserCommandCount: () => commands, capability: async (invocation) => {
      commands++
      if (invocation.node.id === "s-a-0001") return { outcome: "success", output: { name: "dynamic" } }
      if (invocation.node.id === "s-a-0002") return { outcome: "success", output: { count: 2 } }
      throw new Error("unexpected_external_capability")
    } } })
  assert.equal(run.status, "completed", JSON.stringify(run.outcome))
  assert.deepEqual(run.outputs.result?.kind === "value" && run.outputs.result.value, { name: "dynamic", count: 2 })
  assert.equal(commands, 2)
})

test("自然v2输出装配拒绝冻结样本、未知节点和重签后的fact摘要篡改", () => {
  const cases = [
    { variant: "constant" as const, error: /hybrid_natural_output_binding_dynamic_required/ },
    { variant: "missing" as const, error: /hybrid_natural_output_node_missing/ },
    { variant: "digest" as const, error: /hybrid_natural_fact_digest_mismatch/ },
    { variant: "source_index" as const, error: /hybrid_natural_output_source_path_missing/ },
    { variant: "target_path" as const, error: /hybrid_natural_output_target_path_missing/ },
    { variant: "schema_mismatch" as const, error: /hybrid_natural_output_field_schema_mismatch/ },
  ]
  for (const item of cases) {
    const raw = naturalAssemblyFixture(item.variant)
    assert.throws(() => materializeHybridChain({ ...raw, step: raw.plan.steps[0]!, version: 1, model: "fixture" }), item.error)
  }
})

type Variant = "valid" | "constant" | "missing" | "digest" | "source_index" | "target_path" | "schema_mismatch"
function naturalAssemblyFixture(variant: Variant = "valid") {
  const plan = structuredClone(extractionFixture.plan), inputSchema: ValueSchema = {
    type: "object", properties: {}, required: [], additionalProperties: false,
  }
  const outputSchema: ValueSchema = { type: "object", properties: { name: { type: "string" }, count: { type: "integer" } },
    required: ["name", "count"], additionalProperties: false }
  plan.inputContract.schema = inputSchema; plan.outputContract.schema = outputSchema
  plan.steps[0]!.inputContract.schema = inputSchema; plan.steps[0]!.outputContract.schema = outputSchema
  const firstPath = variant === "source_index" ? [1] : ["name"]
  const firstBinding: ValueBinding = variant === "constant" ? { source: "constant", value: "frozen" }
    : { source: "node", nodeId: variant === "missing" ? "a-9999" : "a-0001", path: firstPath }
  const fields = [{ binding: firstBinding, path: [variant === "target_path" ? "unknown" : "name"] },
    { binding: { source: "node", nodeId: "a-0002", path: ["count"] } as ValueBinding, path: ["count"] }]
  const outputDigest = "f".repeat(64), factValue = { fields, schema: outputSchema, outputDigest }
  const factDigest = variant === "digest" ? "0".repeat(64) : sha(canonical(factValue))
  const factRefs = [{ ref: "result:verified-output", digest: factDigest }]
  const segments = [readSegment("s-a-0001", "name", { type: "string" }),
    readSegment("s-a-0002", "count", { type: "integer" })]
  const readFacts = segments.map((segment, index) => {
    assert.equal(segment.operation.name, "browser.read-fields")
    const value = { actionRef: `a-000${index + 1}`, specification: segment.operation.specification,
      outputPath: [index === 0 ? "name" : "count"], readPath: [], output: index === 0 ? { name: "dynamic" } : { count: 2 } }
    return { id: segment.outputs[0]!.sourceRef, kind: "verified_natural_read", value,
      sourceRefs: [{ ref: `read:${segment.id}`, digest: sha(canonical(value)) }] }
  })
  const traceSource = { source: { historyRef: "fixture:natural-output" }, judged: true, completed: true,
    actions: [{ id: "a-0001", preObservationRef: "o-1", postObservationRef: "o-final" },
      { id: "a-0002", preObservationRef: "o-2", postObservationRef: "o-final" }],
    observations: [{ id: "o-1", facts: [readFacts[0]!] }, { id: "o-2", facts: [readFacts[1]!] },
      { id: "o-final", facts: [{ id: "f-output", kind: "verified_output_assembly",
      value: factValue, sourceRefs: factRefs }] }], finalResultRef: { ref: "result:final", digest: outputDigest } }
  const requirementSource = { id: plan.requirement.id, version: plan.requirement.version,
    text: "fixture requirement", taskText: "fixture task", sourceDigest: plan.requirement.digest }
  const planSource = { id: plan.id, version: plan.version, sourceDigest: digestJson(plan), stepId: plan.steps[0]!.id,
    inputSchemaDigest: sha(canonical(inputSchema)), outputSchemaDigest: sha(canonical(outputSchema)), callMode: "once" as const }
  const requirementPayload = canonical(requirementSource), planPayload = canonical(planSource), tracePayload = canonical(traceSource)
  const inputPayload = canonical(inputSchema), emptyPayload = canonical([])
  const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: "a".repeat(64),
    requirement: { ...requirementSource, digest: sha(requirementPayload) },
    plan: { ...planSource, digest: sha(planPayload) }, runtimeInputSchema: inputSchema,
    trace: { ...traceSource, digest: sha(tracePayload) } }
  if (variant === "source_index") (segments[0]!.outputs[0]! as { schema: ValueSchema }).schema = {
    type: "array", items: { type: "string" }, maxItems: 1,
  }
  if (variant === "schema_mismatch") (segments[0]!.outputs[0]! as { schema: ValueSchema }).schema = {
    type: "object", properties: { name: { type: "integer" } }, required: ["name"], additionalProperties: false,
  }
  const terminals = ["completed", "missing", "timeout", "blocked", "human_required", "failed", "cancelled"]
    .map((status) => ({ id: status, status }))
  const edges = segments.flatMap((segment, index) => requiredNodeOutcomes.capability.map((outcome) => ({
    from: segment.id, outcome, to: outcome === "success" ? index === 0 ? segments[1]!.id : "completed" : outcome,
  })))
  const body = { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: [sha(requirementPayload), sha(planPayload), sha(tracePayload), sha(inputPayload), sha(emptyPayload), "a".repeat(64)],
    segments, controlGraph: { entry: segments[0]!.id, edges, terminals },
    coverage: segments.map((segment, index) => ({ actionRef: `a-000${index + 1}`, disposition: "compiled",
      ownerSegmentId: segment.id, exclusionRule: null, evidenceRefs: [{ ref: `proof:${segment.id}`, digest: "b".repeat(64) }] })),
    gaps: [], outputAssembly: { sourceRef: "f-output", fields, schema: outputSchema, proofRefs: factRefs } }
  const canonicalPayload = canonical(body)
  return { request, response: { compilation: { ...body, canonicalDigest: sha(canonicalPayload) }, canonicalPayload,
    sourcePayloads: [requirementPayload, planPayload, tracePayload, inputPayload, emptyPayload] }, plan }
}

function readSegment(id: string, field: string, schema: ValueSchema) {
  const output = { type: "object" as const, properties: { [field]: schema }, required: [field], additionalProperties: false }
  return { id, kind: "deterministic" as const, operation: { name: "browser.read-fields" as const, version: 2 as const,
    specification: { container: "main", fields: { [field]: { selector: `.${field}`, attribute: null,
      valueType: schema.type } }, maxItems: 1, maxInputBytes: 1000, outputSchema: output } },
    preconditions: [], expectedEffect: { kind: "read" as const }, postconditions: [{ kind: "read" }],
    outputs: [{ schema: output, sourceRef: `fact:${id}` }], proofRefs: [{ ref: `proof:${id}`, digest: "b".repeat(64) }],
    requirementClauseRefs: [], bindings: [], target: field === "name" ? { strategy: "css" as const, value: "main",
      scope: { url: "https://fixture.invalid/list", urlDigest: "c".repeat(64) } } : null }
}

function canonical(value: JsonValue | Record<string, unknown>): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item as JsonValue)).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`).join(",")}}`
  return JSON.stringify(value)
}
function sha(value: string) { return createHash("sha256").update(value).digest("hex") }
