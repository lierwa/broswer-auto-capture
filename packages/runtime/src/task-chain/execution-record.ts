import {
  NODE_EXECUTION_RECORD_BYTES, NODE_VALUE_RECORD_BYTES, nodeBindings,
  type ChainNode, type JsonValue, type NodeExecutionRecord, type NodeLoopRecord, type NodeValueRecord, type ValueBinding,
} from "@browser-capture/contracts"
import type { RuntimeState } from "./runtime.js"

const encoder = new TextEncoder()
const sensitiveKey = /cookie|password|passwd|authorization|bearer|token|secret|profile|user.?data.?dir|credential|api.?key|private.?key|captcha|verification.?code|one.?time|^otp$|session.?id|验证码|登录态|口令/i
const rawPageKey = /^(html|dom|pageContent|pageSnapshot|selectorMap|selector_map|screenshot|rawPage|rawResponse)$/i
const allowedCapabilities = new Set(["browser.read-fields:2", "data.transform:1"])
const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).byteLength
const knownCapability = (node: Extract<ChainNode, { kind: "capability" }>) =>
  allowedCapabilities.has(`${node.capability.name}:${node.capability.version}`)

/** WHY：动态合同只证明结构；原始浏览器来源即使改名为 source、写变量或经过恒等 Function，也不进入详情仓库。 */
function rawOutput(node: ChainNode) {
  return ["browser", "observe", "human"].includes(node.kind)
    || node.kind === "invoke"
    || node.kind === "capability" && !knownCapability(node)
    || node.kind === "llm" && "delegate" in node && Boolean(node.delegate)
}

function outputBindings(node: ChainNode): ValueBinding[] {
  if (node.kind === "emit") return [node.output.kind === "value" ? node.output.value : node.output.artifact]
  if (node.kind === "terminal") return "result" in node && node.result
    ? [node.result.output.kind === "value" ? node.result.output.value : node.result.output.artifact] : []
  return nodeBindings(node)
}

function nodePolluted(state: RuntimeState, nodeId: string, seen: Set<string>): boolean {
  if (seen.has(`node:${nodeId}`)) return false
  const node = state.compiled.nodes.get(nodeId)
  if (!node || rawOutput(node)) return true
  const previous = state.run.events.findLast((event) => event.nodeId === nodeId && event.status === "finished")?.execution?.output
  if (previous?.reason === "raw_source" || previous?.reason === "unsupported_capability") return true
  const next = new Set(seen).add(`node:${nodeId}`)
  return outputBindings(node).some((binding) => bindingPolluted(state, binding, next))
}

function variableBindings(node: ChainNode, name: string): ValueBinding[] {
  const bindings = node.writes.some((write) => write.variable === name) ? outputBindings(node) : []
  if (node.kind === "loop" && node.iteration.mode === "each" && node.iteration.itemVariable === name) {
    bindings.push(node.iteration.collection)
  }
  if (node.kind === "loop" && "accumulators" in node) {
    bindings.push(...node.accumulators.filter((item) => item.variable === name).flatMap((item) => [item.initial, item.next]))
  }
  if (node.kind === "invoke" && node.iteration.mode === "each" && node.iteration.itemVariable === name) {
    bindings.push(node.iteration.collection)
  }
  return bindings
}

export function bindingPolluted(state: RuntimeState, binding: ValueBinding, seen = new Set<string>()): boolean {
  if (binding.source !== "constant" && binding.path.some((part) => sensitiveKey.test(String(part)) || rawPageKey.test(String(part)))) return true
  if (binding.source === "node") return nodePolluted(state, binding.nodeId, seen)
  if (binding.source !== "variable" || seen.has(`variable:${binding.name}`)) return false
  const next = new Set(seen).add(`variable:${binding.name}`)
  // WHY：同名变量可有多个合法写入者；恢复后不猜最后一个 writer，任一原始来源都保守脱敏。
  return [...state.compiled.nodes.values()].some((node) =>
    node.writes.some((write) => write.variable === binding.name && (rawOutput(node)
      || write.path.some((part) => sensitiveKey.test(String(part)) || rawPageKey.test(String(part)))))
    || variableBindings(node, binding.name).some((source) => bindingPolluted(state, source, next)))
}

type Scrubbed = { value: JsonValue; redacted: boolean; limited: boolean }
function scrub(value: JsonValue, depth = 0): Scrubbed {
  if (depth > 32) return { value: "[内容过深]", redacted: false, limited: true }
  if (typeof value === "string" && /^\s*(?:<!doctype\s+html|<html\b|Bearer\s+[A-Za-z0-9._-]{12,})/i.test(value)) {
    return { value: "[已脱敏]", redacted: true, limited: false }
  }
  if (value === null || typeof value !== "object") return { value, redacted: false, limited: false }
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value)
  const children = entries.map(([key, child]) => ({ key, ...(sensitiveKey.test(key) || rawPageKey.test(key)
    ? { value: "[已脱敏]" as JsonValue, redacted: true, limited: false } : scrub(child, depth + 1)) }))
  return { value: Array.isArray(value) ? children.map((item) => item.value)
    : Object.fromEntries(children.map((item) => [item.key, item.value])),
  redacted: children.some((item) => item.redacted), limited: children.some((item) => item.limited) }
}

export function valueRecord(value: JsonValue, forbidden?: "raw_source" | "unsupported_capability"): NodeValueRecord {
  if (forbidden) return { status: "redacted", reason: forbidden }
  if (bytes(value) > 1024 * 1024) return { status: "truncated", reason: "value_size_limit" }
  const safe = scrub(value)
  if (safe.limited || bytes(safe.value) > NODE_VALUE_RECORD_BYTES) return { status: "truncated", reason: "value_size_limit" }
  return safe.redacted ? { status: "redacted", value: safe.value, reason: "sensitive_fields" }
    : { status: "recorded", value: safe.value }
}

function startedEvent(state: RuntimeState, node: ChainNode) {
  return state.run.events.findLast((event) => event.nodeId === node.id && event.status === "started")
}

export function withholdExecutionInput(state: RuntimeState, node: ChainNode) {
  const event = startedEvent(state, node)
  if (event) event.execution = boundedRecord({ ...event.execution, input: { status: "redacted", reason: "raw_source" } })
}

export function boundExecutionInput(state: RuntimeState, node: ChainNode, value: JsonValue,
  bindings: Record<string, ValueBinding> | ValueBinding[] = {}) {
  const event = startedEvent(state, node)
  if (!event) return
  const whole = ["browser", "observe", "human"].includes(node.kind) ? "raw_source" as const
    : node.kind === "llm" && "delegate" in node && node.delegate ? "raw_source" as const
    : node.kind === "capability" && !knownCapability(node) ? "unsupported_capability" as const : undefined
  const named = !Array.isArray(bindings) && value !== null && typeof value === "object" && !Array.isArray(value)
  const polluted = Array.isArray(bindings) && bindings.some((binding) => bindingPolluted(state, binding))
  const safe = named ? Object.fromEntries(Object.entries(value).map(([name, item]) =>
    [name, bindings[name] && bindingPolluted(state, bindings[name]) ? "[原始来源已脱敏]" : item])) : value
  const partial = named && Object.values(bindings).some((binding) => bindingPolluted(state, binding))
  const input = valueRecord(safe, whole ?? (polluted ? "raw_source" : undefined))
  event.execution = boundedRecord({ ...event.execution, input: partial && input.status === "recorded"
    ? { ...input, status: "redacted", reason: "raw_source" } : input })
}

export function captureLoopRecord(state: RuntimeState, node: Extract<ChainNode, { kind: "loop" }>,
  exitReason?: NodeLoopRecord["exitReason"], total?: number) {
  const event = startedEvent(state, node), frame = state.checkpoint.loops[node.id]
  if (!event || !frame || unsafeLoop(node, state)) return
  event.execution = boundedRecord({ ...event.execution, loop: { index: frame.index,
    activeStableKey: frame.activeStableKey, completedStableKeysCount: frame.completedStableKeys.length,
    ...(total === undefined ? {} : { total }), ...(exitReason ? { exitReason } : {}) } })
}

function unsafeLoop(node: Extract<ChainNode, { kind: "loop" }>, state: RuntimeState) {
  return node.iteration.mode === "each" && (node.iteration.stableKeyPath.some((part) => sensitiveKey.test(String(part)))
    || bindingPolluted(state, node.iteration.collection))
}

function belongsToBody(state: RuntimeState, owner: Extract<ChainNode, { kind: "loop" }>, nodeId: string) {
  const entry = "body" in owner ? owner.body.entry : state.compiled.edges.get(`${owner.id}:body`)?.to
  const exits = new Set("body" in owner ? owner.body.exits : [])
  const pending = entry ? [entry] : [], seen = new Set<string>()
  while (pending.length) {
    const current = pending.pop()!
    if (current === owner.id || seen.has(current)) continue
    const node = state.compiled.nodes.get(current)
    if (!node || node.kind === "terminal") continue
    if (current === nodeId) return true
    seen.add(current)
    if (!exits.has(current)) pending.push(...state.compiled.chain.edges.filter((edge) => edge.from === current).map((edge) => edge.to))
  }
  return false
}

function loopStamps(state: RuntimeState, node: ChainNode) {
  return Object.entries(state.checkpoint.loops).flatMap(([nodeId, frame]) => {
    const owner = state.compiled.nodes.get(nodeId)
    if (nodeId === node.id || frame.activeStableKey === null || owner?.kind !== "loop" || unsafeLoop(owner, state)
      || !belongsToBody(state, owner, node.id)) return []
    return [{ nodeId, index: frame.index, stableKey: frame.activeStableKey }]
  })
}

export function executionRecordForEvent(state: RuntimeState, node: ChainNode, status: "started" | "finished",
  output?: JsonValue): NodeExecutionRecord {
  const loops = loopStamps(state, node)
  if (status === "started") return boundedRecord(loops.length ? { loops } : {})
  const previous = startedEvent(state, node)?.execution
  const resumedObservation = state.resumingNodeId === node.id && state.resumeObservation !== null
  const forbidden = resumedObservation ? "raw_source" as const
    : rawOutput(node) ? node.kind === "capability" ? "unsupported_capability" as const : "raw_source" as const
    : outputBindings(node).some((binding) => bindingPolluted(state, binding)) ? "raw_source" as const : undefined
  return boundedRecord({ ...previous, ...(loops.length ? { loops } : {}), output: output === undefined
    ? { status: "missing" } : valueRecord(output, forbidden) })
}

function boundedRecord(record: NodeExecutionRecord): NodeExecutionRecord {
  if (bytes(record) <= NODE_EXECUTION_RECORD_BYTES) return record
  const { loops: _loops, ...withoutLoops } = record
  if (bytes(withoutLoops) <= NODE_EXECUTION_RECORD_BYTES) return withoutLoops
  return { ...(record.input ? { input: { status: "truncated", reason: "event_size_limit" } as NodeValueRecord } : {}),
    ...(record.output ? { output: { status: "truncated", reason: "event_size_limit" } as NodeValueRecord } : {}) }
}
