import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { CONTRACT_VERSION, jsonValueSchema, predicateSchema, requiredNodeOutcomes, taskChainSchema, taskPlanSchema, taskPlanExecutionIssues,
  valueBindingSchema, valueSchemaSchema, type JsonValue, type StableChainNode, type StableChainNodeV2, type TaskChain, type TaskDataContract,
  type TaskPlan, type TaskPlanStep, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { compactGeneratedFailureRoutes, digestJson } from "@browser-capture/runtime"
import { hybridAuthoritySchema, hybridCompilerResponseSchema, hybridNaturalRequestSchema, hybridResultBranchSchema,
  naturalSummarySegmentSchema,
  type HybridCompilation, type HybridSegment } from "./hybrid-schema.js"
import { materializeHybridOutput } from "./hybrid-output.js"
import { assertHybridChild, type ResolveHybridChild } from "./hybrid-invoke.js"
import { naturalPayloadContext, validateHybridRequestSources } from "./hybrid-natural-payload.js"
import { materializeNaturalResult } from "./hybrid-result.js"
import { RUNTIME_SCOPE_FROM, RUNTIME_SCOPE_READ_ONLY, classifyRuntimeScopeDecisions, type RuntimeScopeDecision } from "./hybrid-runtime-scope.js"
import { materializeNaturalSummary } from "./hybrid-summary.js"
import { assertNaturalBinding, assertResultDataSegment, assertNaturalReadSegment } from "./hybrid-natural-materialization.js"
import { materializeSelectionFunction } from "./hybrid-selection.js"
import { detectNaturalPreparations, type NaturalPreparation } from "./hybrid-preparation.js"
import { materializeOrderedBranch, materializePreparationGraph, systemPromptForSemanticOperation, upgradeStableGraph } from "./hybrid-v2.js"

export { validateHybridRequestSources } from "./hybrid-natural-payload.js"

type Authority = z.infer<typeof hybridAuthoritySchema>
const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }
const contract = (id: string, schema: ValueSchema): TaskDataContract => ({ id, version: 1, dialect: "bat-value-schema/v1", schema })

export function validateHybridResponse(raw: unknown) {
  const envelope = hybridCompilerResponseSchema.parse(raw), compilation = envelope.compilation
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
  return envelope
}

/** WHY：只物化受管 fork 已校验的区段；复用现有 IR/compiler，模型不能参与节点、边或预算生成。 */
type MaterializeHybridInput = { response: unknown; request: unknown; plan: TaskPlan; step: TaskPlanStep;
  version: number; model: string; resolveChild?: ResolveHybridChild }

export function materializeHybridChain(input: MaterializeHybridInput): TaskChain {
  const plan = taskPlanSchema.parse(input.plan)
  if (taskPlanExecutionIssues(plan).length || !isDeepStrictEqual(plan.steps.find((step) => step.id === input.step.id), input.step)) {
    throw new Error("hybrid_plan_step_mismatch")
  }
  const envelope = validateHybridResponse(input.response), { compilation } = envelope
  if (compilation.gaps.length || compilation.coverage.some((row) => row.disposition === "not_compilable")) {
    throw new Error("hybrid_compilation_gaps")
  }
  const request = z.record(z.string(), jsonValueSchema).parse(input.request)
  const payload = compilation.compilerVersion === "bat-hybrid/2"
    ? naturalPayloadContext(envelope, request) : (validateHybridRequestSources(envelope, request), null)
  const { authority, context } = sourceContext(compilation, request, input.plan, input.step, payload)
  const preparations = context.version === 2 && compilation.compilerVersion === "bat-hybrid/2"
    ? detectNaturalPreparations({ compilation, request: context.request, assertFact: context.payload.assertFact }) : []
  const runtimeScopes = new Map(context.version === 2 ? classifyRuntimeScopeDecisions({
    compilation, trace: context.request.trace, assertFact: context.payload.assertFact,
  }).flatMap((decision) => decision.runtimeScopeFrom ? [[decision.segmentId, decision] as const] : []) : [])
  const missingTargetProducers = new Set(compilation.compilerVersion === "bat-hybrid/2"
    ? (compilation.resultBranches ?? []).flatMap((raw) => {
      const branch = hybridResultBranchSchema.parse(raw)
      return branch.missingProducerSegmentId ? [branch.missingProducerSegmentId] : []
    }) : [])
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
      runtimeScopes.get(segment.id), missingTargetProducers.has(segment.id))]
  })
  removeOptionalPreparationRuntimeScopes(nodes, preparations)
  const variables: Record<string, TaskDataContract> = {}
  const edges = structuredClone(compilation.controlGraph.edges)
  let entry = compilation.controlGraph.entry
  for (const [segmentId, summary] of summaries) {
    for (const edge of edges) if (edge.to === segmentId) edge.to = summary.entry
    if (entry === segmentId) entry = summary.entry
    const merge = summary.nodes[0]!
    edges.push(...merge.outcomes.map((outcome) => ({ from: merge.id, outcome,
      to: outcome === "success" ? segmentId : outcome })))
  }
  const control = authority ? effectiveControl(request) : { selections: [], branches: [], loops: [], invokes: [] }
  const loops = materializeLoops(control, compilation, variables)
  nodes.push(...materializeBranches(control))
  if (context.version === 2 && compilation.compilerVersion === "bat-hybrid/2") {
    const resultBranches = (compilation.resultBranches ?? []).map((raw) => {
      const branch = hybridResultBranchSchema.parse(raw)
      return { id: branch.id, label: branch.controlRef, kind: "branch" as const, predicate: branch.predicate,
        writes: [], outputContract: unit, outcomes: [...requiredNodeOutcomes.branch] }
    })
    nodes.push(...resultBranches)
    // WHY：先保持编译证据完整，最终物化再统一压缩通用异常终态。
    edges.push(...resultBranches.map((branch) => ({ from: branch.id, outcome: "failed" as const, to: "failed" })))
  }
  for (const loop of loops) {
    const initializer = initializeCursor(loop)
    for (const edge of edges) if (edge.to === loop.id && !loop.body.exits.includes(edge.from)) edge.to = initializer.id
    if (entry === loop.id) entry = initializer.id
    edges.push(...initializer.outcomes.map((outcome) => ({ from: initializer.id, outcome,
      to: outcome === "success" ? loop.id : outcome })))
    nodes.push(initializer, loop)
  }
  return finalizeMaterializedChain(input, compilation, context, authority,
    { nodes, variables, edges, entry, loops, preparations })
}

function finalizeMaterializedChain(input: MaterializeHybridInput, compilation: HybridCompilation,
  context: SourceContext, authority: Authority | null, graph: {
    nodes: Array<StableChainNode | StableChainNodeV2>; variables: Record<string, TaskDataContract>;
    edges: Array<{ from: string; outcome: string; to: string }>; entry: string;
    loops: ReturnType<typeof materializeLoops>; preparations: NaturalPreparation[];
  }): TaskChain {
  const { nodes, variables, edges, loops, preparations } = graph
  let entry = graph.entry
  const last = compilation.segments.at(-1)
  let outputSchema = last?.kind === "explicit_llm" ? last.outputSchema
    : last?.kind === "function" ? last.draft.outputSchema : last?.outputs[0]?.schema ?? unit.schema
  let output: ValueBinding = last && outputSchema.type !== "null"
    ? { source: "node", nodeId: last.id, path: [] } : { source: "constant", value: null }
  const finalLoop = loops.find((loop) => last && loop.body.exits.includes(last.id) && loop.accumulators.length === 1)
  if (finalLoop) {
    const variable = finalLoop.accumulators[0]!.variable
    outputSchema = variables[variable]!.schema
    output = { source: "variable", name: variable, path: [] }
  }
  const assembly = materializeSelectedOutput(authority, context, compilation, input.step.outputContract.schema)
  if (assembly) {
    for (const edge of edges) if (edge.to === "completed") edge.to = assembly.entry
    if (entry === "completed") entry = assembly.entry
    nodes.push(...assembly.nodes); edges.push(...assembly.edges)
    for (const alternate of assembly.alternates ?? []) {
      for (const edge of edges) if (edge.to === alternate.terminalId) edge.to = alternate.entry
      if (entry === alternate.terminalId) entry = alternate.entry
      nodes.push(...alternate.nodes); edges.push(...alternate.edges)
    }
    if (assembly.alternates?.length) variables.result = contract("result", assembly.schema)
    outputSchema = assembly.schema; output = assembly.binding
  }
  if (!isDeepStrictEqual(outputSchema, input.step.outputContract.schema)) throw new Error("hybrid_final_output_contract_mismatch")
  nodes.push(...materializeTerminals(compilation, input.step, output))
  // 来源证据保留完整，公共 TaskChain 在末尾收掉重复通用异常终态。
  const targets = new Set([entry, ...edges.map((edge) => edge.to)])
  const reachableNodes = nodes.filter((node) => node.kind !== "terminal" || targets.has(node.id))
  const multiplier = loops.reduce((sum, loop) => sum + loop.maxIterations, 1)
  const modelCalls = compilation.segments.filter((segment) => segment.kind === "explicit_llm").length * multiplier
  const invokes = compilation.segments.flatMap((segment) => segment.kind === "deterministic" && segment.operation.name === "task-chain.invoke" ? [segment.operation] : [])
  const upgraded = upgradeStableGraph(reachableNodes, edges)
  const prepared = applyPreparationGraphs(upgraded, preparations, entry)
  entry = prepared.entry
  const browserNodes = prepared.nodes.filter((node) => node.kind === "capability"
    && node.capability.name.startsWith("browser."))
  const scopedBrowserNodes = browserNodes.filter((node) => "config" in node
    && z.record(z.string(), jsonValueSchema).safeParse(node.config).data?.[RUNTIME_SCOPE_FROM] !== undefined)
  const commands = (browserNodes.length + scopedBrowserNodes.length) * multiplier
    + invokes.reduce((sum, operation) => sum + operation.budget.maxBrowserCommands, 0) * multiplier
  const chain = taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v2",
    id: input.step.chain.id, taskId: input.plan.taskId, version: input.version,
    plan: { id: input.plan.id, version: input.plan.version, digest: digestJson(input.plan) }, stepId: input.step.id, name: input.step.title,
    inputContract: input.step.inputContract, outputContract: input.step.outputContract, variables, entry,
    nodes: prepared.nodes, edges: prepared.edges,
    completion: input.step.completion.map((condition) => ({ ...condition,
      predicate: rewritePredicate(condition.predicate, input.step.id, output,
        input.step.resultSpec?.mode === "execution") })),
    budget: { maxTransitions: Math.max(2, prepared.nodes.length * multiplier * 2) + invokes.reduce((sum, operation) => sum + operation.budget.maxTransitions, 0) * multiplier,
      maxBrowserCommands: commands,
      maxActiveMs: Math.max(1000, (prepared.nodes.reduce((sum, node) => sum + ("timeoutMs" in node ? node.timeoutMs : 0), 0)
        + invokes.reduce((sum, operation) => sum + operation.budget.maxActiveMs, 0)) * multiplier),
      maxLlmCalls: modelCalls + invokes.reduce((sum, operation) => sum + operation.budget.maxLlmCalls, 0) * multiplier,
      maxInvocations: 1 + invokes.reduce((sum, operation) => sum + operation.budget.maxInvocations, 0) * multiplier,
      maxDepth: Math.min(input.plan.budget.maxDepth, input.step.budget.maxDepth) },
    reuseBoundary: { description: authority ? "已确认需求、绑定、控制合同和固定公共能力版本。"
      : "已确认需求、自然来源证据和固定公共能力版本。", assumptions: ["复跑重新解析稳定目标。"],
      invalidationConditions: [authority ? "需求、控制合同、能力版本或证明条件改变。"
        : "需求、来源证据、能力版本或证明条件改变。"] },
    implementationSummary: `workflow-use hybrid ${compilation.canonicalDigest}`, validation: { status: "candidate", evidence: [] } })
  return compactGeneratedFailureRoutes(chain)
}

function removeOptionalPreparationRuntimeScopes(nodes: Array<StableChainNode | StableChainNodeV2>,
  preparations: NaturalPreparation[]) {
  const optional = new Set(preparations.flatMap((item) =>
    [item.preparation.actionSegmentId, item.preparation.consumerSegmentId]))
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!
    if (!optional.has(node.id) || node.kind !== "capability" || !("config" in node)) continue
    const parsed = z.record(z.string(), jsonValueSchema).safeParse(node.config)
    if (!parsed.success || !Object.hasOwn(parsed.data, RUNTIME_SCOPE_FROM)) continue
    const { [RUNTIME_SCOPE_FROM]: _scope, ...config } = parsed.data
    nodes[index] = { ...node, config }
  }
}

export function applyPreparationGraphs(graph: ReturnType<typeof upgradeStableGraph>, preparations: NaturalPreparation[],
  initialEntry: string) {
  const nodes = [...graph.nodes]
  let edges = [...graph.edges], entry = initialEntry
  for (const preparation of preparations) {
    const materialized = materializePreparationGraph(preparation)
    edges = edges.filter((edge) => !(edge.from === preparation.preparation.actionSegmentId
      && edge.port === "success" && edge.to === preparation.preparation.consumerSegmentId))
    for (const edge of edges) {
      if (edge.to === preparation.preparation.actionSegmentId) edge.to = materialized.entry
    }
    if (entry === preparation.preparation.actionSegmentId) entry = materialized.entry
    nodes.push(...materialized.nodes)
    edges.push(...materialized.edges)
  }
  return { nodes, edges, entry }
}

function effectiveControl(request: Record<string, JsonValue>) {
  const control = z.object({ selections: z.array(jsonValueSchema), branches: z.array(jsonValueSchema),
    loops: z.array(jsonValueSchema), invokes: z.array(jsonValueSchema) }).strict().parse(request.control)
  const annotations = z.array(z.record(z.string(), jsonValueSchema)).parse(request.acceptedAnnotations)
  for (const annotation of annotations) {
    if (annotation.kind !== "control_intent") continue
    const intent = z.record(z.string(), jsonValueSchema).parse(annotation.intent)
    const destination = "strategy" in intent ? control.selections : "bodyRef" in intent ? control.loops
      : "predicate" in intent || "cases" in intent ? control.branches : control.invokes
    destination.push(intent)
  }
  return control
}

type SourceContext = { version: 1; authority: Authority }
  | { version: 2; request: z.infer<typeof hybridNaturalRequestSchema>; payload: ReturnType<typeof naturalPayloadContext> }

function sourceContext(compilation: HybridCompilation, request: Record<string, JsonValue>, plan: TaskPlan,
  step: TaskPlanStep, payload: ReturnType<typeof naturalPayloadContext> | null): { authority: Authority | null; context: SourceContext } {
  const authority = compilation.compilerVersion === "bat-hybrid/1"
    ? hybridAuthoritySchema.parse({ requirement: request.requirement, plan: request.plan }) : null
  if (authority && (authority.plan.id !== plan.id || authority.plan.version !== plan.version
    || authority.plan.stepId !== step.id || authority.requirement.id !== plan.requirement.id
    || authority.requirement.version !== plan.requirement.version || authority.requirement.digest !== compilation.sourceDigests[0]
    || authority.plan.digest !== compilation.sourceDigests[1]
    || !isDeepStrictEqual(request.runtimeInputSchema, step.inputContract.schema))) throw new Error("hybrid_authority_mismatch")
  if (authority) return { authority, context: { version: 1, authority } }
  const natural = hybridNaturalRequestSchema.parse(request)
  if (natural.plan.id !== plan.id || natural.plan.version !== plan.version || natural.plan.stepId !== step.id
    || natural.plan.sourceDigest !== digestJson(plan) || natural.requirement.id !== plan.requirement.id
    || natural.requirement.version !== plan.requirement.version || natural.requirement.sourceDigest !== plan.requirement.digest
    || natural.plan.inputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.inputContract.schema))
    || natural.plan.outputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.outputContract.schema))
    || !step.resultSpec || !isDeepStrictEqual(natural.plan.resultSpec, step.resultSpec)
    || !isDeepStrictEqual(natural.runtimeInputSchema, step.inputContract.schema)) throw new Error("hybrid_natural_source_mismatch")
  if (!payload) throw new Error("hybrid_natural_source_payloads_missing")
  return { authority: null, context: { version: 2, request: natural, payload } }
}

function materializeSegment(segment: Exclude<HybridSegment, { kind: "function" }>, context: SourceContext, model: string, compilation: HybridCompilation,
  resolveChild?: ResolveHybridChild, runtimeScope?: RuntimeScopeDecision, missingTargetOutcome = false): StableChainNode {
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
        assertNaturalBinding(decision, context.request.trace, context.payload), compilation)
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

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(",")}}`
  return JSON.stringify(value)
}

export function digestCanonicalJson(value: JsonValue): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex")
}

function materializeSelectedOutput(authority: Authority | null, context: SourceContext,
  compilation: HybridCompilation, outputSchema: ValueSchema) {
  if (authority) return materializeHybridOutput(authority.requirement.clauses, compilation,
    (binding) => rewriteBinding(binding, compilation))
  if (context.version !== 2 || compilation.compilerVersion !== "bat-hybrid/2") {
    throw new Error("hybrid_natural_source_mismatch")
  }
  return materializeNaturalResult({ compilation, request: context.request, payload: context.payload, outputSchema,
    rewrite: (binding) => rewriteBinding(binding, compilation) })
}

function rewriteBinding(raw: unknown, compilation: HybridCompilation): ValueBinding {
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

function materializeTerminals(compilation: HybridCompilation, step: TaskPlanStep, output: ValueBinding): StableChainNode[] {
  return compilation.controlGraph.terminals.map((terminal) => {
    const status = terminal.status === "completed" ? "completed" : terminal.status === "cancelled" ? "cancelled"
      : terminal.status === "blocked" || terminal.status === "human_required" ? "blocked" : "failed"
    return { id: terminal.id, label: terminal.status, kind: "terminal", status, reason: terminal.status, outcomes: [], writes: [],
      outputContract: status === "completed" ? step.outputContract : unit,
      evidence: [{ source: "input", path: [] }], ...(status === "completed" ? {
        result: { name: "result", output: { kind: "value", value: output }, contract: step.outputContract } } : {}) }
  })
}

function rewritePredicate(raw: unknown, oldId: string, output: ValueBinding, executionReceipt = false) {
  const predicate = predicateSchema.parse(raw)
  // WHY：execution 步骤以到达 completed 终点证明成功，业务输出按合同必须是 null；
  // `exists(step output)` 表达的是“执行成功”而不是“null 是业务数据”，不能物化成恒假的 exists(null)。
  if (executionReceipt && predicate.operator === "exists" && predicate.value.source === "node"
    && predicate.value.nodeId === oldId && predicate.value.path.length === 0) {
    return predicateSchema.parse({ operator: "equals", left: { source: "constant", value: true },
      right: { source: "constant", value: true } })
  }
  const binding = (value: ValueBinding): ValueBinding => {
    if (value.source !== "node" || value.nodeId !== oldId) return value
    if (output.source === "constant") {
      if (value.path.length) throw new Error("hybrid_null_output_path")
      return output
    }
    return { ...output, path: [...output.path, ...value.path] }
  }
  if (predicate.operator === "exists") return { ...predicate, value: binding(predicate.value) }
  if (predicate.operator === "array_length_at_least") return { ...predicate, value: binding(predicate.value), minimum: binding(predicate.minimum) }
  return { ...predicate, left: binding(predicate.left), right: binding(predicate.right) }
}

function materializeLoops(raw: unknown, compilation: HybridCompilation,
  variables: Record<string, TaskDataContract>): Extract<StableChainNode, { kind: "loop" }>[] {
  const control = z.object({ loops: z.array(z.object({ id: z.string(), bodyRef: z.string(), maxIterations: z.number().int().positive(),
    continuePredicate: predicateSchema, accumulator: z.record(z.string(), jsonValueSchema) }).passthrough()) }).passthrough().parse(raw)
  return control.loops.map((intent) => {
    const body = compilation.controlGraph.edges.filter((edge) => edge.from === `loop-${intent.id}` && edge.outcome === "body")
    const start = compilation.segments.findIndex((segment) => segment.id === body[0]?.to)
    const exits = compilation.controlGraph.edges.filter((edge) => edge.to === `loop-${intent.id}` && edge.outcome === "success"
      && compilation.segments.findIndex((segment) => segment.id === edge.from) >= start)
    if (start < 0 || body.length !== 1 || exits.length !== 1) throw new Error("hybrid_loop_body_missing")
    const accumulators = []
    if (Object.keys(intent.accumulator).length) {
      const accumulator = z.object({ variable: z.string(), initial: valueBindingSchema, next: valueBindingSchema,
        operation: z.literal("append_unique"), stableKeyPath: z.array(z.union([z.string(), z.number().int().nonnegative()])),
        schema: valueSchemaSchema }).strict().parse(intent.accumulator)
      const { schema, ...configuration } = accumulator
      if (schema.type !== "array") throw new Error("hybrid_accumulator_array_required")
      variables[accumulator.variable] = contract(accumulator.variable, schema)
      accumulators.push({ ...configuration, initial: rewriteBinding(configuration.initial, compilation),
        next: rewriteBinding(configuration.next, compilation) })
    }
    const cursorVariable = `cursor-${intent.id}`
    variables[cursorVariable] = contract(cursorVariable, { type: "integer", minimum: 0, maximum: intent.maxIterations })
    return { id: `loop-${intent.id}`, label: intent.id, kind: "loop", writes: [], outputContract: unit,
      outcomes: [...requiredNodeOutcomes.loop], iteration: { mode: "while", condition: intent.continuePredicate },
      cursorVariable, maxIterations: intent.maxIterations, body: { entry: body[0]!.to, exits: [exits[0]!.from] }, accumulators }
  })
}

function initializeCursor(loop: Extract<StableChainNode, { kind: "loop" }>): StableChainNode {
  return { id: `init-${loop.id}`, label: "初始化循环游标", kind: "capability", capability: { name: "data.transform", version: 1 },
    input: { value: { source: "constant", value: 0 } }, config: { operation: "assign", arguments: { value: "value" } },
    effect: "read", timeoutMs: 1000, outputContract: contract(loop.cursorVariable, { type: "integer", minimum: 0 }),
    writes: [{ variable: loop.cursorVariable, path: [] }], outcomes: [...requiredNodeOutcomes.capability] }
}

function materializeBranches(raw: unknown): Array<StableChainNode | StableChainNodeV2> {
  const legacy = z.object({ id: z.string(), predicate: predicateSchema }).passthrough()
  const nway = z.object({ id: z.string(), cases: z.array(z.object({ id: z.string(), label: z.string(),
    predicate: predicateSchema }).passthrough()).min(1) }).passthrough()
  const control = z.object({ branches: z.array(z.union([legacy, nway])) }).passthrough().parse(raw)
  return control.branches.map((intent) => {
    if ("cases" in intent) {
      const parsed = nway.parse(intent)
      return materializeOrderedBranch({ id: `branch-${parsed.id}`, label: parsed.id, cases: parsed.cases })
    }
    return { id: `branch-${intent.id}`, label: intent.id, kind: "branch", predicate: intent.predicate,
      writes: [], outputContract: unit, outcomes: [...requiredNodeOutcomes.branch] }
  })
}
