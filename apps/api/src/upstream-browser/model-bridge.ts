import { randomUUID, timingSafeEqual } from "node:crypto"
import Fastify from "fastify"
import { z } from "zod"
import type { AI, AIEvent, ModelSelection } from "@agent-platform/ai-connect/server"

export const modelPurposeSchema = z.enum(["agent", "judge", "workflow_generation", "variable_suggestion",
  "extract", "output_conversion"])
const text = z.object({ type: z.literal("text"), text: z.string() }).strict()
const image = z.object({ type: z.literal("image"), data: z.string().min(1),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]) }).strict()
export const modelRequestSchema = z.object({
  id: z.uuid(), purpose: modelPurposeSchema,
  upstreamSessionId: z.string().min(1).max(256).optional(),
  system: z.string().optional(),
  messages: z.array(z.discriminatedUnion("role", [
    z.object({ role: z.literal("user"), content: z.union([z.string(), z.array(z.union([text, image]))]) }).strict(),
    z.object({ role: z.literal("assistant"), content: z.string() }).strict(),
  ])).min(1),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
}).strict()
export type ModelAudit = { requestId: string; upstreamSessionId?: string;
  purpose: z.infer<typeof modelPurposeSchema>; event: AIEvent }
type AISubject = ReturnType<AI["forSubject"]>
type Subject = Pick<AISubject, "generate" | "generateObject"> & {
  verifyCapabilities(...args: Parameters<AISubject["verifyCapabilities"]>): Promise<unknown>
}

/** WHY：HTTP 独立于上游 stdout/stderr；账号与凭据只在 TS AI Connect 内，Python 只有本次桥的随机口令。 */
export async function openModelBridge(input: {
  subject: Subject; selection: ModelSelection; signal: AbortSignal; onAudit(audit: ModelAudit): void;
}) {
  input.signal.throwIfAborted()
  const selection = Object.freeze({ ...input.selection })
  await input.subject.verifyCapabilities({ model: selection,
    require: ["vision", "structuredOutput"], signal: input.signal })
  const lifetime = new AbortController(), token = randomUUID(), seen = new Set<string>()
  const signal = AbortSignal.any([input.signal, lifetime.signal])
  const app = Fastify({ logger: false, bodyLimit: 20 * 1024 * 1024, requestTimeout: 180_000 })
  app.setErrorHandler((_error, _request, reply) => reply.code(400).send({ error: "bridge_request_invalid" }))
  app.post("/invoke", async (request, reply) => {
    const supplied = Buffer.from(request.headers.authorization ?? ""), expected = Buffer.from(`Bearer ${token}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return reply.code(401).send({ error: "bridge_unauthorized" })
    }
    const parsed = modelRequestSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: "bridge_request_invalid" })
    const body = parsed.data
    if (seen.has(body.id)) return reply.code(409).send({ error: "bridge_duplicate_request" })
    seen.add(body.id)
    try {
      signal.throwIfAborted()
      // WHY：prepareInvocation 仅支持 managed profile；普通账号用公开 generate 接口，固定选择并由 AI Connect 核验能力。
      const args = { model: selection, requiredCapabilities: ["vision", "structuredOutput"] as const,
        messages: body.messages, ...(body.system === undefined ? {} : { system: body.system }), signal,
        onEvent: (event: AIEvent) => {
          // WHY：正文流、页面提取和搜索内容不能进入产品审计；保留生命周期与供应商 usage。
          if (["generation.started", "generation.completed", "generation.failed", "generation.cancelled"].includes(event.type)) {
            input.onAudit({ requestId: body.id, purpose: body.purpose, event,
              ...(body.upstreamSessionId === undefined ? {} : { upstreamSessionId: body.upstreamSessionId }) })
          }
        } }
      const result = body.jsonSchema
        ? await input.subject.generateObject({ ...args, schema: { jsonSchema: body.jsonSchema, parse: (value) => z.json().parse(value) } })
        : await input.subject.generate(args)
      signal.throwIfAborted()
      return { completion: body.jsonSchema ? result.object : result.text, usage: result.usage }
    } catch {
      return reply.code(signal.aborted ? 409 : 502).send({ error: signal.aborted ? "bridge_cancelled" : "bridge_model_failed" })
    }
  })
  try {
    const url = await app.listen({ host: "127.0.0.1", port: 0 })
    signal.throwIfAborted()
    return { url, token, async close() { lifetime.abort(); await app.close() } }
  } catch (error) { lifetime.abort(); await app.close(); throw error }
}
