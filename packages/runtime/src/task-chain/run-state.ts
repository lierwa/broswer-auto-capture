import { randomUUID } from "node:crypto"
import { taskRunSchema, type ChainNode, type NodeOutcome, type TaskOutput } from "@browser-capture/contracts"
import { evaluatePredicate, resolveBinding } from "./bindings.js"
import { stableUuid } from "./hash.js"
import { now } from "./runtime-support.js"
import type { RuntimeState } from "./runtime.js"

export async function finishTerminal(state: RuntimeState, node: Extract<ChainNode, { kind: "terminal" }>) {
  for (const evidence of node.evidence) resolveBinding(evidence, state.context)
  if (node.status === "completed" && state.compiled.chain.completion.some((condition) => !evaluatePredicate(condition.predicate, state.context))) {
    throw new Error("completion_condition_failed")
  }
  const artifacts = structuredClone(state.checkpoint.artifacts), reason = node.reason
  state.run.status = node.status
  state.run.outcome = node.status === "completed" ? { status: "completed", reason, evidence: artifacts,
    completionEvidence: state.compiled.chain.completion.map((item) => item.id) }
    : node.status === "partial" ? { status: "partial", reason, evidence: artifacts, remaining: [reason] }
      : node.status === "blocked" ? { status: "blocked", reason, evidence: artifacts, code: "terminal_blocked" }
        : node.status === "failed" ? { status: "failed", reason, evidence: artifacts, code: "terminal_failed" }
          : { status: "cancelled", reason, evidence: artifacts }
  state.run.checkpoint = null
}

export async function pauseRun(state: RuntimeState,
  cause: "drift" | "budget" | "interrupted" | "requested", reason: string) {
  syncCheckpoint(state); state.checkpoint.id = randomUUID()
  state.run.checkpoint = structuredClone(state.checkpoint); state.run.status = "paused"
  state.run.outcome = { status: "paused", cause, checkpointId: state.checkpoint.id,
    reason, evidence: structuredClone(state.checkpoint.artifacts) }
}

export async function failRun(state: RuntimeState, error: unknown) {
  const reason = error instanceof Error ? error.message : "runtime_failed"
  state.run.status = "failed"
  state.run.outcome = { status: "failed", code: reason, reason: `运行失败：${reason}`,
    evidence: structuredClone(state.checkpoint.artifacts) }
  if (state.checkpoint.pendingEffect) state.checkpoint.pendingEffect.status = "uncertain"
  syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint)
}

export function recordEvent(state: RuntimeState, node: ChainNode, status: "planned" | "started" | "finished",
  outcome: NodeOutcome | null, idempotencyKey: string, stableKey: string | null) {
  state.run.sequence += 1
  state.run.events.push({ sequence: state.run.sequence, at: now(state).toISOString(),
    invocationId: state.run.binding.invocationId, nodeId: node.id, status, outcome, idempotencyKey, stableKey })
}

export function syncCheckpoint(state: RuntimeState) {
  state.checkpoint.sequence = state.run.sequence; state.checkpoint.mode = state.run.mode
  state.checkpoint.nodeOutputs = structuredClone(state.context.nodeOutputs)
  state.checkpoint.variables = structuredClone(state.context.variables)
  state.checkpoint.outputs = structuredClone(state.run.outputs)
  state.checkpoint.consumed = structuredClone(state.run.consumed)
  state.checkpoint.events = structuredClone(state.run.events)
  state.checkpoint.modelCalls = structuredClone(state.run.modelCalls)
  state.checkpoint.auditComplete = state.run.auditComplete
}

export async function beginEffect(state: RuntimeState,
  kind: "capability" | "browser" | "llm" | "invoke", nodeId: string,
  stableKey: string | null, idempotencyKey: string) {
  state.checkpoint.pendingEffect = { kind, nodeId, stableKey: stableKey ?? "root", idempotencyKey, status: "planned" }
  syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint)
  await persistRun(state)
  state.checkpoint.pendingEffect.status = "started"
  syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint)
  await persistRun(state)
}

export function completeEffect(state: RuntimeState) {
  state.checkpoint.pendingEffect = null
  syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint)
}

export async function markEffectUncertain(state: RuntimeState) {
  if (state.checkpoint.pendingEffect) state.checkpoint.pendingEffect.status = "uncertain"
  syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint)
  await persistRun(state)
}

export async function persistRun(state: RuntimeState) {
  if (state.capabilities.persist) await state.capabilities.persist(taskRunSchema.parse({ ...state.run,
    checkpoint: state.run.checkpoint ? structuredClone(state.run.checkpoint) : null }))
}

export function invokedOutput(output: TaskOutput) {
  return output.kind === "value" ? output.value : { artifactId: output.artifact.artifactId,
    mediaType: output.artifact.mediaType, digest: output.artifact.digest }
}
