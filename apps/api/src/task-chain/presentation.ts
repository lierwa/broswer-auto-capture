import {
  CONTRACT_VERSION, chainEdgePort, chainNodeDisplayTitle, chainPresentationContentSchema, chainPresentationSchema, nodeBindings,
  predicateBindings, type ChainEdge, type ChainEdgeV2, type ChainNode, type ChainPresentation,
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
  // WHY：阶段只来自冻结控制流和节点证据；业务词不足时宁可显示真实动作，也不从 URL 或 Function 源码臆测。
  return createChainPresentation(chain, groupedPresentationContent(chain, step, undefined, true))
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
  return validatePreparationPresentation(graph, groupedPresentationContent(graph, input.step, previous, false))
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
  previous?: ChainPresentationContent, final = false): ChainPresentationContent {
  const executable = controlFlowNodes(chain)
  if (!executable.length) return { stages: [], overviewLayout: [], focusLayouts: [] }
  const groups = deterministicStageGroups(chain, executable, final)
  const stageByNode = new Map<string, string>()
  const usedIds = new Set<string>()
  const stages: ChainPresentationContent["stages"] = groups.map((nodes) => {
    const retained = retainedStage(nodes, previous)
    const id = retained?.id ?? stableStageId(nodes, usedIds)
    if (usedIds.has(id)) throw new Error("preparation_presentation_stage_identity")
    usedIds.add(id)
    for (const node of nodes) stageByNode.set(node.id, id)
    const titles = nodes.map(chainNodeDisplayTitle)
    const title = stageTitle(nodes, titles, step)
    const summary = titles.length === 1 ? titles[0]! : titles.slice(0, 4).join(" → ")
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

function deterministicStageGroups(chain: PresentationGraph, nodes: ChainNode[], final: boolean) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const order = new Map(nodes.map((node, index) => [node.id, index]))
  const consumers = new Map<string, string[]>()
  const variableWriters = new Map<string, string[]>()
  for (const node of nodes) for (const write of node.writes) {
    const writers = variableWriters.get(write.variable) ?? []
    writers.push(node.id); variableWriters.set(write.variable, writers)
  }
  const recordConsumer = (binding: ReturnType<typeof nodeBindings>[number], consumerId: string) => {
    const producers = binding.source === "node" ? [binding.nodeId]
      : binding.source === "variable" ? variableWriters.get(binding.name) ?? [] : []
    for (const producer of producers) {
      const values = consumers.get(producer) ?? []
      if (!values.includes(consumerId)) values.push(consumerId)
      consumers.set(producer, values)
    }
  }
  for (const node of chain.nodes) for (const binding of nodeBindings(node)) recordConsumer(binding, node.id)
  for (const condition of chain.completion ?? []) for (const binding of predicateBindings(condition.predicate)) {
    recordConsumer(binding, `completion-${condition.id}`)
  }
  let groups = nodes.map((node) => [node])
  const merge = (nodeIds: string[]) => {
    const requested = new Set(nodeIds)
    const selected = groups.filter((group) => group.some((node) => requested.has(node.id)))
    if (selected.length < 2) return
    const candidate = selected.flat().sort((left, right) => order.get(left.id)! - order.get(right.id)!)
    if (!validStageCandidate(chain, candidate)) return
    const selectedSet = new Set(selected)
    const insertion = Math.min(...selected.map((group) => groups.indexOf(group)))
    groups = groups.filter((group) => !selectedSet.has(group))
    groups.splice(insertion, 0, candidate)
  }

  // 独占值依赖可证明“读取/确定性选择”只服务这个动作；共享 producer 不能被吞进某一个阶段。
  for (const action of nodes.filter(isBrowserAction)) {
    const support = exclusiveSupport(action.id, byId, consumers)
    merge([...support, action.id])
  }
  // 无目标 send_keys 延续前一 input 的已知焦点；这是原生动作合同，不靠同 URL 或页面词义猜测。
  for (const inputNode of nodes.filter((node) => workflowActionName(node) === "input")) {
    const successor = chain.edges.find((edge) => edge.from === inputNode.id && chainEdgePort(edge) === "success")?.to
    const next = successor ? byId.get(successor) : undefined
    if (next && workflowActionName(next) === "send_keys" && workflowTarget(next) === null) merge([inputNode.id, next.id])
  }
  // 动作自带 consumerRef 证明后续读取是它的 readiness；若该读取另有值消费者，则留给后续真实依赖。
  for (const action of nodes.filter(isBrowserAction)) for (const consumerRef of readinessConsumers(action)) {
    const read = byId.get(consumerRef)
    if (read && isReadFields(read) && !(consumers.get(read.id)?.length)
      && reachableWithinChain(chain, action.id, read.id)) merge([action.id, read.id])
  }
  // 从 completed terminal 的正式输出/证据反向追踪；展示标题绝不能反过来决定业务分组。
  for (const terminal of final ? chain.nodes.filter((node) => node.kind === "terminal" && node.status === "completed") : []) {
    for (const binding of nodeBindings(terminal)) {
      if (binding.source !== "node") continue
      const tail = outputTail(binding.nodeId, terminal.id, byId, consumers)
      if (tail.length > 1) merge(tail)
    }
  }
  return groups
}

function exclusiveSupport(consumerId: string, nodes: Map<string, ChainNode>, consumers: Map<string, string[]>) {
  const found = new Set<string>()
  const visit = (id: string) => {
    const node = nodes.get(id)
    if (!node) return
    for (const binding of nodeBindings(node)) {
      if (binding.source !== "node" || found.has(binding.nodeId)) continue
      const producer = nodes.get(binding.nodeId)
      if (!producer || !isDeterministicSupport(producer)
        || consumers.get(producer.id)?.length !== 1) continue
      found.add(producer.id); visit(producer.id)
    }
  }
  visit(consumerId)
  return [...found]
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

function validStageCandidate(chain: PresentationGraph, nodes: ChainNode[]) {
  return stageCandidateEntry(chain, nodes) !== null
}

function outputTail(rootId: string, terminalId: string, nodes: Map<string, ChainNode>, consumers: Map<string, string[]>) {
  const found = new Set<string>(), visiting = new Set<string>()
  const visit = (id: string): boolean => {
    if (found.has(id)) return true
    if (visiting.has(id)) return false
    const node = nodes.get(id)
    if (!node || !(isPureReadFields(node) || node.kind === "capability"
      && node.capability.name === "data.transform" && node.effect === "read")) return false
    visiting.add(id)
    if (node.kind === "capability" && node.capability.name === "data.transform") {
      const producers = nodeBindings(node).filter((binding) => binding.source === "node").map((binding) => binding.nodeId)
      if (!producers.length || producers.some((producer) => !visit(producer))) { visiting.delete(id); return false }
    }
    visiting.delete(id); found.add(id)
    return true
  }
  if (!visit(rootId) || ![...found].some((id) => isPureReadFields(nodes.get(id)!))) return []
  if ([...found].some((id) => (consumers.get(id) ?? []).some((consumer) => consumer !== terminalId && !found.has(consumer)))) return []
  return [...found]
}

function isBrowserAction(node: ChainNode) {
  if (node.kind === "browser") return true
  return node.kind === "capability" && node.capability.name === "browser.workflow-step"
}

function isReadFields(node: ChainNode) {
  return node.kind === "capability" && node.capability.name === "browser.read-fields"
}

function isDeterministicSupport(node: ChainNode) {
  return node.kind === "function" || node.kind === "capability"
    && node.effect === "read" && ["browser.read-fields", "data.transform"].includes(node.capability.name)
}

function isPureReadFields(node: ChainNode) {
  return isReadFields(node) && node.kind === "capability" && node.effect === "read"
}

function workflowActionName(node: ChainNode) {
  if (node.kind === "browser") return node.operation
  return node.kind === "capability" && node.capability.name === "browser.workflow-step"
    && isRecord(node.config) && typeof node.config.actionName === "string" ? node.config.actionName : null
}

function workflowTarget(node: ChainNode) {
  if (node.kind === "browser") return node.target ?? null
  return node.kind === "capability" && isRecord(node.config) ? node.config.target ?? null : null
}

function readinessConsumers(node: ChainNode) {
  if (node.kind !== "capability" || !isRecord(node.config) || !Array.isArray(node.config.postconditions)) return []
  return node.config.postconditions.flatMap((condition) => isRecord(condition) && condition.kind === "read_fields"
    && (condition.ready === true || condition.transition === true) && typeof condition.consumerRef === "string"
    ? [condition.consumerRef] : [])
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

function reachableWithinChain(chain: PresentationGraph, from: string, to: string) {
  const pending = [from], seen = new Set<string>()
  while (pending.length) {
    const current = pending.shift()!
    if (current === to) return true
    if (seen.has(current)) continue
    seen.add(current)
    pending.push(...chain.edges.filter((edge) => edge.from === current).map((edge) => edge.to))
  }
  return false
}

function stageTitle(nodes: ChainNode[], titles: string[], step: Pick<TaskPlan["steps"][number], "title" | "goal">) {
  if (nodes.length === 1) return titles[0]!
  const input = nodes.findIndex((node) => workflowActionName(node) === "input")
  const keys = nodes.findIndex((node) => workflowActionName(node) === "send_keys")
  if (input >= 0 && keys > input) return `${titles[input]}并${titles[keys]}`
  const anchorIndex = nodes.findLastIndex(isBrowserAction)
  if (anchorIndex >= 0) {
    const anchor = titles[anchorIndex]!
    const directRead = nodes.slice(0, anchorIndex).findLast((node) => node.kind === "capability"
      && node.capability.name === "browser.read-fields")
    if (directRead && anchor === "打开读取到的页面") return `${chainNodeDisplayTitle(directRead)}后打开页面`
    return anchor
  }
  const fieldRead = nodes.findLast((node) => chainNodeDisplayTitle(node).startsWith("读取字段："))
  if (fieldRead) return chainNodeDisplayTitle(fieldRead)
  return titles.find((title) => title !== "处理数据") ?? step.title
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function sameIdentity(left: string[], right: string[]) {
  return left.length === right.length && new Set(left).size === left.length
    && new Set(right).size === right.length && left.every((id) => right.includes(id))
}

function invalid(code: string): never {
  throw new DomainError(code, "链路展示结构与当前执行图不一致。", 409)
}
