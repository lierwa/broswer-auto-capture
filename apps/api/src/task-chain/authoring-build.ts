import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import type {
  ChainPresentationContent, JsonValue, TaskAuthoringJob, TaskChain, TaskPlan, TaskPlanStep, TaskRequirement,
} from "@browser-capture/contracts"
import { executableChainDigest } from "@browser-capture/runtime"
import { assertNaturalSourceIdentity } from "../upstream-browser/hybrid-artifact.js"
import { naturalSourceContext, validateHybridRequestSources } from "../upstream-browser/hybrid-natural-payload.js"
import { validateHybridPrefixResponse } from "../upstream-browser/hybrid-prefix-schema.js"
import { materializeHybridPrefix } from "../upstream-browser/hybrid-prefix-materializer.js"
import { materializeHybridChain, validateHybridResponse } from "../upstream-browser/hybrid-materializer.js"
import { validateSelectionFunctions } from "../upstream-browser/hybrid-selection.js"
import { parseCompilationCheckpoint, type CompilationCheckpoint } from "../upstream-browser/hybrid-compilation-checkpoint.js"
import type { HybridSourceResult } from "../upstream-browser/hybrid-captured-source.js"
import type { TaskContractRepository } from "./repository.js"
import { RequirementClarificationRequired } from "./authoring-failure.js"
import { createPreparationPresentation, createStepChainPresentation } from "./presentation.js"

type Context = { repository: TaskContractRepository; job: TaskAuthoringJob; plan: TaskPlan;
  requirement: TaskRequirement; step: TaskPlanStep; input: JsonValue; model: string; signal: AbortSignal;
  preparationPresentation?: typeof createPreparationPresentation }

/** One step owns the current snapshot. A next step starts only after finish() retained its result. */
export class AuthoringBuild {
  private identity: string | undefined
  private finished: { canonicalRequest: string; response: ReturnType<typeof validateHybridResponse>;
    presentation: ChainPresentationContent; chainDigest: string } | undefined
  constructor(private readonly context: Context) {}

  async accept(event: CompilationCheckpoint, signal: AbortSignal) {
    const { repository, job, plan, step, input, model } = this.context
    this.active(signal)
    const previous = this.previous(event)
    if (previous?.sequence === event.sequence && previous.digest === event.digest && previous.payload === event.payload) return
    try {
      const payload = parseCompilationCheckpoint(event), source = naturalSourceContext(payload.canonicalRequest)
      if (payload.stepId !== step.id) {
        throw new Error("hybrid_compilation_step_input_mismatch")
      }
      assertNaturalSourceIdentity(source.request, this.context.requirement, plan, step, input,
        { localRef: source.ordinary.trace.source.historyRef, digest: source.ordinary.trace.digest }, undefined, source)
      if (previous) assertImmutablePrefix(previous.payload, payload.canonicalRequest)
      // WHY：在线时序不能吞掉旧编译器的业务歧义；先核验同源 envelope，再返回原需求确认入口。
      const response = payload.phase === "prefix" ? validateHybridPrefixResponse(payload.response)
        : validateHybridResponse(payload.response)
      validateHybridRequestSources(response, source.request)
      // WHY：完整来源已到达，之后失败属于节点收尾，不再把 B-U 已完成记作探索失败。
      if (payload.phase === "final" && source.ordinary.trace.completed) {
        job.authoring!.stage = "compiling"; job.authoring!.level = "E1"
      }
      const ambiguities = response.compilation.gaps.filter(gap => gap.resolution === "confirm_intent")
        .map(gap => ({ code: gap.reason, clauseRefs: gap.clauseRefs }))
      if (ambiguities.length) throw new RequirementClarificationRequired(ambiguities)
      const materialize = { response: payload.response, request: source.request, plan, step, model }
      let graph, finalChain: TaskChain | undefined
      if (payload.phase === "prefix") graph = await materializeHybridPrefix(materialize, signal)
      else {
        if (!source.ordinary.trace.completed) throw new Error("hybrid_completed_source_required")
        await validateSelectionFunctions(payload.response, source.request, signal)
        const chain = materializeHybridChain({ ...materialize,
          version: repository.nextChainVersion(plan.taskId, step.chain.id),
          resolveChild: reference => repository.chain(plan.taskId, reference.id, reference.version, reference.digest) })
        if (!("nodeModel" in chain) || chain.nodeModel !== "stable/v2") throw new Error("hybrid_compilation_node_model_invalid")
        finalChain = chain
        graph = { nodes: chain.nodes, edges: chain.edges }
      }
      const presentation = payload.phase === "prefix"
        ? preparationPresentation(this.context.preparationPresentation ?? createPreparationPresentation,
          { step, nodes: graph.nodes, edges: graph.edges, ...(previous?.presentation
            ? { previous: previous.presentation } : {}) })
        : chainPresentationContent(createStepChainPresentation(finalChain!, step))
      // WHY：异步校验后重新读取活动事实；不可用开始校验时的旧 job 覆盖取消/人工等待。
      const current = this.active(signal)
      if (!isDeepStrictEqual(current.authoring!.build, job.authoring?.build)) {
        throw new Error("hybrid_compilation_snapshot_changed")
      }
      const build = { authorRequestId: event.id, stepId: step.id, sequence: event.sequence,
        digest: event.digest, phase: payload.phase, payload: event.payload, ...graph,
        ...(presentation ? { presentation } : {}) }
      current.authoring!.build = build
      current.authoring!.stage = payload.phase === "final" ? "compiling" : "exploring"
      current.authoring!.level = payload.phase === "final" ? "E1" : "E0"
      if (payload.phase === "final") {
        const artifact = saveBuildRecord(() => repository.saveArtifact(plan.taskId, job.id,
          "application/vnd.bat.hybrid-online-compilation+json;version=1", z.json().parse(event)))
        const prior = z.object({ steps: z.array(z.json()) }).safeParse(current.authoring!.annotations)
        current.authoring!.annotations = { mode: "online-compilation/v1",
          steps: [...(prior.success ? prior.data.steps : []), { stepId: step.id, artifact }] }
      }
      current.sequence++; current.updatedAt = new Date().toISOString()
      saveBuildRecord(() => repository.saveJob(current))
      Object.assign(job, current)
      this.identity = event.id
      if (payload.phase === "final") this.finished = { canonicalRequest: payload.canonicalRequest,
        response: validateHybridResponse(payload.response), presentation: structuredClone(presentation!),
        chainDigest: executableChainDigest(finalChain!) }
    } catch (error) {
      // 合法 raw 回执留在受控 artifact；绝不以非法包覆盖上一份有效节点。
      const reason = error instanceof Error && /^(hybrid_|selection_function_|function_)[a-z_0-9]+$/.test(error.message)
        ? error.message : "hybrid_compilation_validation_failed"
      if (!signal.aborted && !this.context.signal.aborted) {
        try { repository.saveArtifact(plan.taskId, job.id,
          "application/vnd.bat.hybrid-compilation-rejected+json;version=1", z.json().parse({ event, reason })) }
        catch (receiptError) { throw new AggregateError([error, receiptError], "hybrid_compilation_receipt_save_failed") }
      }
      throw error
    }
  }

  finish(source: HybridSourceResult) {
    if (!this.finished || this.finished.canonicalRequest !== source.canonicalRequest || source.sourceGaps.length) {
      throw new Error("hybrid_online_final_compilation_required")
    }
    return { response: this.finished.response, forkSourceDigest: source.forkSourceDigest, modelCalls: [],
      presentation: structuredClone(this.finished.presentation), chainDigest: this.finished.chainDigest }
  }

  private previous(event: CompilationCheckpoint) {
    const { job, step } = this.context, previous = job.authoring?.build
    if (this.identity && this.identity !== event.id) throw new Error("hybrid_compilation_owner_mismatch")
    if (!this.identity) {
      if (event.sequence !== 1 || previous && (previous.phase !== "final" || previous.stepId === step.id)) {
        throw new Error("hybrid_compilation_sequence_mismatch")
      }
      return undefined
    }
    if (!previous || previous.authorRequestId !== event.id || previous.stepId !== step.id
      || event.sequence < previous.sequence || event.sequence > previous.sequence + 1
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
  const old = naturalSourceContext(z.object({ canonicalRequest: z.string() }).parse(JSON.parse(previous)).canonicalRequest).ordinary
  const current = naturalSourceContext(next).ordinary
  if (!isDeepStrictEqual(old.requirement, current.requirement) || !isDeepStrictEqual(old.plan, current.plan)
    || !isDeepStrictEqual(old.runtimeInputSchema, current.runtimeInputSchema)
    || old.actionRegistryVersion !== current.actionRegistryVersion
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
