import {
  CONTRACT_VERSION, chainEdgePort, chainPresentationContentSchema, chainPresentationSchema, type ChainPresentation,
  type ChainPresentationContent, type TaskChain, type TaskPlan,
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
  const content = defaultPresentationContent(chain)
  // WHY：新链完整实现一个已确认计划步骤，直接复用该业务事实；不推测更细阶段，也不改写旧版展示。
  return createChainPresentation(chain, { ...content,
    stages: content.stages.map((stage) => ({ ...stage, title: step.title, summary: step.goal })) })
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

function validateStage(chain: TaskChain, stage: ChainPresentation["stages"][number], stageByNode: Map<string, string>) {
  if (stageByNode.get(chain.entry) === stage.id && stage.entryNodeId !== chain.entry) invalid("presentation_chain_entry")
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

function validateLayouts(presentation: ChainPresentation) {
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

function sameIdentity(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length
    && new Set(right).size === right.length && left.every((id) => right.includes(id))
}

function invalid(code: string): never {
  throw new DomainError(code, "链路展示结构与当前执行图不一致。", 409)
}
