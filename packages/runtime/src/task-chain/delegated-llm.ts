import { randomUUID } from "node:crypto"
import { llmNodeCapabilityResultSchema, modelCallAuditSchema, type ChainNode } from "@browser-capture/contracts"
import { resolveBinding } from "./bindings.js"
import type { RuntimeState } from "./runtime.js"
import { RuntimeBudgetExceededError, type ModelCallReport, type NodeCapabilityResult } from "./types.js"
import { UncertainEffectError, executionStableKey, modelCount } from "./runtime-support.js"
import { beginEffect, completeEffect, markEffectUncertain, persistRun, syncCheckpoint } from "./run-state.js"

export async function executeDelegatedLlm(
  state: RuntimeState,
  node: Extract<ChainNode, { kind: "llm" }>,
): Promise<NodeCapabilityResult> {
  if (!("delegate" in node) || !node.delegate) throw new Error("delegated_llm_config_missing")
  const delegate = node.delegate, llm = state.capabilities.llm!
  state.capabilities.accountConsumption?.({ llmCalls: delegate.maxInvocations,
    browserCommands: delegate.maxBrowserCommands })
  state.run.auditComplete = false; state.run.consumed.llmCalls = null
  const callId = randomUUID()
  await beginEffect(state, "llm", node.id, executionStableKey(state), callId)
  const onModelCall = async (report: ModelCallReport) => {
    if (!delegate.modelPurposes.includes(report.purpose)) throw new Error(`delegated_model_purpose_undeclared:${report.purpose}`)
    const existing = state.run.modelCalls.find((item) => item.callId === report.callId)
    if (!existing && report.status !== "intended") throw new Error("delegated_model_completion_without_intent")
    if (existing && (existing.status !== "intended" || report.status === "intended")) {
      throw new Error("delegated_model_audit_transition_invalid")
    }
    if (existing && (existing.purpose !== report.purpose || existing.model !== report.model
      || existing.intendedAt !== report.intendedAt)) throw new Error("delegated_model_audit_identity_mismatch")
    const audit = modelCallAuditSchema.parse({ callId: report.callId, invocationId: state.run.binding.invocationId,
      nodeId: node.id, purpose: report.purpose, model: report.model, intendedAt: report.intendedAt,
      status: report.status, reportedInvocations: report.reportedInvocations })
    if (existing) Object.assign(existing, audit)
    else state.run.modelCalls.push(audit)
    state.run.auditComplete = state.run.modelCalls.every((item) => item.status !== "intended")
    state.run.consumed.llmCalls = modelCount(state.run)
    syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint)
    await persistRun(state)
  }
  try {
    const result = llmNodeCapabilityResultSchema.parse(await llm({ binding: state.run.binding, mode: state.run.mode, node,
      input: resolveBinding(node.input, state.context), callId, signal: state.signal, onModelCall }))
    const purposes = new Set(state.run.modelCalls.map((item) => item.purpose))
    if (delegate.modelPurposes.some((purpose) => !purposes.has(purpose))) throw new Error("delegated_model_audit_missing")
    state.run.auditComplete = state.run.modelCalls.every((item) => item.status !== "intended")
    const actualInvocations = modelCount(state.run)
    if (actualInvocations === null || actualInvocations !== result.reportedInvocations) throw new Error("delegated_model_count_mismatch")
    if (actualInvocations > delegate.maxInvocations) throw new Error("delegated_model_count_exceeded")
    const browserCommands = result.reportedBrowserCommands
    if (browserCommands === undefined || browserCommands > delegate.maxBrowserCommands) {
      throw new Error("delegated_browser_count_invalid")
    }
    state.capabilities.accountConsumption?.({ llmCalls: actualInvocations - delegate.maxInvocations,
      browserCommands: browserCommands - delegate.maxBrowserCommands }, "settle")
    state.run.consumed.llmCalls = actualInvocations
    state.run.consumed.browserCommands += browserCommands
    completeEffect(state)
    const { reportedInvocations: _reportedInvocations, reportedBrowserCommands: _reportedBrowserCommands, ...nodeResult } = result
    return nodeResult
  } catch (error) {
    state.run.auditComplete = state.run.modelCalls.every((item) => item.status !== "intended")
    state.run.consumed.llmCalls = modelCount(state.run)
    state.run.consumed.browserCommands += delegate.maxBrowserCommands
    await markEffectUncertain(state)
    if (error instanceof RuntimeBudgetExceededError) throw error
    throw new UncertainEffectError(error instanceof Error ? error.message : "delegated_llm_effect_uncertain")
  }
}
