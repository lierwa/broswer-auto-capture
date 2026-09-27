import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { jsonValueSchema, type JsonValue } from "@browser-capture/contracts"
import { recompileHybridSource } from "../src/upstream-browser/hybrid-exploration.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { digestCanonicalJson, validateHybridResponse } from "../src/upstream-browser/hybrid-materializer.js"
import type { ModelAudit } from "../src/upstream-browser/model-bridge.js"
import { canonical, naturalSourceFixture } from "./helpers/natural-source.js"

const hash = (text: string) => createHash("sha256").update(text).digest("hex")
const selection = { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "medium" as const }
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

function annotated(source: ReturnType<typeof fixture>, tamper: boolean) {
  const trace = JSON.parse(source.sourcePayloads[2]!) as ReturnType<typeof traceOf>
  trace.observations[0]!.facts.push(fact("selection-a-0001", "selection_function", { actionRef: "a-0001" }))
  if (tamper) trace.actions[0]!.status = "failed"
  return pack(trace, "selection_function_evidence_required", source)
}

async function harness(source: ReturnType<typeof fixture>, authorized: boolean, tamper = false) {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-offline-annotation-"))
  const counts = { compiler: 0, bridges: 0, runnerClosed: 0, bridgeClosed: 0 }
  const commands: string[] = [], progress: unknown[] = []
  let audit: ((value: ModelAudit) => void) | undefined
  const dependencies: NonNullable<Parameters<typeof recompileHybridSource>[1]> = {
    verifySource: async () => "5".repeat(64),
    createRunner: () => ({ startCompiler: async () => { counts.compiler++ },
      request: async (command) => {
        commands.push(command.type)
        if (command.type !== "hybrid_compile" && command.type !== "hybrid_annotate") {
          throw new Error("unexpected_fixture_command")
        }
        assert.match(JSON.stringify(command), /"number":1\.0/)
        assert.deepEqual(command.sourceGaps, source.sourceGaps)
        if (command.type === "hybrid_compile") return jsonValueSchema.parse(source.response)
        assert.equal(command.type, "hybrid_annotate")
        const requestId = randomUUID()
        for (const type of ["generation.started", "generation.completed"] as const) {
          audit!({ requestId, purpose: "semantic_annotation", event: { type } as ModelAudit["event"] })
        }
        const result = annotated(source, tamper)
        return jsonValueSchema.parse({ request: result.request, response: result.response })
      }, close: async () => { counts.runnerClosed++
        return cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "not_required", code: null })), false) } }),
    openBridge: async (input) => { counts.bridges++; audit = input.onAudit
      assert.deepEqual(input.allowedPurposes, ["semantic_annotation"])
      return { url: "http://127.0.0.1:1", token: randomUUID(), close: async () => { counts.bridgeClosed++ } } },
  }
  try {
    const original = structuredClone(source)
    const invoke = recompileHybridSource({ root: process.cwd(), directory, signal: new AbortController().signal,
      canonicalRequest: source.canonicalRequest, sourceGaps: source.sourceGaps,
      outputSchema: { type: "null" }, verifiedChildren: [],
      subject: {} as NonNullable<Parameters<typeof recompileHybridSource>[0]["subject"]>,
      ...(authorized ? { annotation: { selection, ownerId: randomUUID(), onProgress: (event: unknown) => progress.push(event) } } : {}),
    }, dependencies)
    if (tamper) await assert.rejects(invoke, /hybrid_annotation_source_mismatch/)
    else {
      const result = await invoke
      assert.equal(result.modelCalls.length, counts.bridges * 2)
      if (counts.bridges) {
        assert.deepEqual(result.modelCalls.map((report) => [report.purpose, report.status]),
          [["semantic_annotation", "intended"], ["semantic_annotation", "completed"]])
        assert.ok(result.request)
        assert.equal(progress.length, 2)
      } else assert.equal(result.request, undefined)
    }
    assert.deepEqual(source, original)
    assert.equal(counts.compiler, 1)
    assert.equal(counts.runnerClosed, 1)
    assert.equal(counts.bridgeClosed, counts.bridges)
    return { counts, commands }
  } finally { await rm(directory, { recursive: true, force: true }) }
}

test("纯编译或未授权缺口不调用模型，也不启动浏览器", async () => {
  for (const [reason, authorized] of [["", true], ["selection_function_evidence_required", false],
    ["selection_function_source_mismatch", true]] as const) {
    const result = await harness(fixture(reason), authorized)
    assert.equal(result.counts.bridges, 0)
    assert.deepEqual(result.commands, ["hybrid_compile"])
  }
})

test("显式离线注解只请求一次，保留数字词法与原来源并单独返回新增审计", async () => {
  const result = await harness(fixture(), true)
  assert.equal(result.counts.bridges, 1)
  assert.deepEqual(result.commands, ["hybrid_compile", "hybrid_annotate"])
})

test("离线注解拒绝改写浏览器事实，拒绝后仍关闭 compiler 与模型桥", async () => {
  await harness(fixture(), true, true)
})
