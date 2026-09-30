import { z } from "zod"
import { budgetSchema, versionReferenceSchema, jsonValueSchema, keySchema, resultSpecSchema, valueBindingSchema, valuePathSchema,
  valueSchemaSchema } from "@browser-capture/contracts"

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const reference = z.object({ ref: z.string().min(1), digest: hash }).strict()
const record = z.record(z.string(), jsonValueSchema)
export const functionDraftSchema = z.object({
  language: z.literal("javascript"), source: z.string().min(1), inputs: z.record(z.string(), valueSchemaSchema),
  outputSchema: valueSchemaSchema, examples: z.array(z.object({ input: record, output: jsonValueSchema }).strict()).min(1).max(20),
}).strict()
export const functionSegmentSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), kind: z.literal("function"),
  label: z.string().min(1), draft: functionDraftSchema, inputBindings: z.record(z.string(), valueBindingSchema),
  proofRefs: z.array(reference).min(1) }).strict()
export const hybridPreparationSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  actionSegmentId: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), consumerSegmentId: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  proofRefs: z.array(reference).min(3) }).strict()
export const semanticOperationSchema = z.object({ id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  clauseRefs: z.array(z.string().min(1)).min(1),
  purpose: z.enum(["classify", "extract_semantics", "summarize", "rank_candidates", "semantic_dedupe"]),
  instruction: z.string().min(1), inputDescription: z.string().min(1), resultSchema: valueSchemaSchema,
  candidateIds: z.array(z.string().min(1)).max(300).nullable() }).strict()
export const semanticOperationBindingSchema = z.object({ kind: z.literal("semantic_operation"),
  operationId: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), inputFieldRefs: z.array(z.string().min(1)).min(1).max(100),
  segmentEvidenceRefs: z.array(reference).min(1) }).strict()
const binding = z.object({ id: z.string(), actionRef: z.string(), argumentPath: z.string(),
  kind: z.enum(["runtime_input", "prior_output", "authorized_constant", "sample_evidence"]),
  sourceRef: z.string(), transform: z.null(), proofRefs: z.array(reference) }).strict()
const naturalBinding = binding.extend({ binding: valueBindingSchema.optional(),
  derivation: z.enum(["anchor_navigation", "prior_verified_read", "repeat_destination", "selection_function"]).optional() }).strict()
export const naturalBindingFactValueSchema = z.object({ actionRef: z.string(), argumentPath: z.string(),
  binding: valueBindingSchema, provenance: z.enum(["runtime_input", "native_parameter", "task_literal", "plan_entry_url", "node_output"]),
  taskQuote: z.string().nullable().optional(), sourceReadRef: z.string().nullable().optional() }).strict()
export const hybridOutputAssemblySchema = z.object({ sourceRef: z.string().min(1),
  fields: z.array(z.object({ binding: valueBindingSchema, path: valuePathSchema }).strict()).min(1).max(100),
  schema: valueSchemaSchema, proofRefs: z.array(reference).min(1) }).strict()
// 来源事实保留代表值用于证明 input/constant 绑定；编译产物使用上面的 schema，绝不携带样本值。
export const hybridOutputAssemblyEvidenceSchema = z.object({
  fields: z.array(z.object({ binding: valueBindingSchema, path: valuePathSchema,
    sampleValue: jsonValueSchema.optional() }).strict()).min(1).max(100),
  schema: valueSchemaSchema, outputDigest: hash,
}).strict()
export const hybridResultBindingSchema = z.object({ contractVersion: z.literal("bat-result-binding/v1"),
  schema: valueSchemaSchema, assignments: z.array(z.object({ to: valuePathSchema, from: valueBindingSchema,
    producerRef: keySchema }).strict()).min(1).max(100),
  sourceRef: z.string().min(1), proofRefs: z.array(reference).min(1) }).strict()
export const hybridResultBranchSchema = z.object({ id: z.string().min(1),
  controlRef: keySchema, sourceActionRef: z.string().min(1),
  sourceSegmentId: z.string().min(1), consumerSegmentId: z.string().min(1),
  missingProducerSegmentId: z.string().min(1).optional(),
  skippedSegmentIds: z.array(z.string().min(1)).min(1), predicate: z.object({
    operator: z.literal("array_length_at_least"), value: valueBindingSchema,
    minimum: valueBindingSchema,
  }).strict(), falseResult: hybridResultBindingSchema,
  falseTerminalId: z.string().min(1) }).strict()
export const targetScopeSchema = z.object({ url: z.string().min(1), urlDigest: hash.optional() }).strict()
const targetQuerySchema = z.object({ kind: z.literal("css"), value: z.string().min(1) }).strict()
const historyTargetIdentitySchema = z.object({
  schemaVersion: z.literal("browser-use.dom-interacted-element/v1"), nodeName: z.string().min(1),
  xPath: z.string().min(1), elementHash: z.string().regex(/^-?\d+$/),
  stableHash: z.string().regex(/^-?\d+$/).nullable(), axNameDigest: hash.nullable(),
  attributes: z.array(z.object({ name: z.enum(["name", "id", "aria-label"]), digest: hash }).strict()).max(3),
}).strict().superRefine((value, context) => {
  if (new Set(value.attributes.map((item) => item.name)).size !== value.attributes.length) {
    context.addIssue({ code: "custom", message: "duplicate_history_target_attribute" })
  }
})
const targetOrdinalBindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("input"), path: valuePathSchema }).strict(),
  z.object({ source: z.literal("constant"), value: jsonValueSchema }).strict(),
  z.object({ source: z.literal("node"), nodeId: z.string().min(1), path: valuePathSchema }).strict(),
])
export const hybridTargetSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("ordinal"), container: z.string().min(1), ordinal: z.number().int().positive(),
    scope: targetScopeSchema.optional() }).strict(),
  z.object({ strategy: z.literal("title"), role: z.string().min(1), name: z.string().min(1) }).strict(),
  z.object({ strategy: z.literal("css"), value: z.string().min(1), scope: targetScopeSchema.optional() }).strict(),
  z.object({ strategy: z.literal("xpath"), value: z.string().min(1), scope: targetScopeSchema.optional() }).strict(),
  z.object({ strategy: z.literal("structure"), scope: targetScopeSchema, container: targetQuerySchema,
    items: targetQuerySchema, ordinal: z.number().int().positive(), ordinalBinding: targetOrdinalBindingSchema.optional(),
    withinItem: targetQuerySchema.nullable() }).strict(),
  z.object({ strategy: z.literal("history"), scope: targetScopeSchema,
    identity: historyTargetIdentitySchema }).strict(),
])
const readFieldSchema = z.object({ selector: z.string().min(1), attribute: z.string().nullable(),
  optionalAttribute: z.boolean().optional(),
  textSource: z.enum(["rendered", "textContent"]).optional(),
  resolveUrl: z.boolean().optional(), valueType: z.enum(["string", "number", "integer", "boolean"]),
  textPrefix: z.string().min(1).max(100).optional(), textSuffix: z.string().min(1).max(100).optional(),
  normalizeWhitespace: z.boolean().optional(), normalizePresentation: z.boolean().optional(),
  multiple: z.boolean().optional(),
  maxValues: z.number().int().min(1).max(300).optional() }).strict()
  .superRefine((value, context) => {
    if (value.optionalAttribute === true && (value.attribute === null || value.multiple === true)) {
      context.addIssue({ code: "custom", message: "optional_attribute_requires_single_attribute" })
    }
    if (value.resolveUrl === true && value.attribute !== "href" && value.attribute !== "src") {
      context.addIssue({ code: "custom", message: "url_resolution_requires_link_attribute" })
    }
    if (value.textSource === "textContent" && value.attribute !== null) {
      context.addIssue({ code: "custom", message: "text_source_requires_text_field" })
    }
    if ((value.textPrefix !== undefined || value.textSuffix !== undefined)
      && (!["string", "number", "integer"].includes(value.valueType) || value.attribute !== null)) {
      context.addIssue({ code: "custom", message: "text_affix_projection_invalid" })
    }
    if (value.normalizePresentation === true
      && (value.valueType !== "string" || value.attribute !== null || value.normalizeWhitespace !== true)) {
      context.addIssue({ code: "custom", message: "presentation_normalization_invalid" })
    }
  })
export const readSpecificationSchema = z.object({ container: z.string().min(1),
  fields: z.record(z.string().min(1), readFieldSchema),
  includeOrdinal: z.boolean().optional(),
  requireComplete: z.boolean().optional(),
  maxItems: z.number().int().min(1).max(300), maxInputBytes: z.number().int().min(1).optional(),
  outputSchema: valueSchemaSchema }).strict()
export const requiredReadPathsSchema = z.array(z.array(z.union([z.string(), z.number().int().nonnegative()])).min(1))
const settlePolicySchema = z.object({ maxMs: z.number().int().min(1).max(30000),
  maxAttempts: z.number().int().min(1).max(100), intervalMs: z.number().int().min(10).max(1000) }).strict()
const factPostconditionSchema = z.object({
  kind: z.enum(["url", "url_digest", "title", "target_value", "target_text", "target_state",
    "target_in_view", "target_visible", "scroll_position", "visible_overlays", "media_playback", "focused_element", "read_fields"]),
  bindingArgument: z.string().min(1).optional(), equals: jsonValueSchema.optional(),
  changed: z.literal(true).optional(), unchanged: z.literal(true).optional(),
  ready: z.literal(true).optional(), transition: z.literal(true).optional(),
  clauseRef: z.string().min(1).optional(), read: readSpecificationSchema.optional(),
  scope: targetScopeSchema.optional(), settle: settlePolicySchema.optional(), consumerRef: z.string().min(1).optional(),
  requiredPaths: requiredReadPathsSchema.optional(),
}).strict().superRefine((value, context) => {
  const authorityCount = [value.bindingArgument !== undefined, value.equals !== undefined && value.equals !== null,
    value.changed === true, value.unchanged === true,
    value.ready === true, value.transition === true].filter(Boolean).length
  if (authorityCount !== 1) context.addIssue({ code: "custom", message: "one_postcondition_authority_required" })
  if (value.equals === null) context.addIssue({ code: "custom", message: "postcondition_equals_must_not_be_null" })
  const read = value.kind === "read_fields"
  if (read !== (value.read !== undefined)) context.addIssue({ code: "custom", message: "postcondition_read_specification_required" })
  const consumer = value.ready === true || value.transition === true
  if (consumer && (!read || !value.consumerRef || !value.settle)) {
    context.addIssue({ code: "custom", message: "consumer_readiness_owner_and_settle_required" })
  }
  if (!read && (value.scope !== undefined || value.consumerRef !== undefined || value.requiredPaths !== undefined || consumer)) {
    context.addIssue({ code: "custom", message: "consumer_readiness_requires_read_projection" })
  }
})
export const hybridPostconditionSchema = z.union([
  factPostconditionSchema,
  z.object({ kind: z.literal("output_schema"), schemaDigest: hash.nullable() }).strict(),
])
const workflowStepOperation = z.object({ name: z.literal("browser.workflow-step"), version: z.literal(2),
  actionName: z.enum(["navigate", "go_back", "wait", "click", "input", "scroll", "send_keys", "dropdown_options", "select_dropdown", "bat_scroll_to", "bat_wait_for"]) }).strict()
const readFieldsOperation = z.object({ name: z.literal("browser.read-fields"), version: z.literal(2), specification: readSpecificationSchema }).strict()
const invokeOperation = z.object({ name: z.literal("task-chain.invoke"), version: z.literal(1), chain: versionReferenceSchema,
  input: valueBindingSchema, budget: budgetSchema }).strict()
const resultDataOperation = z.object({ name: z.literal("data.transform"), version: z.literal(1), dataOperation: z.literal("count") }).strict()
const humanWaitOperation = z.object({ name: z.literal("browser.wait-for-human"), version: z.literal(1),
  human: z.object({ reason: z.enum(["login", "captcha", "confirmation", "access_restriction"]),
    prompt: z.string().trim().min(1).max(500),
    resumeWhen: z.object({ operator: z.literal("equals"), path: z.tuple([z.literal("url")]),
      expected: z.object({ source: z.literal("constant"), value: z.string().url() }).strict() }).strict(),
  }).strict() }).strict()
const deterministicOperation = z.discriminatedUnion("name", [workflowStepOperation, readFieldsOperation, invokeOperation])
const naturalOperation = z.discriminatedUnion("name", [workflowStepOperation, readFieldsOperation, invokeOperation, resultDataOperation, humanWaitOperation])
const deterministicBase = { id: z.string(), kind: z.literal("deterministic"),
  operation: deterministicOperation, target: hybridTargetSchema.nullable(),
  preconditions: z.array(record), expectedEffect: z.object({ kind: z.enum(["none", "read", "ui_state", "navigation", "external_write"]) }).strict(),
  postconditions: z.array(hybridPostconditionSchema).min(1), outputs: z.array(z.object({ schema: valueSchemaSchema, sourceRef: z.string() }).strict()),
  proofRefs: z.array(reference).min(1), requirementClauseRefs: z.array(z.string()).optional() }
const deterministic = z.object({ ...deterministicBase, bindings: z.array(binding) }).strict()
const naturalDeterministic = z.object({ ...deterministicBase, operation: naturalOperation, bindings: z.array(naturalBinding) }).strict()
const semantic = z.object({ id: z.string(), kind: z.literal("explicit_llm"),
  operationId: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
  purpose: z.enum(["classify", "extract_semantics", "summarize", "rank_candidates", "semantic_dedupe"]),
  requirementClauseRefs: z.array(z.string()).min(1), inputSchema: valueSchemaSchema,
  inputBindings: z.array(valueBindingSchema).length(1), outputSchema: valueSchemaSchema,
  validation: z.object({ schema: valueSchemaSchema, candidateIds: z.array(z.string()).max(300).nullable() }).strict(),
  budget: z.object({ maxCalls: z.literal(1), maxInputBytes: z.number().int().min(1).max(128000),
    timeoutMs: z.number().int().min(1).max(120000) }).strict() }).strict()
export const naturalSummarySegmentSchema = z.object({ id: z.string(), kind: z.literal("explicit_llm"),
  operationId: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), purpose: z.literal("summarize"),
  sourceRef: z.string().min(1), inputSchema: valueSchemaSchema,
  inputBindings: z.array(valueBindingSchema).length(1), outputSchema: valueSchemaSchema,
  validation: z.object({ schema: valueSchemaSchema, candidateIds: z.null() }).strict(),
  budget: z.object({ maxCalls: z.literal(1), timeoutMs: z.number().int().min(1).max(120000) }).strict() }).strict()
export const compilationGapSchema = z.object({ id: z.string(), code: z.string(), actionRefs: z.array(z.string()),
  clauseRefs: z.array(z.string()), reason: z.string(),
  resolution: z.enum(["collect_evidence", "confirm_intent", "add_capability", "reject_trace"]) }).strict()
const compilationBody = {
  mediaType: z.literal("application/vnd.bat.hybrid-compilation+json;version=1"),
  sourceDigests: z.array(hash).length(6), segments: z.array(z.discriminatedUnion("kind", [deterministic, semantic])).max(500),
  controlGraph: z.object({ entry: z.string(), edges: z.array(z.object({ from: z.string(),
    outcome: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/), to: z.string() }).strict()),
    terminals: z.array(z.object({ id: z.string(), status: z.string() }).strict()) }).strict(),
  coverage: z.array(z.object({ actionRef: z.string(), disposition: z.enum(["compiled", "supporting", "retry_attempt", "agent_internal", "not_compilable"]),
    ownerSegmentId: z.string().nullable(), exclusionRule: z.string().nullable(), evidenceRefs: z.array(reference) }).strict()),
  gaps: z.array(compilationGapSchema),
  canonicalDigest: hash }
const legacyCompilationSchema = z.object({ ...compilationBody, compilerVersion: z.literal("bat-hybrid/1") }).strict()
export const hybridRepeatMethodSchema = z.object({ id: keySchema, sourceRef: z.string().min(1),
  proofRefs: z.array(reference).min(1), readSegmentId: keySchema, continuationSegmentId: keySchema,
  advanceSegmentId: keySchema, outputPath: valuePathSchema, readPath: valuePathSchema,
  stableKeyPath: valuePathSchema, sampleActionRefs: z.array(z.string().min(1)).min(5).max(500) }).strict()
export const naturalCompilationSchema = z.object({ ...compilationBody, compilerVersion: z.literal("bat-hybrid/2"),
  segments: z.array(z.discriminatedUnion("kind", [naturalDeterministic, naturalSummarySegmentSchema, functionSegmentSchema])).max(500),
  outputAssembly: hybridOutputAssemblySchema.nullable().optional(),
  resultBinding: hybridResultBindingSchema.nullable().optional(),
  resultBranches: z.array(hybridResultBranchSchema).max(20).optional(),
  repeatMethods: z.array(hybridRepeatMethodSchema).max(1).optional() }).strict()
export const hybridCompilationSchema = z.discriminatedUnion("compilerVersion", [legacyCompilationSchema, naturalCompilationSchema])
export const hybridCompilerResponseSchema = z.object({ compilation: hybridCompilationSchema, canonicalPayload: z.string(),
  sourcePayloads: z.array(z.string()).length(5) }).strict()
export type HybridCompilation = z.infer<typeof hybridCompilationSchema>
export type HybridSegment = HybridCompilation["segments"][number]

export const hybridAuthoritySchema = z.object({
  requirement: z.object({ id: z.string(), version: z.number().int().positive(), digest: hash,
    clauses: z.array(z.object({ id: z.string(), kind: z.string(), expression: jsonValueSchema }).strict()) }).strict(),
  plan: z.object({ id: z.string(), version: z.number().int().positive(), digest: hash, stepId: z.string(),
    inputSchemaDigest: hash, outputSchemaDigest: hash, callMode: z.enum(["once", "each", "batch"]),
    semanticOperations: z.array(semanticOperationSchema).default([]) }).strict(),
}).strict()

export const hybridNaturalRequestSchema = z.object({ compilerVersion: z.literal("bat-hybrid/2"),
  actionRegistryVersion: hash,
  requirement: z.object({ id: z.string(), version: z.number().int().positive(), text: z.string().min(1),
    taskText: z.string().min(1), sourceDigest: hash, digest: hash }).strict(),
  plan: z.object({ id: z.string(), version: z.number().int().positive(), sourceDigest: hash, digest: hash,
    stepId: z.string(), inputSchemaDigest: hash, outputSchemaDigest: hash,
    callMode: z.enum(["once", "each", "batch"]), entryUrls: z.array(z.url()).max(32), resultSpec: resultSpecSchema,
    semanticOperations: z.array(semanticOperationSchema).default([]) }).strict(),
  runtimeInputSchema: valueSchemaSchema,
  trace: z.object({ digest: hash, source: z.object({ historyRef: z.string().min(1) }).passthrough(),
    actions: z.array(z.object({ id: z.string(), preObservationRef: z.string().nullable(),
      postObservationRef: z.string().nullable() }).passthrough()),
    observations: z.array(z.object({ id: z.string(), facts: z.array(z.object({ id: z.string(), kind: z.string(),
      value: jsonValueSchema, sourceRefs: z.array(reference).min(1) }).passthrough()) }).passthrough()),
  }).passthrough(),
}).strict()
