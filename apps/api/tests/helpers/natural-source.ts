import { createHash } from "node:crypto"
import { jsonValueSchema, type JsonValue } from "@browser-capture/contracts"
import { digestCanonicalJson } from "../../src/upstream-browser/hybrid-materializer.js"
import { naturalPayloadContext } from "../../src/upstream-browser/hybrid-natural-payload.js"
import { hybridCompilerResponseSchema, type HybridCompilation } from "../../src/upstream-browser/hybrid-schema.js"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

export function materializationPayloadFixture(request: Record<string, JsonValue>,
  compilation: Extract<HybridCompilation, { compilerVersion: "bat-hybrid/2" }>) {
  const sources = ["requirement", "plan", "trace"].map((key) => {
    const value = request[key]
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("fixture_source_required")
    const { digest: _digest, ...body } = value
    return body
  })
  const sourcePayloads = [...sources, request.runtimeInputSchema, []].map((value) => canonical(jsonValueSchema.parse(value)))
  const { canonicalDigest: _digest, ...body } = compilation
  const revised = { ...body, sourceDigests: [...sourcePayloads.map(hash), request.actionRegistryVersion] }
  const canonicalPayload = canonical(jsonValueSchema.parse(revised))
  const envelope = hybridCompilerResponseSchema.parse({ compilation: { ...revised, canonicalDigest: hash(canonicalPayload) },
    canonicalPayload, sourcePayloads })
  return naturalPayloadContext(envelope, request)
}

export function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error("fixture_json_invalid")
  return encoded
}

export function naturalSourceFixture(input: { trace: Record<string, JsonValue>;
  requirement?: Record<string, JsonValue>; plan?: Record<string, JsonValue>;
  lexicalizeTrace?: (canonical: string) => string }) {
  const runtimeInputSchema = { type: "null" }, outputSchema = { type: "null" }
  const requirement = input.requirement ?? { id: "requirement", version: 1, text: "Choose the requested item",
    taskText: "Choose the requested item", sourceDigest: "1".repeat(64) }
  const plan = input.plan ?? { id: "plan", version: 1, sourceDigest: "2".repeat(64), stepId: "choose",
    callMode: "once", entryUrls: ["https://example.test/"],
    inputSchemaDigest: digestCanonicalJson(runtimeInputSchema),
    outputSchemaDigest: digestCanonicalJson(outputSchema),
    resultSpec: { contractVersion: "bat-result-spec/v1", mode: "execution" } }
  const trace = jsonValueSchema.parse(input.trace)
  const tracePayload = input.lexicalizeTrace?.(canonical(trace)) ?? canonical(trace)
  const sourcePayloads = [canonical(jsonValueSchema.parse(requirement)), canonical(jsonValueSchema.parse(plan)),
    tracePayload, canonical(runtimeInputSchema), "[]"]
  const request = { compilerVersion: "bat-hybrid/2", actionRegistryVersion: "4".repeat(64),
    requirement: { ...requirement, digest: digestCanonicalJson(requirement) },
    plan: { ...plan, digest: digestCanonicalJson(plan) },
    runtimeInputSchema, trace: { ...input.trace, digest: hash(tracePayload) } }
  const plain = canonical(jsonValueSchema.parse(request))
  const canonicalRequest = input.lexicalizeTrace?.(plain) ?? plain
  return { canonicalRequest, sourcePayloads, request: JSON.parse(canonicalRequest) as Record<string, JsonValue> }
}
