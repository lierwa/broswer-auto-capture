import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import test from "node:test"
import type { JsonValue, ValueSchema } from "@browser-capture/contracts"
import { digestJson, type ModelCallReport } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createHybridArtifact, createHybridSourceArtifact, readHybridSourceArtifact } from "../src/upstream-browser/hybrid-artifact.js"
import type { HybridSourceResult } from "../src/upstream-browser/hybrid-exploration.js"
import { hybridAuthorResultSchema, hybridAuthorSourceSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { browserUseTask, naturalRequirementText } from "../src/upstream-browser/task-request.js"
import { recompileHybridSource } from "../src/upstream-browser/hybrid-exploration.js"
import { digestNaturalPayload } from "../src/upstream-browser/hybrid-natural-payload.js"

const URL = "https://fixture.invalid/records?view=current"
const INPUT_SCHEMA: ValueSchema = { type: "object", properties: { url: { type: "string" } },
  required: ["url"], additionalProperties: false }
const ITEM_SCHEMA: ValueSchema = { type: "object", properties: {
  name: { type: "string", maxLength: 40 }, weight: { type: "number" },
}, required: ["name", "weight"], additionalProperties: false }
const OUTPUT_SCHEMA: ValueSchema = { type: "object", properties: {
  records: { type: "array", maxItems: 1, items: ITEM_SCHEMA },
}, required: ["records"], additionalProperties: false }

test("实际Python Runner自然协议保留nullable binding并贯穿source与candidate边界", async () => {
  const gap = fixture("bindings-gap", { type: "null" })
  const numeric = pythonNumericPayload()
  assert.equal(digestNaturalPayload(numeric.payload), numeric.digest)
  assert.match(gap.raw, /"pages":\s*1\.0/)
  const gapFacts = facts(gap.result.request, "natural_binding")
  const quotes = Object.fromEntries(gapFacts.map((fact) => {
    const value = fact.value as Record<string, JsonValue>
    return [String(value.provenance), value.taskQuote]
  }))
  assert.deepEqual(quotes, { native_parameter: null, runtime_input: null, task_literal: "Read visible records" })
  const pages = gapFacts.map((fact) => fact.value as Record<string, JsonValue>)
    .find((value) => value.argumentPath === "pages")
  assert.deepEqual(pages, { actionRef: "a-0002", argumentPath: "pages", binding: { source: "constant", value: 1 },
    provenance: "native_parameter", taskQuote: null })
  assert.equal(readHybridSourceArtifact(gap.stored).result.sourceSuccess, true)
  assert.deepEqual(gap.result.response.compilation.gaps.map((item) => item.reason),
    ["natural_read_annotation_model_unavailable", "natural_field_read_evidence_missing", "natural_concrete_effect_missing"])
  assert.throws(() => candidate(gap), /hybrid_compilation_gaps/)

  const verified = fixture("verified-output", OUTPUT_SCHEMA)
  assert.match(verified.raw, /"weight":\s*1\.0/)
  const loaded = readHybridSourceArtifact(JSON.parse(JSON.stringify(verified.stored)))
  assert.equal(loaded.result.sourceValidated, true)
  assert.equal(facts(loaded.result.request, "verified_natural_read").length, 1)
  assert.equal(loaded.result.response.compilation.compilerVersion, "bat-hybrid/2")
  if (loaded.result.response.compilation.compilerVersion !== "bat-hybrid/2") assert.fail("expected natural compilation")
  assert.ok(loaded.result.response.compilation.outputAssembly)
  const restored = { ...verified, result: loaded.result, modelCalls: loaded.modelCalls }
  const compiled = candidate(restored)
  assert.ok(compiled.chain.nodes.some((node) => node.kind === "capability"
    && node.capability.name === "browser.read-fields"))
  assert.ok(compiled.chain.nodes.some((node) => node.kind === "capability"
    && node.capability.name === "data.transform"))
  const recompiled = await recompileHybridSource({ root: process.cwd(), signal: AbortSignal.timeout(30_000),
    request: loaded.result.request, sourceResponse: loaded.result.response, outputSchema: OUTPUT_SCHEMA,
    verifiedChildren: [] })
  assert.equal(recompiled.response.compilation.gaps.length, 0)
  assert.equal(recompiled.response.compilation.canonicalDigest, loaded.result.response.compilation.canonicalDigest)

  const tampered = structuredClone(verified.stored)
  const read = facts(tampered.result.request, "verified_natural_read")[0]!
  const output = (read.value as Record<string, JsonValue>).output as Array<Record<string, JsonValue>>
  output[0]!.weight = 2
  assert.throws(() => readHybridSourceArtifact(tampered), /hybrid_source_mismatch/)
  assert.throws(() => readHybridSourceArtifact(JSON.parse(JSON.stringify(negativeZeroArtifact(verified.stored)))),
    /hybrid_source_mismatch/)
  assert.throws(() => readHybridSourceArtifact(sameObservationLexicalDuplicate(verified.stored)),
    /hybrid_natural_fact_digest_mismatch/)
})

function fixture(scenario: "bindings-gap" | "verified-output", outputSchema: ValueSchema) {
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.definition.body = "Open the input URL. Read visible records."
  requirement.goal = "Read visible records"
  requirement.inputContract.schema = structuredClone(INPUT_SCHEMA)
  requirement.outputContract.schema = structuredClone(outputSchema)
  requirement.confirmation = { confirmedAt: "2026-09-16T00:00:00.000Z", requestId: "fixture-confirmation" }
  const plan = structuredClone(extractionFixture.plan), step = plan.steps[0]!
  plan.inputContract.schema = structuredClone(INPUT_SCHEMA); plan.outputContract.schema = structuredClone(outputSchema)
  step.inputContract.schema = structuredClone(INPUT_SCHEMA); step.outputContract.schema = structuredClone(outputSchema)
  plan.requirement = { id: requirement.id, version: requirement.version, revision: requirement.revision,
    digest: digestJson(requirement) }
  const input = { url: URL }
  const source = hybridAuthorSourceSchema.parse({ task: browserUseTask({ requirement, plan, step, resolvedInput: input }),
    input, inputSchema: INPUT_SCHEMA, outputSchema, requirementId: requirement.id, requirementVersion: requirement.version,
    planId: plan.id, planVersion: plan.version, stepId: step.id, callMode: step.invocation.mode,
    requirementText: naturalRequirementText(requirement).text, requirementDigest: digestJson(requirement),
    planDigest: digestJson(plan), maxSteps: 4, verifiedChildren: [] })
  const execution = runPython(scenario, source), result = execution.result
  const purposes: ModelCallReport["purpose"][] = ["agent", "judge",
    ...(scenario === "verified-output" ? ["semantic_annotation" as const] : [])]
  const modelCalls: ModelCallReport[] = purposes
    .map((purpose, index) => ({ callId: `call-${index}`, purpose, model: "fixture",
      intendedAt: "2026-09-16T00:00:00.000Z", status: "completed" as const, reportedInvocations: 1 }))
  const enriched: HybridSourceResult = { ...result, modelCalls, forkSourceDigest: "5".repeat(64) }
  const stored = createHybridSourceArtifact(requirement, plan, step.id, input, enriched)
  return { requirement, plan, step, input, result, raw: execution.raw, modelCalls, stored }
}

function candidate(value: ReturnType<typeof fixture>) {
  return createHybridArtifact({ requirement: value.requirement, plan: value.plan, step: value.step,
    stepInput: value.input, request: value.result.request, response: value.result.response,
    forkSourceDigest: "5".repeat(64), modelCalls: value.modelCalls, model: "fixture", version: 1,
    source: { history: value.result.history, sourceSuccess: true, sourceValidated: true, closed: true } })
}

function runPython(scenario: "bindings-gap" | "verified-output", source: unknown) {
  const result = spawnSync("work/upstream-browser-hybrid/.venv/bin/python",
    ["vendor/workflow-use/workflows/tests/natural_author_fixture.py", scenario], {
      cwd: process.cwd(), input: JSON.stringify(source), encoding: "utf8", env: { ...process.env,
        PYTHONPATH: "apps/api/python:vendor/workflow-use/workflows:vendor/workflow-use/workflows/tests",
        PYTHONDONTWRITEBYTECODE: "1", ANONYMIZED_TELEMETRY: "false", BROWSER_USE_SETUP_LOGGING: "false" },
    })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, "")
  return { result: hybridAuthorResultSchema.parse(JSON.parse(result.stdout)), raw: result.stdout }
}

function pythonNumericPayload() {
  const script = `import hashlib,json
value={'nested':[1.0,1e-07,{'negative':-0.0}]}
payload=json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
print(json.dumps({'payload':payload,'digest':hashlib.sha256(payload.encode()).hexdigest()}))`
  const result = spawnSync("work/upstream-browser-hybrid/.venv/bin/python", ["-c", script], {
    cwd: process.cwd(), encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  })
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout) as { payload: string; digest: string }
}

function negativeZeroArtifact(raw: ReturnType<typeof fixture>["stored"]) {
  const artifact = structuredClone(raw), result = artifact.result
  const payload = result.response.sourcePayloads[2]!.replace('"weight":1.0', '"weight":-0.0')
  assert.notEqual(payload, result.response.sourcePayloads[2])
  result.response.sourcePayloads[2] = payload
  const read = facts(result.request, "verified_natural_read")[0]!
  const output = (read.value as Record<string, JsonValue>).output as Array<Record<string, JsonValue>>
  output[0]!.weight = -0
  const request = result.request as Record<string, JsonValue>, trace = request.trace as Record<string, JsonValue>
  trace.digest = sha(payload); result.history.digest = sha(payload)
  result.response.compilation.sourceDigests[2] = sha(payload)
  const { canonicalDigest: _old, ...body } = result.response.compilation
  result.response.canonicalPayload = canonical(body)
  result.response.compilation.canonicalDigest = sha(result.response.canonicalPayload)
  return artifact
}

function sameObservationLexicalDuplicate(raw: ReturnType<typeof fixture>["stored"]) {
  const artifact = structuredClone(raw), result = artifact.result
  const request = result.request as Record<string, JsonValue>, trace = request.trace as Record<string, JsonValue>
  const observations = trace.observations as Array<Record<string, JsonValue>>
  const observation = observations.find((item) => (item.facts as Array<Record<string, JsonValue>>)
    .some((fact) => fact.kind === "verified_natural_read"))!
  const ordinaryFacts = observation.facts as Array<Record<string, JsonValue>>
  ordinaryFacts.push(structuredClone(ordinaryFacts.find((fact) => fact.kind === "verified_natural_read")!))

  const parseRaw = JSON.parse as (text: string,
    reviver: (key: string, value: unknown, context: { source: string }) => unknown) => unknown
  const rawApi = JSON as typeof JSON & { rawJSON(value: string): unknown }
  const originalPayload = result.response.sourcePayloads[2]!
  const rawTrace = parseRaw(originalPayload,
    (_key, value, context) => typeof value === "number" ? rawApi.rawJSON(context.source) : value) as Record<string, unknown>
  assert.equal(JSON.stringify(rawTrace), originalPayload)
  const rawObservations = rawTrace.observations as Array<Record<string, unknown>>
  const rawObservation = rawObservations.find((item) => item.id === observation.id)!
  const rawFacts = rawObservation.facts as Array<Record<string, unknown>>
  const rawFact = rawFacts.find((fact) => fact.kind === "verified_natural_read")!
  rawFacts.push({ ...rawFact, value: JSON.parse(JSON.stringify(rawFact.value)) })
  const payload = JSON.stringify(rawTrace)
  assert.match(payload, /"weight":1\.0/); assert.match(payload, /"weight":1[,}]/)
  result.response.sourcePayloads[2] = payload
  trace.digest = sha(payload); result.history.digest = sha(payload)
  result.response.compilation.sourceDigests[2] = sha(payload)
  const { canonicalDigest: _old, ...body } = result.response.compilation
  result.response.canonicalPayload = canonical(body)
  result.response.compilation.canonicalDigest = sha(result.response.canonicalPayload)
  return artifact
}

function facts(request: JsonValue, kind: string) {
  assert.ok(request && typeof request === "object" && !Array.isArray(request))
  const trace = request.trace as Record<string, JsonValue>, observations = trace.observations as Array<Record<string, JsonValue>>
  return observations.flatMap((item) => item.facts as Array<Record<string, JsonValue>>)
    .filter((fact) => fact.kind === kind)
}

function canonical(value: JsonValue | Record<string, unknown>): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item as JsonValue)).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`).join(",")}}`
  return JSON.stringify(value)
}
function sha(value: string) { return createHash("sha256").update(value).digest("hex") }
