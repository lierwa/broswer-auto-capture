import { randomUUID } from "node:crypto"
import {
  CONTRACT_VERSION, invokeChainResultSchema, llmNodeCapabilityResultSchema, modelCallAuditSchema, nodeCapabilityResultSchema,
  parseTaskOutput, parseTaskValue, resumeVerificationResultSchema, sameRunBinding, taskCheckpointSchema,
  taskResumeRequestSchema, taskRunRequestSchema, taskRunSchema, type ChainNode, type JsonValue, type NodeOutcome,
  type TaskCheckpoint, type TaskOutput, type TaskRun,
} from "@browser-capture/contracts"
import { applyWrites, evaluatePredicate, readObservation, readPath, resolveBinding, resolveBindings, type BindingContext } from "./bindings.js"
import { withBrowserCommandAccounting } from "./browser-consumption.js"
import { compileTaskChain, type CompiledTaskChain } from "./compiler.js"
import { executeDataOperation } from "./data.js"
import { executeBuiltinCapability } from "./capabilities.js"
import { driveTaskChain } from "./engine.js"
import { digestJson, executableChainDigest, stableUuid } from "./hash.js"
import { executeLoop } from "./loop.js"
import { RuntimeBudgetExceededError, type NodeCapabilityResult, type TaskChainCapabilities, type TaskChainRuntimeInput } from "./types.js"
import { BudgetError, UncertainEffectError, activeNow, assertBudget, executionStableKey, modelCount, now } from "./runtime-support.js"
import { beginEffect, completeEffect, failRun, finishTerminal, invokedOutput, markEffectUncertain,
  pauseRun, persistRun, recordEvent, syncCheckpoint } from "./run-state.js"
export type RuntimeState = {
  compiled: CompiledTaskChain; run: TaskRun; context: BindingContext; checkpoint: TaskCheckpoint
  capabilities: TaskChainCapabilities; signal: AbortSignal; pauseAtCheckpoint: boolean
  resumingNodeId: string | null; resumeObservation: JsonValue | null
}
export class TaskChainRuntime {
  private active = false
  async execute(input: TaskChainRuntimeInput): Promise<TaskRun> {
    if (this.active) throw new Error("runtime_busy")
    this.active = true
    try { return await this.executeExclusive(input) }
    finally { this.active = false }
  }
  private async executeExclusive(input: TaskChainRuntimeInput) {
    const compiled = compileTaskChain(input.chain), capabilities = input.capabilities
    const signal = input.control?.signal ?? new AbortController().signal
    const state = input.control?.checkpoint
      ? await resumeState(compiled, input.request, input.control.resumeRequest, input.control.checkpoint, capabilities, signal)
      : startState(compiled, input.request, capabilities, signal)
    state.pauseAtCheckpoint = input.control?.pauseAtCheckpoint ?? false
    await persistRun(state)
    try {
      await driveTaskChain(state, {
        signal, maxTransitions: compiled.chain.budget.maxTransitions,
        shouldContinue: (current) => current.run.status === "running",
        step: async (current) => {
          signal.throwIfAborted()
          assertBudget(current)
          current.capabilities.accountConsumption?.({ transitions: 1 })
          await executeNode(current)
          await persistRun(current)
        },
      })
    } catch (error) {
      if (signal.aborted) await pauseRun(state, "interrupted", "运行已中断；检查点与未决副作用保留。")
      else if (error instanceof BudgetError || error instanceof RuntimeBudgetExceededError) await pauseRun(state, "budget", error.message)
      else await failRun(state, error)
    }
    state.run.auditComplete = state.run.modelCalls.every((audit) => audit.status !== "intended")
    state.run.consumed.llmCalls = modelCount(state.run)
    if (state.run.checkpoint) { syncCheckpoint(state); state.run.checkpoint = structuredClone(state.checkpoint) }
    await persistRun(state)
    return taskRunSchema.parse(state.run)
  }
}
function startState(compiled: CompiledTaskChain, rawRequest: unknown, capabilities: TaskChainCapabilities, signal: AbortSignal): RuntimeState {
  const request = taskRunRequestSchema.parse(rawRequest), input = parseTaskValue(compiled.chain.inputContract, request.input)
  assertReferences(compiled, request.binding, input)
  const consumed = { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
  const checkpoint: TaskCheckpoint = taskCheckpointSchema.parse({ contractVersion: CONTRACT_VERSION, id: randomUUID(), binding: request.binding,
    mode: request.mode, sequence: 0, cursor: compiled.chain.entry, resumeWhen: null,
    input, nodeOutputs: {}, variables: {}, loops: {}, invocations: [],
    outputs: {}, artifacts: [], browser: null, consumed, events: [], modelCalls: [], auditComplete: true,
    externalFailure: null, pendingEffect: null })
  const run: TaskRun = taskRunSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "run", binding: request.binding, mode: request.mode,
    input, budget: compiled.chain.budget, sequence: 0, status: "running", outputs: {}, checkpoint, consumed,
    outcome: null, events: [], modelCalls: [], auditComplete: true, externalFailure: null })
  return { compiled, run, context: { input, nodeOutputs: {}, variables: {} }, checkpoint,
    capabilities, signal, pauseAtCheckpoint: false, resumingNodeId: null, resumeObservation: null }
}
async function resumeState(compiled: CompiledTaskChain, rawRequest: unknown, rawResume: unknown, rawCheckpoint: unknown,
  capabilities: TaskChainCapabilities, signal: AbortSignal): Promise<RuntimeState> {
  const request = taskRunRequestSchema.parse(rawRequest), resume = taskResumeRequestSchema.parse(rawResume)
  const checkpoint = taskCheckpointSchema.parse(rawCheckpoint)
  const requestedInput = parseTaskValue(compiled.chain.inputContract, request.input)
  const input = parseTaskValue(compiled.chain.inputContract, checkpoint.input)
  assertReferences(compiled, request.binding, requestedInput)
  if (!sameRunBinding(request.binding, resume.binding) || !sameRunBinding(resume.binding, checkpoint.binding)
    || resume.checkpointId !== checkpoint.id || resume.expectedSequence !== checkpoint.sequence
    || request.mode !== checkpoint.mode || digestJson(input) !== digestJson(requestedInput)
    || !compiled.nodes.has(checkpoint.cursor)) throw new Error("resume_binding_mismatch")
  validateCheckpointValues(compiled, checkpoint)
  const verification = checkpoint.browser
    ? await withBrowserCommandAccounting(capabilities, checkpoint.consumed, "resume", async () =>
      resumeVerificationResultSchema.parse(await capabilities.verifyResume?.(checkpoint, signal)
        ?? { ok: false, reason: "resume_verifier_unavailable" }))
    : resumeVerificationResultSchema.parse({ ok: true })
  if (verification.browser) checkpoint.browser = verification.browser
  if (checkpoint.pendingEffect) checkpoint.pendingEffect.status = "uncertain"
  const context = { input, nodeOutputs: structuredClone(checkpoint.nodeOutputs), variables: structuredClone(checkpoint.variables) }
  const resumeConditionFailed = checkpoint.resumeWhen !== null && (verification.observation === undefined
    || !observationMatches(checkpoint.resumeWhen, verification.observation, context))
  const pausedReason = checkpoint.pendingEffect ? "存在未能确认是否完成的外部副作用。"
    : !verification.ok ? verification.reason ?? "浏览器现场与检查点不一致。"
      : resumeConditionFailed ? "浏览器现场未满足检查点恢复条件。" : null
  const run: TaskRun = taskRunSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "run", binding: request.binding, mode: checkpoint.mode,
    input, budget: compiled.chain.budget, sequence: checkpoint.sequence, status: "running", outputs: checkpoint.outputs,
    checkpoint, consumed: checkpoint.consumed, outcome: null, events: checkpoint.events,
    modelCalls: checkpoint.modelCalls, auditComplete: checkpoint.auditComplete,
    externalFailure: checkpoint.externalFailure ?? null })
  if (pausedReason) {
    run.status = "paused"
    run.outcome = { status: "paused", cause: "drift", checkpointId: checkpoint.id,
      reason: pausedReason, evidence: structuredClone(checkpoint.artifacts) }
  }
  return { compiled, run, context, checkpoint: structuredClone(checkpoint), capabilities, signal,
    pauseAtCheckpoint: false, resumingNodeId: checkpoint.cursor,
    resumeObservation: verification.observation === undefined ? null : verification.observation }
}
function assertReferences(compiled: CompiledTaskChain, binding: TaskRun["binding"], input: JsonValue) {
  if (binding.taskId !== compiled.chain.taskId || binding.chain.id !== compiled.chain.id || binding.chain.version !== compiled.chain.version
    || binding.chain.digest !== executableChainDigest(compiled.chain) || binding.plan.id !== compiled.chain.plan.id
    || binding.plan.version !== compiled.chain.plan.version || binding.plan.digest !== compiled.chain.plan.digest
    || binding.inputDigest !== digestJson(input)) throw new Error("run_binding_mismatch")
}
function validateCheckpointValues(compiled: CompiledTaskChain, checkpoint: TaskCheckpoint) {
  for (const [nodeId, value] of Object.entries(checkpoint.nodeOutputs)) {
    const node = compiled.nodes.get(nodeId)
    if (!node) throw new Error("checkpoint_node_unknown")
    parseTaskValue(node.outputContract, value)
  }
  for (const [name, value] of Object.entries(checkpoint.variables)) {
    const contract = compiled.chain.variables[name]
    if (!contract) throw new Error("checkpoint_variable_unknown")
    parseTaskValue(contract, value)
  }
  const emits = new Map([...compiled.nodes.values()].flatMap((node) => node.kind === "emit" ? [[node.name, node.contract] as const]
    : node.kind === "terminal" && "result" in node && node.result ? [[node.result.name, node.result.contract] as const] : []))
  for (const [name, output] of Object.entries(checkpoint.outputs)) {
    const contract = emits.get(name)
    if (!contract) throw new Error("checkpoint_output_unknown")
    parseTaskOutput(contract, output)
  }
  for (const event of checkpoint.events) {
    if (!compiled.nodes.has(event.nodeId) || event.invocationId !== checkpoint.binding.invocationId) throw new Error("checkpoint_event_invalid")
  }
  for (const audit of checkpoint.modelCalls) {
    if (compiled.nodes.get(audit.nodeId)?.kind !== "llm" || audit.invocationId !== checkpoint.binding.invocationId) {
      throw new Error("checkpoint_model_audit_invalid")
    }
  }
  if (checkpoint.pendingEffect && !compiled.nodes.has(checkpoint.pendingEffect.nodeId)) throw new Error("checkpoint_effect_invalid")
}
function writeVariable(state: RuntimeState, name: string, value: JsonValue) {
  const contract = state.compiled.chain.variables[name]
  if (!contract) throw new Error("runtime_variable_unknown")
  state.context.variables[name] = parseTaskValue(contract, value)
}
function validateWrittenVariables(state: RuntimeState, node: ChainNode) {
  for (const write of node.writes) writeVariable(state, write.variable, state.context.variables[write.variable]!)
}
async function executeNode(state: RuntimeState) {
  const node = state.compiled.nodes.get(state.checkpoint.cursor)!
  const started = activeNow(state), stableKey = executionStableKey(state)
  const idempotencyKey = `${state.run.binding.runId}:${state.run.binding.invocationId}:${node.id}:${stableKey ?? "root"}`
  recordEvent(state, node, "planned", null, idempotencyKey, stableKey)
  recordEvent(state, node, "started", null, idempotencyKey, stableKey)
  let result: NodeCapabilityResult
  const accounting = node.kind === "capability" && node.capability.name.startsWith("browser.")
    ? "browser_capability" : node.kind
  try { result = nodeCapabilityResultSchema.parse(await withBrowserCommandAccounting(state.capabilities,
    state.run.consumed, accounting, () => dispatchNode(state, node, idempotencyKey, stableKey))) }
  catch (error) {
    if (error instanceof UncertainEffectError || error instanceof RuntimeBudgetExceededError) throw error
    const failure = node.outcomes.includes("failed") ? "failed" : node.outcomes.includes("blocked") ? "blocked" : null
    if (!failure) throw error
    result = { outcome: failure, output: null, reason: error instanceof Error ? error.message : "node_failed" }
  }
  const activeMs = Math.max(0, activeNow(state) - started)
  state.run.consumed.activeMs += activeMs
  state.capabilities.accountConsumption?.({ activeMs }, "settle")
  state.run.consumed.transitions += 1
  const validatesOutput = ["success", "partial", "true", "false", "body", "done", "limit"].includes(result.outcome)
  const output = validatesOutput ? parseTaskValue(node.outputContract, result.output ?? null) : null
  if (validatesOutput) {
    state.context.nodeOutputs[node.id] = output
    applyWrites(node.writes, output, state.context.variables)
    validateWrittenVariables(state, node)
  }
  if (result.artifacts) state.checkpoint.artifacts.push(...result.artifacts)
  if (result.browser !== undefined) state.checkpoint.browser = result.browser
  if (result.externalFailure) {
    state.checkpoint.externalFailure = structuredClone(result.externalFailure)
    state.run.externalFailure = structuredClone(result.externalFailure)
  } else if ((node.kind === "browser" || node.kind === "observe"
    || node.kind === "capability" && node.capability.name.startsWith("browser.")) && result.outcome === "success") {
    state.checkpoint.externalFailure = null; state.run.externalFailure = null
  }
  recordEvent(state, node, "finished", result.outcome, idempotencyKey, stableKey)
  state.resumingNodeId = null
  if (node.kind === "terminal") {
    await finishTerminal(state, node)
    return
  }
  if (node.kind === "capability" && result.outcome === "human_required") {
    waitForCapabilityHuman(state, node, result.reason)
    return
  }
  if (state.run.status === "waiting_for_human") {
    state.checkpoint.resumeWhen = state.checkpoint.browser && node.kind === "human" ? node.resumeWhen : null
    syncCheckpoint(state)
    state.run.checkpoint = structuredClone(state.checkpoint)
    return
  }
  const edge = state.compiled.edges.get(`${node.id}:${result.outcome}`)
  if (!edge) throw new Error("runtime_outcome_unbound")
  state.checkpoint.cursor = edge.to
  state.checkpoint.resumeWhen = node.kind === "checkpoint" && state.checkpoint.browser ? node.resumeWhen : null
  state.checkpoint.sequence = state.run.sequence
  state.checkpoint.nodeOutputs = structuredClone(state.context.nodeOutputs)
  state.checkpoint.variables = structuredClone(state.context.variables)
  state.checkpoint.consumed = structuredClone(state.run.consumed)
  state.checkpoint.outputs = structuredClone(state.run.outputs)
  state.run.checkpoint = structuredClone(state.checkpoint)
  if (node.kind === "checkpoint") {
    state.checkpoint.id = randomUUID()
    state.run.checkpoint = structuredClone(state.checkpoint)
    await persistRun(state)
    if (state.pauseAtCheckpoint) await pauseRun(state, "requested", "运行在显式检查点暂停。")
  }
}
async function dispatchNode(state: RuntimeState, node: ChainNode, idempotencyKey: string,
  stableKey: string | null): Promise<NodeCapabilityResult> {
  const context = state.context
  if (node.kind === "capability") return executeCapability(state, node, idempotencyKey, stableKey)
  if (node.kind === "data") return { outcome: "success", output: executeDataOperation(node.operation, resolveBindings(node.arguments, context)) }
  if (node.kind === "condition" || node.kind === "branch") return { outcome: evaluatePredicate(node.predicate, context) ? "true" : "false", output: null }
  if (node.kind === "loop") return executeLoop(state, node, writeVariable)
  if (node.kind === "browser") {
    if (!state.capabilities.browser) throw new Error("browser_capability_unavailable")
    await beginEffect(state, "browser", node.id, stableKey, idempotencyKey)
    const target = resolveTarget(node.target, context)
    let result: NodeCapabilityResult
    try { result = nodeCapabilityResultSchema.parse(await state.capabilities.browser({ binding: state.run.binding, node,
      arguments: resolveBindings(node.arguments, context), ...(target ? { target } : {}), idempotencyKey, signal: state.signal })) }
    catch (error) {
      await markEffectUncertain(state)
      throw new UncertainEffectError(error instanceof Error ? error.message : "browser_effect_uncertain")
    }
    completeEffect(state)
    return result
  }
  if (node.kind === "observe") {
    if (!state.capabilities.observe) throw new Error("observe_capability_unavailable")
    const target = resolveTarget(node.target, context)
    const result = nodeCapabilityResultSchema.parse(await state.capabilities.observe({ binding: state.run.binding,
      node, ...(target ? { target } : {}), signal: state.signal }))
    if (result.outcome === "success" && !observationMatches(node.stableWhen, result.output ?? null, context)) return { ...result, outcome: "missing" }
    return result
  }
  if (node.kind === "human") return executeHuman(state, node)
  if (node.kind === "llm") return executeLlm(state, node)
  if (node.kind === "invoke") return executeInvoke(state, node, idempotencyKey)
  if (node.kind === "emit") {
    const raw = node.output.kind === "value" ? { kind: "value", contract: { id: node.contract.id, version: node.contract.version }, value: resolveBinding(node.output.value, context) }
      : resolveBinding(node.output.artifact, context)
    const output = parseTaskOutput(node.contract, raw)
    state.run.outputs[node.name] = output; state.checkpoint.outputs[node.name] = output
    return { outcome: "success", output: (output.kind === "value" ? output.value : output.artifact) as unknown as JsonValue }
  }
  if (node.kind === "checkpoint") return { outcome: "success", output: null }
  if (node.kind === "terminal" && "result" in node && node.result) {
    const raw = node.result.output.kind === "value" ? { kind: "value", contract: {
      id: node.result.contract.id, version: node.result.contract.version }, value: resolveBinding(node.result.output.value, context) }
      : resolveBinding(node.result.output.artifact, context)
    const output = parseTaskOutput(node.result.contract, raw)
    state.run.outputs[node.result.name] = output; state.checkpoint.outputs[node.result.name] = output
    return { outcome: "success", output: (output.kind === "value" ? output.value : output.artifact) as unknown as JsonValue }
  }
  return { outcome: "success", output: null }
}

async function executeCapability(state: RuntimeState, node: Extract<ChainNode, { kind: "capability" }>,
  idempotencyKey: string, stableKey: string | null): Promise<NodeCapabilityResult> {
  if (state.resumingNodeId === node.id && state.resumeObservation !== null && node.human
    && observationMatches(node.human.resumeWhen, state.resumeObservation, state.context)) {
    return { outcome: "success", output: structuredClone(state.resumeObservation), browser: state.checkpoint.browser ?? undefined }
  }
  const invocation = { binding: state.run.binding, node, input: resolveBindings(node.input, state.context),
    config: structuredClone(node.config), idempotencyKey,
    ...(node.human ? { resumeCondition: node.human.resumeWhen.operator === "exists" ? node.human.resumeWhen
      : { ...node.human.resumeWhen, expected: resolveBinding(node.human.resumeWhen.expected, state.context) } } : {}),
    signal: state.signal }
  const builtin = executeBuiltinCapability(invocation)
  if (builtin) return builtin
  if (!state.capabilities.capability) throw new Error("capability_unavailable")
  const effect = node.effect !== "read"
  if (effect) await beginEffect(state, "capability", node.id, stableKey, idempotencyKey)
  let result: NodeCapabilityResult
  try {
    result = nodeCapabilityResultSchema.parse(await state.capabilities.capability(invocation))
  } catch (error) {
    if (effect) await markEffectUncertain(state)
    throw effect ? new UncertainEffectError(error instanceof Error ? error.message : "capability_effect_uncertain") : error
  }
  if (effect) completeEffect(state)
  if (result.outcome === "success" && node.stableWhen
    && !observationMatches(node.stableWhen, result.output ?? null, state.context)) return { ...result, outcome: "missing" }
  return result
}

function waitForCapabilityHuman(state: RuntimeState, node: Extract<ChainNode, { kind: "capability" }>, reason?: string) {
  syncCheckpoint(state); state.checkpoint.id = randomUUID()
  state.checkpoint.resumeWhen = node.human?.resumeWhen ?? null
  state.run.checkpoint = structuredClone(state.checkpoint); state.run.status = "waiting_for_human"
  state.run.outcome = { status: "waiting_for_human", waitpointId: stableUuid(state.run.binding.runId, node.id, "waitpoint"),
    checkpointId: state.checkpoint.id, reason: reason ?? node.human?.prompt ?? "需要用户处理当前浏览器页面。",
    evidence: structuredClone(state.checkpoint.artifacts) }
}
function resolveTarget(target: Extract<ChainNode, { kind: "browser" | "observe" }>["target"], context: BindingContext) {
  if (!target) return undefined
  return target.kind === "semantic" ? { kind: target.kind,
    role: typeof target.role === "string" ? target.role : resolveBinding(target.role, context), name: resolveBinding(target.name, context),
    ...(target.fallbackName === undefined ? {} : { fallbackName: resolveBinding(target.fallbackName, context) }),
    ...(target.occurrence === undefined ? {} : { occurrence: resolveBinding(target.occurrence, context) }) }
    : { kind: target.kind, strategy: target.strategy, value: resolveBinding(target.value, context) }
}
function observationMatches(condition: Extract<ChainNode, { kind: "observe" }>["stableWhen"]
  | NonNullable<Extract<ChainNode, { kind: "capability" }>["stableWhen"]>, observation: JsonValue, context: BindingContext) {
  const found = readObservation(observation, condition.path)
  if (condition.operator === "exists") return found.exists && found.value !== null
  return found.exists && JSON.stringify(found.value) === JSON.stringify(resolveBinding(condition.expected, context))
}
async function executeHuman(state: RuntimeState, node: Extract<ChainNode, { kind: "human" }>): Promise<NodeCapabilityResult> {
  if (state.resumingNodeId === node.id && state.resumeObservation !== null) {
    return { outcome: "success", output: structuredClone(state.resumeObservation), browser: state.checkpoint.browser ?? undefined }
  }
  if (!state.capabilities.human) throw new Error("human_capability_unavailable")
  syncCheckpoint(state)
  state.checkpoint.id = randomUUID()
  const result = nodeCapabilityResultSchema.parse(await state.capabilities.human({ binding: state.run.binding, node,
    checkpoint: structuredClone(state.checkpoint), resuming: state.resumingNodeId === node.id,
    resumeCondition: node.resumeWhen.operator === "exists" ? node.resumeWhen
      : { ...node.resumeWhen, expected: resolveBinding(node.resumeWhen.expected, state.context) }, signal: state.signal }))
  if (result.outcome !== "human_required") {
    if (result.outcome === "success" && !observationMatches(node.resumeWhen, result.output ?? null, state.context)) return { ...result, outcome: "blocked" }
    return result
  }
  state.run.checkpoint = structuredClone(state.checkpoint)
  state.run.status = "waiting_for_human"
  state.run.outcome = { status: "waiting_for_human", waitpointId: stableUuid(state.run.binding.runId, node.id, "waitpoint"),
    checkpointId: state.checkpoint.id, reason: result.reason ?? node.prompt, evidence: result.artifacts ?? [] }
  return result
}
async function executeLlm(state: RuntimeState, node: Extract<ChainNode, { kind: "llm" }>): Promise<NodeCapabilityResult> {
  if (!state.capabilities.llm) throw new Error("explicit_llm_not_authorized")
  state.capabilities.accountConsumption?.({ llmCalls: 1 })
  const callId = randomUUID(), audit = modelCallAuditSchema.parse({ callId, invocationId: state.run.binding.invocationId,
    nodeId: node.id, purpose: "explicit_llm", model: node.model, intendedAt: now(state).toISOString(), status: "intended", reportedInvocations: null })
  state.run.modelCalls.push(audit); state.run.auditComplete = false; state.run.consumed.llmCalls = null
  await beginEffect(state, "llm", node.id, executionStableKey(state), callId)
  try {
    const result = llmNodeCapabilityResultSchema.parse(await state.capabilities.llm({ binding: state.run.binding, node,
      input: resolveBinding(node.input, state.context), callId, signal: state.signal }))
    audit.status = result.outcome === "success" ? "completed" : result.outcome === "cancelled" ? "interrupted" : "failed"
    audit.reportedInvocations = result.reportedInvocations
    state.capabilities.accountConsumption?.({ llmCalls: result.reportedInvocations === null ? null : result.reportedInvocations - 1 }, "settle")
    state.run.auditComplete = state.run.modelCalls.every((item) => item.status !== "intended")
    state.run.consumed.llmCalls = modelCount(state.run)
    completeEffect(state)
    const { reportedInvocations: _reportedInvocations, ...nodeResult } = result
    return nodeResult
  } catch (error) {
    if (error instanceof RuntimeBudgetExceededError) throw error
    audit.status = state.signal.aborted ? "interrupted" : "failed"
    state.capabilities.accountConsumption?.({ llmCalls: null }, "settle")
    state.run.auditComplete = true; state.run.consumed.llmCalls = modelCount(state.run)
    await markEffectUncertain(state)
    throw new UncertainEffectError(error instanceof Error ? error.message : "llm_effect_uncertain")
  }
}
async function executeInvoke(state: RuntimeState, node: Extract<ChainNode, { kind: "invoke" }>, idempotencyKey: string): Promise<NodeCapabilityResult> {
  if (!state.capabilities.invoke) throw new Error("invoke_capability_unavailable")
  const rawInput = node.iteration.mode === "once" ? resolveBinding(node.input, state.context) : null
  const items = node.iteration.mode === "each" ? resolveBinding(node.iteration.collection, state.context) : [rawInput]
  if (!Array.isArray(items)) throw new Error("invoke_collection_required")
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
    const completed = state.checkpoint.invocations.find((entry) =>
      entry.chain.id === node.chain.id && entry.stableKey === stableKey && entry.status === "completed")
    if (completed) { if (completed.output) outputs.push(invokedOutput(completed.output)); continue }
    if (node.iteration.mode === "each") writeVariable(state, node.iteration.itemVariable, item)
    const invocationId = stableUuid(state.run.binding.runId, node.id, stableKey)
    const childInput = node.iteration.mode === "each" ? resolveBinding(node.input, state.context) : rawInput!
    let progress = state.checkpoint.invocations.find((entry) => entry.invocationId === invocationId)
    if (!progress) {
      progress = { invocationId, chain: node.chain, stableKey, inputDigest: digestJson(childInput), status: "pending", output: null, checkpointId: null, reason: null }
      state.checkpoint.invocations.push(progress)
      state.capabilities.accountConsumption?.({ invocations: 1 })
      state.run.consumed.invocations += 1
    }
    progress.status = "running"
    const childIdempotencyKey = `${idempotencyKey}:${stableKey}`
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
