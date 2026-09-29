import { z } from "zod"
import { naturalCompilationSchema } from "./hybrid-schema.js"
import { assertHybridEnvelope } from "./hybrid-response.js"

const reference = z.object({ ref: z.string().min(1), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const prefixDependencySchema = z.object({ actionRef: z.string().regex(/^a-\d{4,}$/),
  kind: z.enum(["consumer_readiness", "repeat_method"]), evidenceRefs: z.array(reference).min(1) }).strict()

// WHY：严格独立入口；原 final schema 拒绝 mode/dependencies，前缀永远没有完成或发布权限。
export const hybridPrefixCompilationSchema = naturalCompilationSchema.extend({ mode: z.literal("prefix"),
  dependencies: z.array(prefixDependencySchema).max(1000),
  outputAssembly: z.null(), resultBinding: z.null(), resultBranches: z.tuple([]), repeatMethods: z.tuple([]),
  controlGraph: naturalCompilationSchema.shape.controlGraph.extend({ entry: z.literal(""), terminals: z.tuple([]) }),
}).strict()
export const hybridPrefixResponseSchema = z.object({ compilation: hybridPrefixCompilationSchema,
  canonicalPayload: z.string().max(8_000_000), sourcePayloads: z.array(z.string()).length(5) }).strict()
export type HybridPrefixResponse = z.infer<typeof hybridPrefixResponseSchema>

export function validateHybridPrefixResponse(raw: unknown) {
  const envelope = hybridPrefixResponseSchema.parse(raw)
  assertHybridEnvelope(envelope)
  return envelope
}
