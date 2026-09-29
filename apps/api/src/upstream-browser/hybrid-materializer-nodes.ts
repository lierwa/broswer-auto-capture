import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { jsonValueSchema, requiredNodeOutcomes, valueBindingSchema, type StableChainNode,
  type StableChainNodeV2, type TaskDataContract, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { naturalSummarySegmentSchema, type HybridCompilation, type HybridSegment } from "./hybrid-schema.js"
import { assertHybridChild, type ResolveHybridChild } from "./hybrid-invoke.js"
import { assertNaturalHumanSegment } from "./hybrid-natural-human.js"
import { assertResultDataSegment, assertNaturalReadSegment } from "./hybrid-natural-materialization.js"
import { assertRepeatAwareBinding, type ValidatedNaturalRepeat } from "./hybrid-natural-repeat.js"
import { RUNTIME_SCOPE_FROM, RUNTIME_SCOPE_READ_ONLY, type RuntimeScopeDecision } from "./hybrid-runtime-scope.js"
import { materializeNaturalSummary } from "./hybrid-summary.js"
import { materializeSelectionFunction } from "./hybrid-selection.js"
import { systemPromptForSemanticOperation } from "./hybrid-v2.js"
import type { SourceContext } from "./hybrid-materializer-source.js"

const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }
const contract = (id: string, schema: ValueSchema): TaskDataContract => ({ id, version: 1, dialect: "bat-value-schema/v1", schema })

export function connectSummaryNodes(edges: Array<{ from: string; outcome: string; to: string }>,
  summaries: ReadonlyMap<string, ReturnType<typeof materializeNaturalSummary>>, entry: string) {
  for (const [segmentId, summary] of summaries) {
    for (const edge of edges) if (edge.to === segmentId) edge.to = summary.entry
    if (entry === segmentId) entry = summary.entry
    const merge = summary.nodes[0]!
    edges.push(...merge.outcomes.map((outcome) => ({ from: merge.id, outcome,
      to: outcome === "success" ? segmentId : outcome })))
  }
  return entry
}

export function materializeHybridNodes(input: { compilation: HybridCompilation; context: SourceContext; model: string;
  runtimeScopes: ReadonlyMap<string, RuntimeScopeDecision>; repeats: ValidatedNaturalRepeat[];
  missingTargetProducers?: ReadonlySet<string>; resolveChild?: ResolveHybridChild | undefined }) {
  const { compilation, context, runtimeScopes, repeats, missingTargetProducers = new Set<string>() } = input
  const summaries = new Map<string, ReturnType<typeof materializeNaturalSummary>>()
  const nodes = compilation.segments.flatMap<StableChainNode | StableChainNodeV2>((segment) => {
    if (segment.kind === "function") {
      if (context.version !== 2) throw new Error("selection_function_source_mismatch")
      return [materializeSelectionFunction(segment, { request: context.request, compilation,
        assertFact: context.payload.assertFact })]
    }
    if (context.version === 2 && compilation.compilerVersion === "bat-hybrid/2" && segment.kind === "explicit_llm") {
      const summary = materializeNaturalSummary({ segment: naturalSummarySegmentSchema.parse(segment), compilation,
        request: context.request,
        assertFact: context.payload.assertFact, model: input.model })
      summaries.set(segment.id, summary)
      return summary.nodes
    }
    return [materializeSegment(segment, context, input.model, compilation, input.resolveChild,
      runtimeScopes.get(segment.id), missingTargetProducers.has(segment.id), repeats)]
  })
  return { nodes, summaries }
}

function materializeSegment(segment: Exclude<HybridSegment, { kind: "function" }>, context: SourceContext, model: string, compilation: HybridCompilation,
  resolveChild?: ResolveHybridChild, runtimeScope?: RuntimeScopeDecision, missingTargetOutcome = false,
  repeats: ValidatedNaturalRepeat[] = []): StableChainNode {
  const base = { id: segment.id, label: segment.id, writes: [] }
  if (segment.kind === "explicit_llm") {
    if (context.version !== 1) throw new Error("explicit_llm_declaration_missing")
    const operation = context.authority.plan.semanticOperations.find((item) => item.id === segment.operationId)
    if (!operation || !isDeepStrictEqual(operation.resultSchema, segment.outputSchema)
      || !isDeepStrictEqual(operation.candidateIds, segment.validation.candidateIds)) {
      throw new Error("explicit_llm_declaration_missing")
    }
    return { ...base, kind: "llm", model, instruction: systemPromptForSemanticOperation(operation),
      input: rewriteBinding(segment.inputBindings[0]!, compilation), timeoutMs: segment.budget.timeoutMs,
      outputContract: contract(segment.id, segment.outputSchema), outcomes: [...requiredNodeOutcomes.llm] }
  }
  if (segment.operation.name === "task-chain.invoke") {
    const operation = segment.operation
    const child = assertHybridChild(operation.chain, operation.budget, segment.outputs[0]?.schema, resolveChild)
    return { ...base, kind: "invoke", chain: operation.chain, input: rewriteBinding(operation.input, compilation),
      iteration: { mode: "once" }, outputContract: contract(segment.id, child.outputSchema), outcomes: [...requiredNodeOutcomes.invoke] }
  }
  const operation = segment.operation
  if (operation.name === "browser.wait-for-human") {
    if (context.version !== 2) throw new Error("hybrid_human_source_required")
    const human = assertNaturalHumanSegment(segment, context.request, compilation, context.payload.assertFact)
    return { ...base, label: human.prompt, kind: "capability", capability: { name: operation.name, version: 1 },
      human, config: {}, input: {}, effect: "read", timeoutMs: 10000,
      outputContract: unit, outcomes: [...requiredNodeOutcomes.capability] }
  }
  if (operation.name === "data.transform") {
    if (context.version !== 2) throw new Error("hybrid_result_derivation_source_invalid")
    const source = assertResultDataSegment(segment, context, compilation)
    return { ...base, kind: "capability", capability: { name: "data.transform", version: 1 },
      input: { source: rewriteBinding(source, compilation) },
      config: { operation: "count", arguments: { source: "source" } }, effect: "read", timeoutMs: 1000,
      outputContract: contract(segment.id, segment.outputs[0]!.schema), outcomes: [...requiredNodeOutcomes.capability] }
  }
  const anchorNavigation = segment.bindings.filter((decision) =>
    "derivation" in decision && decision.derivation === "anchor_navigation")
  if (anchorNavigation.length > 0 && (anchorNavigation.length !== 1 || segment.bindings.length !== 1
    || operation.name !== "browser.workflow-step" || operation.actionName !== "navigate"
    || segment.target !== null || segment.expectedEffect.kind !== "navigation")) {
    throw new Error("hybrid_anchor_navigation_segment_invalid")
  }
  const bindings: Record<string, ValueBinding> = {}
  for (const decision of segment.bindings) {
    if (decision.kind === "sample_evidence") throw new Error("hybrid_sample_value_leak")
    if (context.version === 2) {
      if (!("binding" in decision) || decision.binding === undefined) throw new Error("hybrid_natural_binding_missing")
      bindings[decision.argumentPath] = rewriteBinding(
        assertRepeatAwareBinding(decision, segment.id, repeats, context.request, context.payload), compilation)
      continue
    }
    const clause = context.authority.requirement.clauses.find((item) => item.id === decision.sourceRef)
    const expression = z.object({ actionName: z.string(), argumentPath: z.string(), binding: jsonValueSchema,
      actionRefs: z.array(z.string()).nullable().optional(), selectionRef: z.string().nullable().optional() }).strict().parse(clause?.expression)
    if (expression.argumentPath !== decision.argumentPath) throw new Error("hybrid_binding_mismatch")
    bindings[decision.argumentPath] = rewriteBinding(expression.binding, compilation)
  }
  if (context.version === 2 && operation.name === "browser.read-fields") {
    assertNaturalReadSegment(segment, context, compilation)
  }
  let target = segment.target
  let targetOrdinalInput: string | undefined
  if (target?.strategy === "structure" && target.ordinalBinding) {
    if (bindings.targetOrdinal) throw new Error("hybrid_reserved_target_input")
    bindings.targetOrdinal = rewriteBinding(target.ordinalBinding, compilation)
    const { ordinalBinding: _binding, ...runtimeTarget } = target
    target = runtimeTarget
    targetOrdinalInput = "targetOrdinal"
  }
  const readScope = segment.target && "scope" in segment.target ? segment.target.scope : undefined
  const runtimeConfig = runtimeScope?.runtimeScopeFrom ? { [RUNTIME_SCOPE_FROM]: runtimeScope.runtimeScopeFrom,
    ...(runtimeScope.readOnlySameDocument ? { [RUNTIME_SCOPE_READ_ONLY]: true } : {}) } : {}
  const config = operation.name === "browser.read-fields" ? { specification: operation.specification,
    ...(readScope ? { scope: readScope } : {}), ...runtimeConfig }
    : { actionName: operation.actionName, target, postconditions: segment.postconditions,
      ...(targetOrdinalInput ? { targetOrdinalInput } : {}),
      ...(missingTargetOutcome ? { missingTargetOutcome: true } : {}),
      ...runtimeConfig }
  return { ...base, kind: "capability", capability: { name: operation.name, version: operation.version }, input: bindings,
    config: jsonValueSchema.parse(config), effect: segment.expectedEffect.kind === "external_write" ? "external_write"
      : segment.expectedEffect.kind === "read" || segment.expectedEffect.kind === "none" ? "read" : "idempotent_write",
    timeoutMs: 180_000, outputContract: segment.outputs[0] ? contract(segment.id, segment.outputs[0].schema) : unit,
    outcomes: [...requiredNodeOutcomes.capability] }
}


export function rewriteBinding(raw: unknown, compilation: HybridCompilation): ValueBinding {
  // WHY：条款引用只属于编译证据；解析成真实节点后再进入公共 ValueBinding 契约。
  const clauseBinding = z.object({ source: z.literal("node"), nodeId: z.string().regex(/^clause:[a-zA-Z0-9_-]+$/),
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])) }).strict().safeParse(raw)
  const binding = clauseBinding.success ? clauseBinding.data : valueBindingSchema.parse(raw)
  if (binding.source !== "node") return binding
  const direct = compilation.segments.find((segment) => segment.id === binding.nodeId)
  if (direct?.kind === "function" || (direct?.kind === "deterministic" && direct.operation.name === "data.transform")) return binding
  if (binding.nodeId.startsWith("clause:")) {
    const clause = binding.nodeId.slice("clause:".length)
    const matches = compilation.segments.filter((segment) => segment.kind === "deterministic"
      && segment.outputs.some((output) => output.sourceRef === clause))
    if (matches.length !== 1) throw new Error("hybrid_prior_output_clause_ambiguous")
    return valueBindingSchema.parse({ ...binding, nodeId: matches[0]!.id })
  }
  const row = compilation.coverage.find((item) => item.actionRef === binding.nodeId)
  if (!row?.ownerSegmentId) throw new Error("hybrid_prior_output_unavailable")
  return { ...binding, nodeId: row.ownerSegmentId }
}
