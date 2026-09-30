import { randomUUID } from "node:crypto"
import { invokeChainResultSchema, type ChainNode, type JsonValue } from "@browser-capture/contracts"
import { readPath, resolveBinding } from "./bindings.js"
import { digestJson, stableUuid } from "./hash.js"
import { beginEffect, completeEffect, invokedOutput, markEffectUncertain, syncCheckpoint } from "./run-state.js"
import { UncertainEffectError } from "./runtime-support.js"
import type { RuntimeState } from "./runtime.js"
import type { NodeCapabilityResult } from "./types.js"
import { boundExecutionInput } from "./execution-record.js"

export async function executeInvoke(state: RuntimeState, node: Extract<ChainNode, { kind: "invoke" }>, idempotencyKey: string,
  writeVariable: (state: RuntimeState, name: string, value: JsonValue) => void): Promise<NodeCapabilityResult> {
  if (!state.capabilities.invoke) throw new Error("invoke_capability_unavailable")
  const rawInput = node.iteration.mode === "once" ? resolveBinding(node.input, state.context) : null
  const items = node.iteration.mode === "each" ? resolveBinding(node.iteration.collection, state.context) : [rawInput]
  if (!Array.isArray(items)) throw new Error("invoke_collection_required")
  // WHY：逐项父节点只留真实集合输入；每个 child 的实参属于独立子调用，不能把最后一项冒充父节点实参。
  if (node.iteration.mode === "once") boundExecutionInput(state, node, rawInput!, [node.input])
  else boundExecutionInput(state, node, { collection: items }, { collection: node.iteration.collection })
  const unique: { item: JsonValue; stableKey: string }[] = [], seen = new Map<string, string>()
  for (const item of items) {
    const stableValue = node.iteration.mode === "each" ? readPath(item, node.iteration.stableKeyPath) : "once"
    if (!["string", "number", "boolean"].includes(typeof stableValue)) throw new Error("invoke_stable_key_scalar_required")
    const stableKey = String(stableValue), itemDigest = digestJson(item)
    const previous = seen.get(stableKey)
    if (previous && previous !== itemDigest) throw new Error("invoke_stable_key_collision")
    if (previous) continue
    seen.set(stableKey, itemDigest); unique.push({ item, stableKey })
  }
  const selected = node.iteration.mode === "each" ? unique.slice(0, node.iteration.maxItems) : unique
  const truncated = node.iteration.mode === "each" && unique.length > node.iteration.maxItems
  const outputs: JsonValue[] = [], failures: string[] = []
  for (const { item, stableKey } of selected) {
    if (node.iteration.mode === "each") writeVariable(state, node.iteration.itemVariable, item)
    const childInput = node.iteration.mode === "each" ? resolveBinding(node.input, state.context) : rawInput!
    const inputDigest = digestJson(childInput)
    // WHY：父节点、外层循环、子链版本与本次输入共同定义调用；仅凭子链 ID 和稳定键会串用已完成输出。
    const invocationId = stableUuid(idempotencyKey, stableKey, node.chain.id, String(node.chain.version), node.chain.digest, inputDigest)
    let progress = state.checkpoint.invocations.find((entry) => entry.invocationId === invocationId)
    if (progress && (progress.stableKey !== stableKey || progress.inputDigest !== inputDigest
      || progress.chain.id !== node.chain.id || progress.chain.version !== node.chain.version
      || progress.chain.digest !== node.chain.digest)) throw new Error("invoke_progress_identity_mismatch")
    if (progress?.status === "completed") { if (progress.output) outputs.push(invokedOutput(progress.output)); continue }
    // WHY：旧检查点的 ID 不含外层现场，不能在恢复时猜测它对应哪次已发生的外部效果。
    const legacyId = stableUuid(state.run.binding.runId, node.id, stableKey)
    if (!progress && state.checkpoint.invocations.some((entry) => entry.invocationId === legacyId)) {
      throw new Error("invoke_progress_legacy_identity_unverifiable")
    }
    if (!progress) {
      progress = { invocationId, chain: node.chain, stableKey, inputDigest, status: "pending", output: null, checkpointId: null, reason: null }
      state.checkpoint.invocations.push(progress)
      state.capabilities.accountConsumption?.({ invocations: 1 })
      state.run.consumed.invocations += 1
    }
    progress.status = "running"
    const childIdempotencyKey = `${idempotencyKey}:${invocationId}`
    await beginEffect(state, "invoke", node.id, stableKey, childIdempotencyKey)
    let result
    try {
      result = invokeChainResultSchema.parse(await state.capabilities.invoke({ parent: state.run.binding, chain: node.chain,
        input: childInput, invocationId, stableKey, idempotencyKey: childIdempotencyKey, signal: state.signal }))
      completeEffect(state)
    } catch (error) {
      progress.status = "paused"; progress.reason = error instanceof Error ? error.message : "invoke_effect_uncertain"
      await markEffectUncertain(state)
      throw new UncertainEffectError(progress.reason)
    }
    progress.status = result.outcome.status === "completed" ? "completed" : result.outcome.status === "partial" ? "partial"
      : result.outcome.status === "paused" ? "paused"
        : result.outcome.status === "cancelled" ? "cancelled" : "failed"
    progress.output = result.output; progress.checkpointId = result.checkpointId ?? null; progress.reason = result.outcome.reason
    if (result.output) outputs.push(invokedOutput(result.output))
    if (result.externalFailure) {
      return { outcome: result.outcome.status === "waiting_for_human" ? "human_required" : "blocked",
        output: outputs as unknown as JsonValue, reason: result.outcome.reason,
        externalFailure: result.externalFailure }
    }
    if (result.outcome.status === "waiting_for_human") {
      waitForInvokedHuman(state, node, result.outcome.reason)
      return { outcome: "human_required", output: outputs as unknown as JsonValue, reason: result.outcome.reason }
    }
    if (result.outcome.status !== "completed") {
      failures.push(result.outcome.reason)
      if (node.iteration.mode !== "each" || node.iteration.onItemFailure === "stop") break
      if (node.iteration.onItemFailure === "pause") return { outcome: "blocked", output: outputs as unknown as JsonValue }
    }
  }
  if (failures.length) return { outcome: outputs.length ? "partial" : "failed", output: outputs as unknown as JsonValue, reason: failures.join("；") }
  if (truncated) return { outcome: outputs.length ? "partial" : "blocked", output: outputs as unknown as JsonValue, reason: "逐项调用数量超过链路预算。" }
  return { outcome: "success", output: (node.iteration.mode === "once" ? outputs[0] ?? null : outputs) as unknown as JsonValue }
}
function waitForInvokedHuman(state: RuntimeState, node: Extract<ChainNode, { kind: "invoke" }>, reason: string) {
  syncCheckpoint(state); state.checkpoint.id = randomUUID(); state.run.checkpoint = structuredClone(state.checkpoint); state.run.status = "waiting_for_human"
  state.run.outcome = { status: "waiting_for_human", waitpointId: stableUuid(state.run.binding.runId, node.id, "waitpoint"),
    checkpointId: state.checkpoint.id, reason, evidence: structuredClone(state.checkpoint.artifacts) }
}
