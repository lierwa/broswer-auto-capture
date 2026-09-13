import {
  nodeBindings, predicateBindings, taskChainSchema, type ChainEdge, type ChainNode,
  type TaskChain, type ValueBinding, type ValueSchema,
} from "@browser-capture/contracts"

export interface CompiledTaskChain {
  chain: TaskChain
  nodes: ReadonlyMap<string, ChainNode>
  edges: ReadonlyMap<string, ChainEdge>
}

export function compileTaskChain(raw: unknown): CompiledTaskChain {
  const chain = taskChainSchema.parse(raw)
  const nodes = new Map(chain.nodes.map((node) => [node.id, node] as const))
  const edges = new Map(chain.edges.map((edge) => [`${edge.from}:${edge.outcome}`, edge] as const))
  assertReachability(chain, nodes, edges)
  assertBoundedCycles(chain, nodes, edges)
  assertCompletedPathBudget(chain, nodes, edges)
  assertBindingDominance(chain, nodes, edges)
  assertStaticContracts(chain, nodes)
  assertDataOperationArguments(nodes)
  assertVariableAvailability(chain, nodes)
  assertBindingPaths(chain, nodes)
  return { chain, nodes, edges }
}

const outputOutcomes = new Set(["success", "partial", "true", "false", "body", "done", "limit"])

const requiredDataArguments: Partial<Record<Extract<ChainNode, { kind: "data" }>["operation"], readonly string[]>> = {
  assign: ["value"], extract: ["source"], transform: ["source", "mode"], filter: ["source", "equals"],
  map: ["source"], deduplicate: ["source"], sort: ["source"], count: ["source"],
}

function assertDataOperationArguments(nodes: ReadonlyMap<string, ChainNode>) {
  for (const node of nodes.values()) {
    if (node.kind !== "data") continue
    for (const name of requiredDataArguments[node.operation] ?? []) {
      // WHY：参数名是公共 data DSL 的一部分；缺失时运行器必然失败，不能把错误候选留到真实浏览器运行。
      if (!(name in node.arguments)) throw new Error(`data_${node.operation}_${name}_required`)
    }
  }
}

function assertStaticContracts(chain: TaskChain, nodes: ReadonlyMap<string, ChainNode>) {
  const emitNames = new Set<string>(), unitKinds = new Set<ChainNode["kind"]>(["browser", "condition", "loop", "checkpoint", "terminal"])
  const completed = [...nodes.values()].filter((node) => node.kind === "terminal" && node.status === "completed")
  if (!completed.length) throw new Error("chain_completed_terminal_missing")
  let exposesChainOutput = false
  for (const node of nodes.values()) {
    if (unitKinds.has(node.kind) && node.outputContract.schema.type !== "null") throw new Error("unit_node_contract_required")
    if (node.kind === "terminal" && node.writes.length) throw new Error("terminal_write_forbidden")
    if (node.kind !== "emit") continue
    if (emitNames.has(node.name)) throw new Error("duplicate_emit_name")
    emitNames.add(node.name)
    if (JSON.stringify(node.outputContract) !== JSON.stringify(node.contract)) throw new Error("emit_contract_mismatch")
    if (JSON.stringify(node.contract) === JSON.stringify(chain.outputContract)) exposesChainOutput = true
  }
  if (!exposesChainOutput) throw new Error("chain_output_not_emitted")
}

function assertVariableAvailability(chain: TaskChain, nodes: ReadonlyMap<string, ChainNode>) {
  const incoming = new Map<string, ChainEdge[]>([...nodes.keys()].map((id) => [id, []]))
  for (const edge of chain.edges) incoming.get(edge.to)!.push(edge)
  const all = new Set(Object.keys(chain.variables)), before = new Map<string, Set<string>>()
  for (const id of nodes.keys()) before.set(id, id === chain.entry ? new Set() : new Set(all))
  let changed = true
  while (changed) {
    changed = false
    for (const id of nodes.keys()) {
      if (id === chain.entry) continue
      const sources = incoming.get(id)!.map((edge) => assignedAfter(before.get(edge.from)!, nodes.get(edge.from)!, edge.outcome))
      const next = sources.length ? new Set([...sources[0]!].filter((name) => sources.every((source) => source.has(name)))) : new Set<string>()
      if (!sameSet(before.get(id)!, next)) { before.set(id, next); changed = true }
    }
  }
  for (const node of nodes.values()) for (const binding of nodeBindings(node)) {
    if (binding.source !== "variable") continue
    const localItem = node.kind === "invoke" && node.iteration.mode === "each" && binding.name === node.iteration.itemVariable
    if (!localItem && !before.get(node.id)!.has(binding.name)) throw new Error("binding_variable_not_available")
  }
  const completed = [...nodes.values()].filter((node) => node.kind === "terminal" && node.status === "completed")
  for (const condition of chain.completion) for (const binding of predicateBindings(condition.predicate)) {
    if (binding.source === "variable" && completed.some((terminal) => !before.get(terminal.id)!.has(binding.name))) {
      throw new Error("completion_variable_not_available")
    }
  }
}

function assignedAfter(before: ReadonlySet<string>, node: ChainNode, outcome: ChainEdge["outcome"]) {
  const assigned = new Set(before)
  if (outputOutcomes.has(outcome)) for (const write of node.writes) assigned.add(write.variable)
  if (node.kind === "loop" && outputOutcomes.has(outcome)) assigned.add(node.cursorVariable)
  if (node.kind === "loop" && node.iteration.mode === "each" && outcome === "body") assigned.add(node.iteration.itemVariable)
  return assigned
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function assertBindingPaths(chain: TaskChain, nodes: ReadonlyMap<string, ChainNode>) {
  const schemaFor = (binding: ValueBinding) => binding.source === "input" ? chain.inputContract.schema
    : binding.source === "node" ? nodes.get(binding.nodeId)!.outputContract.schema
      : binding.source === "variable" ? chain.variables[binding.name]!.schema : null
  const bindings = [...nodes.values()].flatMap(nodeBindings).concat(chain.completion.flatMap((item) => predicateBindings(item.predicate)))
  for (const binding of bindings) {
    if (binding.source !== "constant") assertSchemaPath(schemaFor(binding)!, binding.path)
  }
  for (const node of nodes.values()) for (const write of node.writes) assertSchemaPath(node.outputContract.schema, write.path)
  for (const node of nodes.values()) {
    if ((node.kind !== "loop" && node.kind !== "invoke") || node.iteration.mode !== "each") continue
    const binding = node.iteration.collection
    if (binding.source === "constant") throw new Error("iteration_collection_binding_required")
    const collection = schemaAtPath(schemaFor(binding)!, binding.path)
    if (!collection || collection.type !== "array") throw new Error("iteration_collection_contract_required")
    const stableKey = schemaAtPath(collection.items, node.iteration.stableKeyPath)
    if (!stableKey || !["string", "number", "integer", "boolean"].includes(stableKey.type)) {
      throw new Error("iteration_stable_key_contract_required")
    }
  }
}

function assertSchemaPath(root: ValueSchema, path: (string | number)[]) {
  if (schemaAtPath(root, path) === undefined) throw new Error("binding_path_contract_mismatch")
}

function schemaAtPath(root: ValueSchema, path: (string | number)[]) {
  let schema: ValueSchema | null = root
  for (const segment of path) {
    if (schema === null) return null
    if (typeof segment === "number") {
      if (schema.type !== "array") return undefined
      schema = schema.items
      continue
    }
    if (schema.type !== "object") return undefined
    schema = schema.properties[segment] ?? (schema.additionalProperties ? null : undefined)!
    if (schema === undefined) return undefined
  }
  return schema
}

function successors(node: ChainNode, edges: ReadonlyMap<string, ChainEdge>) {
  return node.outcomes.map((outcome) => edges.get(`${node.id}:${outcome}`)!.to)
}

function assertReachability(chain: TaskChain, nodes: ReadonlyMap<string, ChainNode>, edges: ReadonlyMap<string, ChainEdge>) {
  const reachable = new Set<string>(), queue = [chain.entry]
  while (queue.length) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const next of successors(nodes.get(id)!, edges)) queue.push(next)
  }
  if (reachable.size !== nodes.size) throw new Error("chain_unreachable")
  if (![...nodes.values()].filter((node) => node.kind === "terminal").every((node) => reachable.has(node.id))) throw new Error("chain_terminal_unreachable")
}

function assertBoundedCycles(chain: TaskChain, nodes: ReadonlyMap<string, ChainNode>, edges: ReadonlyMap<string, ChainEdge>) {
  const visiting = new Set<string>(), done = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error("chain_unbounded_cycle")
    if (done.has(id)) return
    visiting.add(id)
    const node = nodes.get(id)!
    // WHY：回到 loop 由其显式 maxIterations 控制；其他回边没有预算语义，编译时拒绝。
    for (const next of successors(node, edges)) if (nodes.get(next)?.kind !== "loop") visit(next)
    visiting.delete(id); done.add(id)
  }
  visit(chain.entry)
  const reaches = (start: string, target: string) => {
    const pending = [start], seen = new Set<string>()
    while (pending.length) {
      const id = pending.shift()!
      if (id === target) return true
      if (seen.has(id)) continue
      seen.add(id); pending.push(...successors(nodes.get(id)!, edges))
    }
    return false
  }
  for (const node of nodes.values()) {
    if (node.kind !== "loop") continue
    for (const outcome of node.outcomes) {
      if (outcome !== "body" && reaches(edges.get(`${node.id}:${outcome}`)!.to, node.id)) {
        throw new Error("loop_terminal_outcome_cycles")
      }
    }
  }
}

function assertCompletedPathBudget(chain: TaskChain, nodes: ReadonlyMap<string, ChainNode>, edges: ReadonlyMap<string, ChainEdge>) {
  const completed = new Set([...nodes.values()]
    .filter((node) => node.kind === "terminal" && node.status === "completed")
    .map((node) => node.id))
  const distance = new Map([[chain.entry, 1]]), pending = [chain.entry]
  while (pending.length) {
    const id = pending.shift()!, transitions = distance.get(id)!
    if (completed.has(id)) {
      // WHY：连最短完成路径都超过预算的链路只能在运行中暂停，候选阶段就应拒绝并要求重新编译。
      if (transitions > chain.budget.maxTransitions) throw new Error("chain_transition_budget_exceeded")
      return
    }
    for (const next of successors(nodes.get(id)!, edges)) {
      if (distance.has(next)) continue
      distance.set(next, transitions + 1); pending.push(next)
    }
  }
}

function assertBindingDominance(chain: TaskChain, nodes: ReadonlyMap<string, ChainNode>, edges: ReadonlyMap<string, ChainEdge>) {
  const predecessors = new Map<string, Set<string>>([...nodes.keys()].map((id) => [id, new Set<string>()]))
  for (const node of nodes.values()) for (const next of successors(node, edges)) predecessors.get(next)!.add(node.id)
  const all = new Set(nodes.keys()), dominators = new Map<string, Set<string>>()
  for (const id of nodes.keys()) dominators.set(id, id === chain.entry ? new Set([id]) : new Set(all))
  let changed = true
  while (changed) {
    changed = false
    for (const id of nodes.keys()) {
      if (id === chain.entry) continue
      const incoming = [...predecessors.get(id)!]
      const common = incoming.length ? new Set([...dominators.get(incoming[0]!)!].filter((candidate) => incoming.every((from) => dominators.get(from)!.has(candidate)))) : new Set<string>()
      common.add(id)
      const before = dominators.get(id)!
      if (before.size !== common.size || [...before].some((value) => !common.has(value))) { dominators.set(id, common); changed = true }
    }
  }
  for (const node of nodes.values()) {
    for (const binding of nodeBindings(node)) {
      if (binding.source === "node" && (binding.nodeId === node.id || !dominators.get(node.id)!.has(binding.nodeId))) {
        throw new Error("binding_node_not_dominating")
      }
    }
  }
  const completedTerminals = [...nodes.values()].filter((node) => node.kind === "terminal" && node.status === "completed")
  for (const condition of chain.completion) for (const binding of predicateBindings(condition.predicate)) {
    if (binding.source === "node" && completedTerminals.some((terminal) => !dominators.get(terminal.id)!.has(binding.nodeId))) {
      throw new Error("completion_binding_not_dominating")
    }
  }
}
