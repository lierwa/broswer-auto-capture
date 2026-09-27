import { randomUUID } from "node:crypto"
import { nodePorts, requiredNodePorts, type ChainNode, type NodeCapabilityResult } from "@browser-capture/contracts"
import { isGeneratedFailureTerminal } from "./compact-failure-routes.js"
import { stableUuid } from "./hash.js"
import { syncCheckpoint } from "./run-state.js"
import type { RuntimeState } from "./runtime.js"

/** WHY：业务路由优先，通用错误原位收束；节点事件已有结果与身份，无需复制终态节点。 */
export function resolveNodeResultRoute(state: RuntimeState, node: ChainNode, result: NodeCapabilityResult) {
  const edge = state.compiled.edges.get(`${node.id}:${result.outcome}`)
  const legacyHuman = "outcomes" in node
  const defaultHuman = !edge || isGeneratedFailureTerminal(state.compiled.nodes.get(edge.to), "human_required")
  if (node.kind === "capability" && result.outcome === "human_required" && (legacyHuman || defaultHuman)) {
    waitForCapabilityHuman(state, node, result.reason)
    return
  }
  if (state.run.status === "waiting_for_human") {
    if (!legacyHuman && edge && !defaultHuman) {
      state.run.status = "running"; state.run.outcome = null; state.checkpoint.resumeWhen = null
    } else {
      state.checkpoint.resumeWhen = state.checkpoint.browser && node.kind === "human" ? node.resumeWhen : null
      syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint)
      return
    }
  }
  if (edge) return edge
  if (!nodePorts(node).includes(result.outcome) || requiredNodePorts(node).includes(result.outcome)) {
    throw new Error("runtime_outcome_unbound")
  }
  finishUnhandledResult(state, node, result)
}

function waitForCapabilityHuman(state: RuntimeState, node: Extract<ChainNode, { kind: "capability" }>, reason?: string) {
  syncCheckpoint(state); state.checkpoint.id = randomUUID()
  // WHY：缺省 URL 条件只核验同一现场；业务完成仍需重试可重复能力或满足显式人工条件。
  state.checkpoint.resumeWhen = node.human?.resumeWhen
    ?? (node.capability.name.startsWith("browser.") ? { operator: "exists", path: ["url"] } : null)
  state.run.checkpoint = structuredClone(state.checkpoint); state.run.status = "waiting_for_human"
  state.run.outcome = { status: "waiting_for_human", waitpointId: stableUuid(state.run.binding.runId, node.id, "waitpoint"),
    checkpointId: state.checkpoint.id, reason: reason ?? node.human?.prompt ?? "需要用户处理当前浏览器页面。",
    evidence: structuredClone(state.checkpoint.artifacts) }
}

function finishUnhandledResult(state: RuntimeState, node: ChainNode, result: NodeCapabilityResult) {
  const evidence = structuredClone(state.checkpoint.artifacts), reason = result.reason ?? `${node.label}: ${result.outcome}`
  if (result.outcome === "human_required") {
    syncCheckpoint(state); state.checkpoint.id = randomUUID()
    state.run.checkpoint = structuredClone(state.checkpoint); state.run.status = "waiting_for_human"
    state.run.outcome = { status: "waiting_for_human", waitpointId: stableUuid(state.run.binding.runId, node.id, "waitpoint"),
      checkpointId: state.checkpoint.id, reason, evidence }
    return
  }
  const status = result.outcome === "cancelled" ? "cancelled" : result.outcome === "blocked" ? "blocked" : "failed"
  state.run.status = status
  state.run.outcome = status === "cancelled" ? { status, reason, evidence }
    : { status, code: result.outcome, reason, evidence }
  state.run.checkpoint = null
}
