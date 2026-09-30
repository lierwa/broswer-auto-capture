import type { ChainNode, JsonValue, Predicate, ValueBinding } from "@browser-capture/contracts"
import { evaluatePredicate } from "./bindings.js"
import { boundExecutionInput } from "./execution-record.js"
import type { RuntimeState } from "./runtime.js"

export function predicateRecords() {
  return { values: {} as Record<string, JsonValue>, bindings: {} as Record<string, ValueBinding> }
}

/** WHY：observer 只看既有求值器实际读取的值，保留有序 case 的短路，不为详情重新求值。 */
export function evaluateRecordedPredicate(state: RuntimeState, node: ChainNode, predicate: Predicate,
  name: string, records = predicateRecords()) {
  try {
    return evaluatePredicate(predicate, state.context, (parameter, value, binding) => {
      const key = `${name}.${parameter}`
      records.values[key] = value; records.bindings[key] = binding
    })
  } finally {
    // WHY：exists 可在绑定缺失时直接返回 false；未读到参数不等于实际传入了空对象。
    if (Object.keys(records.values).length) boundExecutionInput(state, node, records.values, records.bindings)
  }
}
