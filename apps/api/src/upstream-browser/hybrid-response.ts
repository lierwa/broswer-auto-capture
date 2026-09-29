import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { hybridCompilerResponseSchema, type HybridCompilation } from "./hybrid-schema.js"

export function validateHybridResponse(raw: unknown) {
  const envelope = hybridCompilerResponseSchema.parse(raw)
  assertHybridEnvelope(envelope)
  return envelope
}

// WHY：prefix 与 final 复用摘要/归属校验，但各自的严格 schema 决定准入，不能相互冒充。
export function assertHybridEnvelope(envelope: {
  compilation: HybridCompilation; canonicalPayload: string; sourcePayloads: string[]
}) {
  const compilation = envelope.compilation
  const { canonicalDigest, ...body } = compilation
  if (createHash("sha256").update(envelope.canonicalPayload).digest("hex") !== canonicalDigest
    || !isDeepStrictEqual(JSON.parse(envelope.canonicalPayload), body)) throw new Error("hybrid_digest_mismatch")
  const actions = new Set<string>(), segments = new Set(compilation.segments.map((segment) => segment.id))
  if (segments.size !== compilation.segments.length) throw new Error("hybrid_duplicate_segment")
  for (const row of compilation.coverage) {
    if (actions.has(row.actionRef)) throw new Error("hybrid_duplicate_coverage")
    actions.add(row.actionRef)
    if (row.ownerSegmentId !== null && !segments.has(row.ownerSegmentId)) throw new Error("hybrid_unknown_segment")
    if (["compiled", "supporting", "retry_attempt"].includes(row.disposition) && row.ownerSegmentId === null) {
      throw new Error("hybrid_missing_owner")
    }
  }
}
