import type { ChainNode, ChainStage } from "@browser-capture/contracts"
import { actionPresentation, type NodeTypePresentation } from "./chainNodePresentation.js"
import { branchDefinitions, exclusiveBranchIds, loopBodyIds, type ControlGraph } from "./chainControlProjection.js"

export type CanvasRoute = { port: string; label: string; detail: string; targetId: string | null;
  target: string; inline: boolean; targetType?: NodeTypePresentation | undefined }
export type CanvasListItem = { id: string; ordinal: number; routes: CanvasRoute[];
  body?: CanvasListItem[]; returns?: string[] }
const cache = new WeakMap<ControlGraph, WeakMap<ChainStage, CanvasListItem[]>>()

/** WHY：列表是版本图的投影。只有可证明的独占动作可放进分支，汇合/回边仍引用同一个 nodeId。 */
export function canvasStageList(stage: ChainStage, chain: ControlGraph): CanvasListItem[] {
  let stages = cache.get(chain)
  if (!stages) { stages = new WeakMap(); cache.set(chain, stages) }
  const cached = stages.get(stage)
  if (cached) return cached
  const nodes = new Map(chain.nodes.map(node => [node.id, node]))
  const ordinals = new Map(stage.nodeIds.map((id, index) => [id, index + 1]))
  const compose = (ids: Set<string>, ancestors: Set<string>): CanvasListItem[] => {
    const groups = loopGroups(ids, ancestors, chain)
    const covered = new Set([...groups.values()].flatMap(group => [...group]))
    const inline = inlineTargets(stage, ids, covered, chain)
    const owned = new Set([...inline.values()].flatMap(ports => [...ports.values()]))
    const emitted = new Set<string>()
    return stage.nodeIds.flatMap(id => {
      if (!ids.has(id) || owned.has(id)) return []
      const owner = [...groups].find(([loop, body]) => loop === id || body.has(id))?.[0]
      if (owner && emitted.has(owner)) return []
      const node = nodes.get(owner ?? id)
      if (!node) return []
      if (owner) {
        emitted.add(owner)
        const loop = node as Extract<ChainNode, { kind: "loop" }>
        return [{ id: owner, ordinal: ordinals.get(owner)!, routes: routesFor(loop, chain),
          body: compose(groups.get(owner)!, new Set([...ancestors, owner])),
          returns: "body" in loop ? [...loop.body.exits] : [] }]
      }
      return [{ id, ordinal: ordinals.get(id)!, routes: routesFor(node, chain).map(route => ({ ...route,
        inline: inline.get(id)?.get(route.port) === route.targetId })) }]
    })
  }
  const result = compose(new Set(stage.nodeIds), new Set())
  stages.set(stage, result); return result
}

function loopGroups(ids: Set<string>, ancestors: Set<string>, chain: ControlGraph) {
  const candidates = chain.nodes.filter((node): node is Extract<ChainNode, { kind: "loop" }> =>
    node.kind === "loop" && ids.has(node.id) && !ancestors.has(node.id))
    .map(node => ({ id: node.id, body: loopBodyIds(node, chain) }))
    .filter(item => item.body.size > 0 && [...item.body].every(id => ids.has(id)))
  // WHY：部分相交不证明嵌套；遇到旧/缺失范围定义保留普通行，绝不猜一个循环框。
  return new Map(candidates.filter(item => !candidates.some(other => other.id !== item.id
    && other.body.has(item.id))).filter(item => !candidates.some(other => other.id !== item.id
    && !item.body.has(other.id) && !other.body.has(item.id) && [...item.body].some(id => other.body.has(id))))
    .map(item => [item.id, item.body]))
}

function inlineTargets(stage: ChainStage, ids: Set<string>, covered: Set<string>, chain: ControlGraph) {
  const result = new Map<string, Map<string, string>>()
  for (const node of chain.nodes) {
    if (!ids.has(node.id) || covered.has(node.id)) continue
    const ports = new Map<string, string>()
    for (const route of routesFor(node, chain)) {
      const target = chain.nodes.find(item => item.id === route.targetId)
      const incoming = chain.edges.filter(edge => edge.to === route.targetId)
      if (target && !["loop", "branch", "condition", "terminal"].includes(target.kind)
        && ids.has(target.id) && !covered.has(target.id) && incoming.length === 1
        && exclusiveBranchIds(stage, node.id, route.port, chain).has(target.id)) ports.set(route.port, target.id)
    }
    if (ports.size) result.set(node.id, ports)
  }
  return result
}

function routesFor(node: ChainNode, chain: ControlGraph): CanvasRoute[] {
  const definitions = node.kind === "loop" ? [{ port: "body", label: "继续", detail: "进入声明的循环体" },
    { port: "done", label: "结束", detail: "按声明的退出或停止条件离开循环" }]
    : branchDefinitions(node, chain).map(row => ({ ...row, detail: row.label,
      label: node.kind === "branch" && "cases" in node
        ? conciseCaseLabel(node, row.port)
        : row.port === "true" ? "条件成立" : "条件不成立" }))
  return definitions.flatMap(definition => {
    const edge = chain.edges.find(edge => edge.from === node.id
      && ("port" in edge ? edge.port : edge.outcome) === definition.port)
    const target = chain.nodes.find(item => item.id === edge?.to)
    if (node.kind === "loop" && !edge) return []
    const info = target ? actionPresentation(target) : null
    // WHY：跨主节点去向也引用同一真实节点；只补类型展示，不复制它的运行状态或动作归属。
    return [{ ...definition, targetId: target?.id ?? null,
      target: info?.title ?? "后续动作尚未记录", inline: false,
      targetType: target ? { kind: target.kind, type: info!.type,
        capabilityName: target.kind === "capability" ? target.capability.name : undefined } : undefined }]
  })
}

function conciseCaseLabel(node: Extract<ChainNode, { kind: "branch" }> & { cases: { id: string; label: string }[] }, port: string) {
  const label = node.cases.find(item => item.id === port)?.label
  // WHY：历史二元分支升级会将条件标题复制成 case label；去重文案，不改条件、顺序或去向。
  if (node.cases.length === 1 && (label === node.label || port === "default")) return port === "default" ? "条件不成立" : "条件成立"
  return label ?? "其他情况"
}
