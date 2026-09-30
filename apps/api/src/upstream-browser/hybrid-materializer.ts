import { validateHybridResponse } from "./hybrid-response.js"
import { sourceContext, digestCanonicalJson, type SourceContext } from "./hybrid-materializer-source.js"
import { materializeHybridNodes, rewriteBinding, connectSummaryNodes } from "./hybrid-materializer-nodes.js"
export { validateHybridResponse } from "./hybrid-response.js"
export { digestCanonicalJson } from "./hybrid-materializer-source.js"
import { assertNaturalDiscoveryExclusions } from "./hybrid-discovery.js"
import { assertActionResultReadiness } from "./hybrid-consumer-readiness.js"
import { isDeepStrictEqual } from "node:util"
import { applyReadRequirements } from "./hybrid-read-requirements.js"
import { z } from "zod"
import { CONTRACT_VERSION, jsonValueSchema, predicateSchema, requiredNodeOutcomes, taskChainSchema, taskPlanSchema, taskPlanExecutionIssues,
  valueBindingSchema, valueSchemaSchema, type JsonValue, type StableChainNode, type StableChainNodeV2, type TaskChain, type TaskDataContract,
  type TaskPlan, type TaskPlanStep, type ValueBinding, type ValueSchema } from "@browser-capture/contracts"
import { compactGeneratedFailureRoutes, digestJson } from "@browser-capture/runtime"
import { hybridAuthoritySchema, hybridCompilerResponseSchema, hybridNaturalRequestSchema, hybridResultBranchSchema,
  naturalSummarySegmentSchema,
  type HybridCompilation, type HybridSegment } from "./hybrid-schema.js"
import { materializeHybridOutput } from "./hybrid-output.js"
import { bindingSchemaInGraph, type BindingSchema } from "./hybrid-output-identity.js"
import { type ResolveHybridChild } from "./hybrid-invoke.js"
import { naturalPayloadContext, validateHybridRequestSources } from "./hybrid-natural-payload.js"
import { materializeNaturalResult } from "./hybrid-result.js"
import { assertRepeatAwareBinding, materializeNaturalRepeats, validateNaturalRepeats, type ValidatedNaturalRepeat } from "./hybrid-natural-repeat.js"
import { RUNTIME_SCOPE_FROM, RUNTIME_SCOPE_READ_ONLY, classifyRuntimeScopeDecisions, type RuntimeScopeDecision } from "./hybrid-runtime-scope.js"
import { detectNaturalPreparations, type NaturalPreparation } from "./hybrid-preparation.js"
import { materializeOrderedBranch, materializePreparationGraph, systemPromptForSemanticOperation, upgradeStableGraph } from "./hybrid-v2.js"

export { validateHybridRequestSources } from "./hybrid-natural-payload.js"

type Authority = z.infer<typeof hybridAuthoritySchema>
const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }
const contract = (id: string, schema: ValueSchema): TaskDataContract => ({ id, version: 1, dialect: "bat-value-schema/v1", schema })

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
  const discoveries = context.version === 2 ? assertNaturalDiscoveryExclusions({ compilation, request: context.request, payload: context.payload }) : new Set<string>()
  const repeats = context.version === 2 && compilation.compilerVersion === "bat-hybrid/2"
    ? validateNaturalRepeats({ compilation, request: context.request, assertFact: context.payload.assertFact,
      outputSchema: input.step.outputContract.schema }) : []
  const preparations = context.version === 2 && compilation.compilerVersion === "bat-hybrid/2"
    ? detectNaturalPreparations({ compilation, request: context.request, assertFact: context.payload.assertFact }) : []
  const runtimeScopes = new Map(context.version === 2 ? classifyRuntimeScopeDecisions({
    compilation, trace: context.request.trace, assertFact: context.payload.assertFact, discoveries,
  }).flatMap((decision) => decision.runtimeScopeFrom ? [[decision.segmentId, decision] as const] : []) : [])
  if (context.version === 2) assertActionResultReadiness(context, compilation, runtimeScopes)
  const missingTargetProducers = new Set(compilation.compilerVersion === "bat-hybrid/2"
    ? (compilation.resultBranches ?? []).flatMap((raw) => {
      const branch = hybridResultBranchSchema.parse(raw)
      return branch.missingProducerSegmentId ? [branch.missingProducerSegmentId] : []
    }) : [])
  const { nodes, summaries } = materializeHybridNodes({ compilation, context, model: input.model,
    runtimeScopes, repeats, missingTargetProducers, resolveChild: input.resolveChild })
  removeOptionalPreparationRuntimeScopes(nodes, preparations)
  const variables: Record<string, TaskDataContract> = {}
  const edges = structuredClone(compilation.controlGraph.edges)
  let entry = compilation.controlGraph.entry
  entry = connectSummaryNodes(edges, summaries, entry)
  const control = authority ? effectiveControl(request) : { selections: [], branches: [], loops: [], invokes: [] }
  const loops = materializeLoops(control, compilation, variables)
  const naturalLoops = materializeNaturalRepeats(repeats, { plan, step: input.step, nodes, variables, compilation, edges })
  loops.push(...naturalLoops.loops); nodes.push(...naturalLoops.branches)
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
    const nextInitializer = naturalLoops.initializers.get(loop.id), firstInitializer = nextInitializer ?? initializer
    for (const edge of edges) if (edge.to === loop.id && !loop.body.exits.includes(edge.from)) edge.to = firstInitializer.id
    if (entry === loop.id) entry = firstInitializer.id
    if (nextInitializer) {
      edges.push(...nextInitializer.outcomes.map((outcome) => ({ from: nextInitializer.id, outcome,
        to: outcome === "success" ? initializer.id : outcome })))
      nodes.push(nextInitializer)
    }
    edges.push(...initializer.outcomes.map((outcome) => ({ from: initializer.id, outcome,
      to: outcome === "success" ? loop.id : outcome })))
    nodes.push(initializer, loop)
  }
  return finalizeMaterializedChain(input, compilation, context, authority,
    { nodes, variables, edges, entry, loops, preparations, repeats })
}

function finalizeMaterializedChain(input: MaterializeHybridInput, compilation: HybridCompilation,
  context: SourceContext, authority: Authority | null, graph: {
    nodes: Array<StableChainNode | StableChainNodeV2>; variables: Record<string, TaskDataContract>;
    edges: Array<{ from: string; outcome: string; to: string }>; entry: string;
    loops: ReturnType<typeof materializeLoops>; preparations: NaturalPreparation[]; repeats: ValidatedNaturalRepeat[];
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
  const assembly = materializeSelectedOutput(authority, context, compilation, input.step.outputContract.schema, graph.repeats,
    binding => bindingSchemaInGraph(binding, input.step.inputContract.schema, nodes, variables))
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
  applyReadRequirements(prepared.nodes, prepared.edges)
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
  if (graph.repeats.length) for (const key of Object.keys(chain.budget) as Array<keyof TaskPlan["budget"]>) {
    chain.budget[key] = Math.min(chain.budget[key], input.plan.budget[key], input.step.budget[key])
  }
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

function materializeSelectedOutput(authority: Authority | null, context: SourceContext,
  compilation: HybridCompilation, outputSchema: ValueSchema, repeats: ValidatedNaturalRepeat[], sourceSchema: BindingSchema) {
  if (authority) return materializeHybridOutput(authority.requirement.clauses, compilation,
    (binding) => rewriteBinding(binding, compilation), sourceSchema)
  if (context.version !== 2 || compilation.compilerVersion !== "bat-hybrid/2") {
    throw new Error("hybrid_natural_source_mismatch")
  }
  return materializeNaturalResult({ compilation, request: context.request, payload: context.payload, outputSchema, repeats, sourceSchema,
    rewrite: (binding) => rewriteBinding(binding, compilation) })
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
