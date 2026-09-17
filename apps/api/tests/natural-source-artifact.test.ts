import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, type JsonValue } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createHybridArtifact, createHybridSourceArtifact, readHybridSourceArtifact } from "../src/upstream-browser/hybrid-artifact.js"
import type { HybridSourceResult } from "../src/upstream-browser/hybrid-exploration.js"
import { hybridAuthorResultSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { browserUseTask, naturalRequirementText } from "../src/upstream-browser/task-request.js"

test("bat-hybrid/2 有 gap 的自然来源可保存但不能产 candidate", () => {
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.confirmation = { confirmedAt: "2026-09-16T00:00:00.000Z", requestId: "fixture-confirmation" }
  const plan = structuredClone(extractionFixture.plan)
  plan.inputContract.schema = { type: "object", properties: { destination: { type: "string" }, alternate: { type: "string" } },
    required: ["destination", "alternate"], additionalProperties: false }
  plan.steps[0]!.inputContract.schema = structuredClone(plan.inputContract.schema)
  plan.requirement = { id: requirement.id, version: requirement.version, revision: requirement.revision,
    digest: digestJson(requirement) }
  const step = plan.steps[0]!, input = { destination: "https://example.com/", alternate: "https://other.example/" }
  const taskText = browserUseTask({ requirement, plan, step, resolvedInput: input })
  const requirementSource = { id: requirement.id, version: requirement.version,
    text: naturalRequirementText(requirement).text, taskText, sourceDigest: digestJson(requirement) }
  const planSource = { id: plan.id, version: plan.version, sourceDigest: digestJson(plan), stepId: step.id,
    inputSchemaDigest: sha(canonical(step.inputContract.schema)),
    outputSchemaDigest: sha(canonical(step.outputContract.schema)),
    callMode: step.invocation.mode }
  const bindingValue = { actionRef: "a-1", argumentPath: "url", provenance: "runtime_input",
    binding: { source: "input", path: ["destination"] } }
  const readValue = { actionRef: "a-1", outputPath: ["name"], output: "verified" }
  const bindingFact = { id: "f-binding", kind: "natural_binding", value: bindingValue,
    sourceRefs: [{ ref: "input:destination", digest: sha(canonical(bindingValue)) }] }
  const traceSource = { mediaType: "application/vnd.bat.browser-use-trace+json;version=1",
    source: { provider: "browser-use", version: "fixture", historyRef: "fixture:natural-history" },
    judged: true, completed: true,
    actions: [{ id: "a-1", name: "navigate", args: { url: input.destination }, preObservationRef: "o-1", postObservationRef: "o-2" }],
    observations: [{ id: "o-1", facts: [bindingFact,
      { id: "f-read", kind: "verified_natural_read", value: readValue,
        sourceRefs: [{ ref: "read:verified", digest: sha(canonical(readValue)) }] }] },
    { id: "o-2", facts: [structuredClone(bindingFact)] }], finalResultRef: null,
    redactionManifestRef: { ref: "fixture:redaction", digest: "1".repeat(64) } }
  const requirementPayload = canonical(requirementSource), planPayload = canonical(planSource), tracePayload = canonical(traceSource)
  const inputPayload = canonical(step.inputContract.schema), annotationsPayload = canonical([])
  const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: "2".repeat(64),
    requirement: { ...requirementSource, digest: sha(requirementPayload) },
    plan: { ...planSource, digest: sha(planPayload) }, runtimeInputSchema: step.inputContract.schema,
    trace: { ...traceSource, digest: sha(tracePayload) } }
  const body = { mediaType: "application/vnd.bat.hybrid-compilation+json;version=1", compilerVersion: "bat-hybrid/2",
    sourceDigests: [sha(requirementPayload), sha(planPayload), sha(tracePayload), sha(inputPayload), sha(annotationsPayload), "2".repeat(64)],
    segments: [], controlGraph: { entry: "", edges: [], terminals: [] }, coverage: [], gaps: [{ id: "g-natural",
      code: "unsupported_capability", actionRefs: [], clauseRefs: [], reason: "natural_compiler_contract_pending",
      resolution: "collect_evidence" }] }
  const canonicalPayload = canonical(body)
  const response = { compilation: { ...body, canonicalDigest: sha(canonicalPayload) }, canonicalPayload,
    sourcePayloads: [requirementPayload, planPayload, tracePayload, inputPayload, annotationsPayload] }
  const calls = (["agent", "judge"] as const).map((purpose, index) => ({ callId: `call-${index}`, purpose,
    model: "fixture", intendedAt: "2026-09-16T00:00:00.000Z", status: "completed" as const, reportedInvocations: 1 }))
  const result = hybridAuthorResultSchema.parse({ output: null, request, response,
    history: { localRef: "fixture:natural-history", digest: sha(tracePayload) },
    sourceSuccess: true, sourceValidated: true, browserCommands: 0 })
  const source: HybridSourceResult = { ...result, modelCalls: calls, forkSourceDigest: "3".repeat(64) }

  const stored = createHybridSourceArtifact(requirement, plan, step.id, input, source)
  const read = readHybridSourceArtifact(stored)
  assert.notEqual(planSource.inputSchemaDigest, digestJson(step.inputContract.schema),
    "fixture 的字段键序应覆盖 Python canonical 与 JS insertion-order 摘要差异")
  assert.equal((read.result.request as Record<string, JsonValue>).compilerVersion, "bat-hybrid/2")
  assert.equal(stored.result.response.compilation.gaps[0]!.reason, "natural_compiler_contract_pending")
  assert.throws(() => createHybridArtifact({ requirement, plan, step, stepInput: input,
    request, response, forkSourceDigest: source.forkSourceDigest, modelCalls: calls, model: "fixture", version: 1,
    source: { history: source.history, sourceSuccess: true, sourceValidated: true, closed: true } }),
  /hybrid_annotation_audit_missing/)
  const auditedCalls = [...calls, { callId: "call-semantic", purpose: "semantic_annotation" as const,
    model: "fixture", intendedAt: "2026-09-16T00:00:00.000Z", status: "completed" as const,
    reportedInvocations: 1 }]
  assert.throws(() => createHybridArtifact({ requirement, plan, step, stepInput: input,
    request, response, forkSourceDigest: source.forkSourceDigest, modelCalls: auditedCalls,
    model: "fixture", version: 1,
    source: { history: source.history, sourceSuccess: true, sourceValidated: true, closed: true } }),
  /hybrid_compilation_gaps/)

  const tamperedRequest = structuredClone(request)
  tamperedRequest.plan.inputSchemaDigest = "4".repeat(64)
  const { digest: _oldPlanDigest, ...tamperedPlanSource } = tamperedRequest.plan
  const tamperedPlanPayload = canonical(tamperedPlanSource)
  tamperedRequest.plan.digest = sha(tamperedPlanPayload)
  const tamperedBody = { ...body, sourceDigests: [...body.sourceDigests] }
  tamperedBody.sourceDigests[1] = tamperedRequest.plan.digest
  const tamperedCanonicalPayload = canonical(tamperedBody)
  const tamperedResult = hybridAuthorResultSchema.parse({ ...result, request: tamperedRequest,
    response: { compilation: { ...tamperedBody, canonicalDigest: sha(tamperedCanonicalPayload) },
      canonicalPayload: tamperedCanonicalPayload,
      sourcePayloads: [requirementPayload, tamperedPlanPayload, tracePayload, inputPayload, annotationsPayload] } })
  assert.throws(() => createHybridSourceArtifact(requirement, plan, step.id, input,
    { ...tamperedResult, modelCalls: calls, forkSourceDigest: source.forkSourceDigest }),
  /hybrid_natural_host_source_mismatch/)

  const reboundRequest = structuredClone(request)
  const reboundFact = reboundRequest.trace.observations[0]!.facts[0]!
  const reboundValue = reboundFact.value as typeof bindingValue
  reboundValue.binding.path = ["alternate"]
  reboundFact.sourceRefs[0]!.digest = sha(canonical(reboundFact.value))
  const { digest: _oldTraceDigest, ...reboundTraceSource } = reboundRequest.trace
  const reboundTracePayload = canonical(reboundTraceSource)
  reboundRequest.trace.digest = sha(reboundTracePayload)
  const reboundBody = { ...body, sourceDigests: [...body.sourceDigests] }
  reboundBody.sourceDigests[2] = reboundRequest.trace.digest
  const reboundCanonicalPayload = canonical(reboundBody)
  const reboundResult = hybridAuthorResultSchema.parse({ ...result, request: reboundRequest,
    response: { compilation: { ...reboundBody, canonicalDigest: sha(reboundCanonicalPayload) },
      canonicalPayload: reboundCanonicalPayload,
      sourcePayloads: [requirementPayload, planPayload, reboundTracePayload, inputPayload, annotationsPayload] },
    history: { localRef: "fixture:natural-history", digest: reboundRequest.trace.digest } })
  assert.throws(() => createHybridSourceArtifact(requirement, plan, step.id, input,
    { ...reboundResult, modelCalls: calls, forkSourceDigest: source.forkSourceDigest }),
  /hybrid_natural_runtime_input_mismatch/)
  assert.equal(requirement.contractVersion, CONTRACT_VERSION)
})

function canonical(value: JsonValue | Record<string, unknown>): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item as JsonValue)).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, JsonValue>)[key]!)}`).join(",")}}`
  return JSON.stringify(value)
}

function sha(value: string) { return createHash("sha256").update(value).digest("hex") }
