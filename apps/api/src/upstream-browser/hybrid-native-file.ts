import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { hybridNaturalRequestSchema, type HybridSegment } from "./hybrid-schema.js"
import type { naturalPayloadContext } from "./hybrid-natural-payload.js"

export const NATIVE_FILE_OUTPUT = "nativeFileOutput"
export const nativeFileOutputSchema = { type: "object", properties: {
  text: { type: "string" }, files: { type: "array", items: { type: "object", properties: {
    artifactId: { type: "string" }, mediaType: { type: "string" }, digest: { type: "string" } },
  required: ["artifactId", "mediaType", "digest"], additionalProperties: false } } },
required: ["text", "files"], additionalProperties: false } as const
const actions = new Set(["read_file", "write_file", "replace_file", "save_as_pdf", "screenshot"])
const checksum = z.string().regex(/^[a-f0-9]{64}$/)
export const nativeFileIdentitySchema = z.object({ fileName: z.string().min(1).refine(value =>
  !value.includes("/") && !value.includes("\\") && ![".", ".."].includes(value)),
  pathDigest: checksum, contentDigest: checksum, byteLength: z.number().int().nonnegative().max(64 * 1024 * 1024) }).strict()
const receipt = z.object({ format: z.literal("bat-native-file-ref/v1"), ownerId: z.uuid(),
  fileName: z.string().min(1), mediaType: z.string().min(1), digest: checksum,
  byteLength: z.number().int().positive().max(64 * 1024 * 1024), relativePath: z.string().min(1) }).strict()
const factValue = z.object({ schemaVersion: z.literal("bat.native-file-output/v1"), actionRef: z.string(),
  resultDigest: checksum, text: z.string(), files: z.array(receipt), ownedFile: nativeFileIdentitySchema.optional() }).strict()

/** WHY：文件结果来自同一次原生回执；探索路径/字节不会成为普通运行的输入或模型上下文。 */
export function assertNativeFileOutput(segment: Extract<HybridSegment, { kind: "deterministic" }>,
  request: z.infer<typeof hybridNaturalRequestSchema>, payload: ReturnType<typeof naturalPayloadContext>) {
  if (segment.operation.name !== "browser.workflow-step" || !actions.has(segment.operation.actionName)) return false
  const action = request.trace.actions.find(item => `s-${item.id}` === segment.id)
  const post = request.trace.observations.find(item => item.id === action?.postObservationRef)
  const pre = request.trace.observations.find(item => item.id === action?.preObservationRef)
  const facts = post?.facts.filter(item => item.kind === "native_file_output"
    && item.id === segment.outputs[0]?.sourceRef) ?? []
  if (!action || action.status !== "succeeded" || !post || !pre || facts.length !== 1 || segment.outputs.length !== 1
    || !isDeepStrictEqual(segment.outputs[0]!.schema, nativeFileOutputSchema)) throw Error("hybrid_native_file_output_missing")
  payload.assertFact(facts[0]!, post.id)
  const value = factValue.parse(facts[0]!.value)
  const results = pre.facts.filter(item => item.kind === "native_action_result" && item.value
    && typeof item.value === "object" && !Array.isArray(item.value) && item.value.actionRef === action.id)
  if (results.length !== 1) throw Error("hybrid_native_file_result_missing")
  payload.assertFact(results[0]!, pre.id)
  const native = z.object({ result: z.object({ extracted_content: z.string().nullable().optional(),
    attachments: z.array(z.string()).nullable().optional(), error: z.null().optional() }).passthrough() }).passthrough().parse(results[0]!.value)
  const resultDigest = z.object({ digest: checksum }).passthrough().parse(action.resultRef).digest
  if (value.actionRef !== action.id || value.resultDigest !== resultDigest
    || value.text !== (native.result.extracted_content ?? "") || value.files.length !== (native.result.attachments ?? []).length) {
    throw Error("hybrid_native_file_result_mismatch")
  }
  return true
}
