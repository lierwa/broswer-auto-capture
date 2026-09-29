import { z } from "zod"
import { jsonValueSchema, parseTaskValue, stableChainNodeV2Schema, valueSchemaSchema, type StableChainNodeV2,
  type ValueSchema } from "@browser-capture/contracts"
import { executeFunctionNode } from "@browser-capture/runtime"
import { functionDraftSchema } from "./hybrid-schema.js"
import { validateAndMaterializeFunctionDraft } from "./hybrid-v2.js"

const candidates = z.array(z.record(z.string(), jsonValueSchema)).min(1).max(300)
const ordinal = z.number().int().min(1).max(300)
export const selectionValidationRequestSchema = z.object({
  source: z.string().min(1), candidates, candidateSchema: valueSchemaSchema,
  maxItems: z.number().int().min(1).max(300),
  outputKind: z.enum(["ordinal", "url"]).default("ordinal"),
  examples: z.array(z.object({ candidates, ordinal }).strict()).max(4).default([]),
}).strict()
const mismatchDetails = z.object({ exampleIndex: z.number().int().min(0).max(20),
  actual: z.number().int().refine(Number.isSafeInteger), expected: z.number().int().refine(Number.isSafeInteger) }).strict()

const safeReasons = new Set([
  "selection_function_candidates_invalid", "selection_function_ordinal_invalid",
  "selection_function_url_invalid",
  "function_draft_example_mismatch", "function_draft_input_mismatch", "function_draft_example_input_invalid",
  "function_source_invalid", "function_input_invalid", "function_output_invalid", "function_output_too_large",
  "function_timeout", "function_cancelled",
])

/** WHY：探索与编译共享同一QuickJS验证门；只反馈固定码及整数结果差异，不带出页面文本或guest错误。 */
export async function validateSelectionRequest(raw: unknown, signal: AbortSignal) {
  const parsed = selectionValidationRequestSchema.safeParse(raw)
  if (!parsed.success) return { valid: false as const, reason: "selection_function_request_invalid" }
  const body = parsed.data
  try {
    signal.throwIfAborted()
    const selected = await computeSelection(body, signal)
    await validateSelectionDraft({ id: "selection-validation", label: "选择程序验证", timeoutMs: 1000, signal,
      bindings: { candidates: { source: "input", path: ["candidates"] } },
      draft: { language: "javascript", source: body.source, inputs: { candidates: body.candidateSchema },
        outputSchema: body.outputKind === "url" ? { type: "string" }
          : { type: "integer", minimum: 1, maximum: body.maxItems },
        examples: [{ candidates: body.candidates, ordinal: selected }, ...body.examples]
          .map((sample) => ({ input: { candidates: sample.candidates }, output: sample.ordinal })) },
    })
    signal.throwIfAborted()
    return body.outputKind === "url" ? { valid: true as const, url: selected as string }
      : { valid: true as const, ordinal: selected as number }
  } catch (error) {
    if (signal.aborted) return { valid: false as const, reason: "bridge_cancelled" }
    const reason = error instanceof Error && safeReasons.has(error.message) ? error.message : "selection_function_validation_failed"
    const details = mismatchDetails.safeParse(error instanceof Error && reason === "function_draft_example_mismatch" ? error.cause : undefined)
    return { valid: false as const, reason, ...(details.success ? details.data : {}) }
  }
}

async function computeSelection(body: z.infer<typeof selectionValidationRequestSchema>, signal: AbortSignal) {
  const current = parseCandidates(body.candidateSchema, body.maxItems, body.candidates)
  const node = stableChainNodeV2Schema.parse({ id: "selection-validation", label: "选择程序验证", kind: "function",
    language: "javascript", source: body.source, inputs: { candidates: { source: "input", path: ["candidates"] } },
    timeoutMs: 1000, outputContract: { id: "selection-validation", version: 1, dialect: "bat-value-schema/v1",
      schema: body.outputKind === "url" ? { type: "string" }
        : { type: "integer", minimum: 1, maximum: body.maxItems } }, writes: [],
  }) as Extract<StableChainNodeV2, { kind: "function" }>
  // WHY：点击前由真实程序计算选择结果，不能要求模型再口算一次原始候选的期望值。
  const result = await executeFunctionNode(node, { candidates: current }, signal)
  if (result.outcome !== "success") throw new Error(result.reason ?? "function_source_invalid")
  if (body.outputKind === "url") {
    if (typeof result.output !== "string" || !current.some(candidate => candidate.attribute_href === result.output)) {
      throw new Error("selection_function_url_invalid")
    }
    return result.output
  }
  const selected = ordinal.max(body.maxItems).safeParse(result.output)
  if (!selected.success || !current.some((candidate) => candidate.ordinal === selected.data)) {
    throw new Error("selection_function_ordinal_invalid")
  }
  return selected.data
}

export async function validateSelectionDraft(input: Parameters<typeof validateAndMaterializeFunctionDraft>[0]) {
  input.signal?.throwIfAborted()
  const draft = functionDraftSchema.parse(input.draft)
  // WHY：读取器按 DOM 顺序生成候选；只验证真实输入与提供的样例，不制造逆序伪反例。
  validateCandidates(draft)
  // WHY：相同 href 是同一个导航结果，不是新的业务样例。响应式页面可能只保留“页码”或“下一页”之一，
  // 所以 URL 选择函数不能依赖某个等价展示副本恰好存在；宿主用已有真实候选派生删减反例，不再询问模型。
  const examples = [...draft.examples, ...equivalentUrlExamples(draft, 20 - draft.examples.length)]
  return validateAndMaterializeFunctionDraft({ ...input, draft: { ...draft, examples } })
}

function equivalentUrlExamples(draft: z.infer<typeof functionDraftSchema>, limit: number) {
  if (draft.outputSchema.type !== "string" || limit <= 0) return []
  const variants: z.infer<typeof functionDraftSchema>["examples"] = []
  for (const example of draft.examples) {
    if (typeof example.output !== "string" || !Array.isArray(example.input.candidates)) continue
    const rows = example.input.candidates
    const equivalent = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row)
      && row.attribute_href === example.output)
    if (equivalent.length < 2) continue
    for (const representative of equivalent) {
      const candidates = rows.filter((row) => !(row && typeof row === "object" && !Array.isArray(row)
        && row.attribute_href === example.output) || row === representative)
      variants.push({ input: { ...example.input, candidates }, output: example.output })
      if (variants.length >= limit) return variants
    }
  }
  return variants
}

function validateCandidates(draft: z.infer<typeof functionDraftSchema>) {
  const schema = draft.inputs.candidates, output = draft.outputSchema
  if (schema?.type === "array" && output.type === "string") {
    // WHY：导航选择仍消费同一真实候选；等价链接不等于多义输出，禁止返回未观察的 href。
    for (const example of draft.examples) {
      const sample = parseCandidates(schema, schema.maxItems ?? 300, example.input.candidates)
      if (typeof example.output !== "string" || !sample.some(candidate => candidate.attribute_href === example.output)) {
        throw new Error("selection_function_url_invalid")
      }
    }
    return
  }
  if (schema?.type !== "array" || output.type !== "integer" || output.minimum !== 1
    || !Number.isInteger(output.maximum) || output.maximum! < 1 || output.maximum! > 300) {
    throw new Error("selection_function_candidates_invalid")
  }
  const samples = draft.examples.map((example) => parseCandidates(schema, output.maximum!, example.input.candidates))
  for (const [index, sample] of samples.entries()) {
    const selected = draft.examples[index]!.output
    if (!sample.some((candidate) => candidate.ordinal === selected)) {
      throw new Error("selection_function_ordinal_invalid")
    }
  }
}

function parseCandidates(schema: ValueSchema, maxItems: number, raw: unknown) {
  if (schema.type !== "array") throw new Error("selection_function_candidates_invalid")
  let sample: z.infer<typeof candidates>
  try {
    parseTaskValue({ id: "selection-candidates", version: 1, dialect: "bat-value-schema/v1", schema }, raw)
    sample = candidates.max(maxItems).parse(raw)
  } catch { throw new Error("selection_function_candidates_invalid") }
  const ordinals = sample.map((candidate) => ordinal.max(maxItems).safeParse(candidate.ordinal))
  if (ordinals.some((value) => !value.success) || new Set(sample.map((candidate) => candidate.ordinal)).size !== sample.length) {
    throw new Error("selection_function_ordinal_invalid")
  }
  return sample
}
