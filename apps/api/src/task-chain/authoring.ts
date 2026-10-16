import { z } from "zod"
import {
  chainPresentationContentSchema, type AuthoringProgressEvent, type ChainPresentation, type JsonValue, type TaskAuthoringJob, type TaskChain,
  type TaskPlan, type TaskRequirement, type TaskPreparationResearch,
} from "@browser-capture/contracts"
import { humanWaitpointSchema, type HumanWaitpoint } from "@browser-capture/contracts/browser"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import { conflict, DomainError } from "../errors.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { RuntimeCleanupRequiredError } from "../upstream-browser/cleanup.js"
import { browserUseTask, naturalRequirementText } from "../upstream-browser/task-request.js"
import { completedModelInvocations } from "../upstream-browser/workflow-artifact.js"
import { assertCapturedSourceIdentity, createHybridArtifact, createHybridSourceArtifact,
  hybridArtifactMediaType, hybridSourceMediaType } from "../upstream-browser/hybrid-artifact.js"
import type { HybridAuthoringProgress, HybridSourceResult } from "../upstream-browser/hybrid-exploration.js"
import { hybridNaturalRequestSchema } from "../upstream-browser/hybrid-schema.js"
import { planNavigationPolicy } from "./navigation-scope.js"
import { saveAuthoringCleanup, settleAuthoringCleanup, CLEANUP_PENDING_REASON } from "./authoring-cleanup.js"
import type { TaskContractRepository } from "./repository.js"
import { projectPreparationPlan } from "./preparation-plan-projection.js"
import { reusableHybridSources } from "./hybrid-source-reuse.js"
import { plannedProgression } from "./authoring-progression.js"
import { authoringFailureCode, authoringFailureMessage, failureLayer, incompleteSourceError, RequirementClarificationRequired } from "./authoring-failure.js"
import { createChainPresentation, createStepChainPresentation } from "./presentation.js"
import { AuthoringBuild } from "./authoring-build.js"
import type { TaskRuntimeHost } from "./runtime-host.js"
import { assertMethodRevisionBaseCurrent, assertMethodRevisionSourceCompatible, executeMethodRevisionPrefix, resolveMethodRevisionBase,
  validateMethodRevisionSource, type MethodRevisionBase } from "./method-revision.js"

type MethodRevision = { base: MethodRevisionBase; source: ReturnType<typeof validateMethodRevisionSource> }
type SourceArtifact = { stepId: string; closed: boolean; artifact: ReturnType<TaskContractRepository["saveArtifact"]> }

export { authoringFailureMessage } from "./authoring-failure.js"

const MAX_EXPLORATION_BROWSER_STEPS = 100

export class TaskChainAuthoring {
  private readonly humanWaits = new Map<string, { job: TaskAuthoringJob; waitpointId: string;
    resume: () => Promise<void>; signal: AbortSignal; resuming: boolean; continuation?: Promise<void> }>()
  constructor(private readonly repository: TaskContractRepository, private readonly ai: AIModelProvider,
    private readonly upstream: UpstreamBrowserRuntime, private readonly host?: TaskRuntimeHost) {}

  async plan(job: TaskAuthoringJob, requirement: TaskRequirement, signal: AbortSignal, research?: TaskPreparationResearch) {
    try {
      signal.throwIfAborted()
      job.status = "running"
      job.audit = { purpose: "plan_projection", model: "none", effort: "none", status: "intended",
        reportedInvocations: null, events: [], escalations: [] }
      this.touch(job)
      // WHY：唯一业务计划已由用户在访谈中确认；此处只能投影同版草案，不得再次调用模型添目标或 URL。
      const plan = projectPreparationPlan(requirement, this.repository.nextPlanVersion(requirement.taskId), research)
      this.complete(job, plan.id, 0)
      return plan
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  assertReusableSources(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan,
    input: JsonValue, sourceJobId: string) {
    if (!this.upstream.recompile) throw new Error("hybrid_offline_compiler_unavailable")
    const reusable = reusableHybridSources(this.repository, job, requirement, plan,
      plannedProgression(plan, input), sourceJobId)
    // WHY：只认本次明确选择、摘要与输入推进均吻合的完整自然来源；旧协议和部分轨迹不能冒充离线恢复。
    if (!reusable || !reusable.sources.every((source) =>
      hybridNaturalRequestSchema.safeParse(source.result.request).success)) {
      throw new Error("hybrid_offline_source_unavailable")
    }
    return reusable
  }

  async task(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue,
    signal: AbortSignal, recoverySourceJobId?: string) {
    try {
      const context = job.preparation?.methodRevision
      const base = context ? resolveMethodRevisionBase(this.repository, job.taskId, requirement, context.base) : undefined
      const revision = context && base ? { base, source: validateMethodRevisionSource(this.repository, job.taskId,
        requirement, base, context) } : undefined
      const model = await this.begin(job, revision ? "chain_method_revision" : recoverySourceJobId
        ? "chain_offline_compilation" : "chain_exploration_and_compilation", signal)
      const result = await this.taskWithModel(job, requirement, plan, input, signal, model, recoverySourceJobId, revision)
      return result
    } catch (error) { this.fail(job, signal, error); throw error }
    finally { this.humanWaits.delete(job.id) }
  }

  async resumeHuman(taskId: string, jobId: string, sequence: number, waitpointId: string) {
    const current = this.repository.job(taskId, jobId), active = this.humanWaits.get(jobId)
    if (current.sequence !== sequence || current.status !== "waiting_for_human"
      || current.waitpoint?.id !== waitpointId || current.waitpoint.status !== "waiting"
      || current.waitpoint.owner !== "authoring_job" || current.waitpoint.ownerId !== jobId) {
      conflict("人工处理状态已变化，请刷新后重试。")
    }
    // WHY：持久化的等待记录不等于仍有可恢复 Agent；重启后绝不能凭记录伪造继续成功。
    if (!active || active.job.taskId !== taskId || active.waitpointId !== waitpointId || active.signal.aborted) {
      conflict("原准备进程已不可恢复，请保留当前记录并重新准备。")
    }
    if (active.resuming) conflict("正在核验人工处理结果，请稍后查看。")
    active.resuming = true
    active.continuation = Promise.resolve().then(async () => {
      await active.resume()
      active.signal.throwIfAborted()
      // WHY：ACK 与下一轮事件可能同批到达；成功只收束原等待，不能覆盖下一处人工等待或终态。
      if (this.humanWaits.get(jobId) !== active || active.job.waitpoint?.id !== waitpointId) return
      active.job.waitpoint.status = "completed"; active.job.waitpoint.resolvedAt = new Date().toISOString()
      active.job.status = "running"; active.job.reason = "人工处理已确认，正在继续原代表试做。"
      this.humanWaits.delete(jobId); this.touch(active.job)
    }).catch(error => {
      // WHY：恢复失败不结束原Agent或伪造完成；保留等待，并只公开已有白名单错误代码。
      const code = authoringFailureCode(error)
      if (this.humanWaits.get(jobId) === active && active.job.waitpoint?.id === waitpointId) {
        active.job.reason = `人工处理恢复未通过：${code}；原任务仍在等待。`; this.touch(active.job)
      }
      throw new DomainError("authoring_human_resume_failed", `恢复原任务未通过：${code}`, 409)
    }).finally(() => { active.resuming = false })
    await active.continuation
  }

  private waitForHuman(job: TaskAuthoringJob,
    wait: Pick<HumanWaitpoint, "id" | "reason" | "prompt" | "origin">,
    resume: () => Promise<void>, signal: AbortSignal) {
    signal.throwIfAborted()
    if (this.humanWaits.has(job.id) && !this.humanWaits.get(job.id)!.resuming) {
      throw new Error("authoring_human_wait_already_active")
    }
    job.waitpoint = humanWaitpointSchema.parse({ ...wait, owner: "authoring_job", ownerId: job.id,
      stepId: null, status: "waiting", requestedAt: new Date().toISOString(), resolvedAt: null })
    job.status = "waiting_for_human"; job.reason = job.waitpoint.prompt
    this.humanWaits.set(job.id, { job, waitpointId: wait.id, resume, signal, resuming: false })
    this.touch(job)
  }

  private async taskWithModel(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue,
    signal: AbortSignal, model: Pick<PreparedAIModel, "selection">, recoverySourceJobId?: string, revision?: MethodRevision) {
    if (!recoverySourceJobId && !this.upstream.withAuthoring) throw new Error("hybrid_authoring_provider_unavailable")
    const childContexts: Record<string, never[]> = Object.fromEntries(plan.steps.map((step) => [step.id, []]))
    if (plan.steps.some((step) => step.invocation.mode === "batch")) throw new Error("hybrid_batch_source_unsupported")
    job.authoring = { stage: recoverySourceJobId ? "compiling" : "exploring", level: "E0",
      failureLayer: null, exploration: null, annotations: null,
      progress: { events: [], actionsStarted: 0, modelCallsStarted: 0 },
      consumption: { explorationToolCalls: 0, explorationSessions: recoverySourceJobId ? 0 : 1,
        compilationCalls: 0, providerInvocations: null } }
    this.touch(job)
    const reused = recoverySourceJobId
      ? this.assertReusableSources(job, requirement, plan, input, recoverySourceJobId) : undefined
    if (!reused) { job.browserRunId = stableUuid(job.id, "upstream-browser"); this.touch(job) }
    const sources = reused?.sources
      ?? await this.explorePlan(job, requirement, plan, input, signal, model, revision)
    if (reused) job.authoring.exploration = z.json().parse(reused.exploration)
    // WHY：首次准备消费原 author 已保存的编译结果；只有用户明确选择恢复才进入离线编译。
    job.authoring.stage = "compiling"; job.authoring.level = "E1"; this.touch(job)
    let compilationInvocations = 0
    const compiledSources = []
    for (const source of sources) {
      job.authoring.consumption.compilationCalls++; this.touch(job)
      const compiled = reused ? await this.upstream.recompile!({ canonicalRequest: source.result.canonicalRequest,
        sourceGaps: source.result.sourceGaps, outputSchema: source.step.outputContract.schema,
        verifiedChildren: childContexts[source.step.id]!, signal, ownerId: job.id })
        : ("compiled" in source ? source.compiled as ReturnType<AuthoringBuild["finish"]> : undefined)
      if (!compiled) throw new Error("hybrid_online_final_compilation_required")
      compilationInvocations += completedModelInvocations(compiled.modelCalls)
      const request = source.result.request
      const ambiguities = compiled.response.compilation.gaps.filter((gap) => gap.resolution === "confirm_intent")
        .map((gap) => ({ code: gap.reason, clauseRefs: [...gap.clauseRefs] }))
      if (ambiguities.length) throw new RequirementClarificationRequired(ambiguities)
      compiledSources.push({ ...source, result: { ...source.result, ...compiled, request,
        history: { ...source.result.history, digest: hybridNaturalRequestSchema.parse(request).trace.digest },
        modelCalls: [...source.result.modelCalls, ...compiled.modelCalls] } })
    }
    const candidates = compiledSources.map(({ step, stepInput, result }) => ({ step, stepInput,
      sealedPresentation: "presentation" in result ? chainPresentationContentSchema.parse(result.presentation) : undefined,
      sealedChainDigest: "chainDigest" in result ? z.string().regex(/^[a-f0-9]{64}$/).parse(result.chainDigest) : undefined,
      ...createHybridArtifact({ requirement, plan, step, stepInput, request: result.request, response: result.response,
        forkSourceDigest: result.forkSourceDigest, modelCalls: result.modelCalls, model: model.selection.modelId,
        resolveChild: (reference) => this.repository.chain(plan.taskId, reference.id, reference.version, reference.digest),
        version: this.repository.nextChainVersion(plan.taskId, step.chain.id),
        source: { history: result.history, sourceSuccess: true, closed: true },
        ...(revision ? { methodRevision: job.preparation!.methodRevision! } : {}) }) }))
    const compiled: TaskChain[] = [], presentations: ChainPresentation[] = [], samples: Record<string, JsonValue> = {}, artifacts: JsonValue[] = []
    for (const { artifact, chain, step, stepInput, sealedPresentation, sealedChainDigest } of candidates) {
      if ((sealedPresentation === undefined) !== (sealedChainDigest === undefined)) {
        throw new Error("hybrid_final_presentation_incomplete")
      }
      if (sealedChainDigest && sealedChainDigest !== executableChainDigest(chain)) {
        throw new Error("hybrid_final_chain_mismatch")
      }
      const presentation = sealedPresentation
        ? createChainPresentation(chain, sealedPresentation) : createStepChainPresentation(chain, step)
      const reference = this.repository.saveArtifact(plan.taskId, job.id, hybridArtifactMediaType, z.json().parse(artifact))
      presentations.push(presentation)
      compiled.push(chain); samples[chain.stepId] = stepInput
      artifacts.push(z.json().parse({ stepId: chain.stepId, artifact: reference }))
    }
    const references = compiled.map((chain) => ({ id: chain.id, version: chain.version, digest: executableChainDigest(chain) }))
    const providerInvocations = compilationInvocations + (reused ? 0
      : sources.reduce((sum, source) => sum + completedModelInvocations(source.result.modelCalls), 0))
    job.authoring.stage = "compiled"; job.authoring.level = "E2"
    const online = z.object({ steps: z.array(z.json()) }).safeParse(job.authoring.annotations)
    job.authoring.annotations = z.json().parse({ mode: "workflow-use/v2", artifacts,
      ...(online.success ? { steps: online.data.steps } : {}) })
    job.authoring.compiledChain = references[0]!; job.authoring.compiledChains = references
    job.authoring.consumption.providerInvocations = providerInvocations
    this.complete(job, plan.id, providerInvocations)
    return { references, chains: compiled, presentations, samples }
  }

  private async explorePlan(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue,
    signal: AbortSignal, model: Pick<PreparedAIModel, "selection">, revision?: MethodRevision) {
    if (!job.authoring || !job.browserRunId) throw new Error("hybrid_authoring_context_missing")
    // WHY：在来源生成前固定协议，缺失新回执不能被当成旧来源放行。
    job.authoring.sourceProtocol = "bat-hybrid/3"
    this.touch(job)
    let progression = plannedProgression(plan, input)
    const steps = revision ? plan.steps.filter(step => step.id === job.preparation!.methodRevision!.stepId) : plan.steps
    const sources: Array<{ step: TaskPlan["steps"][number];
      stepInput: JsonValue; result: HybridSourceResult; compiled: ReturnType<AuthoringBuild["finish"]> }> = []
    const sourceArtifacts: SourceArtifact[] = []
    const capturedCalls = new Map<string, number>()
    let explorationError: unknown, closed = false
    try {
      // WHY：准备与复跑使用同版确认范围，入口不再承担全部权限。
      const navigationPolicy = planNavigationPolicy(plan)
      await this.upstream.withAuthoring!({ selection: model.selection, signal, ownerId: job.browserRunId,
      connectionOwnerId: job.taskId,
      ...(job.browser?.mode ? { browserMode: job.browser.mode } : {}),
      ...navigationPolicy,
      onHumanWait: (wait, resume) => this.waitForHuman(job, wait, resume, signal),
      onCleanup: report => { saveAuthoringCleanup(this.repository, job, report); this.touch(job) },
      onProgress: (event) => this.recordProgress(job, event) }, async (session) => {
      if (revision) {
        progression = await executeMethodRevisionPrefix({ repository: this.repository, ...(this.host ? { host: this.host } : {}),
          content: revision.base.content, stepId: steps[0]!.id, job, input, signal, ...(session.capabilities ? { capabilities: session.capabilities } : {}),
          touch: () => this.touch(job) })
        assertMethodRevisionBaseCurrent(this.repository, job.taskId, requirement, revision.base)
      }
      for (const step of steps) {
        const stepInput = progression.resolve(step)
        const source = await this.exploreStep(session, job, requirement, plan, step, stepInput,
          signal, model, step === steps.at(-1), capturedCalls, sourceArtifacts, revision)
        sources.push(source); progression.acceptSource(step.id, stepInput, source.result)
      }
      })
      closed = true
    } catch (error) {
      // WHY：withAuthoring 在资源结算后抛主错误；未确认的清理使用独立类型，不能吞掉业务失败再报成功。
      closed = !(error instanceof RuntimeCleanupRequiredError)
      explorationError = error
    }
    if (!closed && await settleAuthoringCleanup(this.repository, this.upstream, job, false)) {
      closed = true
      if (explorationError instanceof RuntimeCleanupRequiredError)
        explorationError = explorationError.primary.status === "failed" ? explorationError.primary.error : undefined
    }
    for (const reference of sourceArtifacts) reference.closed = closed
    job.authoring.exploration = z.json().parse({ mode: "workflow-use-authoring/v3", sources: sourceArtifacts })
    if (!explorationError) { job.authoring.stage = "explored"; job.authoring.level = "E1" }
    job.authoring.consumption.providerInvocations = capturedCalls.size
      ? [...capturedCalls.values()].reduce((sum, count) => sum + count, 0) : null
    this.touch(job)
    if (explorationError) throw explorationError
    signal.throwIfAborted()
    if (!revision) progression.finish()
    return sources
  }

  private async exploreStep(session: import("../upstream-browser/hybrid-exploration.js").HybridAuthorSession,
    job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, step: TaskPlan["steps"][number],
    stepInput: JsonValue, signal: AbortSignal, model: Pick<PreparedAIModel, "selection">, closeAfterResponse: boolean,
    capturedCalls: Map<string, number>, sourceArtifacts: SourceArtifact[], revision?: MethodRevision) {
    const requirementText = naturalRequirementText(requirement).text
    signal.throwIfAborted()
    job.authoring!.stage = "exploring"; job.authoring!.level = "E0"
    if (!step.resultSpec) throw new Error("plan_result_spec_required")
    const build = new AuthoringBuild({ repository: this.repository, job, requirement, plan, step,
      input: stepInput, model: model.selection.modelId, signal,
      ...(revision ? { methodRevision: job.preparation!.methodRevision! } : {}) })
    const task = browserUseTask({ requirement, plan, step, resolvedInput: stepInput,
      ...(revision ? { methodRevision: job.preparation!.methodRevision! } : {}) })
    const result = await session.author({ task, input: stepInput, sourceProtocol: job.authoring!.sourceProtocol,
      inputSchema: step.inputContract.schema, outputSchema: step.outputContract.schema,
      resultSpec: step.resultSpec,
      requirementId: requirement.id, requirementVersion: requirement.version, planId: plan.id, planVersion: plan.version,
      requirementText, requirementDigest: digestJson(requirement), planDigest: digestJson(plan),
      entryUrls: plan.entryUrls ?? [],
      stepId: step.id, callMode: step.invocation.mode,
      // WHY：计划预算是正式运行上界，不是首次探索的试错额度；准备阶段必须在有界动作内
      // 形成可复跑证据，否则快速失败并保留诊断，不能让模型在页面间无限绕路。
      maxSteps: Math.min(MAX_EXPLORATION_BROWSER_STEPS, Math.max(1, step.budget.maxBrowserCommands)) },
      { closeAfterResponse: closeAfterResponse, onCompilation: async (event, bounded) => {
        // 人工恢复 ACK 与检查点可同批抵达；等原恢复把 job 保存为 running，不能误拒绝或覆盖等待。
        await this.humanWaits.get(job.id)?.continuation
        await build.accept(event, bounded)
      },
        onSource: (result) => {
        capturedCalls.set(step.id, completedModelInvocations(result.modelCalls))
        job.authoring!.consumption.providerInvocations = [...capturedCalls.values()].reduce((sum, count) => sum + count, 0)
        const artifact = this.repository.saveArtifact(plan.taskId, job.id, hybridSourceMediaType,
          z.json().parse(createHybridSourceArtifact(requirement, plan, step.id, stepInput, result)))
        sourceArtifacts.push({ stepId: step.id, closed: false, artifact })
        job.authoring!.exploration = z.json().parse({ mode: "workflow-use-authoring/v3", sources: sourceArtifacts })
        this.touch(job)
      } })
    assertCapturedSourceIdentity(requirement, plan, step.id, stepInput, result,
      revision ? job.preparation!.methodRevision! : undefined)
    if (revision) assertMethodRevisionSourceCompatible(revision.source, result)
    job.authoring!.consumption.explorationToolCalls += result.browserCommands
    this.touch(job)
    // WHY：原生安全拒绝优先于后续采集/编译缺口，不能在用户界面再退化为普通动作失败。
    const scopeFailure = result.sourceGaps.find(gap => gap.reason === "hybrid_navigation_outside_authorized_scope")
    if (scopeFailure) throw new RequirementClarificationRequired([{ code: scopeFailure.reason, clauseRefs: [...scopeFailure.clauseRefs] }])
    const compilationFailure = result.sourceGaps.find(gap => gap.reason.startsWith("hybrid_compilation_"))
    if (compilationFailure) throw new Error(compilationFailure.reason)
    const ambiguities = result.sourceGaps.filter((gap) => gap.resolution === "confirm_intent")
      .map((gap) => ({ code: gap.reason, clauseRefs: [...gap.clauseRefs] }))
    // WHY：只有纯业务歧义可从未完成来源返回需求对话；缺证或拒绝来源仍按来源失败处理。
    const ambiguityOnly = ambiguities.length > 0
      && result.sourceGaps.every((gap) => gap.resolution === "confirm_intent")
    if (!result.sourceSuccess && !ambiguityOnly) {
      const trace = hybridNaturalRequestSchema.parse(result.request).trace
      throw incompleteSourceError(trace.actions)
    }
    if (ambiguities.length) throw new RequirementClarificationRequired(ambiguities)
    return { step, stepInput, result, compiled: build.finish(result) }
  }

  private async begin(job: TaskAuthoringJob, purpose: "chain_exploration_and_compilation"
    | "chain_offline_compilation" | "chain_method_revision", signal: AbortSignal) {
    const selection = this.ai.selection()
    job.status = "running"; job.sequence++; job.updatedAt = new Date().toISOString(); job.reason = null
    job.audit = { purpose, model: selection.modelId, effort: selection.reasoningEffort,
      status: "intended", reportedInvocations: null, events: [], escalations: [] }
    this.save(job)
    // WHY：纯来源重编译无需账号或模型资格；现行探索仍在副作用前核验所选模型。
    return purpose === "chain_offline_compilation" ? { selection } : this.ai.prepare(selection, signal)
  }
  private complete(job: TaskAuthoringJob, resultId: string, reportedInvocations: number | null) {
    job.status = "completed"; job.resultId = resultId; job.reason = null; job.sequence++; job.updatedAt = new Date().toISOString()
    job.audit!.status = "completed"; job.audit!.reportedInvocations = reportedInvocations; this.save(job)
  }
  private fail(job: TaskAuthoringJob, signal: AbortSignal, error: unknown) {
    job.status = signal.aborted ? "interrupted" : "failed"; job.reason = signal.aborted ? "生成已中断，可重新发起。"
      : `生成未完成：${authoringFailureMessage(error)}`
    if (job.cleanup?.status === "unconfirmed") job.reason += CLEANUP_PENDING_REASON
    job.sequence++; job.updatedAt = new Date().toISOString()
    if (job.waitpoint?.status === "waiting") {
      job.waitpoint.status = signal.aborted ? "cancelled" : "failed"; job.waitpoint.resolvedAt = job.updatedAt
    }
    if (job.audit?.status === "intended") job.audit.status = signal.aborted ? "interrupted" : "failed"
    if (job.audit) job.audit.reportedInvocations = settledGenerationCount(job.audit.events)
    if (job.authoring) {
      job.audit!.reportedInvocations = job.authoring.consumption.providerInvocations === null ? null
        : job.authoring.consumption.providerInvocations
      job.authoring.failureLayer = failureLayer(error, job.authoring.stage)
      job.authoring.failureCode = authoringFailureCode(error)
    }
    if (error instanceof RequirementClarificationRequired && job.preparation) {
      job.preparation.requirementReturn = {
        reason: error.issues.some(issue => issue.code === "hybrid_navigation_outside_authorized_scope")
          ? "页面尝试访问尚未确认的来源，已停止。请返回需求对话核对访问范围；原入口和执行记录保留。"
          : "准备真实页面时发现会改变任务结果的业务歧义，需要返回需求对话由你确认。",
        issues: error.issues,
      }
      job.reason = job.preparation.requirementReturn.reason
    }
    this.save(job)
  }
  private recordProgress(job: TaskAuthoringJob, event: HybridAuthoringProgress) {
    if (job.status !== "running" || !job.authoring) return
    const progress = job.authoring.progress ?? { events: [], actionsStarted: 0, modelCallsStarted: 0 }
    const observed: AuthoringProgressEvent = { ...event, sequence: job.sequence + 1 }
    progress.events = [...progress.events, observed].slice(-50)
    if (event.source === "browser" && event.phase === "dispatch" && event.status === "started") progress.actionsStarted++
    if (event.source === "model" && event.status === "started") progress.modelCallsStarted++
    job.authoring.progress = progress
    this.touch(job)
  }
  private touch(job: TaskAuthoringJob) {
    job.sequence++; job.updatedAt = new Date().toISOString(); this.save(job)
  }
  private save(job: TaskAuthoringJob) { this.repository.saveJob(job) }
}

function settledGenerationCount(events: NonNullable<TaskAuthoringJob["audit"]>["events"]) {
  const started = new Set(events.filter((event) => event.type === "generation.started").map((event) => event.invocationId))
  const completed = new Set(events.filter((event) => event.type === "generation.completed").map((event) => event.invocationId))
  return started.size > 0 && [...started].every((id) => completed.has(id)) ? completed.size : null
}

export function requirePlannedChainShape(step: TaskPlan["steps"][number], chain: TaskChain) {
  if (step.invocation.mode === "batch" && !chain.nodes.some((node) => node.kind === "loop")) {
    throw new Error("batch_chain_loop_required")
  }
}
