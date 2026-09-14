import type { ChainNode, JsonValue, StableChainNode } from "@browser-capture/contracts"
import { evaluatePredicate, readPath, resolveBinding } from "./bindings.js"
import { digestJson } from "./hash.js"
import type { RuntimeState } from "./runtime.js"
import type { NodeCapabilityResult } from "./types.js"

type LoopNode = Extract<ChainNode, { kind: "loop" }>
type StableLoopNode = Extract<StableChainNode, { kind: "loop" }>
type WriteVariable = (state: RuntimeState, name: string, value: JsonValue) => void

export function executeLoop(state: RuntimeState, node: LoopNode, writeVariable: WriteVariable): NodeCapabilityResult {
  const frame = state.checkpoint.loops[node.id] ?? { index: 0, completedStableKeys: [], activeStableKey: null }
  const returnedFromBody = frame.activeStableKey !== null
  if (returnedFromBody) {
    if ("accumulators" in node) appendBodyValues(state, node, writeVariable)
    if (!frame.completedStableKeys.includes(frame.activeStableKey!)) frame.completedStableKeys.push(frame.activeStableKey!)
    frame.activeStableKey = null; frame.index += 1
  } else if ("accumulators" in node) initializeAccumulators(state, node, writeVariable)
  state.checkpoint.loops[node.id] = frame
  writeVariable(state, node.cursorVariable, frame.index)
  if (returnedFromBody && "stopWhen" in node && node.stopWhen && evaluatePredicate(node.stopWhen, state.context)) {
    return { outcome: "done", output: null }
  }
  if (node.iteration.mode === "while") {
    const repeatCondition = "repeatCondition" in node.iteration ? node.iteration.repeatCondition : undefined
    const predicate = returnedFromBody && repeatCondition ? repeatCondition : node.iteration.condition
    if (!evaluatePredicate(predicate, state.context)) return { outcome: "done", output: null }
    if (frame.index >= node.maxIterations) return { outcome: "limit", output: null }
    frame.activeStableKey = String(frame.index)
    return { outcome: "body", output: null }
  }
  const collection = resolveBinding(node.iteration.collection, state.context)
  if (!Array.isArray(collection)) throw new Error("loop_collection_required")
  let item: JsonValue | undefined, stableKey = ""
  while (frame.index < collection.length) {
    item = collection[frame.index]!
    const stableValue = readPath(item, node.iteration.stableKeyPath)
    if (!["string", "number", "boolean"].includes(typeof stableValue)) throw new Error("loop_stable_key_scalar_required")
    stableKey = String(stableValue)
    if (!frame.completedStableKeys.includes(stableKey)) break
    frame.index += 1
  }
  if (frame.index >= collection.length) return { outcome: "done", output: null }
  if (frame.index >= node.maxIterations) return { outcome: "limit", output: null }
  writeVariable(state, node.iteration.itemVariable, item!)
  frame.activeStableKey = stableKey
  return { outcome: "body", output: null }
}

function initializeAccumulators(state: RuntimeState, node: StableLoopNode, writeVariable: WriteVariable) {
  for (const accumulator of node.accumulators) {
    if (Object.hasOwn(state.context.variables, accumulator.variable)) continue
    writeVariable(state, accumulator.variable, uniqueItems(resolveBinding(accumulator.initial, state.context), accumulator.stableKeyPath))
  }
}

function appendBodyValues(state: RuntimeState, node: StableLoopNode, writeVariable: WriteVariable) {
  for (const accumulator of node.accumulators) {
    if (accumulator.appendWhen && !evaluatePredicate(accumulator.appendWhen, state.context)) continue
    const current = state.context.variables[accumulator.variable]
    if (!Array.isArray(current)) throw new Error("loop_accumulator_array_required")
    const next = resolveBinding(accumulator.next, state.context)
    writeVariable(state, accumulator.variable, uniqueItems([...current, ...asItems(next)], accumulator.stableKeyPath))
  }
}

function uniqueItems(value: JsonValue, stableKeyPath?: (string | number)[]) {
  const seen = new Set<string>(), result: JsonValue[] = []
  for (const item of asItems(value)) {
    const identity = stableKeyPath ? readPath(item, stableKeyPath) : digestJson(item)
    if (stableKeyPath && !["string", "number", "boolean"].includes(typeof identity)) {
      throw new Error("loop_accumulator_stable_key_scalar_required")
    }
    const key = String(identity)
    if (seen.has(key)) continue
    seen.add(key); result.push(structuredClone(item))
  }
  return result
}

function asItems(value: JsonValue): JsonValue[] { return Array.isArray(value) ? value : [value] }
