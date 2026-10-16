import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import type {
  ChainPresentationContent, JsonValue, TaskAuthoringJob, TaskChain, TaskPlan, TaskPlanStep, TaskRequirement, TaskMethodRevisionContext,
} from "@browser-capture/contracts"
import { executableChainDigest } from "@browser-capture/runtime"
import { assertNaturalSourceIdentity } from "../upstream-browser/hybrid-artifact.js"
import { naturalSourceContext, validateHybridRequestSources } from "../upstream-browser/hybrid-natural-payload.js"
import { validateHybridPrefixResponse } from "../upstream-browser/hybrid-prefix-schema.js"
import { materializeHybridPrefix } from "../upstream-browser/hybrid-prefix-materializer.js"
import { materializeHybridChain, validateHybridResponse } from "../upstream-browser/hybrid-materializer.js"
import { validateSelectionFunctions } from "../upstream-browser/hybrid-selection.js"
import { parseCompilationCandidate, parseCompilationCheckpoint, type CompilationCheckpoint,
  type CompilationPayload } from "../upstream-browser/hybrid-compilation-checkpoint.js"
import type { HybridSourceResult } from "../upstream-browser/hybrid-captured-source.js"
import type { TaskContractRepository } from "./repository.js"
import { RequirementClarificationRequired } from "./authoring-failure.js"
import { createPreparationPresentation, createStepChainPresentation } from "./presentation.js"
import { compilationProgress } from "./authoring-build-progress.js"
import { saveStepBuild } from "./preparation-step-builds.js"

type Context = { repository: TaskContractRepository; job: TaskAuthoringJob; plan: TaskPlan;
  requirement: TaskRequirement; step: TaskPlanStep; input: JsonValue; model: string; signal: AbortSignal;
  preparationPresentation?: typeof createPreparationPresentation; methodRevision?: Pick<TaskMethodRevisionContext, "problem"> }
type Source = ReturnType<typeof naturalSourceContext>
type Receipt = NonNullable<NonNullable<TaskAuthoringJob["authoring"]>["sourceReceipt"]>

/** One step owns the current snapshot. A next step starts only after finish() retained its result. */
export class AuthoringBuild {
  private finished: { canonicalRequest: string; response: ReturnType<typeof validateHybridResponse>;
    presentation: ChainPresentationContent; chainDigest: string } | undefined
  constructor(private readonly context: Context) {}

  async accept(event: CompilationCheckpoint, signal: AbortSignal) {
    const payload = parseCompilationCheckpoint(event), previous = this.previous(event, signal)
    if (previous?.sequence === event.sequence) {
      if (this.active(signal).authoring!.candidateStatus?.status === "pending") {
        throw new Error("hybrid_compilation_settlement_incomplete")
      }
      return
    }
    let source: Source
    try { source = this.receiveSource(event, payload, previous, signal) }
    catch (error) {
      this.active(signal)
      const { repository, job } = this.context
      saveBuildRecord(() => repository.saveArtifact(job.taskId, job.id,
        "application/vnd.bat.hybrid-compilation-rejected+json;version=1",
        z.json().parse({ event, stage: "source", reason: candidateFailureCode(error) })))
      throw error
    }
    this.finished = undefined
    let stage: "validate" | "materialize" = "validate"
    try {
      const candidate = parseCompilationCandidate(payload)
      if (candidate.kind === "error") {
        this.rejectCandidate(event, candidate.stage, candidate.code, signal)
        return
      }
      const response = payload.phase === "prefix" ? validateHybridPrefixResponse(candidate.response)
        : validateHybridResponse(candidate.response)
      validateHybridRequestSources(response, source.request)
      const ambiguities = response.compilation.gaps.filter(gap => gap.resolution === "confirm_intent")
        .map(gap => ({ code: gap.reason, clauseRefs: gap.clauseRefs }))
      if (ambiguities.length) throw new RequirementClarificationRequired(ambiguities)
      stage = "materialize"
      await this.acceptCandidate(event, payload, source, response, signal)
    } catch (error) {
      if (signal.aborted || this.context.signal.aborted || error instanceof Error && [
        "hybrid_compilation_save_failed", "hybrid_compilation_job_not_active", "hybrid_compilation_snapshot_changed",
      ].includes(error.message)) throw error
      this.rejectCandidate(event, stage, candidateFailureCode(error), signal)
      if (error instanceof RequirementClarificationRequired) throw error
    }
  }

  private receiveSource(event: CompilationCheckpoint, payload: CompilationPayload, previous: Receipt | undefined,
    signal: AbortSignal) {
    const { job, plan, step, input } = this.context
    const source = naturalSourceContext(payload.canonicalRequest)
    if (source.ordinary.compilerVersion !== (job.authoring?.sourceProtocol ?? "bat-hybrid/2")) {
      throw new Error("hybrid_source_protocol_mismatch")
    }
    if (payload.stepId !== step.id) throw new Error("hybrid_compilation_step_input_mismatch")
    assertNaturalSourceIdentity(source.request, this.context.requirement, plan, step, input,
      { localRef: source.ordinary.trace.source.historyRef, digest: source.ordinary.trace.digest }, undefined, source,
      this.context.methodRevision)
    if (previous) assertImmutablePrefix(previous.canonicalRequest, payload.canonicalRequest)
    const current = this.active(signal)
    current.authoring!.sourceReceipt = { authorRequestId: event.id, stepId: step.id, sequence: event.sequence,
      digest: event.digest, phase: payload.phase, canonicalRequest: payload.canonicalRequest }
    current.authoring!.candidateStatus = { status: "pending", observedActions: source.ordinary.trace.actions.length }
    const completed = payload.phase === "final" && source.ordinary.trace.completed
    current.authoring!.stage = completed ? "compiling" : "exploring"
    current.authoring!.level = completed ? "E1" : "E0"
    this.save(current)
    return source
  }

  private async acceptCandidate(event: CompilationCheckpoint, payload: CompilationPayload, source: Source,
    response: ReturnType<typeof validateHybridPrefixResponse> | ReturnType<typeof validateHybridResponse>, signal: AbortSignal) {
    const { repository, job, plan, step, model } = this.context
    const materialize = { response, request: source.request, plan, step, model }
    let graph, finalChain: TaskChain | undefined
    if (payload.phase === "prefix") graph = await materializeHybridPrefix(materialize, signal)
    else {
      if (!source.ordinary.trace.completed) throw new Error("hybrid_completed_source_required")
      await validateSelectionFunctions(response, source.request, signal)
      const chain = materializeHybridChain({ ...materialize,
        version: repository.nextChainVersion(plan.taskId, step.chain.id),
        resolveChild: reference => repository.chain(plan.taskId, reference.id, reference.version, reference.digest) })
      if (!("nodeModel" in chain) || chain.nodeModel !== "stable/v2") throw new Error("hybrid_compilation_node_model_invalid")
      finalChain = chain
      graph = { nodes: chain.nodes, edges: chain.edges }
    }
    const prior = job.authoring?.build?.presentation
    const presentation = payload.phase === "prefix"
      ? preparationPresentation(this.context.preparationPresentation ?? createPreparationPresentation,
        { step, nodes: graph.nodes, edges: graph.edges, ...(prior ? { previous: prior } : {}) })
      : chainPresentationContent(createStepChainPresentation(finalChain!, step))
    const current = this.currentReceipt(event, signal)
    const build = { authorRequestId: event.id, stepId: step.id, sequence: event.sequence,
      digest: event.digest, phase: payload.phase, ...graph,
      compilation: compilationProgress(response.compilation, source.ordinary.trace),
      ...(presentation ? { presentation } : {}) }
    current.authoring!.build = build
    current.authoring!.candidateStatus = { ...current.authoring!.candidateStatus!, status: "accepted" }
    if (payload.phase === "final") {
      const artifact = saveBuildRecord(() => repository.saveArtifact(plan.taskId, job.id,
        "application/vnd.bat.hybrid-online-compilation+json;version=1", z.json().parse(event)))
      const { authorRequestId: _owner, ...view } = build
      const buildArtifact = saveBuildRecord(() => saveStepBuild(repository, job, view))
      const previous = z.object({ steps: z.array(z.json()) }).safeParse(current.authoring!.annotations)
      current.authoring!.annotations = { mode: "online-compilation/v1",
        steps: [...(previous.success ? previous.data.steps : []), { stepId: step.id, artifact, buildArtifact }] }
    }
    this.save(current)
    if (payload.phase === "final") this.finished = { canonicalRequest: payload.canonicalRequest,
      response: validateHybridResponse(response), presentation: structuredClone(presentation!),
      chainDigest: executableChainDigest(finalChain!) }
  }

  private rejectCandidate(event: CompilationCheckpoint, stage: "annotation" | "compile" | "validate" | "materialize",
    reason: string, signal: AbortSignal) {
    const { repository, job, plan } = this.context, current = this.currentReceipt(event, signal)
    saveBuildRecord(() => repository.saveArtifact(plan.taskId, job.id,
      "application/vnd.bat.hybrid-compilation-rejected+json;version=1", z.json().parse({ event, reason, stage })))
    current.authoring!.candidateStatus = { ...current.authoring!.candidateStatus!, status: "failed", stage, code: reason }
    this.save(current)
  }

  private save(current: TaskAuthoringJob) {
    current.sequence++; current.updatedAt = new Date().toISOString()
    saveBuildRecord(() => this.context.repository.saveJob(current))
    Object.assign(this.context.job, current)
  }

  private currentReceipt(event: CompilationCheckpoint, signal: AbortSignal) {
    const current = this.active(signal), receipt = current.authoring!.sourceReceipt
    if (!receipt || receipt.authorRequestId !== event.id || receipt.stepId !== this.context.step.id
      || receipt.sequence !== event.sequence || receipt.digest !== event.digest) {
      throw new Error("hybrid_compilation_snapshot_changed")
    }
    return current
  }
  finish(source: HybridSourceResult) {
    // WHY：原始 sourceGaps 保留探索历史；是否仍阻断链路由已校验并保存的最终编译唯一判定。
    // 无消费者探查可被编译器合法排除，不能在宿主重新把历史缺口判活；来源匹配和 final 屏障仍保留。
    const current = this.active(this.context.signal)
    const receipt = current.authoring?.sourceReceipt, build = current.authoring?.build
    const candidate = current.authoring?.candidateStatus
    if (receipt?.stepId === this.context.step.id && receipt.canonicalRequest === source.canonicalRequest
      && candidate?.status === "failed" && candidate.code) throw new Error(candidate.code)
    if (!this.finished || !source.sourceSuccess || receipt?.phase !== "final"
      || receipt.stepId !== this.context.step.id || receipt.canonicalRequest !== source.canonicalRequest
      || current.authoring?.candidateStatus?.status !== "accepted"
      || build?.sequence !== receipt.sequence || build.digest !== receipt.digest || build.authorRequestId !== receipt.authorRequestId
      || this.finished.canonicalRequest !== source.canonicalRequest
      || this.finished.response.compilation.gaps.length) {
      throw new Error("hybrid_online_final_compilation_required")
    }
    return { response: this.finished.response, forkSourceDigest: source.forkSourceDigest, modelCalls: [],
      presentation: structuredClone(this.finished.presentation), chainDigest: this.finished.chainDigest }
  }

  private previous(event: CompilationCheckpoint, signal: AbortSignal) {
    const previous = this.active(signal).authoring!.sourceReceipt
    if (!previous || previous.stepId !== this.context.step.id) {
      if (event.sequence !== 1 || previous && previous.phase !== "final") {
        throw new Error("hybrid_compilation_sequence_mismatch")
      }
      return undefined
    }
    if (previous.authorRequestId !== event.id) throw new Error("hybrid_compilation_owner_mismatch")
    if (event.sequence < previous.sequence || event.sequence > previous.sequence + 1
      || event.sequence === previous.sequence && event.digest !== previous.digest
      || previous.phase === "final" && event.sequence !== previous.sequence) {
      throw new Error("hybrid_compilation_sequence_mismatch")
    }
    return previous
  }

  private active(signal: AbortSignal) {
    signal.throwIfAborted(); this.context.signal.throwIfAborted()
    const { repository, job } = this.context, current = repository.job(job.taskId, job.id)
    if (current.status !== "running" || !current.authoring || current.browserRunId !== job.browserRunId || current.key !== job.key) {
      throw new Error("hybrid_compilation_job_not_active")
    }
    return current
  }
}

function preparationPresentation(project: typeof createPreparationPresentation,
  input: Parameters<typeof createPreparationPresentation>[0]) {
  // WHY：presentation 只解释已合法的编译事实；展示投影异常不能反向拒绝 prefix 或中断原 ACK。
  try { return project(input) }
  catch { return undefined }
}

function chainPresentationContent(presentation: ReturnType<typeof createStepChainPresentation>) {
  return { stages: presentation.stages, overviewLayout: presentation.overviewLayout,
    focusLayouts: presentation.focusLayouts }
}

function saveBuildRecord<T>(write: () => T): T {
  try { return write() }
  catch (error) { throw new Error("hybrid_compilation_save_failed", { cause: error }) }
}

function assertImmutablePrefix(previous: string, next: string) {
  const old = naturalSourceContext(previous).ordinary
  const current = naturalSourceContext(next).ordinary
  if (!isDeepStrictEqual(old.requirement, current.requirement) || !isDeepStrictEqual(old.plan, current.plan)
    || !isDeepStrictEqual(old.runtimeInputSchema, current.runtimeInputSchema)
    || old.actionRegistryVersion !== current.actionRegistryVersion || old.compilerVersion !== current.compilerVersion
    || !isDeepStrictEqual(old.trace.source, current.trace.source)
    || !isDeepStrictEqual(old.trace.actions, current.trace.actions.slice(0, old.trace.actions.length))) {
    throw new Error("hybrid_compilation_source_changed")
  }
  for (const observation of old.trace.observations) {
    const candidate = current.trace.observations.find(item => item.id === observation.id)
    const { facts, ...body } = observation, { facts: nextFacts, ...nextBody } = candidate ?? { facts: [] }
    if (!isDeepStrictEqual(body, nextBody) || facts.some(fact => !nextFacts.some(item => isDeepStrictEqual(item, fact)))) {
      throw new Error("hybrid_compilation_evidence_changed")
    }
  }
}

function candidateFailureCode(error: unknown) {
  return error instanceof Error && /^(hybrid_|selection_function_|function_)[a-z_0-9]+$/.test(error.message)
    && error.message.length <= 200 ? error.message : "hybrid_compilation_candidate_invalid"
}
