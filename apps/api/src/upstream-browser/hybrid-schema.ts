import { z } from "zod"
import { budgetSchema, versionReferenceSchema, jsonValueSchema, nodeOutcomeSchema, valueBindingSchema, valuePathSchema,
  valueSchemaSchema } from "@browser-capture/contracts"

const hash = z.string().regex(/^[a-f0-9]{64}$/)
const reference = z.object({ ref: z.string().min(1), digest: hash }).strict()
const record = z.record(z.string(), jsonValueSchema)
const binding = z.object({ id: z.string(), actionRef: z.string(), argumentPath: z.string(),
  kind: z.enum(["runtime_input", "prior_output", "authorized_constant", "sample_evidence"]),
  sourceRef: z.string(), transform: z.null(), proofRefs: z.array(reference) }).strict()
const naturalBinding = binding.extend({ binding: valueBindingSchema.optional() }).strict()
export const naturalBindingFactValueSchema = z.object({ actionRef: z.string(), argumentPath: z.string(),
  binding: valueBindingSchema, provenance: z.enum(["runtime_input", "native_parameter", "task_literal"]),
  taskQuote: z.string().nullable().optional() }).strict()
export const hybridOutputAssemblySchema = z.object({ sourceRef: z.string().min(1),
  fields: z.array(z.object({ binding: valueBindingSchema, path: valuePathSchema }).strict()).min(1).max(100),
  schema: valueSchemaSchema, proofRefs: z.array(reference).min(1) }).strict()
export const targetScopeSchema = z.object({ url: z.string().min(1), urlDigest: hash.optional() }).strict()
const targetQuerySchema = z.object({ kind: z.literal("css"), value: z.string().min(1) }).strict()
const targetOrdinalBindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("input"), path: valuePathSchema }).strict(),
  z.object({ source: z.literal("constant"), value: jsonValueSchema }).strict(),
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
])
export const readSpecificationSchema = z.object({ container: z.string().min(1),
  fields: z.record(z.string().min(1), z.object({ selector: z.string().min(1), attribute: z.string().nullable(),
    valueType: z.enum(["string", "number", "integer", "boolean"]),
    multiple: z.boolean().optional(), maxValues: z.number().int().min(1).max(300).optional() }).strict()),
  maxItems: z.number().int().min(1).max(300), maxInputBytes: z.number().int().min(1).optional(),
  outputSchema: valueSchemaSchema }).strict()
const deterministicBase = { id: z.string(), kind: z.literal("deterministic"),
  operation: z.discriminatedUnion("name", [
    z.object({ name: z.literal("browser.workflow-step"), version: z.literal(2),
      actionName: z.enum(["navigate", "go_back", "wait", "click", "input", "scroll", "send_keys", "dropdown_options", "select_dropdown", "bat_scroll_to", "bat_wait_for"]) }).strict(),
    z.object({ name: z.literal("browser.read-fields"), version: z.literal(2), specification: readSpecificationSchema }).strict(),
    z.object({ name: z.literal("task-chain.invoke"), version: z.literal(1), chain: versionReferenceSchema,
      input: valueBindingSchema, budget: budgetSchema }).strict(),
  ]), target: hybridTargetSchema.nullable(),
  preconditions: z.array(record), expectedEffect: z.object({ kind: z.enum(["none", "read", "ui_state", "navigation", "external_write"]) }).strict(),
  postconditions: z.array(record).min(1), outputs: z.array(z.object({ schema: valueSchemaSchema, sourceRef: z.string() }).strict()),
  proofRefs: z.array(reference).min(1), requirementClauseRefs: z.array(z.string()).optional() }
const deterministic = z.object({ ...deterministicBase, bindings: z.array(binding) }).strict()
const naturalDeterministic = z.object({ ...deterministicBase, bindings: z.array(naturalBinding) }).strict()
const semantic = z.object({ id: z.string(), kind: z.literal("explicit_llm"),
  purpose: z.enum(["classify", "extract_semantics", "summarize", "rank_candidates", "semantic_dedupe"]),
  requirementClauseRefs: z.array(z.string()).min(1), inputSchema: valueSchemaSchema,
  inputBindings: z.array(valueBindingSchema).length(1), outputSchema: valueSchemaSchema,
  validation: z.object({ schema: valueSchemaSchema, candidateIds: z.array(z.string()).max(300).nullable() }).strict(),
  budget: z.object({ maxCalls: z.literal(1), maxInputBytes: z.number().int().min(1).max(128000),
    timeoutMs: z.number().int().min(1).max(120000) }).strict() }).strict()
export const naturalSummarySegmentSchema = z.object({ id: z.string(), kind: z.literal("explicit_llm"),
  purpose: z.literal("summarize"), sourceRef: z.string().min(1), inputSchema: valueSchemaSchema,
  inputBindings: z.array(valueBindingSchema).length(1), outputSchema: valueSchemaSchema,
  validation: z.object({ schema: valueSchemaSchema, candidateIds: z.null() }).strict(),
  budget: z.object({ maxCalls: z.literal(1), timeoutMs: z.number().int().min(1).max(120000) }).strict() }).strict()
const compilationBody = {
  mediaType: z.literal("application/vnd.bat.hybrid-compilation+json;version=1"),
  sourceDigests: z.array(hash).length(6), segments: z.array(z.discriminatedUnion("kind", [deterministic, semantic])).max(500),
  controlGraph: z.object({ entry: z.string(), edges: z.array(z.object({ from: z.string(), outcome: nodeOutcomeSchema, to: z.string() }).strict()),
    terminals: z.array(z.object({ id: z.string(), status: z.string() }).strict()) }).strict(),
  coverage: z.array(z.object({ actionRef: z.string(), disposition: z.enum(["compiled", "supporting", "retry_attempt", "agent_internal", "not_compilable"]),
    ownerSegmentId: z.string().nullable(), exclusionRule: z.string().nullable(), evidenceRefs: z.array(reference) }).strict()),
  gaps: z.array(z.object({ id: z.string(), code: z.string(), actionRefs: z.array(z.string()), clauseRefs: z.array(z.string()),
    reason: z.string(), resolution: z.enum(["collect_evidence", "confirm_intent", "add_capability", "reject_trace"]) }).strict()),
  canonicalDigest: hash }
const legacyCompilationSchema = z.object({ ...compilationBody, compilerVersion: z.literal("bat-hybrid/1") }).strict()
const naturalCompilationSchema = z.object({ ...compilationBody, compilerVersion: z.literal("bat-hybrid/2"),
  segments: z.array(z.discriminatedUnion("kind", [naturalDeterministic, naturalSummarySegmentSchema])).max(500),
  outputAssembly: hybridOutputAssemblySchema.nullable().optional() }).strict()
export const hybridCompilationSchema = z.discriminatedUnion("compilerVersion", [legacyCompilationSchema, naturalCompilationSchema])
export const hybridCompilerResponseSchema = z.object({ compilation: hybridCompilationSchema, canonicalPayload: z.string(),
  sourcePayloads: z.array(z.string()).length(5) }).strict()
export type HybridCompilation = z.infer<typeof hybridCompilationSchema>
export type HybridSegment = HybridCompilation["segments"][number]

export const hybridAuthoritySchema = z.object({
  requirement: z.object({ id: z.string(), version: z.number().int().positive(), digest: hash,
    clauses: z.array(z.object({ id: z.string(), kind: z.string(), expression: jsonValueSchema }).strict()) }).strict(),
  plan: z.object({ id: z.string(), version: z.number().int().positive(), digest: hash, stepId: z.string(),
    inputSchemaDigest: hash, outputSchemaDigest: hash, callMode: z.enum(["once", "each", "batch"]) }).strict(),
}).strict()

export const hybridNaturalRequestSchema = z.object({ compilerVersion: z.literal("bat-hybrid/2"),
  actionRegistryVersion: hash,
  requirement: z.object({ id: z.string(), version: z.number().int().positive(), text: z.string().min(1),
    taskText: z.string().min(1), sourceDigest: hash, digest: hash }).strict(),
  plan: z.object({ id: z.string(), version: z.number().int().positive(), sourceDigest: hash, digest: hash,
    stepId: z.string(), inputSchemaDigest: hash, outputSchemaDigest: hash,
    callMode: z.enum(["once", "each", "batch"]) }).strict(),
  runtimeInputSchema: valueSchemaSchema,
  trace: z.object({ digest: hash, source: z.object({ historyRef: z.string().min(1) }).passthrough(),
    actions: z.array(z.object({ id: z.string(), preObservationRef: z.string().nullable(),
      postObservationRef: z.string().nullable() }).passthrough()),
    observations: z.array(z.object({ id: z.string(), facts: z.array(z.object({ id: z.string(), kind: z.string(),
      value: jsonValueSchema, sourceRefs: z.array(reference).min(1) }).passthrough()) }).passthrough()),
  }).passthrough(),
}).strict()
