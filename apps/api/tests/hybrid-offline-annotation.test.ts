import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { z } from "zod"
import { jsonValueSchema } from "@browser-capture/contracts"
import { recompileHybridSource } from "../src/upstream-browser/hybrid-exploration.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { digestCanonicalJson, validateHybridResponse } from "../src/upstream-browser/hybrid-materializer.js"
import type { ModelAudit } from "../src/upstream-browser/model-bridge.js"

const hash = (text: string) => createHash("sha256").update(text).digest("hex")
const selection = { connectionId: randomUUID(), modelId: "fixture", reasoningEffort: "medium" as const }
const gap = (reason: string) => ({ id: "missing-selection", code: "missing_binding", actionRefs: ["a2"],
  clauseRefs: [], reason, resolution: "collect_evidence" as const })
const fact = (id: string, kind: string, value: Record<string, string>) => {
  const digest = digestCanonicalJson(value)
  return { id, kind, value, sourceRefs: [{ ref: `sha256:${digest}`, digest }] }
}

function fixture(reason = "selection_function_evidence_required") {
  const requirement = { id: "requirement", version: 1, sourceDigest: "1".repeat(64),
    text: "Choose the requested item", taskText: "Choose the requested item" }
  const plan = { id: "plan", version: 1, sourceDigest: "2".repeat(64), stepId: "choose", callMode: "once",
    entryUrls: ["https://example.test/"], inputSchemaDigest: "3".repeat(64), outputSchemaDigest: "3".repeat(64),
    resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" }, semanticOperations: [] }
  const trace = { source: { historyRef: "fixture", sample: 1 }, actions: [
    { id: "a2", name: "click", status: "succeeded", preObservationRef: "o1", postObservationRef: "o2" }],
    observations: [{ id: "o1", facts: [fact("browser", "browser_context", { title: "fixture" })] },
      { id: "o2", facts: [] as ReturnType<typeof fact>[] }], completed: true }
  return pack(requirement, plan, trace, reason)
}

function pack(requirement: object, plan: object, trace: ReturnType<typeof traceOf>, reason: string) {
  const sourcePayloads = [requirement, plan, trace, { type: "null" }, []]
    .map((value) => JSON.stringify(value).replace('"sample":1', '"sample":1.0'))
  const digests = sourcePayloads.map(hash)
  const body = { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: [...digests, "4".repeat(64)], segments: [], controlGraph: { entry: "", edges: [], terminals: [] },
    coverage: [], gaps: reason ? [gap(reason)] : [] }
  const canonicalPayload = JSON.stringify(body)
  const response = validateHybridResponse({ compilation: { ...body, canonicalDigest: hash(canonicalPayload) },
    canonicalPayload, sourcePayloads })
  const request = z.record(z.string(), jsonValueSchema).parse({ compilerVersion: "bat-hybrid/2", actionRegistryVersion: "4".repeat(64),
    requirement: { ...requirement, digest: digests[0] }, plan: { ...plan, digest: digests[1] },
    trace: { ...trace, digest: digests[2] }, runtimeInputSchema: { type: "null" } })
  return { request, response }
}

function traceOf() { return { source: { historyRef: "", sample: 1 }, actions: [
  { id: "", name: "", status: "", preObservationRef: "", postObservationRef: "" }],
  observations: [{ id: "", facts: [] as ReturnType<typeof fact>[] }], completed: true } }

function annotated(source: ReturnType<typeof fixture>, tamper: boolean) {
  const trace = JSON.parse(source.response.sourcePayloads[2]!) as ReturnType<typeof traceOf>
  trace.observations[0]!.facts.push(fact("selection-a2", "selection_function", { actionRef: "a2" }))
  if (tamper) trace.actions[0]!.status = "failed"
  return pack(JSON.parse(source.response.sourcePayloads[0]!), JSON.parse(source.response.sourcePayloads[1]!),
    trace, "selection_function_evidence_required")
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
        assert.match(JSON.stringify(command), /"sample":1\.0/)
        if (command.type === "hybrid_compile") return jsonValueSchema.parse(source.response)
        assert.equal(command.type, "hybrid_annotate")
        const requestId = randomUUID()
        for (const type of ["generation.started", "generation.completed"] as const) {
          audit!({ requestId, purpose: "semantic_annotation", event: { type } as ModelAudit["event"] })
        }
        return jsonValueSchema.parse(annotated(source, tamper))
      }, close: async () => { counts.runnerClosed++
        return cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "not_required", code: null })), false) } }),
    openBridge: async (input) => { counts.bridges++; audit = input.onAudit
      assert.deepEqual(input.allowedPurposes, ["semantic_annotation"])
      return { url: "http://127.0.0.1:1", token: randomUUID(), close: async () => { counts.bridgeClosed++ } } },
  }
  try {
    const original = structuredClone(source)
    const invoke = recompileHybridSource({ root: process.cwd(), directory, signal: new AbortController().signal,
      request: source.request, sourceResponse: source.response, outputSchema: { type: "null" }, verifiedChildren: [],
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
