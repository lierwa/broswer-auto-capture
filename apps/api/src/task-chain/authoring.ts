import { z } from "zod"
import {
  CONTRACT_VERSION, planCandidateRecordSchema, resultSpecSchema, taskPlanEntryUrlsSchema,
  taskPlanExecutionIssues, taskPlanSchema, taskPlanStepSchema,
  type AuthoringProgressEvent, type ChainPresentation, type JsonValue, type TaskAuthoringJob, type TaskChain, type TaskDataContract,
  type TaskPlan, type TaskRequirement,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { browserGrantLimits } from "@browser-capture/browser"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { browserUseTask, naturalRequirementText } from "../upstream-browser/task-request.js"
import { completedModelInvocations } from "../upstream-browser/workflow-artifact.js"
import { createHybridArtifact, createHybridSourceArtifact, hybridArtifactMediaType, hybridSourceMediaType } from "../upstream-browser/hybrid-artifact.js"
import type { HybridAuthoringProgress, HybridSourceResult } from "../upstream-browser/hybrid-exploration.js"
import { hybridNaturalRequestSchema } from "../upstream-browser/hybrid-schema.js"
import { collectOrigins } from "./exploration-browser-support.js"
import type { TaskContractRepository } from "./repository.js"
import { planCorrectionPrompt, planPrompt } from "./authoring-prompts.js"
import { incompatibleSourceRegistry, reusableHybridSources } from "./hybrid-source-reuse.js"
import { plannedProgression } from "./authoring-progression.js"
import { authoringFailureMessage, failureLayer } from "./authoring-failure.js"
import { explainPlanCandidateIssues } from "./plan-candidate-diagnostics.js"
import { createStepChainPresentation } from "./presentation.js"

export { authoringFailureMessage } from "./authoring-failure.js"

type RequirementIssue = { code: string; clauseRefs: string[] }
const MAX_EXPLORATION_BROWSER_STEPS = 100
class RequirementClarificationRequired extends Error {
  constructor(readonly issues: RequirementIssue[]) { super("hybrid_requirement_clarification_required") }
}

const semanticPlanStepSchema = taskPlanStepSchema.omit({ chain: true, budget: true, resultSpec: true })
  .extend({ resultSpec: resultSpecSchema })
  .refine((step) => step.invocation.mode !== "batch", "workflow_batch_input_unsupported")
export const semanticPlanSchema = taskPlanSchema.omit({ contractVersion: true, kind: true, id: true, taskId: true,
  version: true, requirement: true, evidence: true, steps: true, budget: true })
  .extend({ entryUrls: taskPlanEntryUrlsSchema, steps: z.array(semanticPlanStepSchema).min(1).max(6) }).strict()
export class TaskChainAuthoring {
  constructor(private readonly repository: TaskContractRepository, private readonly ai: AIModelProvider,
    private readonly upstream: UpstreamBrowserRuntime) {}

  async plan(job: TaskAuthoringJob, requirement: TaskRequirement, signal: AbortSignal) {
    try {
      const model = await this.begin(job, "plan_creation", signal)
      const id = stableUuid(requirement.taskId, "plan"), version = this.repository.nextPlanVersion(requirement.taskId)
      const prompt = planPrompt(requirement), onEvent = (event: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"] extends (event: infer E) => void ? E : never) => {
        job.audit!.events.push(event); this.touch(job)
      }
      const candidate = await generateJson(model, semanticPlanSchema, prompt, signal, onEvent)
      const first = this.recordPlanCandidate(job, candidate, requirement, id, version)
      const corrected = first.plan ? null : await generateJson(model, semanticPlanSchema,
        planCorrectionPrompt(requirement, undefined, candidate, z.json().parse(first.issues)), signal, onEvent)
      const second = corrected === null ? null : this.recordPlanCandidate(job, corrected, requirement, id, version)
      const plan = second?.plan ?? first.plan
      if (!plan) throw new Error("plan_candidate_contract_invalid")
      // WHY：生成中的计划属于当前 TaskDraft 内容；只有试跑快照或手动 Release 才冻结不可变版本。
      this.complete(job, plan.id, second ? 2 : 1)
      return plan
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  async correctPlan(job: TaskAuthoringJob, requirement: TaskRequirement,
    source: NonNullable<TaskAuthoringJob["preparation"]>["planCandidates"][number], signal: AbortSignal) {
    try {
      // WHY：续接使用上次已保存候选；旧模型审计先归档，不能被新调用覆盖。
      if (job.audit) job.preparation!.priorAudits.push(structuredClone(job.audit))
      const id = stableUuid(requirement.taskId, "plan"), version = this.repository.nextPlanVersion(requirement.taskId)
      // WHY：合同实现修复后先用原始候选重新校验；合法候选不再消耗一次模型生成。
      const current = inspectPlanCandidate(source.candidate, requirement, id, version)
      if (current.plan) {
        job.status = "running"; job.reason = null
        job.audit = { purpose: "plan_contract_revalidation", model: "none", effort: "none",
          status: "intended", reportedInvocations: 0, events: [], escalations: [] }
        const validated = this.recordPlanCandidate(job, source.candidate, requirement, id, version)
        if (!validated.plan) throw new Error("plan_candidate_revalidation_changed")
        this.complete(job, validated.plan.id, 0)
        return validated.plan
      }
      // WHY：合同诊断可变得更精确，但原始模型候选不变；保存新诊断再交给既有纠正入口。
      source.issues = current.issues
      this.touch(job)
      const model = await this.begin(job, "plan_creation", signal)
      const onEvent = (event: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"] extends (event: infer E) => void ? E : never) => {
        job.audit!.events.push(event); this.touch(job)
      }
      const candidate = await generateJson(model, semanticPlanSchema,
        planCorrectionPrompt(requirement, undefined, source.candidate, z.json().parse(source.issues)), signal, onEvent)
      const result = this.recordPlanCandidate(job, candidate, requirement, id, version)
      if (!result.plan) throw new Error("plan_candidate_contract_invalid")
      this.complete(job, result.plan.id, 1)
      return result.plan
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  private recordPlanCandidate(job: TaskAuthoringJob, value: JsonValue, requirement: TaskRequirement,
    id: string, version: number) {
    const result = inspectPlanCandidate(value, requirement, id, version)
    if (!job.preparation) throw new Error("preparation_state_missing")
    job.preparation.planCandidates.push(planCandidateRecordSchema.parse({
      attempt: job.preparation.planCandidates.length + 1, candidate: value, digest: digestJson(value), issues: result.issues,
    }))
    this.touch(job)
    return result
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
    signal: AbortSignal, recoverySourceJobId?: string, verifySourceFirst = false) {
    try {
      // WHY：从失败方案续接前先校验受管源码，避免模型准备或 Browser 重新打开后才发现环境漂移。
      if (verifySourceFirst) {
        job.status = "running"
        job.audit = { purpose: "chain_exploration_and_compilation", model: "none", effort: "none",
          status: "intended", reportedInvocations: 0, events: [], escalations: [] }
        job.authoring = { stage: "exploring", level: "E0", failureLayer: null,
          exploration: { mode: "workflow-use-authoring/v2", sources: [] }, annotations: null,
          progress: { events: [], actionsStarted: 0, modelCallsStarted: 0 },
          consumption: { explorationToolCalls: 0, explorationSessions: 0, compilationCalls: 0, providerInvocations: 0 } }
        this.touch(job)
        if (!this.upstream.sourceDigest) throw new Error("workflow_fork_source_verifier_unavailable")
        await this.upstream.sourceDigest()
        signal.throwIfAborted()
      }
      const model = await this.begin(job, recoverySourceJobId ? "chain_offline_compilation"
        : "chain_exploration_and_compilation", signal)
      const result = await this.taskWithModel(job, requirement, plan, input, signal, model, recoverySourceJobId)
      return result
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  private async taskWithModel(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue,
    signal: AbortSignal, model: PreparedAIModel, recoverySourceJobId?: string) {
    if (!recoverySourceJobId && !this.upstream.withAuthoring) throw new Error("hybrid_authoring_provider_unavailable")
    const childContexts: Record<string, never[]> = Object.fromEntries(plan.steps.map((step) => [step.id, []]))
    if (plan.steps.some((step) => step.invocation.mode === "batch")) throw new Error("hybrid_batch_source_unsupported")
    job.authoring = { stage: recoverySourceJobId ? "compiling" : "exploring", level: "E0",
      failureLayer: null, exploration: null, annotations: null,
      progress: { events: [], actionsStarted: 0, modelCallsStarted: 0 },
      consumption: { explorationToolCalls: 0, explorationSessions: recoverySourceJobId ? 0 : 1,
        compilationCalls: 0, providerInvocations: null } }
    this.touch(job)
    const reusable = recoverySourceJobId
      ? this.assertReusableSources(job, requirement, plan, input, recoverySourceJobId)
      : this.upstream.recompile && !job.preparation?.resumedFromJobId
      ? reusableHybridSources(this.repository, job, requirement, plan, plannedProgression(plan, input)) : undefined
    // WHY：历史 v1 来源只读保留；自然任务生产入口不得把旧 authority 请求送入新编译器。
    let reused = reusable?.sources.every((source) => hybridNaturalRequestSchema.safeParse(source.result.request).success)
      ? reusable : undefined
    if (recoverySourceJobId && !reused) throw new Error("hybrid_offline_source_unavailable")
    let sources: NonNullable<typeof reused>["sources"]
    if (reused) sources = reused.sources
    else {
      job.browserRunId = stableUuid(job.id, "upstream-browser"); this.touch(job)
      sources = await this.explorePlan(job, requirement, plan, input, signal, model, childContexts)
    }
    // WHY：先确认唯一 Browser 已关闭并校验所有步骤，再写候选；后一步 gap 不能留下半套可用链。
    job.authoring.stage = "compiling"; this.touch(job)
    let reusedModelInvocations = 0
    if (reused) {
      let registryChanged = false
      try { for (const source of sources) {
        const compiled = await this.upstream.recompile!({ request: source.result.request,
          sourceResponse: source.result.response, outputSchema: source.step.outputContract.schema,
          verifiedChildren: childContexts[source.step.id]!, signal,
          annotation: { selection: model.selection, ownerId: job.id,
            onProgress: (event) => this.recordProgress(job, event) } })
        const { modelCalls = [], request = source.result.request, ...result } = compiled
        reusedModelInvocations += completedModelInvocations(modelCalls)
        // WHY：离线只追加缺失的派生函数；浏览器事实与旧来源不改，历史审计保留，当前 job 只计新增调用。
        source.result = { ...source.result, ...result, request,
          history: { ...source.result.history, digest: hybridNaturalRequestSchema.parse(request).trace.digest },
          modelCalls: [...source.result.modelCalls, ...modelCalls] }
      } } catch (error) {
        if (!incompatibleSourceRegistry(error)) throw error
        registryChanged = true
      }
      if (registryChanged) {
        if (recoverySourceJobId) throw new Error("hybrid_offline_source_registry_incompatible")
        // WHY：只有旧来源的动作注册合同已不兼容时才重新采集；编译 gap 必须留在
        // 编译层并保留原来源，不能因编译器尚未接通就再开 Browser 消耗模型。
        reused = undefined
        job.authoring.stage = "exploring"; job.authoring.level = "E0"; job.authoring.exploration = null
        job.authoring.consumption.explorationSessions = 1; job.authoring.consumption.providerInvocations = null
        job.browserRunId = stableUuid(job.id, "upstream-browser")
        this.touch(job)
        sources = await this.explorePlan(job, requirement, plan, input, signal, model, childContexts)
        job.authoring.stage = "compiling"; this.touch(job)
      } else {
        // WHY：重编译结果属于本次准备，保存新派生记录；不能让技术详情继续显示旧 gap。
        job.authoring.exploration = z.json().parse({ ...reused.exploration, sources: sources.map(({ step, stepInput, result }) => ({
          stepId: step.id, artifact: this.repository.saveArtifact(plan.taskId, job.id, hybridSourceMediaType,
            z.json().parse(createHybridSourceArtifact(requirement, plan, step.id, stepInput, result))) })) })
        job.authoring.level = "E1"
        job.authoring.consumption.explorationSessions = 0
        job.authoring.consumption.providerInvocations = reusedModelInvocations
        this.touch(job)
      }
    }
    const candidates = sources.map(({ step, stepInput, result }) => ({ step, stepInput,
      ...createHybridArtifact({ requirement, plan, step, stepInput, request: result.request, response: result.response,
        forkSourceDigest: result.forkSourceDigest, modelCalls: result.modelCalls, model: model.selection.modelId,
        resolveChild: (reference) => this.repository.chain(plan.taskId, reference.id, reference.version, reference.digest),
        version: this.repository.nextChainVersion(plan.taskId, step.chain.id),
        source: { history: result.history, sourceSuccess: true, closed: true } }) }))
    const compiled: TaskChain[] = [], presentations: ChainPresentation[] = [], samples: Record<string, JsonValue> = {}, artifacts: JsonValue[] = []
    for (const { artifact, chain, step, stepInput } of candidates) {
      const reference = this.repository.saveArtifact(plan.taskId, job.id, hybridArtifactMediaType, z.json().parse(artifact))
      presentations.push(createStepChainPresentation(chain, step))
      compiled.push(chain); samples[chain.stepId] = stepInput
      artifacts.push(z.json().parse({ stepId: chain.stepId, artifact: reference }))
    }
    const references = compiled.map((chain) => ({ id: chain.id, version: chain.version, digest: executableChainDigest(chain) }))
    const providerInvocations = reused ? reusedModelInvocations
      : sources.reduce((sum, source) => sum + completedModelInvocations(source.result.modelCalls), 0)
    job.authoring.stage = "compiled"; job.authoring.level = "E2"
    job.authoring.annotations = z.json().parse({ mode: "workflow-use/v2", artifacts })
    job.authoring.compiledChain = references[0]!; job.authoring.compiledChains = references
    job.authoring.consumption.providerInvocations = providerInvocations
    this.complete(job, plan.id, providerInvocations)
    return { references, chains: compiled, presentations, samples }
  }

  private async explorePlan(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue,
    signal: AbortSignal, model: PreparedAIModel, childContexts: Record<string, never[]>) {
    if (!job.authoring || !job.browserRunId) throw new Error("hybrid_authoring_context_missing")
    const progression = plannedProgression(plan, input), sources: Array<{ step: TaskPlan["steps"][number];
      stepInput: JsonValue; result: HybridSourceResult }> = []
    let explorationError: unknown, closed = false
    try {
      const requirementText = naturalRequirementText(requirement).text
      const allowedOrigins = collectOrigins([plan.entryUrls ?? [], input, requirementText])
      if (!allowedOrigins.length) throw new Error("preexecution_entry_unresolved")
      await this.upstream.withAuthoring!({ selection: model.selection, signal, ownerId: job.browserRunId,
      allowedOrigins,
      onProgress: (event) => this.recordProgress(job, event) }, async (session) => {
      try { for (const step of plan.steps) {
        signal.throwIfAborted()
        if (!step.resultSpec) throw new Error("plan_result_spec_required")
        const stepInput = progression.resolve(step)
        const task = browserUseTask({ requirement, plan, step, resolvedInput: stepInput })
        const result = await session.author({ task, input: stepInput,
          inputSchema: step.inputContract.schema, outputSchema: step.outputContract.schema,
          resultSpec: step.resultSpec,
          requirementId: requirement.id, requirementVersion: requirement.version, planId: plan.id, planVersion: plan.version,
          requirementText, requirementDigest: digestJson(requirement), planDigest: digestJson(plan),
          entryUrls: plan.entryUrls ?? [],
          stepId: step.id, callMode: step.invocation.mode,
          verifiedChildren: childContexts[step.id]!,
          // WHY：计划预算是正式运行上界，不是首次探索的试错额度；准备阶段必须在有界动作内
          // 形成可复跑证据，否则快速失败并保留诊断，不能让模型在页面间无限绕路。
          maxSteps: Math.min(MAX_EXPLORATION_BROWSER_STEPS, Math.max(1, step.budget.maxBrowserCommands)) })
        sources.push({ step, stepInput, result })
        if (!result.sourceSuccess) throw new Error("hybrid_completed_source_required")
        const ambiguities = result.response.compilation.gaps.filter((gap) => gap.resolution === "confirm_intent")
          .map((gap) => ({ code: gap.reason, clauseRefs: [...gap.clauseRefs] }))
        if (ambiguities.length) throw new RequirementClarificationRequired(ambiguities)
        progression.accept(step.id, stepInput, result.output)
        job.authoring!.consumption.explorationToolCalls += result.browserCommands
        job.authoring!.exploration = z.json().parse({ mode: "workflow-use-authoring/v2", sources: sources.map(({ step, result }) => ({
          stepId: step.id, history: result.history, canonicalDigest: result.response.compilation.canonicalDigest,
          gaps: result.response.compilation.gaps })) })
        job.authoring!.stage = "explored"; job.authoring!.level = "E1"; this.touch(job)
      } } catch (error) { explorationError = error }
      })
      closed = true
    } catch (error) {
      explorationError = explorationError ? new AggregateError([explorationError, error], "hybrid_source_and_cleanup_failed") : error
    }
    const sourceArtifacts = sources.map(({ step, stepInput, result }) => ({ stepId: step.id,
      artifact: this.repository.saveArtifact(plan.taskId, job.id, hybridSourceMediaType,
        z.json().parse(createHybridSourceArtifact(requirement, plan, step.id, stepInput, result, closed))) }))
    job.authoring.exploration = z.json().parse({ mode: "workflow-use-authoring/v2", sources: sourceArtifacts })
    job.authoring.consumption.providerInvocations = explorationError ? null
      : sources.reduce((sum, source) => sum + completedModelInvocations(source.result.modelCalls), 0)
    this.touch(job)
    if (explorationError) throw explorationError
    signal.throwIfAborted()
    progression.finish()
    return sources
  }

  private async begin(job: TaskAuthoringJob, purpose: "plan_creation" | "chain_exploration_and_compilation"
    | "chain_offline_compilation", signal: AbortSignal) {
    const selection = this.ai.selection()
    job.status = "running"; job.sequence++; job.updatedAt = new Date().toISOString(); job.reason = null
    job.audit = { purpose, model: selection.modelId, effort: selection.reasoningEffort,
      status: "intended", reportedInvocations: null, events: [], escalations: [] }
    this.save(job)
    return this.ai.prepare(selection, signal)
  }
  private complete(job: TaskAuthoringJob, resultId: string, reportedInvocations: number | null) {
    job.status = "completed"; job.resultId = resultId; job.reason = null; job.sequence++; job.updatedAt = new Date().toISOString()
    job.audit!.status = "completed"; job.audit!.reportedInvocations = reportedInvocations; this.save(job)
  }
  private fail(job: TaskAuthoringJob, signal: AbortSignal, error: unknown) {
    job.status = signal.aborted ? "interrupted" : "failed"; job.reason = signal.aborted ? "生成已中断，可重新发起。"
      : `生成未完成：${authoringFailureMessage(error)}`
    job.sequence++; job.updatedAt = new Date().toISOString()
    if (job.audit?.status === "intended") job.audit.status = signal.aborted ? "interrupted" : "failed"
    if (job.audit) job.audit.reportedInvocations = settledGenerationCount(job.audit.events)
    if (!signal.aborted && job.preparation?.phase === "forming_plan"
      && job.preparation.planCandidates.at(-1)?.issues.length) {
      job.reason = "预执行方案未通过结果归属或输入输出合同校验；候选与准确错误已保存，可在此继续纠正。"
    }
    if (job.authoring) {
      job.audit!.reportedInvocations = job.authoring.consumption.providerInvocations === null ? null
        : job.authoring.consumption.compilationCalls + job.authoring.consumption.providerInvocations
      job.authoring.failureLayer = failureLayer(error, job.authoring.stage)
    }
    if (error instanceof RequirementClarificationRequired && job.preparation) {
      job.preparation.requirementReturn = {
        reason: "准备真实页面时发现会改变任务结果的业务歧义，需要返回需求对话由你确认。",
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

async function generateJson<T>(model: PreparedAIModel, schema: z.ZodType<T>, prompt: string, signal: AbortSignal,
  onEvent: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"]) {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema, { target: "draft-7", override: ({ jsonSchema: value }) => {
    for (const key of ["format", "pattern", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"]) delete value[key]
  } })
  // WHY：供应商只产出语义 JSON；完整合同失败保留精确诊断，不重试完整图。
  return model.generateObject({ prompt, jsonSchema, parse: (value) => z.json().parse(value), signal, onEvent })
}

type PlanCandidate = z.infer<typeof semanticPlanSchema>

function materializePlan(candidate: PlanCandidate, requirement: TaskRequirement, id: string, version: number) {
  const steps = candidate.steps.map((step) => ({ ...step, budget: planningEnvelope(step.invocation.mode === "each" ? step.invocation.maxItems : 1),
    chain: { id: stableUuid(requirement.taskId, id, String(version), step.id), version: 1 } }))
  return { ...candidate, contractVersion: CONTRACT_VERSION, kind: "plan", id, taskId: requirement.taskId, version,
    requirement: { id: requirement.id, version: requirement.version, digest: digestJson(requirement), revision: requirement.revision },
    steps, budget: aggregatePlanBudget(steps), evidence: [] }
}

function parsePlanCandidate(value: JsonValue, requirement: TaskRequirement, id: string, version: number) {
  const candidate = normalizeBoundStepContracts(normalizeEachCompletionBindings(semanticPlanSchema.parse(value)))
  const plan = taskPlanSchema.parse(materializePlan(candidate, requirement, id, version))
  const issues = taskPlanExecutionIssues(plan)
  if (issues.length) throw new Error(issues.join(","))
  return plan
}

function inspectPlanCandidate(value: JsonValue, requirement: TaskRequirement, id: string, version: number) {
  try { return { plan: parsePlanCandidate(value, requirement, id, version), issues: [] } }
  catch (error) {
    const issues = error instanceof z.ZodError ? error.issues.map((issue) => ({
      path: issue.path.map((part) => typeof part === "number" ? part : String(part)),
      code: issue.code === "custom" ? issue.message : issue.code, message: issue.message,
    })) : [{ path: [], code: "plan_candidate_invalid", message: error instanceof Error ? error.message : "invalid" }]
    return { plan: null, issues: explainPlanCandidateIssues(value, issues) }
  }
}

export function planCandidatesForJob(job: TaskAuthoringJob, requirement: TaskRequirement) {
  if (!job.preparation) return []
  if (job.preparation.planCandidates.length) return job.preparation.planCandidates.map((item) => ({
    ...item, issues: explainPlanCandidateIssues(item.candidate, item.issues),
  }))
  // WHY：v17 的方案候选只写在 AI 事件里；只重组已完成调用，保留原始审计且不伪造候选。
  const audits = [...job.preparation.priorAudits, ...(job.audit ? [job.audit] : [])]
  const candidates: NonNullable<TaskAuthoringJob["preparation"]>["planCandidates"] = []
  for (const audit of audits.filter((item) => item.purpose === "plan_creation")) {
    const completed = [...new Set(audit.events.filter((event) => event.type === "generation.completed")
      .map((event) => event.invocationId))]
    for (const invocationId of completed) {
      const raw = audit.events.filter((event) => event.type === "text.delta" && event.invocationId === invocationId)
        .map((event) => event.type === "text.delta" ? event.text : "").join("")
      let candidate: JsonValue
      try { candidate = z.json().parse(JSON.parse(raw)) } catch { continue }
      const { issues } = inspectPlanCandidate(candidate, requirement, stableUuid(requirement.taskId, "plan"), 1)
      candidates.push(planCandidateRecordSchema.parse({ attempt: candidates.length + 1, candidate,
        digest: digestJson(candidate), issues }))
    }
  }
  return candidates.slice(-10)
}

export function normalizeBoundStepContracts(candidate: PlanCandidate): PlanCandidate {
  const normalized = structuredClone(candidate), outputs = new Map<string, TaskDataContract>()
  for (const step of normalized.steps) {
    const source = step.input.source === "constant" || step.input.path.length ? undefined
      : step.input.source === "input" ? normalized.inputContract
      : step.input.source === "node" ? outputs.get(step.input.nodeId) : undefined
    // WHY：整值 binding 的 schema 由来源唯一决定；模型重复抄一份更窄合同只会制造计划内自相矛盾。
    if (source) step.inputContract = { ...step.inputContract, schema: structuredClone(source.schema) }
    outputs.set(step.id, step.outputContract)
  }
  const output = normalized.output
  if (output.source === "node" && output.path.length === 0) {
    const step = normalized.steps.find((item) => item.id === output.nodeId)
    // WHY：计划公开输出是最终结果的唯一合同；整值透传时由宿主同步末步 schema，避免模型重复抄写产生漂移。
    if (step && step.invocation.mode !== "each") {
      step.outputContract = { ...step.outputContract, schema: structuredClone(normalized.outputContract.schema) }
      if (step.resultSpec?.mode === "data") step.resultSpec.schema = structuredClone(normalized.outputContract.schema)
    }
  }
  return normalized
}

export function normalizeEachCompletionBindings(candidate: PlanCandidate): PlanCandidate {
  const normalized = structuredClone(candidate)
  for (const step of normalized.steps) {
    if (step.invocation.mode !== "each") continue
    const binding = <T extends { source: string; nodeId?: string; path?: (string | number)[] }>(value: T): T =>
      value.source === "node" && value.nodeId === step.id && typeof value.path?.[0] !== "number"
        ? { ...value, path: [0, ...value.path!] } : value
    for (const condition of step.completion) {
      if (condition.predicate.operator === "exists") condition.predicate.value = binding(condition.predicate.value)
      else if (condition.predicate.operator === "array_length_at_least") {
        condition.predicate.value = binding(condition.predicate.value)
        condition.predicate.minimum = binding(condition.predicate.minimum)
      }
      else {
        condition.predicate.left = binding(condition.predicate.left)
        condition.predicate.right = binding(condition.predicate.right)
      }
    }
  }
  return normalized
}

function aggregatePlanBudget(steps: TaskPlan["steps"]) {
  return {
    maxTransitions: steps.reduce((sum, step) => sum + step.budget.maxTransitions, 0),
    maxBrowserCommands: steps.reduce((sum, step) => sum + step.budget.maxBrowserCommands, 0),
    maxActiveMs: steps.reduce((sum, step) => sum + step.budget.maxActiveMs, 0),
    maxLlmCalls: steps.reduce((sum, step) => sum + step.budget.maxLlmCalls, 0),
    maxInvocations: steps.reduce((sum, step) => sum + step.budget.maxInvocations, 0),
    maxDepth: Math.max(...steps.map((step) => step.budget.maxDepth)),
  }
}

function planningEnvelope(invocations: number) {
  // WHY：计划阶段尚无图，保存宿主能力上界以兼容唯一计划合同；执行预算由 P4 的实际图推导，模型不能填写。
  return { maxTransitions: 500 * invocations, maxBrowserCommands: browserGrantLimits.maxCommands * invocations,
    maxActiveMs: browserGrantLimits.timeoutMs * invocations,
    maxLlmCalls: 500 * invocations, maxInvocations: invocations, maxDepth: 16 }
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
