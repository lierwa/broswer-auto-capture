import { z } from "zod"
import { CONTRACT_VERSION, requiredStableNodeOutcomes, stableTaskChainSchema, type JsonValue,
  type StableChainNode, type StableTaskChain, type TaskDataContract, type TaskPlan, type ValueBinding } from "@browser-capture/contracts"
import { compileTaskChain, digestJson, readPath } from "@browser-capture/runtime"
import { regionAggregates, validateAnnotations, type CompilationAnnotations } from "./compilation-annotations.js"
import { validateExplorationResult, type ExplorationEvent, type ExplorationTrace } from "./exploration-trace.js"
import { inferredContract, observationContract, outputFieldContract } from "./trace-schema.js"

const unit = inferredContract("unit", null)
const constant = (value: JsonValue): ValueBinding => ({ source: "constant", value })
const output = (nodeId: string, path: (string | number)[] = []): ValueBinding => ({ source: "node", nodeId, path })
const base = (id: string, kind: StableChainNode["kind"], contract: TaskDataContract = unit) => ({ id, label: id,
  outputContract: contract, writes: [], outcomes: [...requiredStableNodeOutcomes[kind]] })

export function compileExplorationTrace(trace: ExplorationTrace, raw: unknown, plan: TaskPlan, stepId: string,
  version: number, modelId: string) {
  const step = plan.steps.find((item) => item.id === stepId)
  if (!step) throw new Error("plan_step_not_found")
  validateExplorationResult(trace.result, step.outputContract, trace.events, trace.input)
  const validated = validateAnnotations(raw, trace)
  assertRepeatedOutputsCollapsed(validated)
  const restored = restoreObservedEntry(trace, validated, step.inputContract)
  const events = semanticEvents(restored.events, restored.annotations)
  if (!events.length) throw new Error("trace_successful_path_required")
  const nodes: StableChainNode[] = [], eventNodes = new Map<string, string>(), eventOutputs = new Map<string, string>()
  const counters = new Map<string, number>()
  for (const event of events) {
    const id = nextSemanticId(event, counters)
    nodes.push(eventCapability(event, id, restored.annotations, step.inputContract, trace.input))
    eventNodes.set(event.id, id); eventOutputs.set(event.id, id)
  }
  const { resultNode, mappingNodes, aggregateBodies } = outputNodes(restored.annotations, trace, step.outputContract, eventOutputs, modelId)
  const bodyExits = new Map<number, string>()
  for (const body of aggregateBodies.toSorted((left, right) => right.regionIndex - left.regionIndex
    || right.aggregateIndex - left.aggregateIndex)) {
    const end = eventNodes.get(restored.annotations.repeatRegions[body.regionIndex]!.endEventId)
    const position = end ? nodes.findIndex((node) => node.id === end) : -1
    if (position < 0) throw new Error("trace_repeat_aggregate_body_missing")
    nodes.splice(position + 1, 0, ...body.nodes)
  }
  for (const [regionIndex, region] of restored.annotations.repeatRegions.entries()) {
    const bodies = aggregateBodies.filter((body) => body.regionIndex === regionIndex)
      .toSorted((left, right) => left.aggregateIndex - right.aggregateIndex)
    bodyExits.set(regionIndex, bodies.at(-1)?.nodes.at(-1)?.id
      ?? eventNodes.get(region.endEventId)!)
  }
  nodes.push(...mappingNodes, resultNode)
  const completed = terminal("completed", "任务可观察完成条件满足", [output(resultNode.id)], step.outputContract,
    { name: "result", output: { kind: "value", value: output(resultNode.id) }, contract: step.outputContract })
  nodes.push(completed)
  const completion = restored.annotations.completion.map((item, index) => {
    const regionIndex = restored.annotations.repeatRegions.findIndex((region) => regionAggregates(region).length
      && eventInsideRegion(item.eventId, region.startEventId, region.endEventId, trace))
    if (regionIndex >= 0) return { id: `completion${index}`, description: item.description,
      predicate: { operator: "exists" as const,
        value: { source: "variable" as const, name: `accumulated${regionIndex}`, path: [] } } }
    const nodeId = eventOutputs.get(item.eventId)
    if (!nodeId) throw new Error("trace_completion_event_missing")
    return { id: `completion${index}`, description: item.description,
      predicate: { operator: "exists" as const, value: output(nodeId, item.resultPath) } }
  })
  const variables: StableTaskChain["variables"] = {}, factors = new Map<string, number>()
  const optional = new Set(restored.annotations.continueOnMissingEventIds.map((eventId) => eventNodes.get(eventId)).filter(Boolean) as string[])
  const edges = connect(nodes, optional)
  let entry = nodes[0]!.id
  entry = addLoops(restored.annotations, trace, eventNodes, bodyExits, aggregateBodies,
    nodes, edges, variables, factors, entry)
  nodes.push(terminal("partial", "链路只取得部分结果", [constant("partial")]),
    terminal("blocked", "外部条件阻止链路继续", [constant("blocked")]),
    terminal("failed", "链路执行失败", [constant("failed")]),
    terminal("cancelled", "链路已取消", [constant("cancelled")]))
  const chain = stableTaskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v1",
    id: step.chain.id, taskId: plan.taskId, version, plan: { id: plan.id, version: plan.version, digest: digestJson(plan) },
    stepId, name: step.title, inputContract: step.inputContract, outputContract: step.outputContract,
    variables, entry, nodes, edges, completion: [...completion, ...localCompletion(step)],
    budget: deriveBudget(nodes, factors, step.budget), reuseBoundary: restored.annotations.reuseBoundary,
    implementationSummary: "成功轨迹先归并为语义能力，再生成稳定控制图；重复证据不扩张节点，普通复跑不调用模型。",
    validation: { status: "candidate", evidence: [] } })
  return compileTaskChain(chain).chain
}

function eventInsideRegion(eventId: string, startId: string, endId: string, trace: ExplorationTrace) {
  const position = trace.events.findIndex((event) => event.id === eventId)
  const start = trace.events.findIndex((event) => event.id === startId)
  const end = trace.events.findIndex((event) => event.id === endId)
  return position >= start && position <= end
}

function assertRepeatedOutputsCollapsed(annotations: CompilationAnnotations) {
  const counts = new Map<string, number>()
  for (const mapping of annotations.outputMappings) {
    if (typeof mapping.outputPath.at(-1) !== "number" || aggregatedChild(mapping.outputPath, annotations)) continue
    const parent = JSON.stringify(mapping.outputPath.slice(0, -1))
    counts.set(parent, (counts.get(parent) ?? 0) + 1)
  }
  // WHY：三个以上同级数组项已经证明存在重复结构；逐项生成节点只会把探索记录伪装成可复跑链路。
  if ([...counts.values()].some((count) => count >= 3)) throw new Error("trace_repeat_region_required")
}

function semanticEvents(events: ExplorationEvent[], annotations: CompilationAnnotations) {
  const mapped = annotations.outputMappings.filter((mapping) => !aggregatedChild(mapping.outputPath, annotations)
    || annotations.repeatRegions.some((region) => regionAggregates(region)
      .some((aggregate) => samePath(mapping.outputPath, aggregate.itemOutputPath))))
  const required = new Set<string>([
    ...annotations.inputBindings.map((item) => item.eventId),
    ...mapped.flatMap(mappingEventIds),
    ...annotations.completion.map((item) => item.eventId), ...annotations.continueOnMissingEventIds,
    ...annotations.repeatRegions.flatMap((item) => [item.startEventId, item.endEventId,
      ...(item.collectionEvent ? [item.collectionEvent.eventId] : []), ...item.itemBindings.map((binding) => binding.eventId)]),
  ])
  const observation = new Set(["observe", "page", "read", "tabs"])
  // WHY：探索探针属于证据，不属于复跑步骤；未被来源、完成或循环引用的只读观察不会改变浏览器路径。
  return events.filter((event) => required.has(event.id) || !observation.has(event.command.type))
}

function outputNodes(annotations: CompilationAnnotations, trace: ExplorationTrace, outputContract: TaskDataContract,
  eventOutputs: Map<string, string>, modelId: string) {
  const nodes: StableChainNode[] = [], mappings: Record<string, ValueBinding> = {}, paths: Record<string, JsonValue> = {}
  const contracts: Record<string, TaskDataContract> = {}, aggregateBodies: Array<{
    regionIndex: number; aggregateIndex: number; nodes: StableChainNode[]; value: ValueBinding; contract: TaskDataContract
    definition: ReturnType<typeof regionAggregates>[number]
  }> = []
  const addField = (path: (string | number)[], binding: ValueBinding, contract: TaskDataContract) => {
    const key = `field${Object.keys(mappings).length}`
    mappings[key] = binding; paths[key] = path; contracts[key] = contract
  }
  for (const [regionIndex, region] of annotations.repeatRegions.entries()) {
    for (const [aggregateIndex, definition] of regionAggregates(region).entries()) {
      const mapping = annotations.outputMappings.find((item) => samePath(item.outputPath, definition.itemOutputPath))!
      const variable = aggregateVariable(regionIndex, aggregateIndex)
      const compiled = compileMapping(mapping, `repeat${regionIndex}_${aggregateIndex}`, trace, outputContract, eventOutputs, modelId)
      const contract = outputFieldContract(variable, outputContract, definition.outputPath,
        readPath(trace.result!.result, definition.outputPath))
      aggregateBodies.push({ regionIndex, aggregateIndex, nodes: compiled.nodes, value: compiled.binding, contract, definition })
      addField(definition.outputPath, { source: "variable", name: variable, path: [] }, contract)
    }
  }
  for (const [index, mapping] of annotations.outputMappings.entries()) {
    if (aggregatedChild(mapping.outputPath, annotations) || aggregateMapping(mapping.outputPath, annotations)) continue
    if (mapping.source === "aggregate_count") {
      const aggregate = aggregateBodies.find((item) => samePath(item.definition.outputPath, mapping.aggregateOutputPath))
      if (!aggregate) throw new Error("trace_aggregate_count_source_missing")
      const id = `mapping${index}Count`
      const contract = outputFieldContract(id, outputContract, mapping.outputPath,
        readPath(trace.result!.result, mapping.outputPath))
      nodes.push(dataCapability(id, contract, "count", { source: { source: "variable",
        name: aggregateVariable(aggregate.regionIndex, aggregate.aggregateIndex), path: [] } }))
      addField(mapping.outputPath, output(id), contract)
      continue
    }
    const compiled = compileMapping(mapping, `mapping${index}`, trace, outputContract, eventOutputs, modelId)
    nodes.push(...compiled.nodes); addField(mapping.outputPath, compiled.binding, compiled.contract)
  }
  const fieldsContract: TaskDataContract = { ...unit, id: "fields", schema: { type: "object", additionalProperties: false,
    required: Object.keys(mappings), properties: Object.fromEntries(Object.entries(contracts).map(([key, contract]) => [key, contract.schema])) } }
  nodes.push(dataCapability("fields", fieldsContract, "merge", mappings))
  const resultNode = dataCapability("result", outputContract, "transform", {
    source: output("fields"), mode: constant("assemble"), paths: constant(paths),
  })
  return { resultNode, mappingNodes: nodes, aggregateBodies }
}

function compileMapping(mapping: CompilationAnnotations["outputMappings"][number], id: string,
  trace: ExplorationTrace, outputContract: TaskDataContract, eventOutputs: Map<string, string>, modelId: string) {
  const contract = outputFieldContract(id, outputContract, mapping.outputPath, readPath(trace.result!.result, mapping.outputPath))
  if (mapping.source === "input") {
    return { nodes: [] as StableChainNode[], binding: { source: "input" as const, path: mapping.inputPath }, contract }
  }
  if (mapping.source === "aggregate_count") throw new Error("trace_aggregate_count_compile_position_invalid")
  if (mapping.source === "tool") {
    const nodeId = eventOutputs.get(mapping.eventId)
    if (!nodeId) throw new Error("trace_output_event_missing")
    return { nodes: [] as StableChainNode[], binding: output(nodeId, mapping.resultPath), contract }
  }
  const sourceId = `${id}Sources`, inferenceId = `${id}Inference`
  const sources = Object.fromEntries(mapping.eventIds.map((eventId, sourceIndex) => {
    const nodeId = eventOutputs.get(eventId)
    if (!nodeId) throw new Error("trace_inference_event_missing")
    return [`source${sourceIndex}`, output(nodeId)]
  }))
  sources.runtimeInput = { source: "input", path: [] }
  const nodes: StableChainNode[] = [dataCapability(sourceId, inferredContract(sourceId, {}), "merge", sources),
    { ...base(inferenceId, "llm", contract), kind: "llm",
      instruction: "根据本次 runtimeInput 和 source 工具证据计算输出。以下只是探索样本的来源说明，不得照抄样本值：\n" + mapping.instruction,
      input: output(sourceId), model: modelId, timeoutMs: 120000 }]
  return { nodes, binding: output(inferenceId), contract }
}

function mappingEventIds(mapping: CompilationAnnotations["outputMappings"][number]) {
  return mapping.source === "tool" ? [mapping.eventId] : mapping.source === "inference" ? mapping.eventIds : []
}

function aggregatedChild(path: (string | number)[], annotations: CompilationAnnotations) {
  return annotations.repeatRegions.some((region) => regionAggregates(region).some((aggregate) =>
    path.length === aggregate.outputPath.length + 1
    && aggregate.outputPath.every((part, index) => path[index] === part) && typeof path.at(-1) === "number"))
}

function aggregateMapping(path: (string | number)[], annotations: CompilationAnnotations) {
  return annotations.repeatRegions.some((region) => regionAggregates(region)
    .some((aggregate) => samePath(path, aggregate.itemOutputPath)))
}

function samePath(left: (string | number)[], right: (string | number)[]) {
  return left.length === right.length && left.every((part, index) => part === right[index])
}

function dataCapability(id: string, contract: TaskDataContract, operation: string,
  input: Record<string, ValueBinding>): Extract<StableChainNode, { kind: "capability" }> {
  return { ...base(id, "capability", contract), kind: "capability",
    capability: { name: "data.transform", version: 1 }, input,
    config: { operation, arguments: Object.fromEntries(Object.keys(input).map((name) => [name, name])) },
    effect: "read", timeoutMs: 30000 }
}

function eventCapability(event: ExplorationEvent, id: string, annotations: CompilationAnnotations,
  inputContract: TaskDataContract, traceInput: JsonValue): Extract<StableChainNode, { kind: "capability" }> {
  const command = event.command, input: Record<string, ValueBinding> = {}
  const add = (name: string, path: (string | number)[], semanticRole = false) => {
    input[name] = eventBinding(event, path, annotations, inputContract, traceInput, semanticRole)
    return name
  }
  const put = (name: string, binding: ValueBinding) => { input[name] = binding; return name }
  if (command.type === "request_help") {
    const resumedUrl = event.output && typeof event.output === "object" && !Array.isArray(event.output)
      && typeof event.output.url === "string" ? event.output.url : null
    const resumeWhen = resumedUrl ? { operator: "equals" as const, path: ["url"], expected: constant(resumedUrl) }
      : { operator: "exists" as const, path: ["url"] }
    return { ...base(id, "capability", observationContract(id, "observe")), kind: "capability",
      capability: { name: "browser.perform", version: 1 }, input, config: { mode: "human" }, effect: "idempotent_write",
      human: { reason: command.reason === "access" ? "access_restriction" : command.reason,
        prompt: command.prompt ?? "请处理当前页面后返回控制权", resumeWhen }, timeoutMs: command.timeoutMs ?? 1800000 }
  }
  const observation = command.type === "observe" || command.type === "page" || command.type === "read" || command.type === "tabs"
  let target: JsonValue | undefined, capture: JsonValue | undefined
  if (command.type === "read") {
    target = { kind: "locator", strategy: "css", value: add("captureTarget", ["selector"]) }
    capture = { scope: "target", target, maxItems: command.maxItems }
  } else if (command.type === "observe" || command.type === "page") capture = { scope: "page" }
  else if (command.type === "tabs") capture = { scope: "tabs" }
  else if (isObservationValue(event.output)) capture = { scope: "page" }
  const actionTarget = "target" in command && command.target
    ? capabilityTarget(command.target, add, put, traceInput, inputContract) : undefined
  const arguments_: Record<string, string> = {}
  if (!observation) for (const key of Object.keys(command).filter((key) => !["type", "target"].includes(key))) {
    arguments_[key] = add(`argument${upperFirst(key)}`, [key])
  }
  if (command.type === "navigate" || command.type === "follow") {
    input.captureNetworkEvidence = constant(true); arguments_.captureNetworkEvidence = "captureNetworkEvidence"
  }
  const operation = observation ? null : command.type === "follow" ? "navigate" : command.type
  const contract = observation ? observationContract(id, command.type)
    : capture ? observationContract(id, "observe") : inferredContract(id, event.output)
  return { ...base(id, "capability", contract), kind: "capability", capability: { name: "browser.perform", version: 1 }, input,
    config: { mode: "perform", operation, arguments: arguments_, ...(actionTarget ? { target: actionTarget } : {}),
      ...(capture ? { capture } : {}) }, effect: operation === null ? "read" : browserEffect(operation), timeoutMs: 30000 }
}

function eventBinding(event: ExplorationEvent, path: (string | number)[], annotations: CompilationAnnotations,
  inputContract: TaskDataContract, traceInput: JsonValue, semanticRole: boolean): ValueBinding {
  const sample = readPath(z.json().parse(event.command), path)
  if (semanticRole && (typeof sample !== "string" || !semanticTargetRoles.has(sample))) throw new Error("trace_semantic_role_unsupported")
  const parameter = annotations.inputBindings.find((item) => item.eventId === event.id
    && JSON.stringify(item.commandPath) === JSON.stringify(path))
  if (parameter) return !semanticRole || closedSemanticRole(inputContract, parameter.inputPath)
    ? { source: "input", path: parameter.inputPath } : constant(sample)
  for (const [index, region] of annotations.repeatRegions.entries()) {
    const item = region.itemBindings.find((entry) => entry.eventId === event.id
      && JSON.stringify(entry.commandPath) === JSON.stringify(path))
    if (item) return !semanticRole || region.collectionPath
      && closedSemanticRole(inputContract, [...region.collectionPath, 0, ...item.itemPath])
      ? { source: "variable", name: `item${index}`, path: item.itemPath } : constant(sample)
  }
  return constant(sample)
}

function capabilityTarget(targetValue: Extract<ExplorationEvent["command"], { target?: unknown }>["target"],
  add: (name: string, path: (string | number)[], semanticRole?: boolean) => string,
  put: (name: string, binding: ValueBinding) => string,
  traceInput: JsonValue, inputContract: TaskDataContract) {
  if (!targetValue) return undefined
  if ("selector" in targetValue) return { kind: "locator", strategy: "css", value: add("targetValue", ["target", "selector"]) }
  const fallback = semanticFallbackName(targetValue.name, traceInput, inputContract)
  return { kind: "semantic", role: add("targetRole", ["target", "role"], true),
    name: add("targetName", ["target", "name"]),
    ...(fallback ? { fallbackName: put("targetFallbackName", fallback) } : {}),
    ...(targetValue.occurrence === undefined ? {} : { occurrence: add("targetOccurrence", ["target", "occurrence"]) }) }
}

function browserEffect(operation: string): "read" | "idempotent_write" | "external_write" {
  if (["wait", "hover"].includes(operation)) return "read"
  return ["navigate", "scroll", "tab_select"].includes(operation) ? "idempotent_write" : "external_write"
}

function nextSemanticId(event: ExplorationEvent, counters: Map<string, number>) {
  const type = event.command.type
  const family = type === "navigate" || type === "follow" ? "navigate"
    : type === "observe" || type === "page" || type === "tabs" ? "observe"
      : type === "read" ? "read" : type === "request_help" ? "human" : "perform"
  const next = (counters.get(family) ?? 0) + 1; counters.set(family, next)
  return `${family}${next}`
}

function terminal(status: "completed" | "failed" | "blocked" | "cancelled" | "partial", reason: string,
  evidence: ValueBinding[], contract = unit,
  result?: Extract<StableChainNode, { kind: "terminal" }>["result"]): Extract<StableChainNode, { kind: "terminal" }> {
  return { ...base(status, "terminal", contract), kind: "terminal", status, reason, evidence, ...(result ? { result } : {}) }
}

function connect(nodes: StableChainNode[], continueOnMissing: Set<string>): StableTaskChain["edges"] {
  return nodes.flatMap((node, index) => node.outcomes.map((outcome) => ({ from: node.id, outcome,
    to: outcome === "success" ? nodes[index + 1]!.id
      : outcome === "missing" && continueOnMissing.has(node.id) ? nodes[index + 1]!.id
        : outcome === "missing" || outcome === "partial" || outcome === "limit" ? "partial"
          : outcome === "blocked" || outcome === "human_required" ? "blocked"
            : outcome === "cancelled" ? "cancelled" : "failed" })))
}

function addLoops(annotations: CompilationAnnotations, trace: ExplorationTrace, eventNodes: Map<string, string>,
  bodyExits: Map<number, string>, aggregateBodies: Array<{
    regionIndex: number; aggregateIndex: number; nodes: StableChainNode[]; value: ValueBinding; contract: TaskDataContract
    definition: ReturnType<typeof regionAggregates>[number]
  }>,
  nodes: StableChainNode[], edges: StableTaskChain["edges"], variables: StableTaskChain["variables"],
  factors: Map<string, number>, originalEntry: string) {
  let entry = originalEntry
  for (const [index, region] of annotations.repeatRegions.entries()) {
    const start = eventNodes.get(region.startEventId), end = bodyExits.get(index) ?? eventNodes.get(region.endEventId)
    if (!start || !end) throw new Error("trace_loop_event_missing")
    const first = nodes.findIndex((node) => node.id === start), last = nodes.findIndex((node) => node.id === end)
    if (first < 0 || last < first) throw new Error("trace_loop_requires_ordered_region")
    const body = new Set(nodes.slice(first, last + 1).map((node) => node.id)), id = `loop${index}`
    for (const nodeId of body) factors.set(nodeId, region.maxItems)
    factors.set(id, region.maxItems + 1)
    const exit = edges.find((edge) => edge.from === end && edge.outcome === "success")
    if (!exit) throw new Error("trace_loop_exit_missing")
    const next = exit.to; exit.to = id
    for (const edge of edges) if (edge.to === start && !body.has(edge.from)) edge.to = id
    if (entry === start) entry = id
    const collectionEvent = region.collectionEvent ? trace.events.find((event) => event.id === region.collectionEvent!.eventId) : null
    const collection = (collectionEvent ? readPath(collectionEvent.output, region.collectionEvent!.resultPath)
      : readPath(trace.input, region.collectionPath!)) as JsonValue[]
    variables[`item${index}`] = inferredContract(`item${index}`, collection[0]!)
    variables[`cursor${index}`] = inferredContract(`cursor${index}`, 0)
    const aggregates = aggregateBodies.filter((item) => item.regionIndex === index)
    for (const aggregate of aggregates) variables[aggregateVariable(index, aggregate.aggregateIndex)] = aggregate.contract
    const stop = aggregates.find((item) => item.definition.stopAfterInputPath)
    nodes.push({ ...base(id, "loop"), kind: "loop", iteration: { mode: "each",
      collection: region.collectionEvent ? output(eventNodes.get(region.collectionEvent.eventId)!, region.collectionEvent.resultPath)
        : { source: "input", path: region.collectionPath! }, itemVariable: `item${index}`,
      stableKeyPath: region.stableKeyPath }, cursorVariable: `cursor${index}`, maxIterations: region.maxItems,
      body: { entry: start, exits: [end] }, accumulators: aggregates.map((aggregate) => ({
        variable: aggregateVariable(index, aggregate.aggregateIndex), initial: constant([]), next: aggregate.value,
        operation: "append_unique" as const,
        ...(aggregate.definition.stableKeyPath?.length ? { stableKeyPath: aggregate.definition.stableKeyPath } : {}),
        ...(aggregate.definition.appendWhen ? { appendWhen: { operator: "equals" as const,
          left: withPath(aggregate.value, aggregate.definition.appendWhen.path),
          right: constant(aggregate.definition.appendWhen.equals) } } : {}),
      })), ...(stop ? { stopWhen: { operator: "array_length_at_least" as const,
        value: { source: "variable" as const, name: aggregateVariable(index, stop.aggregateIndex), path: [] },
        minimum: { source: "input" as const, path: stop.definition.stopAfterInputPath! } } } : {}) })
    edges.push({ from: id, outcome: "body", to: start }, { from: id, outcome: "done", to: next },
      { from: id, outcome: "limit", to: "partial" }, { from: id, outcome: "failed", to: "failed" })
  }
  return entry
}

function aggregateVariable(regionIndex: number, aggregateIndex: number) {
  return aggregateIndex === 0 ? `accumulated${regionIndex}` : `accumulated${regionIndex}_${aggregateIndex}`
}
function withPath(binding: ValueBinding, path: (string | number)[]): ValueBinding {
  return binding.source === "constant" ? binding : { ...binding, path: [...binding.path, ...path] }
}

function deriveBudget(nodes: StableChainNode[], factors: Map<string, number>, authorized: TaskPlan["steps"][number]["budget"]) {
  const hasBrowser = nodes.some((node) => node.kind === "capability" && node.capability.name === "browser.perform")
  return { maxTransitions: Math.max(1, nodes.reduce((sum, node) => sum + (factors.get(node.id) ?? 1), 0)),
    // WHY：BrowserSkill 自己展开并逐条记账底层命令；编译器只继承计划已授权的硬上限，不能猜动作展开成本。
    maxBrowserCommands: hasBrowser ? authorized.maxBrowserCommands : 0,
    maxActiveMs: Math.min(authorized.maxActiveMs, Math.max(1000, nodes.reduce((sum, node) => sum
      + (factors.get(node.id) ?? 1) * ("timeoutMs" in node ? node.timeoutMs : 1), 0))),
    maxLlmCalls: nodes.filter((node) => node.kind === "llm").reduce((sum, node) => sum + (factors.get(node.id) ?? 1), 0),
    maxInvocations: 1, maxDepth: 1 }
}

function restoreObservedEntry(trace: ExplorationTrace, annotations: CompilationAnnotations, inputContract: TaskDataContract) {
  const indexed = new Map(trace.events.map((event) => [event.id, event]))
  const events = annotations.replayEventIds.map((id) => indexed.get(id)!)
  const required = new Set<string>([
    ...annotations.outputMappings.filter((mapping) => !aggregatedChild(mapping.outputPath, annotations)
      || annotations.repeatRegions.some((region) => regionAggregates(region)
        .some((aggregate) => samePath(mapping.outputPath, aggregate.itemOutputPath))))
      .flatMap(mappingEventIds),
    ...annotations.completion.map((item) => item.eventId),
    ...annotations.repeatRegions.flatMap((region) => [region.startEventId, region.endEventId,
      ...(region.collectionEvent ? [region.collectionEvent.eventId] : []), ...region.itemBindings.map((binding) => binding.eventId)]),
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
  return { events: [entry, ...events.slice(match.index + 1)], annotations: { ...annotations,
    replayEventIds: [entryId, ...events.slice(match.index + 1).map((event) => event.id)],
    inputBindings: [...annotations.inputBindings.filter((binding) => kept.has(binding.eventId)),
      { eventId: entryId, commandPath: ["url"], inputPath: match.path }],
    continueOnMissingEventIds: annotations.continueOnMissingEventIds.filter((id) => kept.has(id)) } }
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
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null }
  catch { return null }
}
function inputUrlPaths(value: JsonValue, path: (string | number)[] = []): Array<{ path: (string | number)[]; url: string }> {
  if (typeof value === "string") { const url = normalizedPublicUrl(value); return url ? [{ path, url }] : [] }
  if (Array.isArray(value)) return value.flatMap((item, index) => inputUrlPaths(item, [...path, index]))
  if (!value || typeof value !== "object") return []
  return Object.entries(value).flatMap(([key, child]) => inputUrlPaths(child, [...path, key]))
}

function localCompletion(step: TaskPlan["steps"][number]): StableTaskChain["completion"] {
  if (step.invocation.mode === "each") return []
  const bind = (value: ValueBinding): ValueBinding | null => {
    if (value.source === "constant") return value
    if (value.source === "node" && value.nodeId === step.id) return output("completed", value.path)
    if (value.source !== "input" || step.input.source !== "input") return null
    const prefix = step.input.path
    return prefix.every((part, index) => value.path[index] === part)
      ? { source: "input", path: value.path.slice(prefix.length) } : null
  }
  return step.completion.flatMap<StableTaskChain["completion"][number]>((condition, index) => {
    const predicate = condition.predicate
    if (predicate.operator === "exists") {
      const value = bind(predicate.value)
      return value ? [{ ...condition, id: `business${index}`, predicate: { operator: "exists" as const, value } }] : []
    }
    if (predicate.operator === "array_length_at_least") {
      const value = bind(predicate.value), minimum = bind(predicate.minimum)
      return value && minimum ? [{ ...condition, id: `business${index}`,
        predicate: { operator: "array_length_at_least" as const, value, minimum } }] : []
    }
    const left = bind(predicate.left), right = bind(predicate.right)
    return left && right ? [{ ...condition, id: `business${index}`, predicate: { ...predicate, left, right } }] : []
  })
}

const semanticTargetRoles = new Set(["link", "button", "textbox", "combobox"])
function semanticFallbackName(targetName: string, input: JsonValue, contract: TaskDataContract) {
  const candidates = inputStringPaths(input).filter((candidate) => candidate.value.length >= 4
    && candidate.value !== targetName && targetName.includes(candidate.value)
    && schemaAtPath(contract, candidate.path)?.type === "string")
  return candidates.length === 1 ? { source: "input" as const, path: candidates[0]!.path } : null
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
function upperFirst(value: string) { return value ? value[0]!.toUpperCase() + value.slice(1) : value }
