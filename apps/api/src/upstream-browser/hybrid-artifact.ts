import { z } from "zod"
import { jsonValueSchema, parseTaskValue, valueBindingSchema, type JsonValue, type TaskPlan, type TaskPlanStep,
  type TaskRequirement } from "@browser-capture/contracts"
import { digestJson, resolveBinding } from "@browser-capture/runtime"
import type { ModelCallReport } from "@browser-capture/runtime"
import { hybridCompilerResponseSchema, hybridNaturalRequestSchema, naturalBindingFactValueSchema } from "./hybrid-schema.js"
import { digestCanonicalJson, materializeHybridChain, validateHybridRequestSources,
  validateHybridResponse } from "./hybrid-materializer.js"
import { assertHybridBranchEvidence, bindHybridControl, hybridStepAuthority } from "./hybrid-authority.js"
import { isDeepStrictEqual } from "node:util"
import type { ResolveHybridChild } from "./hybrid-invoke.js"
import { hybridAuthorResultSchema } from "./hybrid-protocol.js"
import type { HybridSourceResult } from "./hybrid-exploration.js"
import { browserUseTask, naturalRequirementText } from "./task-request.js"
import { naturalPayloadContext } from "./hybrid-natural-payload.js"

export const hybridArtifactMediaType = "application/vnd.bat.workflow-use+json;version=2"
export const hybridSourceMediaType = "application/vnd.bat.workflow-use-source+json;version=2"
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const sourceReference = z.object({ localRef: z.string().min(1), digest: hash }).strict()
export const hybridArtifactSchema = z.object({
  mode: z.literal("workflow-use-artifact/v2"), status: z.literal("candidate"),
  forkSourceDigest: hash,
  task: z.object({ requirementId: z.uuid(), requirementVersion: z.number().int().positive(), requirementDigest: hash,
    planId: z.uuid(), planVersion: z.number().int().positive(), planDigest: hash,
    stepId: z.string().min(1), inputDigest: hash }).strict(),
  compilationRequest: jsonValueSchema, compilerResponse: hybridCompilerResponseSchema,
  source: z.object({ history: sourceReference, sourceSuccess: z.literal(true), sourceValidated: z.literal(true),
    closed: z.literal(true) }).strict(),
  modelCalls: z.array(z.object({ callId: z.string().min(1), purpose: z.enum(["agent", "judge", "extract", "semantic_annotation"]),
    model: z.string(), intendedAt: z.string().datetime(), status: z.enum(["intended", "completed", "failed", "interrupted"]),
    reportedInvocations: z.number().int().nonnegative().nullable() }).strict()),
}).strict()

const sourceArtifactSchema = z.object({ mode: z.literal("workflow-use-source/v2"), status: z.literal("explored"), closed: z.boolean(),
  requirementDigest: hash, planDigest: hash, stepId: z.string(), inputDigest: hash, forkSourceDigest: hash,
  result: hybridAuthorResultSchema, modelCalls: hybridArtifactSchema.shape.modelCalls }).strict()

export function readHybridSourceArtifact(raw: unknown) {
  const artifact = sourceArtifactSchema.parse(raw)
  const envelope = validateHybridResponse(artifact.result.response)
  const request = z.record(z.string(), jsonValueSchema).parse(artifact.result.request)
  validateHybridRequestSources(envelope, request)
  if (envelope.compilation.compilerVersion === "bat-hybrid/2") {
    naturalPayloadContext(envelope, request).assertTraceEvidence()
  }
  return artifact
}

export function createHybridSourceArtifact(requirement: TaskRequirement, plan: TaskPlan, stepId: string,
  input: JsonValue, source: HybridSourceResult, closed = true) {
  const { forkSourceDigest, modelCalls, ...result } = source
  const artifact = sourceArtifactSchema.parse({ mode: "workflow-use-source/v2", status: "explored", closed,
    requirementDigest: digestJson(requirement), planDigest: digestJson(plan), stepId, inputDigest: digestJson(input),
    forkSourceDigest, result, modelCalls })
  const envelope = validateHybridResponse(result.response)
  const request = z.record(z.string(), jsonValueSchema).parse(result.request)
  validateHybridRequestSources(envelope, request)
  if (envelope.compilation.compilerVersion === "bat-hybrid/2") {
    const step = plan.steps.find((item) => item.id === stepId)
    if (!step) throw new Error("hybrid_natural_step_missing")
    assertNaturalSourceIdentity(request, requirement, plan, step, input, result.history,
      naturalPayloadContext(envelope, request))
  }
  return artifact
}

/** WHY：只有正常结束的来源和零 gap 的编译产物能写 candidate；模型只拥有独立的探索调用审计。 */
export function createHybridArtifact(input: { requirement: TaskRequirement; plan: TaskPlan; step: TaskPlanStep;
  stepInput: JsonValue; request: unknown; response: unknown; forkSourceDigest: string;
  source: z.infer<typeof hybridArtifactSchema>["source"]; modelCalls: ModelCallReport[]; version: number; model: string;
  resolveChild?: ResolveHybridChild }) {
  if (!input.requirement.confirmation || input.plan.requirement.id !== input.requirement.id
    || input.plan.requirement.version !== input.requirement.version || input.plan.requirement.digest !== digestJson(input.requirement)
    || input.plan.requirement.revision !== input.requirement.revision) throw new Error("hybrid_confirmed_source_required")
  parseTaskValue(input.step.inputContract, input.stepInput)
  const envelope = validateHybridResponse(input.response)
  const request = z.record(z.string(), jsonValueSchema).parse(input.request)
  validateHybridRequestSources(envelope, request)
  if (envelope.compilation.compilerVersion === "bat-hybrid/2") {
    const natural = assertNaturalSourceIdentity(
      request, input.requirement, input.plan, input.step, input.stepInput, input.source.history,
      naturalPayloadContext(envelope, request))
    const hasNaturalReadProof = natural.trace.observations.some((observation) =>
      observation.facts.some((fact) => fact.kind === "verified_natural_read"))
    assertSourceModelAudit(input.modelCalls, hasNaturalReadProof)
    const chain = materializeHybridChain({ response: envelope, request, plan: input.plan,
      step: input.step, version: input.version, model: input.model,
      ...(input.resolveChild ? { resolveChild: input.resolveChild } : {}) })
    const artifact = hybridArtifactSchema.parse({ mode: "workflow-use-artifact/v2", status: "candidate",
      forkSourceDigest: input.forkSourceDigest,
      task: { requirementId: input.requirement.id, requirementVersion: input.requirement.version,
        requirementDigest: digestJson(input.requirement), planId: input.plan.id, planVersion: input.plan.version,
        planDigest: digestJson(input.plan), stepId: input.step.id, inputDigest: digestJson(input.stepInput) },
      compilationRequest: request, compilerResponse: envelope, source: input.source, modelCalls: input.modelCalls })
    return { artifact, chain }
  }
  const authority = hybridStepAuthority(input.requirement, input.step.id)
  const sources = z.object({ requirement: z.object({ clauses: jsonValueSchema }).passthrough(), control: jsonValueSchema,
    acceptedAnnotations: jsonValueSchema, trace: z.object({ digest: hash, source: z.object({ historyRef: z.string() }).passthrough() }).passthrough() }).passthrough().parse(input.request)
  const annotations = z.array(z.record(z.string(), jsonValueSchema)).parse(sources.acceptedAnnotations)
  const proposed = annotations.slice(authority.acceptedAnnotations.length)
  if (!isDeepStrictEqual(authority.clauses, sources.requirement.clauses)
    || !isDeepStrictEqual(bindHybridControl(authority, input.request), sources.control)
    || !isDeepStrictEqual(authority.acceptedAnnotations, annotations.slice(0, authority.acceptedAnnotations.length))
    || proposed.some((item) => item.kind !== "semantic_operation")) {
    throw new Error("hybrid_confirmed_authority_mismatch")
  }
  if (input.source.history.digest !== sources.trace.digest || input.source.history.localRef !== sources.trace.source.historyRef) {
    throw new Error("hybrid_history_reference_mismatch")
  }
  assertHybridSampleBindings(input.request, input.stepInput)
  assertHybridBranchEvidence(authority, input.stepInput, input.request)
  assertSourceModelAudit(input.modelCalls, proposed.length > 0)
  const chain = materializeHybridChain({ response: envelope, request: input.request, plan: input.plan,
    step: input.step, version: input.version, model: input.model, ...(input.resolveChild ? { resolveChild: input.resolveChild } : {}) })
  const artifact = hybridArtifactSchema.parse({ mode: "workflow-use-artifact/v2", status: "candidate",
    forkSourceDigest: input.forkSourceDigest,
    task: { requirementId: input.requirement.id, requirementVersion: input.requirement.version, requirementDigest: digestJson(input.requirement),
      planId: input.plan.id, planVersion: input.plan.version, planDigest: digestJson(input.plan), stepId: input.step.id, inputDigest: digestJson(input.stepInput) },
    compilationRequest: input.request, compilerResponse: envelope, source: input.source, modelCalls: input.modelCalls })
  return { artifact, chain }
}

function assertNaturalSourceIdentity(raw: Record<string, JsonValue>, requirement: TaskRequirement, plan: TaskPlan,
  step: TaskPlanStep, input: JsonValue, history: { localRef: string; digest: string },
  payload: ReturnType<typeof naturalPayloadContext>) {
  const source = hybridNaturalRequestSchema.parse(raw)
  const requirementText = naturalRequirementText(requirement).text
  const taskText = browserUseTask({ requirement, plan, step, resolvedInput: input })
  if (source.requirement.id !== requirement.id || source.requirement.version !== requirement.version
    || source.requirement.text !== requirementText || source.requirement.taskText !== taskText
    || source.requirement.sourceDigest !== digestJson(requirement) || source.plan.id !== plan.id
    || source.plan.version !== plan.version || source.plan.sourceDigest !== digestJson(plan)
    || source.plan.stepId !== step.id || source.plan.callMode !== step.invocation.mode
    || source.plan.inputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.inputContract.schema))
    || source.plan.outputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.outputContract.schema))
    || !isDeepStrictEqual(source.runtimeInputSchema, step.inputContract.schema)) {
    throw new Error("hybrid_natural_host_source_mismatch")
  }
  payload.assertTraceEvidence()
  assertNaturalRuntimeInputBindings(source, input, payload)
  if (history.digest !== source.trace.digest || history.localRef !== source.trace.source.historyRef) {
    throw new Error("hybrid_history_reference_mismatch")
  }
  return source
}

function assertNaturalRuntimeInputBindings(source: z.infer<typeof hybridNaturalRequestSchema>, input: JsonValue,
  payload: ReturnType<typeof naturalPayloadContext>) {
  for (const observation of source.trace.observations) for (const fact of observation.facts) {
    if (fact.kind !== "natural_binding") continue
    payload.assertFact(fact, observation.id)
    const value = naturalBindingFactValueSchema.parse(fact.value)
    if (value.provenance !== "runtime_input") continue
    const action = source.trace.actions.find((item) => item.id === value.actionRef)
    if (!action || ![action.preObservationRef, action.postObservationRef].includes(observation.id)) {
      throw new Error("hybrid_natural_runtime_binding_action_mismatch")
    }
    const args = z.record(z.string(), jsonValueSchema).safeParse(action.args)
    if (!args.success || !(value.argumentPath in args.data) || value.binding.source !== "input") {
      throw new Error("hybrid_natural_runtime_binding_missing")
    }
    const expected = resolveBinding(value.binding, { input, variables: {}, nodeOutputs: {} })
    if (!isDeepStrictEqual(args.data[value.argumentPath], expected)) {
      throw new Error("hybrid_natural_runtime_input_mismatch")
    }
  }
}

function assertSourceModelAudit(calls: ModelCallReport[], annotations: boolean) {
  const settled = new Map(calls.map((call) => [call.callId, call]))
  if (annotations && ![...settled.values()].some((call) => call.purpose === "semantic_annotation"
    && call.status === "completed" && (call.reportedInvocations ?? 0) > 0)) throw new Error("hybrid_annotation_audit_missing")
  if ([...settled.values()].some((call) => call.status === "intended" || call.reportedInvocations === null)) {
    throw new Error("hybrid_source_model_audit_incomplete")
  }
  for (const purpose of ["agent", "judge"]) {
    if (![...settled.values()].some((call) => call.purpose === purpose && call.status === "completed"
      && (call.reportedInvocations ?? 0) > 0)) throw new Error("hybrid_source_model_audit_missing")
  }
}

export function assertHybridSampleBindings(raw: unknown, input: JsonValue) {
  const request = z.object({ requirement: z.object({ clauses: z.array(z.object({ expression: jsonValueSchema }).passthrough()) }).passthrough(),
    trace: z.object({ actions: z.array(z.object({ name: z.string(), args: z.record(z.string(), jsonValueSchema) }).passthrough()) }).passthrough(),
    control: z.object({ selections: z.array(z.object({ id: z.string(), actionRefs: z.array(z.string()),
      target: z.record(z.string(), jsonValueSchema) }).passthrough()) }).passthrough(),
  }).passthrough().parse(raw)
  const authority = z.object({ actionName: z.string(), argumentPath: z.string(), binding: valueBindingSchema,
    actionRefs: z.array(z.string()).nullable().optional(), selectionRef: z.string().nullable().optional() }).strict()
  for (const clause of request.requirement.clauses) {
    const expression = authority.safeParse(clause.expression)
    if (!expression.success || expression.data.binding.source !== "input") continue
    const expected = resolveBinding(expression.data.binding, { input, variables: {}, nodeOutputs: {} })
    for (const action of request.trace.actions.filter((action) => action.name === expression.data.actionName
      && (!expression.data.actionRefs || expression.data.actionRefs.includes(String(action.id)))
      && (!expression.data.selectionRef || request.control.selections.some((selection) => selection.id === expression.data.selectionRef
        && selection.actionRefs.includes(String(action.id)))))) {
      const actual = action.args[expression.data.argumentPath]
      if (actual === undefined || digestJson(actual) !== digestJson(expected)) throw new Error("hybrid_sample_input_mismatch")
    }
  }
  for (const selection of request.control.selections) {
    if (!("ordinalBinding" in selection.target)) continue
    const target = z.object({ ordinal: z.number().int().positive(), ordinalBinding: valueBindingSchema }).passthrough()
      .parse(selection.target)
    if (!(["input", "constant"] as string[]).includes(target.ordinalBinding.source)) {
      throw new Error("hybrid_target_ordinal_binding_unconsumable")
    }
    const ordinal = resolveBinding(target.ordinalBinding, { input, variables: {}, nodeOutputs: {} })
    if (ordinal !== target.ordinal) throw new Error("hybrid_sample_target_ordinal_mismatch")
  }
}

export function readHybridArtifact(raw: unknown) {
  const artifact = hybridArtifactSchema.parse(raw)
  const envelope = validateHybridResponse(artifact.compilerResponse)
  const request = z.record(z.string(), jsonValueSchema).parse(artifact.compilationRequest)
  validateHybridRequestSources(envelope, request)
  if (envelope.compilation.compilerVersion === "bat-hybrid/2") {
    naturalPayloadContext(envelope, request).assertTraceEvidence()
  }
  return artifact
}
