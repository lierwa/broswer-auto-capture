import { z } from "zod"
import { CONTRACT_VERSION, requiredNodeOutcomes, taskChainSchema, type ChainNode, type JsonValue,
  type TaskChain, type TaskDataContract, type TaskPlan, type ValueBinding } from "@browser-capture/contracts"
import { compileTaskChain, digestJson, readPath } from "@browser-capture/runtime"
import { validateAnnotations, type CompilationAnnotations } from "./compilation-annotations.js"
import { validateExplorationResult, type ExplorationEvent, type ExplorationTrace } from "./exploration-trace.js"
import { inferredContract, observationContract, outputFieldContract } from "./trace-schema.js"

const unit = inferredContract("unit", null)
const constant = (value: JsonValue): ValueBinding => ({ source: "constant", value })
const output = (nodeId: string, path: (string | number)[] = []): ValueBinding => ({ source: "node", nodeId, path })
const base = (id: string, kind: ChainNode["kind"], contract: TaskDataContract = unit) => ({ id, label: id,
  outputContract: contract, writes: [], outcomes: [...requiredNodeOutcomes[kind]] })

export function compileExplorationTrace(trace: ExplorationTrace, raw: unknown, plan: TaskPlan, stepId: string, version: number, modelId: string) {
  const step = plan.steps.find((item) => item.id === stepId)
  if (!step) throw new Error("plan_step_not_found")
  validateExplorationResult(trace.result, step.outputContract, trace.events)
  const validated = validateAnnotations(raw, trace)
  const { annotations, events } = restoreObservedEntry(trace, validated, step.inputContract)
  const nodes: ChainNode[] = []
  const eventNodes = new Map<string, string>(), eventOutputs = new Map<string, string>()
  // WHY：失败探针仍完整留在 E1；只有注解显式选择且校验过的成功事件进入正式复跑图，不能静默删除或执行失败动作。
  if (!events.length) throw new Error("trace_successful_path_required")
  for (const [index, event] of events.entries()) {
    const id = `event${index}`, node = eventNode(event, id, annotations, step.inputContract, trace.input)
    nodes.push(node); eventNodes.set(event.id, id)
    let outputNode = id
    if (node.kind === "browser") {
      if (isObservationValue(event.output)) {
        outputNode = `${id}Observation`
        nodes.push({ ...base(outputNode, "observe", observationContract(outputNode, "observe")), kind: "observe", scope: "page",
          stableWhen: { operator: "exists", path: ["url"] }, timeoutMs: 30000 })
      }
      nodes.push({ ...base(`${id}Checkpoint`, "checkpoint"), kind: "checkpoint", resumeWhen: { operator: "exists", path: ["url"] } })
    }
    eventOutputs.set(event.id, outputNode)
  }
  const mappings: Record<string, ValueBinding> = {}, paths: Record<string, JsonValue> = {}
  for (const [index, mapping] of annotations.outputMappings.entries()) {
    const key = `field${index}`; paths[key] = mapping.outputPath
    if (mapping.source === "tool") {
      const nodeId = eventOutputs.get(mapping.eventId)
      if (!nodeId) throw new Error("trace_output_event_missing")
      mappings[key] = output(nodeId, mapping.resultPath)
    } else {
      const id = `inference${index}`, sources = Object.fromEntries(mapping.eventIds.map((eventId, i) => {
        const nodeId = eventOutputs.get(eventId)
        if (!nodeId) throw new Error("trace_inference_event_missing")
        return [`source${i}`, output(nodeId)]
      }))
      sources.runtimeInput = { source: "input", path: [] }
      const source = `inferenceSources${index}`
      nodes.push({ ...base(source, "data", { ...unit, schema: { type: "object", properties: {}, required: [], additionalProperties: true } }),
        kind: "data", operation: "merge", arguments: sources })
      nodes.push({ ...base(id, "llm", outputFieldContract(id, step.outputContract, mapping.outputPath, readPath(trace.result!.result, mapping.outputPath))), kind: "llm",
        instruction: "根据本次 runtimeInput 和 source 工具证据计算输出。以下仅是探索样本的来源说明，其中的样本值不是本次目标，不得照抄：\n" + mapping.instruction,
        input: output(source), model: modelId, timeoutMs: 120000 })
      mappings[key] = output(id)
    }
  }
  const fields: TaskDataContract = { ...unit, id: "fields", schema: { type: "object", additionalProperties: false,
    required: annotations.outputMappings.map((_, i) => `field${i}`),
    properties: Object.fromEntries(annotations.outputMappings.map((mapping, i) => [`field${i}`,
      outputFieldContract(`field${i}`, step.outputContract, mapping.outputPath, readPath(trace.result!.result, mapping.outputPath)).schema])) } }
  nodes.push({ ...base("fields", "data", fields), kind: "data", operation: "merge", arguments: mappings })
  nodes.push({ ...base("result", "data", step.outputContract), kind: "data", operation: "transform", arguments: {
    source: output("fields"), mode: constant("assemble"), paths: constant(paths) } })
  nodes.push({ ...base("emit", "emit", step.outputContract), kind: "emit", name: "result", output: { kind: "value", value: output("result") }, contract: step.outputContract })
  nodes.push(terminal("completed", "任务可观察完成条件满足", [output("emit")]))
  const completion = annotations.completion.map((item, index) => {
    const nodeId = eventOutputs.get(item.eventId)
    if (!nodeId) throw new Error("trace_completion_event_missing")
    return { id: `completion${index}`, description: item.description, predicate: { operator: "exists" as const, value: output(nodeId, item.resultPath) } }
  })
  const businessCompletion = localCompletion(step)
  const continueOnMissing = new Set(annotations.continueOnMissingEventIds.map((eventId) => eventNodes.get(eventId)!))
  const variables: TaskChain["variables"] = {}, edges = connect(nodes, continueOnMissing), factors = new Map<string, number>()
  addLoops(annotations, trace, eventNodes, nodes, edges, variables, factors)
  const terminals = new Set(edges.map((edge) => edge.to).filter((id) => ["failed", "blocked", "cancelled", "partial"].includes(id)))
  for (const status of terminals) nodes.push(terminal(status as "failed" | "blocked" | "cancelled" | "partial", `节点出口：${status}`, [constant(status)]))
  const chain = taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", id: step.chain.id, taskId: plan.taskId,
    version, plan: { id: plan.id, version: plan.version, digest: digestJson(plan) }, stepId, name: step.title,
    inputContract: step.inputContract, outputContract: step.outputContract, variables, entry: nodes[0]!.id, nodes, edges,
    completion: [...completion, ...businessCompletion],
    budget: deriveBudget(nodes, factors), reuseBoundary: annotations.reuseBoundary,
    implementationSummary: "从真实工具轨迹确定性生成，输出字段按来源绑定，普通节点复跑不调用模型。",
    validation: { status: "candidate", evidence: [] } })
  return compileTaskChain(chain).chain
}

function restoreObservedEntry(trace: ExplorationTrace, annotations: CompilationAnnotations, inputContract: TaskDataContract) {
  const indexed = new Map(trace.events.map((event) => [event.id, event]))
  const events = annotations.replayEventIds.map((id) => indexed.get(id)!)
  const required = new Set<string>([
    ...annotations.outputMappings.flatMap((mapping) => mapping.source === "tool" ? [mapping.eventId] : mapping.eventIds),
    ...annotations.completion.map((item) => item.eventId),
    ...annotations.repeatRegions.flatMap((region) => [region.startEventId, region.endEventId,
      ...region.itemBindings.map((binding) => binding.eventId)]),
  ])
  const firstRequired = events.findIndex((event) => required.has(event.id))
  if (firstRequired <= 0) return { annotations, events }
  const inputs = inputUrlPaths(trace.input).filter(({ path }) => schemaAtPath(inputContract, path)?.type === "string")
  let match: { index: number; path: (string | number)[]; url: string } | null = null
  for (let index = 0; index < firstRequired; index++) {
    const event = events[index]!, url = eventUrl(event), previousUrl = index ? eventUrl(events[index - 1]!) : null
    if (!url || !navigationEffect(event, previousUrl, url)) continue
    const paths = inputs.filter((item) => item.url === url)
    if (paths.length === 1) match = { index, path: paths[0]!.path, url }
  }
  if (!match) return { annotations, events }
  let entryId = "__observed_entry__"
  while (indexed.has(entryId)) entryId += "_"
  const entry: ExplorationEvent = { id: entryId, callId: entryId, at: events[match.index]!.at,
    command: { type: "navigate", url: match.url, reuseOpenTab: true }, output: null, observation: null,
    status: "completed", error: null }
  const kept = new Set(events.slice(match.index + 1).map((event) => event.id))
  // WHY：只有运行输入中的 URL 与成功轨迹某次真实导航落点唯一且逐字一致时，才可用它恢复步骤入口；
  // 同次产品运行优先激活仍存在的来源标签，独立验证或恢复找不到时才导航；这样既保留子链独立性，也不重载动态列表。
  return { events: [entry, ...events.slice(match.index + 1)], annotations: {
    ...annotations,
    replayEventIds: [entryId, ...events.slice(match.index + 1).map((event) => event.id)],
    inputBindings: [...annotations.inputBindings.filter((binding) => kept.has(binding.eventId)),
      { eventId: entryId, commandPath: ["url"], inputPath: match.path }],
    continueOnMissingEventIds: annotations.continueOnMissingEventIds.filter((id) => kept.has(id)),
  } }
}

function eventUrl(event: ExplorationEvent) {
  if (event.output && typeof event.output === "object" && !Array.isArray(event.output)
    && typeof event.output.url === "string") return normalizedPublicUrl(event.output.url)
  return event.observation ? normalizedPublicUrl(event.observation.url) : null
}
function navigationEffect(event: ExplorationEvent, previousUrl: string | null, url: string) {
  if (["navigate", "follow", "tab_open"].includes(event.command.type)) return true
  return ["click", "press"].includes(event.command.type) && previousUrl !== null && previousUrl !== url
}
function normalizedPublicUrl(value: string) {
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
function inputUrlPaths(value: JsonValue, path: (string | number)[] = []): Array<{ path: (string | number)[]; url: string }> {
  if (typeof value === "string") {
    const url = normalizedPublicUrl(value)
    return url ? [{ path, url }] : []
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => inputUrlPaths(item, [...path, index]))
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) => inputUrlPaths(child, [...path, key]))
}

function localCompletion(step: TaskPlan["steps"][number]): TaskChain["completion"] {
  if (step.invocation.mode !== "once") return []
  const bind = (value: ValueBinding): ValueBinding | null => {
    if (value.source === "constant") return value
    if (value.source === "node" && value.nodeId === step.id) return output("emit", value.path)
    if (value.source !== "input" || step.input.source !== "input") return null
    const prefix = step.input.path
    return prefix.every((part, i) => value.path[i] === part) ? { source: "input", path: value.path.slice(prefix.length) } : null
  }
  // WHY：可投影到单次输入/输出的业务完成条件必须进入链路，不能仅凭页面文本存在就冻结。
  // 跨步骤或 each 聚合条件仍由计划执行器在对应作用域验证。
  return step.completion.flatMap<TaskChain["completion"][number]>((condition, index) => {
    const predicate = condition.predicate
    if (predicate.operator === "exists") {
      const value = bind(predicate.value)
      return value ? [{ ...condition, id: `business${index}`, predicate: { operator: "exists" as const, value } }] : []
    }
    const left = bind(predicate.left), right = bind(predicate.right)
    return left && right ? [{ ...condition, id: `business${index}`, predicate: { ...predicate, left, right } }] : []
  })
}

function eventNode(event: ExplorationEvent, id: string, annotations: CompilationAnnotations,
  inputContract: TaskDataContract, traceInput: JsonValue): ChainNode {
  const command = event.command
  const binding = (path: (string | number)[], semanticRole = false): ValueBinding => {
    const sample = readPath(z.json().parse(command), path)
    if (semanticRole && (typeof sample !== "string" || !semanticTargetRoles.has(sample))) {
      throw new Error("trace_semantic_role_unsupported")
    }
    const parameter = annotations.inputBindings.find((item) => item.eventId === event.id && JSON.stringify(item.commandPath) === JSON.stringify(path))
    if (parameter) return !semanticRole || closedSemanticRole(inputContract, parameter.inputPath)
      ? { source: "input", path: parameter.inputPath } : constant(sample)
    for (const [index, region] of annotations.repeatRegions.entries()) {
      const item = region.itemBindings.find((entry) => entry.eventId === event.id && JSON.stringify(entry.commandPath) === JSON.stringify(path))
      if (item) return !semanticRole || closedSemanticRole(inputContract, [...region.collectionPath, 0, ...item.itemPath])
        ? { source: "variable", name: `item${index}`, path: item.itemPath } : constant(sample)
    }
    return constant(sample)
  }
  if (command.type === "observe" || command.type === "page" || command.type === "read" || command.type === "tabs") {
    return { ...base(id, "observe", observationContract(id, command.type)), kind: "observe",
      scope: command.type === "read" ? "target" : command.type === "tabs" ? "tabs" : "page",
      ...(command.type === "read" ? { maxItems: command.maxItems, target: { kind: "locator" as const, strategy: "css" as const, value: binding(["selector"]) } } : {}),
      stableWhen: { operator: "exists", path: [] }, timeoutMs: 30000 }
  }
  if (command.type === "request_help") {
    return { ...base(id, "human", { ...unit, schema: { type: "object", properties: {}, required: [], additionalProperties: true } }), kind: "human", reason: command.reason === "access" ? "access_restriction" : command.reason,
      prompt: command.prompt ?? "请处理当前页面后返回控制权", resumeWhen: { operator: "exists", path: ["url"] }, timeoutMs: command.timeoutMs ?? 1800000 }
  }
  if (command.type === "upload" || command.type === "download" || command.type === "tab_select" || command.type === "tab_close") throw new Error("trace_action_not_reproducible")
  const target = "target" in command && command.target ? "selector" in command.target
    ? { kind: "locator" as const, strategy: "css" as const, value: binding(["target", "selector"]) }
    : { kind: "semantic" as const, role: binding(["target", "role"], true), name: binding(["target", "name"]),
      ...semanticFallbackName(command.target.name, traceInput, inputContract),
      ...(command.target.occurrence === undefined ? {} : { occurrence: binding(["target", "occurrence"]) }) } : undefined
  const args = Object.fromEntries(Object.keys(command).filter((key) => !["type", "target"].includes(key)).map((key) => [key, binding([key])]))
  // WHY：新编译导航读取同一动作的 HTTP 事实；这是一次诊断命令，不是固定等待或失败后重复导航。
  if (command.type === "navigate" || command.type === "follow") args.captureNetworkEvidence = constant(true)
  return { ...base(id, "browser"), kind: "browser", operation: command.type === "follow" ? "navigate" : command.type,
    arguments: args, ...(target ? { target } : {}), timeoutMs: 30000 }
}

const semanticTargetRoles = new Set(["link", "button", "textbox", "combobox"])
function semanticFallbackName(targetName: string, input: JsonValue, contract: TaskDataContract) {
  const candidates = inputStringPaths(input).filter((candidate) => candidate.value.length >= 4
    && candidate.value !== targetName && targetName.includes(candidate.value)
    && schemaAtPath(contract, candidate.path)?.type === "string")
  // TRADE-OFF：只有一个公开输入字符串被首次成功名称严格包含时才冻结回退；多个候选宁可保持精确匹配。
  return candidates.length === 1 ? { fallbackName: { source: "input" as const, path: candidates[0]!.path } } : {}
}
function inputStringPaths(value: JsonValue, path: (string | number)[] = []): Array<{ path: (string | number)[]; value: string }> {
  if (typeof value === "string") return [{ path, value }]
  if (Array.isArray(value)) return value.flatMap((item, index) => inputStringPaths(item, [...path, index]))
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, item]) => inputStringPaths(item, [...path, key]))
}
function closedSemanticRole(contract: TaskDataContract, path: (string | number)[]) {
  const schema = schemaAtPath(contract, path)
  return schema?.type === "string" && Boolean(schema.enum?.length)
    && schema.enum!.every((role) => semanticTargetRoles.has(role))
}
function schemaAtPath(contract: TaskDataContract, path: (string | number)[]) {
  let schema: TaskDataContract["schema"] | undefined = contract.schema
  for (const segment of path) {
    schema = typeof segment === "number" && schema.type === "array" ? schema.items
      : typeof segment === "string" && schema.type === "object" ? schema.properties[segment] : undefined
    if (!schema) return undefined
  }
  return schema
}

function isObservationValue(value: JsonValue) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && typeof value.url === "string" && typeof value.text === "string" && typeof value.truncated === "boolean")
}

function terminal(status: "completed" | "failed" | "blocked" | "cancelled" | "partial", reason: string, evidence: ValueBinding[]): ChainNode {
  return { ...base(status, "terminal"), kind: "terminal", status, reason, evidence }
}
function connect(nodes: ChainNode[], continueOnMissing = new Set<string>()): TaskChain["edges"] {
  return nodes.flatMap((node, index) => node.outcomes.map((outcome) => ({ from: node.id, outcome,
    to: outcome === "success" || outcome === "missing" && continueOnMissing.has(node.id) ? nodes[index + 1]!.id : outcome === "missing" ? "partial"
      : outcome === "blocked" || outcome === "human_required" ? "blocked" : outcome === "cancelled" ? "cancelled" : "failed" })))
}
function addLoops(annotations: CompilationAnnotations, trace: ExplorationTrace, eventNodes: Map<string, string>, nodes: ChainNode[],
  edges: TaskChain["edges"], variables: TaskChain["variables"], factors: Map<string, number>) {
  const occupied = new Set<string>()
  for (const [index, region] of annotations.repeatRegions.entries()) {
    const start = eventNodes.get(region.startEventId), endId = eventNodes.get(region.endEventId)
    if (!start || !endId) throw new Error("trace_loop_event_missing")
    const end = nodes.some((node) => node.id === `${endId}Checkpoint`) ? `${endId}Checkpoint` : endId
    const first = nodes.findIndex((node) => node.id === start), last = nodes.findIndex((node) => node.id === end)
    if (first === 0 || nodes.slice(first, last + 1).some((node) => occupied.has(node.id))) throw new Error("trace_loop_requires_entry_and_disjoint_regions")
    const body = new Set(nodes.slice(first, last + 1).map((node) => node.id))
    if (annotations.outputMappings.some((mapping) => mapping.source === "tool" && body.has(eventNodes.get(mapping.eventId)!))) throw new Error("trace_loop_output_requires_collection_provenance")
    body.forEach((id) => { occupied.add(id); factors.set(id, region.maxItems) })
    const id = `loop${index}`, exit = edges.find((edge) => edge.from === end && edge.outcome === "success")!
    factors.set(id, region.maxItems + 1)
    const next = exit.to; exit.to = id
    for (const edge of edges) if (edge.to === start && !body.has(edge.from)) edge.to = id
    const collection = readPath(trace.input, region.collectionPath) as JsonValue[]
    variables[`item${index}`] = inferredContract(`item${index}`, collection[0]!)
    variables[`cursor${index}`] = inferredContract(`cursor${index}`, 0)
    nodes.push({ ...base(id, "loop"), kind: "loop", iteration: { mode: "each", collection: { source: "input", path: region.collectionPath },
      itemVariable: `item${index}`, stableKeyPath: region.stableKeyPath }, cursorVariable: `cursor${index}`, maxIterations: region.maxItems })
    edges.push({ from: id, outcome: "body", to: start }, { from: id, outcome: "done", to: next },
      { from: id, outcome: "limit", to: "partial" }, { from: id, outcome: "failed", to: "failed" })
  }
}
function deriveBudget(nodes: ChainNode[], factors: Map<string, number>) {
  // WHY：每个节点的命令成本来自 BrowserSession 映射；循环采用显式上限，无模型猜测或隐式重试。
  const commands = nodes.reduce((sum, node) => sum + (factors.get(node.id) ?? 1) * (node.kind === "observe" ? node.scope === "page" ? 5 : node.scope === "target" ? 3 : 1
    : node.kind === "browser" ? node.operation === "navigate" ? 3 : node.operation === "tab_open" ? 2
      : node.target?.kind === "semantic" ? ["click", "press"].includes(node.operation) ? 54 : 48
        : 3 : node.kind === "human" ? 8 : 0), 0)
  return { maxTransitions: nodes.reduce((sum, node) => sum + (factors.get(node.id) ?? 1), 0), maxBrowserCommands: commands,
    maxActiveMs: Math.max(1000, nodes.reduce((sum, node) => sum + (factors.get(node.id) ?? 1) * ("timeoutMs" in node && node.kind !== "human" ? node.timeoutMs : 1), 0)),
    maxLlmCalls: nodes.filter((node) => node.kind === "llm").reduce((sum, node) => sum + (factors.get(node.id) ?? 1), 0), maxInvocations: 1, maxDepth: 1 }
}
