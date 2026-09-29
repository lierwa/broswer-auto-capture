import { isDeepStrictEqual } from "node:util"
import { applyReadRequirements } from "./hybrid-read-requirements.js"
import { z } from "zod"
import { jsonValueSchema, nodeBindings, taskPlanSchema, taskPlanExecutionIssues, type TaskPlan, type TaskPlanStep,
  type StableChainNodeV2 } from "@browser-capture/contracts"
import { validateHybridPrefixResponse, type HybridPrefixResponse } from "./hybrid-prefix-schema.js"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"
import { sourceContext } from "./hybrid-materializer-source.js"
import { materializeHybridNodes, connectSummaryNodes } from "./hybrid-materializer-nodes.js"
import { assertNaturalDiscoveryExclusions } from "./hybrid-discovery.js"
import { classifyRuntimeScopeDecisions } from "./hybrid-runtime-scope.js"
import { assertActionResultReadiness } from "./hybrid-consumer-readiness.js"
import { validateSelectionFunctions } from "./hybrid-selection.js"
import { upgradeStableGraph } from "./hybrid-v2.js"

export async function materializeHybridPrefix(input: { response: unknown; request: unknown;
  plan: TaskPlan; step: TaskPlanStep; model: string }, signal: AbortSignal) {
  signal.throwIfAborted()
  const plan = taskPlanSchema.parse(input.plan)
  if (taskPlanExecutionIssues(plan).length || !isDeepStrictEqual(plan.steps.find(step => step.id === input.step.id), input.step)) {
    throw new Error("hybrid_plan_step_mismatch")
  }
  const envelope = validateHybridPrefixResponse(input.response), { compilation } = envelope
  const request = z.record(z.string(), jsonValueSchema).parse(input.request)
  const payload = naturalPayloadContext(envelope, request)
  payload.assertTraceEvidence()
  const { context } = sourceContext(compilation, request, input.plan, input.step, payload)
  if (context.version !== 2) throw new Error("hybrid_prefix_source_required")
  assertPrefixCoverage(envelope, context.request.trace.actions.map(action => action.id))
  await validateSelectionFunctions(envelope, request, signal)
  const discoveries = assertNaturalDiscoveryExclusions({ compilation, request: context.request, payload })
  const runtimeScopes = new Map(classifyRuntimeScopeDecisions({ compilation,
    trace: context.request.trace, assertFact: payload.assertFact, discoveries,
  }).flatMap(decision => decision.runtimeScopeFrom ? [[decision.segmentId, decision] as const] : []))
  assertActionResultReadiness(context, compilation, runtimeScopes)
  const { nodes, summaries } = materializeHybridNodes({ compilation, context, model: input.model,
    runtimeScopes, repeats: [] })
  const edges = structuredClone(compilation.controlGraph.edges)
  connectSummaryNodes(edges, summaries, "")
  const graph = upgradeStableGraph(nodes, edges)
  signal.throwIfAborted()
  // WHY：片段没有入口或终点；缺口之后的现场/控制依赖未闭合，不能用样本 scope 冒充稳定节点。
  const barrier = compilation.coverage.findIndex(row => row.disposition === "not_compilable")
  const allowed = new Set(compilation.coverage.slice(0, barrier < 0 ? undefined : barrier)
    .flatMap(row => row.ownerSegmentId ? [row.ownerSegmentId] : []))
  const retained = closedNodes(graph.nodes.filter(node => allowed.has(node.id)
    || compilation.segments.some(segment => allowed.has(segment.id)
      && (node.id === `selection-${segment.id.slice(2)}` || summaries.get(segment.id)?.nodes.some(item => item.id === node.id)))))
  const ids = new Set(retained.map(node => node.id))
  applyReadRequirements(retained, graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)))
  return { nodes: retained, edges: graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)) }
}

function assertPrefixCoverage(envelope: HybridPrefixResponse, actions: string[]) {
  const { compilation } = envelope
  if (actions.length !== compilation.coverage.length
    || compilation.coverage.some((row, index) => row.actionRef !== actions[index])) {
    throw new Error("hybrid_prefix_coverage_mismatch")
  }
  const waiting = new Set<string>()
  for (const dependency of compilation.dependencies) {
    const key = `${dependency.actionRef}:${dependency.kind}`
    if (waiting.has(key) || !compilation.coverage.some(row => row.actionRef === dependency.actionRef
      && row.disposition === "not_compilable" && row.ownerSegmentId === null)) {
      throw new Error("hybrid_prefix_dependency_mismatch")
    }
    waiting.add(key)
  }
  for (const row of compilation.coverage) {
    if (row.disposition === "not_compilable" && !compilation.dependencies.some(item => item.actionRef === row.actionRef)
      && !compilation.gaps.some(item => item.actionRefs.includes(row.actionRef))) {
      throw new Error("hybrid_prefix_unexplained_gap")
    }
  }
}

function closedNodes(nodes: StableChainNodeV2[]) {
  let current = nodes
  for (;;) {
    const ids = new Set(current.map(node => node.id))
    const next = current.filter(node => nodeReferences(node).every(id => ids.has(id)))
    if (next.length === current.length) return current
    current = next
  }
}

function nodeReferences(node: StableChainNodeV2): string[] {
  const refs = nodeBindings(node).flatMap(binding => binding.source === "node" ? [binding.nodeId] : [])
  if (node.kind !== "capability" || !node.config || typeof node.config !== "object" || Array.isArray(node.config)) return refs
  const config = node.config
  // WHY：只检查受管浏览器配置；业务输出恰好叫 consumerRef/runtimeScopeFrom 不构成图依赖。
  if (!node.capability.name.startsWith("browser.")) return refs
  if (typeof config.runtimeScopeFrom === "string") refs.push(config.runtimeScopeFrom)
  if (Array.isArray(config.postconditions)) for (const condition of config.postconditions) {
    if (condition && typeof condition === "object" && !Array.isArray(condition)
      && typeof condition.consumerRef === "string") refs.push(condition.consumerRef)
  }
  return refs
}
