import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import { hybridCompilerResponseSchema } from "./hybrid-schema.js"
import { hybridPrefixResponseSchema } from "./hybrid-prefix-schema.js"

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const compilationCheckpointSchema = z.object({ id: z.uuid(), event: z.literal("authoring_compilation"),
  sequence: z.number().int().min(1).max(202), digest, payload: z.string().min(1).max(8_000_000) }).strict()
const common = { stepId: z.string().min(1), canonicalRequest: z.string().min(1).max(8_000_000) }
export const compilationPayloadSchema = z.discriminatedUnion("phase", [
  z.object({ ...common, phase: z.literal("prefix"), response: hybridPrefixResponseSchema }).strict(),
  z.object({ ...common, phase: z.literal("final"), response: hybridCompilerResponseSchema }).strict(),
])
export const compilationAckSchema = z.object({ id: z.uuid(), type: z.literal("hybrid_compilation_ack"),
  authorRequestId: z.uuid(), sequence: z.number().int().min(1).max(202), digest, accepted: z.boolean() }).strict()
export type CompilationCheckpoint = z.infer<typeof compilationCheckpointSchema>
export type CompilationPayload = z.infer<typeof compilationPayloadSchema>
export type CompilationHandler = (event: CompilationCheckpoint, signal: AbortSignal) => Promise<void>
export type CompilationPending = { onCompilation?: CompilationHandler;
  savingCompilation?: { event: CompilationCheckpoint; completion: Promise<void> } }

export function parseCompilationCheckpoint(event: CompilationCheckpoint) {
  if (Buffer.byteLength(event.payload) > 8_000_000
    || createHash("sha256").update(event.payload).digest("hex") !== event.digest) {
    throw new Error("hybrid_compilation_checkpoint_digest_mismatch")
  }
  return compilationPayloadSchema.parse(JSON.parse(event.payload))
}

export function confirmationBudget(payload: CompilationPayload) {
  return 10_000 + payload.response.compilation.segments.reduce((sum, segment) => sum
    + (segment.kind === "function" ? segment.draft.examples.length * 1000 : 0), 0)
}

/** WHY：只有保存完成才能 ACK；fd4 日志和前端订阅均不参与这个屏障。 */
export async function receiveCompilation(event: CompilationCheckpoint, pending: CompilationPending,
  signal: AbortSignal, send: (ack: z.infer<typeof compilationAckSchema>) => Promise<unknown>) {
  if (!pending.onCompilation) throw new Error("hybrid_compilation_handler_unavailable")
  if (pending.savingCompilation) {
    const original = pending.savingCompilation.event
    if (original.id !== event.id || original.sequence !== event.sequence || original.digest !== event.digest
      || original.payload !== event.payload) throw new Error("hybrid_compilation_inflight_conflict")
    return pending.savingCompilation.completion
  }
  const release = () => { if (pending.savingCompilation?.event === event) delete pending.savingCompilation }
  const completion = saveAndAcknowledge(event, pending.onCompilation, signal, send, release)
  pending.savingCompilation = { event, completion }
  try { await completion } finally { release() }
}

async function saveAndAcknowledge(event: CompilationCheckpoint, handle: CompilationHandler,
  signal: AbortSignal, send: (ack: z.infer<typeof compilationAckSchema>) => Promise<unknown>, release: () => void) {
  let accepted = false
  try {
    const payload = parseCompilationCheckpoint(event)
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(confirmationBudget(payload))])
    await handle(event, bounded)
    bounded.throwIfAborted()
    accepted = true
  } finally {
    // WHY：ACK 回执与下一检查点可能在同一管道批次到达；发 ACK 前释放旧槽，旧 finally 不能清新槽。
    release()
    // WHY：取消后绝不唤醒旧 author；正常拒绝也必须解开 Python 等待，以便交接失败来源。
    if (!signal.aborted) await send(compilationAckSchema.parse({ id: randomUUID(), type: "hybrid_compilation_ack",
      authorRequestId: event.id, sequence: event.sequence, digest: event.digest, accepted }))
  }
}
