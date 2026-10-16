import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import test from "node:test"
import { jsonValueSchema, type JsonValue } from "@browser-capture/contracts"
import { recompileHybridSource } from "../src/upstream-browser/hybrid-exploration.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { digestCanonicalJson, validateHybridResponse } from "../src/upstream-browser/hybrid-materializer.js"
import { canonical, naturalSourceFixture } from "./helpers/natural-source.js"

const hash = (text: string) => createHash("sha256").update(text).digest("hex")
const gap = (reason: string) => ({ id: "missing-selection", code: "missing_binding", actionRefs: ["a-0001"],
  clauseRefs: [], reason, resolution: "collect_evidence" as const })
const sourceGap = { id: "source-gap", code: "missing_observation", actionRefs: [] as string[],
  clauseRefs: [] as string[], reason: "fixture_capture_gap", resolution: "collect_evidence" as const }
const pythonFloat = (value: string) => value.replace('"number":1', '"number":1.0')
const fact = (id: string, kind: string, value: Record<string, JsonValue>, preserveFloat = false) => {
  const digest = preserveFloat ? hash(pythonFloat(canonical(value))) : digestCanonicalJson(value)
  return { id, kind, value, sourceRefs: [{ ref: `sha256:${digest}`, digest }] }
}

function fixture(reason = "selection_function_evidence_required") {
  return pack(traceOf(), reason)
}

function pack(trace: ReturnType<typeof traceOf>, reason: string,
  previous?: ReturnType<typeof naturalSourceFixture>) {
  const source = naturalSourceFixture({ trace, lexicalizeTrace: pythonFloat,
    ...(previous ? { requirement: JSON.parse(previous.sourcePayloads[0]!) as Record<string, JsonValue>,
      plan: JSON.parse(previous.sourcePayloads[1]!) as Record<string, JsonValue> } : {}) })
  const digests = source.sourcePayloads.map(hash)
  const body = { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: [...digests, "4".repeat(64)], segments: [], controlGraph: { entry: "", edges: [], terminals: [] },
    coverage: [], gaps: reason ? [sourceGap, gap(reason)] : [sourceGap] }
  const canonicalPayload = JSON.stringify(body)
  const response = validateHybridResponse({ compilation: { ...body, canonicalDigest: hash(canonicalPayload) },
    canonicalPayload, sourcePayloads: source.sourcePayloads })
  return { ...source, sourceGaps: [sourceGap], response }
}

function traceOf() {
  const reference = { ref: "fixture:observation", digest: "0".repeat(64) }
  return { mediaType: "application/vnd.bat.browser-use-trace+json;version=2",
    source: { provider: "browser-use", version: "fixture", historyRef: "fixture" }, completed: true,
    actions: [{ id: "a-0001", stepIndex: 0, actionIndex: 0, name: "click", args: {}, status: "succeeded",
      preObservationRef: "o-0001", resultRef: null, postObservationRef: "o-0002", effect: "ui_state", retryOf: null }],
    observations: [{ id: "o-0001", sequence: 0, url: "https://example.test/", tabId: "tab-1",
      facts: [fact("browser", "browser_context", { number: 1, title: "fixture" }, true)], sourceRefs: [reference] },
      { id: "o-0002", sequence: 1, url: "https://example.test/", tabId: "tab-1",
        facts: [] as ReturnType<typeof fact>[], sourceRefs: [reference] }],
    finalResultRef: null, redactionManifestRef: reference }
}

async function harness(source: ReturnType<typeof fixture>) {
  const original = structuredClone(source), commands: string[] = []
  let closed = 0
  const dependencies: NonNullable<Parameters<typeof recompileHybridSource>[1]> = {
    verifySource: async () => "5".repeat(64),
    createRunner: () => ({ startCompiler: async () => {}, request: async command => {
      commands.push(command.type)
      assert.equal(command.type, "hybrid_compile")
      assert.match(JSON.stringify(command), /"number":1\.0/)
      assert.deepEqual(command.sourceGaps, source.sourceGaps)
      return jsonValueSchema.parse(source.response)
    }, close: async () => { closed++
      return cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => ({ stage, status: "not_required", code: null })), false)
    } }),
  }
  const result = await recompileHybridSource({ root: process.cwd(), signal: new AbortController().signal,
    ownerId: randomUUID(), canonicalRequest: source.canonicalRequest, sourceGaps: source.sourceGaps,
    outputSchema: { type: "null" }, verifiedChildren: [] }, dependencies)
  assert.deepEqual(source, original)
  assert.deepEqual(result.modelCalls, [])
  assert.equal(closed, 1)
  assert.deepEqual(commands, ["hybrid_compile"])
  return result
}

test("恢复只重编译，完整保留来源与缺口且不请求模型救援", async () => {
  for (const reason of ["", "selection_function_evidence_required", "repeat_annotation_invalid_response"]) {
    const result = await harness(fixture(reason))
    assert.deepEqual(result.response.compilation.gaps, fixture(reason).response.compilation.gaps)
  }
})
