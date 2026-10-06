import {
  CONTRACT_VERSION, chainEdgePort, chainPresentationContentSchema, chainPresentationSchema, type ChainEdge, type ChainEdgeV2, type ChainNode, type ChainPresentation,
  type ChainPresentationContent, type StableChainNodeV2, type TaskChain, type TaskPlan,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import { CAPABILITY_DESCRIPTOR_REGISTRY_VERSION } from "./capability-descriptors.js"

export function presentationDigest(value: Omit<ChainPresentation, "presentationDigest">) {
  return digestJson(value)
}

export function createChainPresentation(chain: TaskChain, content?: ChainPresentationContent) {
  const details = content ? chainPresentationContentSchema.parse(content) : defaultPresentationContent(chain)
  const base = { contractVersion: CONTRACT_VERSION, kind: "chain_presentation" as const,
    chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) },
    descriptorRegistryVersion: CAPABILITY_DESCRIPTOR_REGISTRY_VERSION,
    ...details }
  return validateChainPresentation(chain, chainPresentationSchema.parse({ ...base,
    presentationDigest: presentationDigest(base) }))
}

export function createStepChainPresentation(chain: TaskChain,
  step: Pick<TaskPlan["steps"][number], "id" | "title" | "goal">) {
  if (chain.stepId !== step.id) invalid("presentation_plan_step_mismatch")
  // WHY：一个已确认业务步骤拥有一条链路；技术动作属于它，不能用动作合并规则另猜业务阶段。
  return createChainPresentation(chain, groupedPresentationContent(chain, step))
}

export type PreparationPresentationInput = {
  step: Pick<TaskPlan["steps"][number], "id" | "title" | "goal">
  nodes: StableChainNodeV2[]
  edges: ChainEdgeV2[]
  previous?: ChainPresentationContent
}

export function createPreparationPresentation(input: PreparationPresentationInput) {
  const graph: PresentationGraph = { nodes: input.nodes, edges: input.edges }
  const previous = input.previous ? validatePreviousPreparation(input.previous, input.nodes) : undefined
  return validatePreparationPresentation(graph, groupedPresentationContent(graph, input.step, previous))
}

export function ungroupedPreparationPresentation(nodes: StableChainNodeV2[], edges: ChainEdgeV2[]) {
  const executable = nodes.filter((node) => node.kind !== "terminal")
  if (!executable.length) return { stages: [], overviewLayout: [], focusLayouts: [] }
  const nodeIds = executable.map((node) => node.id), inStage = new Set(nodeIds)
  const exits = edges.filter((edge) => inStage.has(edge.from) && !inStage.has(edge.to)).map((edge) => ({
    id: stageExitId(edge), label: edge.port, sourceNodeId: edge.from, sourcePort: edge.port,
  }))
  return chainPresentationContentSchema.parse({ stages: [{ id: "ungrouped-actions", title: "未分组动作",
    summary: "当前生成节点尚未形成可用阶段展示。", nodeIds, entryNodeId: nodeIds[0]!, exits }],
  overviewLayout: [{ stageId: "ungrouped-actions", x: 0, y: 0 }],
  focusLayouts: [{ stageId: "ungrouped-actions", nodes: nodeIds.map((nodeId, index) => ({
    nodeId, x: index * 300, y: 0,
  })) }] })
}

export function presentationForRevision(chain: TaskChain, current: ChainPresentation) {
  return createChainPresentation(chain, {
    stages: current.stages, overviewLayout: current.overviewLayout, focusLayouts: current.focusLayouts,
  })
}

export function validateChainPresentation(chain: TaskChain, raw: unknown) {
  const presentation = chainPresentationSchema.parse(raw)
  const reference = presentation.chain
  if (reference.id !== chain.id || reference.version !== chain.version
    || reference.digest !== executableChainDigest(chain)) invalid("presentation_chain_mismatch")
  const { presentationDigest: _digest, ...content } = presentation
  if (presentation.presentationDigest !== presentationDigest(content)) invalid("presentation_digest_mismatch")
  if (presentation.descriptorRegistryVersion !== CAPABILITY_DESCRIPTOR_REGISTRY_VERSION) {
    invalid("presentation_descriptor_registry_unknown")
  }
  const executableNodes = chain.nodes.filter((node) => node.kind !== "terminal")
  const assignments = presentation.stages.flatMap((stage) => stage.nodeIds.map((nodeId) => [nodeId, stage.id] as const))
  if (assignments.length !== executableNodes.length || new Set(assignments.map(([nodeId]) => nodeId)).size !== assignments.length
    || executableNodes.some((node) => !assignments.some(([nodeId]) => nodeId === node.id))) invalid("presentation_stage_coverage")
  const nodes = new Map(chain.nodes.map((node) => [node.id, node]))
  const stageByNode = new Map(assignments)
  if (assignments.some(([nodeId]) => nodes.get(nodeId)?.kind === "terminal" || !nodes.has(nodeId))) {
    invalid("presentation_stage_node_unknown")
  }
  for (const stage of presentation.stages) validateStage(chain, stage, stageByNode)
  validateLayouts(presentation)
  return presentation
}

type PresentationGraph = { nodes: ChainNode[]; edges: ChainEdge[]; entry?: string;
  completion?: TaskChain["completion"] }

function validateStage(chain: PresentationGraph, stage: ChainPresentation["stages"][number], stageByNode: Map<string, string>) {
  if (chain.entry && stageByNode.get(chain.entry) === stage.id && stage.entryNodeId !== chain.entry) {
    invalid("presentation_chain_entry")
  }
  const reachable = new Set([stage.entryNodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const edge of chain.edges) if (reachable.has(edge.from) && stageByNode.get(edge.to) === stage.id
      && !reachable.has(edge.to)) { reachable.add(edge.to); changed = true }
  }
  if (stage.nodeIds.some((nodeId) => !reachable.has(nodeId))) invalid("presentation_stage_unreachable")
  for (const edge of chain.edges) {
    const sourceStage = stageByNode.get(edge.from), targetStage = stageByNode.get(edge.to)
    if (targetStage === stage.id && sourceStage !== stage.id && edge.to !== stage.entryNodeId) {
      invalid("presentation_stage_external_entry")
    }
  }
  const expected = chain.edges.filter((edge) => stageByNode.get(edge.from) === stage.id
    && stageByNode.get(edge.to) !== stage.id).map((edge) => `${edge.from}:${chainEdgePort(edge)}`)
  const declared = stage.exits.map((exit) => `${exit.sourceNodeId}:${exit.sourcePort}`)
  if (new Set(expected).size !== expected.length || new Set(declared).size !== declared.length
    || expected.length !== declared.length || expected.some((key) => !declared.includes(key))) {
    invalid("presentation_stage_exit_mismatch")
  }
}

function validateLayouts(presentation: Pick<ChainPresentationContent, "stages" | "overviewLayout" | "focusLayouts">) {
  const stageIds = presentation.stages.map((stage) => stage.id)
  if (!sameIdentity(stageIds, presentation.overviewLayout.map((item) => item.stageId))
    || !sameIdentity(stageIds, presentation.focusLayouts.map((item) => item.stageId))) {
    invalid("presentation_layout_stage_mismatch")
  }
  for (const layout of presentation.focusLayouts) {
    const stage = presentation.stages.find((item) => item.id === layout.stageId)!
    if (!sameIdentity(stage.nodeIds, layout.nodes.map((item) => item.nodeId))) invalid("presentation_layout_node_mismatch")
  }
}

function validatePreviousPreparation(raw: ChainPresentationContent, nodes: StableChainNodeV2[]) {
  const previous = chainPresentationContentSchema.parse(raw), known = new Set(nodes.map((node) => node.id))
  const assigned = previous.stages.flatMap((stage) => stage.nodeIds)
  if (new Set(assigned).size !== assigned.length || assigned.some((nodeId) => !known.has(nodeId))) {
    throw new Error("preparation_presentation_previous_mismatch")
  }
  validateLayouts(previous)
  return previous
}

function validatePreparationPresentation(graph: PresentationGraph, raw: ChainPresentationContent) {
  const presentation = chainPresentationContentSchema.parse(raw)
  const executable = graph.nodes.filter((node) => node.kind !== "terminal"), known = new Map(graph.nodes.map((node) => [node.id, node]))
  const assignments = presentation.stages.flatMap((stage) => stage.nodeIds.map((nodeId) => [nodeId, stage.id] as const))
  if (assignments.length !== executable.length || new Set(assignments.map(([nodeId]) => nodeId)).size !== assignments.length
    || executable.some((node) => !assignments.some(([nodeId]) => nodeId === node.id))
    || assignments.some(([nodeId]) => known.get(nodeId)?.kind === "terminal" || !known.has(nodeId))) {
    throw new Error("preparation_presentation_stage_coverage")
  }
  const stageByNode = new Map(assignments)
  for (const stage of presentation.stages) validateStage(graph, stage, stageByNode)
  validateLayouts(presentation)
  return presentation
}

function defaultPresentationContent(chain: TaskChain): ChainPresentationContent {
  const nodes = chain.nodes.filter((node) => node.kind !== "terminal")
  if (!nodes.length) return { stages: [], overviewLayout: [], focusLayouts: [] }
  const nodeIds = nodes.map((node) => node.id), inStage = new Set(nodeIds)
  const exits = chain.edges.filter((edge) => inStage.has(edge.from) && !inStage.has(edge.to)).map((edge, index) => ({
    id: `exit-${index + 1}`, label: chainEdgePort(edge), sourceNodeId: edge.from, sourcePort: chainEdgePort(edge),
  }))
  const stage = { id: "ungrouped-actions", title: "未分组动作", summary: "当前版本尚未建立业务阶段分组。",
    nodeIds, entryNodeId: chain.entry, exits }
  return { stages: [stage], overviewLayout: [{ stageId: stage.id, x: 0, y: 0 }],
    focusLayouts: [{ stageId: stage.id, nodes: nodeIds.map((nodeId, index) => ({
      nodeId, x: index % 2 * 300, y: Math.floor(index / 2) * 150,
    })) }] }
}

function groupedPresentationContent(chain: PresentationGraph,
  step: Pick<TaskPlan["steps"][number], "title" | "goal">,
  previous?: ChainPresentationContent): ChainPresentationContent {
  const executable = controlFlowNodes(chain)
  if (!executable.length) return { stages: [], overviewLayout: [], focusLayouts: [] }
  const groups = [executable]
  const stageByNode = new Map<string, string>()
  const usedIds = new Set<string>()
  const stages: ChainPresentationContent["stages"] = groups.map((nodes) => {
    const retained = retainedStage(nodes, previous)
    const id = retained?.id ?? stableStageId(nodes, usedIds)
    if (usedIds.has(id)) throw new Error("preparation_presentation_stage_identity")
    usedIds.add(id)
    for (const node of nodes) stageByNode.set(node.id, id)
    const title = step.title
    const summary = step.goal
    return { id, title, summary, nodeIds: nodes.map((node) => node.id),
      entryNodeId: stageCandidateEntry(chain, nodes) ?? nodes[0]!.id, exits: [] }
  })
  for (const stage of stages) {
    const inStage = new Set(stage.nodeIds)
    stage.exits = chain.edges.filter((edge) => inStage.has(edge.from) && stageByNode.get(edge.to) !== stage.id)
      .map((edge) => ({ id: stageExitId(edge), label: chainEdgePort(edge),
        sourceNodeId: edge.from, sourcePort: chainEdgePort(edge) }))
  }
  return { stages, overviewLayout: stages.map((stage, index) => previous?.overviewLayout
      .find((item) => item.stageId === stage.id) ?? { stageId: stage.id, x: index * 340, y: 0 }),
    focusLayouts: stages.map((stage) => {
      const retained = previous?.focusLayouts.find((item) => item.stageId === stage.id)
      return { stageId: stage.id, nodes: stage.nodeIds.map((nodeId, index) => retained?.nodes
        .find((item) => item.nodeId === nodeId) ?? { nodeId, x: index * 300, y: 0 }) }
    }) }
}

function retainedStage(nodes: ChainNode[], previous?: ChainPresentationContent) {
  if (!previous) return undefined
  const nodeIds = new Set(nodes.map((node) => node.id))
  const candidates = previous.stages.filter((stage) => stage.nodeIds.every((nodeId) => nodeIds.has(nodeId)))
  return candidates.length === 1 ? candidates[0] : undefined
}

function stableStageId(nodes: ChainNode[], used: Set<string>) {
  const anchor = nodes.find(isBrowserAction) ?? nodes[0]!
  const digest = digestJson(anchor.id)
  for (const length of [16, 24, 32, 40, 48, 56]) {
    const candidate = `stage-${digest.slice(0, length)}`
    if (!used.has(candidate)) return candidate
  }
  throw new Error("preparation_presentation_stage_identity")
}

function stageExitId(edge: ChainEdge) {
  return `exit-${digestJson({ from: edge.from, port: chainEdgePort(edge), to: edge.to }).slice(0, 16)}`
}

function stageCandidateEntry(chain: PresentationGraph, nodes: ChainNode[]) {
  const ids = new Set(nodes.map((node) => node.id))
  const externalTargets = [...new Set(chain.edges.filter((edge) => !ids.has(edge.from) && ids.has(edge.to)).map((edge) => edge.to))]
  const entry = chain.entry && ids.has(chain.entry) ? chain.entry
    : externalTargets.length === 1 ? externalTargets[0] : externalTargets.length === 0 ? nodes[0]?.id : undefined
  if (!entry) return null
  const reachable = new Set([entry])
  let changed = true
  while (changed) {
    changed = false
    for (const edge of chain.edges) if (reachable.has(edge.from) && ids.has(edge.to) && !reachable.has(edge.to)) {
      reachable.add(edge.to); changed = true
    }
  }
  return nodes.every((node) => reachable.has(node.id)) ? entry : null
}

function isBrowserAction(node: ChainNode) {
  if (node.kind === "browser") return true
  return node.kind === "capability" && node.capability.name === "browser.workflow-step"
}

function controlFlowNodes(chain: PresentationGraph) {
  const executable = new Map(chain.nodes.filter((node) => node.kind !== "terminal").map((node) => [node.id, node]))
  if (!chain.entry) return [...executable.values()]
  const ordered: ChainNode[] = [], visited = new Set<string>(), pending = [chain.entry]
  while (pending.length) {
    const id = pending.shift()!
    if (visited.has(id)) continue
    visited.add(id)
    const node = executable.get(id)
    if (node) ordered.push(node)
    const successors = chain.edges.filter((edge) => edge.from === id)
      .sort((left, right) => `${chainEdgePort(left)}:${left.to}`.localeCompare(`${chainEdgePort(right)}:${right.to}`))
    pending.push(...successors.map((edge) => edge.to))
  }
  ordered.push(...[...executable.values()].filter((node) => !visited.has(node.id))
    .sort((left, right) => left.id.localeCompare(right.id)))
  return ordered
}

function sameIdentity(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length
    && new Set(right).size === right.length && left.every((id) => right.includes(id))
}

function invalid(code: string): never {
  throw new DomainError(code, "链路展示结构与当前执行图不一致。", 409)
}
