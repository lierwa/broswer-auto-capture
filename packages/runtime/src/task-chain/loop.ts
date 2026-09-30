import type { ChainNode, JsonValue, StableChainNode, StableChainNodeV2 } from "@browser-capture/contracts"
import { readPath, resolveBinding } from "./bindings.js"
import { digestJson } from "./hash.js"
import type { RuntimeState } from "./runtime.js"
import type { NodeCapabilityResult } from "./types.js"
import { boundExecutionInput, captureLoopRecord } from "./execution-record.js"
import { evaluateRecordedPredicate, predicateRecords } from "./recorded-predicate.js"

type LoopNode = Extract<ChainNode, { kind: "loop" }>
type StableLoopNode = Extract<StableChainNode | StableChainNodeV2, { kind: "loop" }>
type WriteVariable = (state: RuntimeState, name: string, value: JsonValue) => void

export function executeLoop(state: RuntimeState, node: LoopNode, writeVariable: WriteVariable): NodeCapabilityResult {
  const records = predicateRecords()
  const finish = (outcome: NodeCapabilityResult["outcome"], exitReason?: Parameters<typeof captureLoopRecord>[2], total?: number) => {
    captureLoopRecord(state, node, exitReason, total)
    return { outcome, output: null }
  }
  const frame = state.checkpoint.loops[node.id] ?? { index: 0, completedStableKeys: [], activeStableKey: null }
  const previous = state.run.events.findLast((event) => event.nodeId === node.id && event.status === "finished")?.execution
  const returnedFromBody = frame.activeStableKey !== null
  if (returnedFromBody) {
    if ("accumulators" in node) appendBodyValues(state, node, writeVariable, records)
    if (!frame.completedStableKeys.includes(frame.activeStableKey!)) frame.completedStableKeys.push(frame.activeStableKey!)
    frame.activeStableKey = null; frame.index += 1
  } else if ("accumulators" in node) initializeAccumulators(state, node, writeVariable)
  state.checkpoint.loops[node.id] = frame
  writeVariable(state, node.cursorVariable, frame.index)
  if (returnedFromBody && "stopWhen" in node && node.stopWhen && evaluateRecordedPredicate(state, node, node.stopWhen, "stop", records)) {
    return finish("done", "stop_when", previous?.loop?.total)
  }
  if (node.iteration.mode === "while") {
    const repeatCondition = "repeatCondition" in node.iteration ? node.iteration.repeatCondition : undefined
    const predicate = returnedFromBody && repeatCondition ? repeatCondition : node.iteration.condition
    if (!evaluateRecordedPredicate(state, node, predicate, "continue", records)) return finish("done", "condition_false")
    if (frame.index >= node.maxIterations) return finish("limit", "iteration_limit")
    frame.activeStableKey = String(frame.index)
    return finish("body")
  }
  const fixed = ["input", "constant"].includes(node.iteration.collection.source)
  // WHY：循环只读固定输入；能力/Function 仍取得副本，不能为每一项复制整个不可变集合。
  const collection = resolveBinding(node.iteration.collection, state.context, !fixed)
  if (!Array.isArray(collection)) throw new Error("loop_collection_required")
  // WHY：固定集合绑定在同 run 内不可变，首次 started 留存后按节点定位；后续只保留本轮判断，不重复序列化整集合。
  if (!fixed || !previous) boundExecutionInput(state, node, { ...records.values, collection },
    { ...records.bindings, collection: node.iteration.collection })
  // WHY：首次无法证明总数也是事实，不在每轮重试哈希；恢复缺少旧事实时才重新核验。
  const total = fixed && previous ? previous.loop?.total : reliableTotal(node, collection)
  let item: JsonValue | undefined, stableKey = ""
  while (frame.index < collection.length) {
    item = collection[frame.index]!
    const stableValue = readPath(item, node.iteration.stableKeyPath)
    if (!["string", "number", "boolean"].includes(typeof stableValue)) throw new Error("loop_stable_key_scalar_required")
    stableKey = String(stableValue)
    if (!frame.completedStableKeys.includes(stableKey)) break
    frame.index += 1
  }
  if (frame.index >= collection.length) return finish("done", "collection_exhausted", total)
  if (frame.index >= node.maxIterations) return finish("limit", "iteration_limit", total)
  writeVariable(state, node.iteration.itemVariable, item!)
  frame.activeStableKey = stableKey
  return finish("body", undefined, total)
}

/** WHY：技术上限不是分母；动态集合每轮可改变，只有固定完整输入且键无身份冲突时才保存总数。 */
function reliableTotal(node: LoopNode, collection: JsonValue[]): number | undefined {
  if (node.iteration.mode !== "each" || !["input", "constant"].includes(node.iteration.collection.source)) return undefined
  const seen = new Map<string, string>()
  try {
    for (const item of collection) {
      const value = readPath(item, node.iteration.stableKeyPath)
      if (!["string", "number", "boolean"].includes(typeof value)) return undefined
      const key = String(value), digest = digestJson(item)
      if (seen.has(key) && seen.get(key) !== digest) return undefined
      seen.set(key, digest)
    }
  } catch { return undefined }
  return seen.size
}

function initializeAccumulators(state: RuntimeState, node: StableLoopNode, writeVariable: WriteVariable) {
  for (const accumulator of node.accumulators) {
    if (Object.hasOwn(state.context.variables, accumulator.variable)) continue
    writeVariable(state, accumulator.variable, uniqueItems(resolveBinding(accumulator.initial, state.context), accumulator.stableKeyPath))
  }
}

function appendBodyValues(state: RuntimeState, node: StableLoopNode, writeVariable: WriteVariable, records: ReturnType<typeof predicateRecords>) {
  for (const accumulator of node.accumulators) {
    if (accumulator.appendWhen && !evaluateRecordedPredicate(state, node, accumulator.appendWhen, `append-${accumulator.variable}`, records)) continue
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
