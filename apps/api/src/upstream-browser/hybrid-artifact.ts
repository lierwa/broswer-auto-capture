import { z } from "zod"
import { jsonValueSchema, parseTaskValue, type JsonValue, type TaskPlan, type TaskPlanStep,
  type TaskExecutionFailureEvidence, type TaskRequirement } from "@browser-capture/contracts"
import { digestJson, resolveBinding } from "@browser-capture/runtime"
import type { ModelCallReport } from "@browser-capture/runtime"
import { hybridCompilerResponseSchema, hybridNaturalRequestSchema, naturalBindingFactValueSchema } from "./hybrid-schema.js"
import { digestCanonicalJson, materializeHybridChain, validateHybridRequestSources,
  validateHybridResponse } from "./hybrid-materializer.js"
import { isDeepStrictEqual } from "node:util"
import type { ResolveHybridChild } from "./hybrid-invoke.js"
import { parseCapturedSource, type HybridSourceResult, type CapturedSourceReceipt } from "./hybrid-captured-source.js"
import { browserUseTask, naturalRequirementText } from "./task-request.js"
import { naturalPayloadContext, naturalSourceContext } from "./hybrid-natural-payload.js"
import { requiresSemanticAnnotationAudit } from "./hybrid-selection-audit.js"

export const hybridArtifactMediaType = "application/vnd.bat.workflow-use+json;version=2"
export const hybridSourceMediaType = "application/vnd.bat.workflow-use-source+json;version=3"
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const sourceReference = z.object({ localRef: z.string().min(1), digest: hash }).strict()
export const hybridArtifactSchema = z.object({
  mode: z.literal("workflow-use-artifact/v2"), status: z.literal("candidate"),
  forkSourceDigest: hash,
  task: z.object({ requirementId: z.uuid(), requirementVersion: z.number().int().positive(), requirementDigest: hash,
    planId: z.uuid(), planVersion: z.number().int().positive(), planDigest: hash,
    stepId: z.string().min(1), inputDigest: hash }).strict(),
  compilationRequest: jsonValueSchema, compilerResponse: hybridCompilerResponseSchema,
  source: z.object({ history: sourceReference, sourceSuccess: z.literal(true),
    closed: z.literal(true) }).strict(),
  modelCalls: z.array(z.object({ callId: z.string().min(1), purpose: z.enum(["agent", "judge", "extract", "semantic_annotation"]),
    model: z.string(), intendedAt: z.string().datetime(), status: z.enum(["intended", "completed", "failed", "interrupted"]),
    reportedInvocations: z.number().int().nonnegative().nullable() }).strict()),
}).strict()

const sourceArtifactSchema = z.object({ mode: z.literal("workflow-use-source/v3"), status: z.literal("received"),
  requirementDigest: hash, planDigest: hash, stepId: z.string(), inputDigest: hash, forkSourceDigest: hash,
  result: jsonValueSchema, modelCalls: hybridArtifactSchema.shape.modelCalls }).strict()

export function readHybridSourceArtifact(raw: unknown) {
  const artifact = sourceArtifactSchema.parse(raw)
  return { ...artifact, result: parseCapturedSource(artifact.result, artifact.forkSourceDigest, artifact.modelCalls) }
}

export function createHybridSourceArtifact(requirement: TaskRequirement, plan: TaskPlan, stepId: string,
  input: JsonValue, source: CapturedSourceReceipt) {
  // WHY：只保存一次接收原文；来源准入在保存之后独立校验，拒绝也留下可追查事实。
  return sourceArtifactSchema.parse({ mode: "workflow-use-source/v3", status: "received",
    requirementDigest: digestJson(requirement), planDigest: digestJson(plan), stepId, inputDigest: digestJson(input),
    ...source })
}

export function assertCapturedSourceIdentity(requirement: TaskRequirement, plan: TaskPlan, stepId: string,
  input: JsonValue, source: HybridSourceResult) {
  const step = plan.steps.find((item) => item.id === stepId)
  if (!step) throw new Error("hybrid_natural_step_missing")
  assertNaturalSourceIdentity(source.request, requirement, plan, step, input, source.history,
    undefined, naturalSourceContext(source.canonicalRequest))
}

/** WHY：只有正常结束的来源和零 gap 的编译产物能写 candidate；模型只拥有独立的探索调用审计。 */
export function createHybridArtifact(input: { requirement: TaskRequirement; plan: TaskPlan; step: TaskPlanStep;
  stepInput: JsonValue; request: unknown; response: unknown; forkSourceDigest: string;
  source: z.infer<typeof hybridArtifactSchema>["source"]; modelCalls: ModelCallReport[]; version: number; model: string;
  repair?: TaskExecutionFailureEvidence; resolveChild?: ResolveHybridChild }) {
  if (!input.requirement.confirmation || input.plan.requirement.id !== input.requirement.id
    || input.plan.requirement.version !== input.requirement.version || input.plan.requirement.digest !== digestJson(input.requirement)
    || input.plan.requirement.revision !== input.requirement.revision) throw new Error("hybrid_confirmed_source_required")
  parseTaskValue(input.step.inputContract, input.stepInput)
  const envelope = validateHybridResponse(input.response)
  const request = z.record(z.string(), jsonValueSchema).parse(input.request)
  validateHybridRequestSources(envelope, request)
  if (envelope.compilation.compilerVersion === "bat-hybrid/2") {
    const payload = naturalPayloadContext(envelope, request)
    const natural = assertNaturalSourceIdentity(
      request, input.requirement, input.plan, input.step, input.stepInput, input.source.history,
      input.repair, payload)
    assertSourceModelAudit(input.modelCalls, requiresSemanticAnnotationAudit({ request: natural,
      compilation: envelope.compilation, assertFact: payload.assertFact, transportRequest: payload.transportRequest }))
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
  throw new Error("hybrid_current_source_required")
}

function assertNaturalSourceIdentity(raw: unknown, requirement: TaskRequirement, plan: TaskPlan,
  step: TaskPlanStep, input: JsonValue, history: { localRef: string; digest: string },
  repair: TaskExecutionFailureEvidence | undefined,
  payload: Pick<ReturnType<typeof naturalPayloadContext>, "assertFact" | "assertTraceEvidence">) {
  const source = hybridNaturalRequestSchema.parse(raw)
  const requirementText = naturalRequirementText(requirement).text
  const taskText = browserUseTask({ requirement, plan, step, resolvedInput: input, ...(repair ? { repair } : {}) })
  if (source.requirement.id !== requirement.id || source.requirement.version !== requirement.version
    || source.requirement.text !== requirementText || source.requirement.taskText !== taskText
    || source.requirement.sourceDigest !== digestJson(requirement) || source.plan.id !== plan.id
    || source.plan.version !== plan.version || source.plan.sourceDigest !== digestJson(plan)
    || source.plan.stepId !== step.id || source.plan.callMode !== step.invocation.mode
    || !isDeepStrictEqual(source.plan.entryUrls, plan.entryUrls ?? [])
    || source.plan.inputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.inputContract.schema))
    || source.plan.outputSchemaDigest !== digestCanonicalJson(jsonValueSchema.parse(step.outputContract.schema))
    || !step.resultSpec || !isDeepStrictEqual(source.plan.resultSpec, step.resultSpec)
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
  payload: Pick<ReturnType<typeof naturalPayloadContext>, "assertFact" | "assertTraceEvidence">) {
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
  for (const purpose of ["agent"]) {
    if (![...settled.values()].some((call) => call.purpose === purpose && call.status === "completed"
      && (call.reportedInvocations ?? 0) > 0)) throw new Error("hybrid_source_model_audit_missing")
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
