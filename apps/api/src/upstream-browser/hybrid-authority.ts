import { z } from "zod"
import { jsonValueSchema, predicateSchema, valueSchemaSchema, type JsonValue, type TaskRequirement } from "@browser-capture/contracts"
import { evaluatePredicate } from "@browser-capture/runtime"
import { isDeepStrictEqual } from "node:util"
import { DomainError } from "../errors.js"

const record = z.record(z.string(), jsonValueSchema)
const refs = z.array(z.string().min(1)).min(1)
const selection = z.object({ id: z.string(), clauseRefs: refs, actionRefs: z.array(z.string().min(1)).default([]),
  strategy: z.enum(["ordinal", "title", "locator"]), target: record }).strict()
const branch = z.object({ id: z.string(), clauseRefs: refs, predicateSource: record, predicate: record,
  outcomes: z.record(z.string(), z.string()) }).strict()
const loop = z.object({ id: z.string(), clauseRefs: refs, bodyRef: z.string(), stableItemKey: record.nullable().default(null),
  maxIterations: z.number().int().min(1).max(10000), accumulator: record, continuePredicate: record,
  stopOutcomes: z.array(z.enum(["complete", "exhausted", "blocked", "failed"])).min(1) }).strict()
const invoke = z.object({ id: z.string(), clauseRefs: refs, chainId: z.string(), chainVersion: z.number().int().positive(),
  mode: z.enum(["once", "each", "batch"]), inputBindings: z.array(record), outputBindings: z.array(record),
  onItemFailure: z.enum(["stop", "continue", "pause"]) }).strict()
const annotation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("control_intent"), clauseRefs: refs, intent: z.union([selection, branch, loop, invoke]),
    confirmedBy: z.literal("user") }).strict(),
  z.object({ kind: z.literal("semantic_operation"), segmentEvidenceRefs: z.array(z.object({ ref: z.string(),
    digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).min(1), clauseRefs: refs,
    purpose: z.enum(["classify", "extract_semantics", "summarize", "rank_candidates", "semantic_dedupe"]),
    candidateIds: z.array(z.string()).max(300).nullable().default(null), inputFieldRefs: refs.max(100),
    proposedOutputSchema: valueSchemaSchema }).strict(),
])
export const hybridStepAuthoritySchema = z.object({
  clauses: z.array(z.object({ id: z.string().min(1), kind: z.enum(["input", "selection", "constraint", "output", "completion"]),
    expression: jsonValueSchema }).strict()).min(1),
  control: z.object({ selections: z.array(selection), branches: z.array(branch), loops: z.array(loop), invokes: z.array(invoke) }).strict(),
  acceptedAnnotations: z.array(annotation),
}).strict()
const document = z.object({ version: z.literal(1), steps: z.record(z.string().min(1), hybridStepAuthoritySchema) }).strict()

/** WHY：确认覆盖 Markdown 全文；只读取其中明确的结构条款，绝不把模型生成控制意图标为用户确认。 */
export function readHybridAuthority(requirement: TaskRequirement) {
  const body = requirement.definition?.body
  if (!body?.includes("```bat-compilation/v1")) {
    throw new DomainError("missing_control_intent", "structured_authority_missing")
  }
  if (!requirement.confirmation) throw new Error("hybrid_confirmed_requirement_required")
  const blocks = [...body.matchAll(/^```bat-compilation\/v1\s*\n([\s\S]*?)^```\s*$/gm)]
  if (blocks.length !== 1) throw new Error("hybrid_structured_requirement_ambiguous")
  const value = document.parse(JSON.parse(blocks[0]![1]!))
  if (!Object.keys(value.steps).length) throw new Error("hybrid_structured_requirement_empty")
  return value.steps
}

export function hybridStepAuthority(requirement: TaskRequirement, stepId: string) {
  const step = readHybridAuthority(requirement)[stepId]
  if (!step) throw new Error("missing_control_intent:step_authority_missing")
  return step
}

export function bindHybridControl(authority: z.infer<typeof hybridStepAuthoritySchema>, raw: unknown) {
  const source = z.object({ trace: z.object({ actions: z.array(z.object({ id: z.string(), args: record,
    preObservationRef: z.string().nullable() }).passthrough()), observations: z.array(z.object({ id: z.string(),
    facts: z.array(z.object({ kind: z.string(), value: jsonValueSchema }).passthrough()) }).passthrough()) }).passthrough() }).passthrough().parse(raw)
  const control = structuredClone(authority.control)
  for (const selection of control.selections) {
    if (selection.actionRefs.length) continue
    const target = { strategy: selection.strategy, ...selection.target }
    selection.actionRefs = source.trace.actions.filter((action) => source.trace.observations.find((item) => item.id === action.preObservationRef)
      ?.facts.some((fact) => fact.kind === "resolved_target" && isDeepStrictEqual(fact.value, {
        actionRef: action.id, index: action.args.index, target }))).map((action) => action.id)
  }
  return control
}

export function hybridBranchChoices(authority: z.infer<typeof hybridStepAuthoritySchema>, input: JsonValue) {
  const branches = [...authority.control.branches, ...authority.acceptedAnnotations.flatMap((item) =>
    item.kind === "control_intent" && "predicateSource" in item.intent ? [item.intent] : [])]
  return branches.map((intent) => {
    const predicate = predicateSchema.parse(intent.predicate)
    const bindings = predicate.operator === "exists" ? [predicate.value]
      : predicate.operator === "array_length_at_least" ? [predicate.value, predicate.minimum] : [predicate.left, predicate.right]
    if (intent.predicateSource.source !== "input" || bindings.some((binding) => !["input", "constant"].includes(binding.source))) {
      throw new Error("hybrid_source_branch_requires_pure_input")
    }
    return { branchId: intent.id, predicate: z.record(z.string(), jsonValueSchema).parse(predicate),
      outcome: evaluatePredicate(predicate, { input, variables: {}, nodeOutputs: {} }) ? "true" as const : "false" as const }
  })
}

export function assertHybridBranchEvidence(authority: z.infer<typeof hybridStepAuthoritySchema>, input: JsonValue, raw: unknown) {
  const source = z.object({ trace: z.object({ observations: z.array(z.object({ facts: z.array(z.object({ kind: z.string(), value: jsonValueSchema }).passthrough()) }).passthrough()) }).passthrough() }).passthrough().parse(raw)
  const actual = source.trace.observations.flatMap((observation) => observation.facts.filter((fact) => fact.kind === "branch_choice").map((fact) => fact.value))
  if (!isDeepStrictEqual(actual, hybridBranchChoices(authority, input))) throw new Error("hybrid_source_branch_evidence_mismatch")
}
