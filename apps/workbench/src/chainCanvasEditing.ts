import { chainEdgePort, isStableTaskChainV2, nodeBindings, nodePorts, predicateBindings, requiredNodePorts,
  type ChainNode, type ChainPresentationContent, type ChainRevisionOperation, type StableChainNodeV2,
  type StableTaskChainV2, type TaskChain } from "@browser-capture/contracts"

type Presentation = ChainPresentationContent

export function newFunctionNode(id: string): StableChainNodeV2 {
  return { id, kind: "function", label: "处理数据", language: "javascript", timeoutMs: 1000,
    source: "function main(inputs) {\n  return {};\n}", inputs: {}, writes: [],
    outputContract: { id: "function-output", version: 1, dialect: "bat-value-schema/v1",
      schema: { type: "object", properties: {}, required: [], additionalProperties: false } } }
}

export function nodeInsertionOperations(chain: TaskChain, presentation: Presentation,
  sourceNodeId: string, newNode: ChainNode, port = "success"): ChainRevisionOperation[] {
  assertEditable(chain)
  const source = findNode(chain, sourceNodeId), next = chain.edges.find((edge) => edge.from === sourceNodeId && edge.port === port)
  if (!next) throw new Error(`“${source.label}”的这条路线还没有下一步，请先连接下一步。`)
  if (chain.nodes.some((node) => node.id === newNode.id)) throw new Error("新增节点与已有节点重复，请重新添加。")
  if ("outcomes" in newNode || requiredNodePorts(newNode).length !== 1 || requiredNodePorts(newNode)[0] !== "success") {
    throw new Error("请先配置具有单一正常下一步的动作或 Function；分支与循环需要完整的路线配置。")
  }
  const content = cloneContent(presentation), stage = content.stages.find((item) => item.nodeIds.includes(sourceNodeId))
  if (!stage) throw new Error("请在一个阶段内选择动作后再新增节点。")
  stage.nodeIds.splice(stage.nodeIds.indexOf(sourceNodeId) + 1, 0, newNode.id)
  const focus = content.focusLayouts.find((item) => item.stageId === stage.id)!
  const previous = focus.nodes.find((item) => item.nodeId === sourceNodeId)!
  const position = { x: previous.x, y: previous.y + 180 }
  focus.nodes.push({ nodeId: newNode.id, ...position })
  const edges = chain.edges.filter((edge) => edge !== next).concat(
    { from: sourceNodeId, port, to: newNode.id }, { from: newNode.id, port: "success", to: next.to })
  return [{ type: "add_node", node: newNode, position },
    { type: "upsert_edge", edge: { from: sourceNodeId, port, to: newNode.id } },
    { type: "upsert_edge", edge: { from: newNode.id, port: "success", to: next.to } },
    { type: "set_presentation", presentation: rebuildExits(content, edges) }]
}

export function nodeRemovalOperations(chain: TaskChain, presentation: Presentation,
  nodeId: string): ChainRevisionOperation[] {
  assertEditable(chain)
  const node = findNode(chain, nodeId)
  if (node.kind === "terminal") throw new Error("结束节点不能直接删除，请先调整任务结束方式。")
  assertNoDependents(chain, node)
  const outgoing = chain.edges.filter((edge) => edge.from === nodeId)
  // WHY：只有明确的单一正常后继能安全接回，不能替用户猜测分支合流或错误恢复路径。
  if (outgoing.length !== 1 || outgoing[0]!.port !== "success" || outgoing[0]!.to === nodeId) {
    throw new Error(`“${node.label}”存在分支或恢复路线，请先明确删除后要连接的下一步。`)
  }
  const successor = outgoing[0]!.to, incoming = chain.edges.filter((edge) => edge.to === nodeId && edge.from !== nodeId)
  const edges = chain.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId)
    .concat(incoming.map((edge) => ({ ...edge, to: successor })))
  const content = removeFromPresentation(presentation, nodeId, successor)
  const operations: ChainRevisionOperation[] = [{ type: "remove_node", nodeId },
    ...incoming.map((edge): ChainRevisionOperation => ({ type: "upsert_edge", edge: { ...edge, to: successor } }))]
  if (chain.entry === nodeId) operations.push({ type: "set_entry", nodeId: successor })
  return [...operations, { type: "set_presentation", presentation: rebuildExits(content, edges) }]
}

export function nodeRouteOperations(chain: TaskChain, presentation: Presentation,
  sourceId: string, port: string, targetId: string): ChainRevisionOperation[] {
  assertEditable(chain)
  const source = findNode(chain, sourceId), target = findNode(chain, targetId)
  if (!nodePorts(source).includes(port)) throw new Error(`“${source.label}”没有这条路线。`)
  if (sourceId === targetId) throw new Error("不能把节点直接连接到自身；重复执行需要配置循环节点。")
  const targetStage = presentation.stages.find((stage) => stage.nodeIds.includes(targetId))
  if (targetStage && !targetStage.nodeIds.includes(sourceId) && targetStage.entryNodeId !== targetId) {
    throw new Error(`请连接到“${targetStage.title}”的第一个动作，不能从阶段中间进入“${target.label}”。`)
  }
  const edge = { from: sourceId, port, to: targetId }
  const edges = chain.edges.filter((item) => item.from !== sourceId || item.port !== port).concat(edge)
  return [{ type: "upsert_edge", edge },
    { type: "set_presentation", presentation: rebuildExits(cloneContent(presentation), edges) }]
}

function assertEditable(chain: TaskChain): asserts chain is StableTaskChainV2 {
  if (!isStableTaskChainV2(chain)) throw new Error("此历史链路使用旧节点格式，请先重新准备任务后再编辑。")
}

function findNode(chain: TaskChain, id: string) {
  const node = chain.nodes.find((item) => item.id === id)
  if (!node) throw new Error("所选节点已不存在，请重新选择。")
  return node
}

function assertNoDependents(chain: TaskChain, node: ChainNode) {
  const variables = new Set(node.writes.map((write) => write.variable))
  const references = (binding: ReturnType<typeof nodeBindings>[number]) => binding.source === "node"
    ? binding.nodeId === node.id : binding.source === "variable" && variables.has(binding.name)
  const consumers = chain.nodes.filter((other) => other.id !== node.id && (
    nodeBindings(other).some(references)
    || other.kind === "capability" && other.human?.resumeWhen.operator === "equals" && references(other.human.resumeWhen.expected)
    || other.kind === "loop" && "body" in other && [other.body.entry, ...other.body.exits].includes(node.id)))
  if (consumers.length) throw new Error(`不能删除“${node.label}”：${consumers.map((item) => `“${item.label}”`).join("、")}仍引用它，请先调整这些节点的输入或循环配置。`)
  const completion = chain.completion.find((condition) => predicateBindings(condition.predicate).some(references))
  if (completion) throw new Error(`不能删除“${node.label}”：完成条件“${completion.description}”仍引用它。`)
}

function removeFromPresentation(presentation: Presentation, nodeId: string, successor: string) {
  const content = cloneContent(presentation)
  for (const stage of content.stages) {
    if (!stage.nodeIds.includes(nodeId)) continue
    stage.nodeIds = stage.nodeIds.filter((id) => id !== nodeId)
    if (stage.entryNodeId === nodeId && stage.nodeIds.length) {
      if (!stage.nodeIds.includes(successor)) throw new Error(`删除后“${stage.title}”没有明确入口，请先调整该阶段。`)
      stage.entryNodeId = successor
    }
  }
  content.stages = content.stages.filter((stage) => stage.nodeIds.length)
  const stageIds = new Set(content.stages.map((stage) => stage.id))
  content.overviewLayout = content.overviewLayout.filter((item) => stageIds.has(item.stageId))
  content.focusLayouts = content.focusLayouts.filter((item) => stageIds.has(item.stageId))
    .map((item) => ({ ...item, nodes: item.nodes.filter((position) => position.nodeId !== nodeId) }))
  return content
}

function cloneContent(presentation: Presentation): Presentation {
  return structuredClone({ stages: presentation.stages, overviewLayout: presentation.overviewLayout,
    focusLayouts: presentation.focusLayouts })
}

function rebuildExits(content: Presentation, edges: TaskChain["edges"]): Presentation {
  for (const stage of content.stages) {
    const members = new Set(stage.nodeIds), previous = stage.exits
    const usedIds = new Set(previous.map((exit) => exit.id))
    let sequence = 0
    stage.exits = edges.filter((edge) => members.has(edge.from) && !members.has(edge.to)).map((edge) => {
      const port = chainEdgePort(edge)
      const existing = previous.find((exit) => exit.sourceNodeId === edge.from && exit.sourcePort === port)
      if (existing) return existing
      while (usedIds.has(`edit-exit-${++sequence}`)) { /* 保留现有出口身份，避免编辑时重号。 */ }
      const id = `edit-exit-${sequence}`
      usedIds.add(id)
      return { id, label: port === "success" ? "继续" : port, sourceNodeId: edge.from, sourcePort: port }
    })
  }
  return content
}
