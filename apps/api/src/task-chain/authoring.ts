import { z } from "zod"
import {
  CONTRACT_VERSION, parseTaskValue, taskPlanExecutionIssues, taskPlanSchema, taskPlanStepSchema,
  type JsonValue, type TaskAuthoringJob, type TaskChain, type TaskDataContract, type TaskPlan, type TaskRequirement,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, readPath, resolveBinding, stableUuid, type BindingContext } from "@browser-capture/runtime"
import { browserGrantLimits } from "@browser-capture/browser"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import type { UpstreamBrowserRuntime } from "../upstream-browser/service.js"
import { browserUseTask } from "../upstream-browser/task-request.js"
import { completedModelInvocations, compileWorkflowChain, createWorkflowArtifact, workflowArtifactMediaType,
  workflowInputs } from "../upstream-browser/workflow-artifact.js"
import type { TaskContractRepository } from "./repository.js"
import { planCorrectionPrompt, planPrompt } from "./authoring-prompts.js"

const semanticPlanStepSchema = taskPlanStepSchema.omit({ chain: true, budget: true })
  .refine((step) => step.invocation.mode !== "batch", "workflow_batch_input_unsupported")
export const semanticPlanSchema = taskPlanSchema.omit({ contractVersion: true, kind: true, id: true, taskId: true,
  version: true, requirement: true, evidence: true, steps: true, budget: true })
  .extend({ steps: z.array(semanticPlanStepSchema).min(1).max(6) }).strict()
export class TaskChainAuthoring {
  constructor(private readonly repository: TaskContractRepository, private readonly ai: AIModelProvider,
    private readonly upstream: UpstreamBrowserRuntime) {}

  async plan(job: TaskAuthoringJob, requirement: TaskRequirement, signal: AbortSignal) {
    try {
      const model = await this.begin(job, "plan_creation", signal)
      const id = stableUuid(requirement.taskId, "plan"), version = this.repository.nextPlanVersion(requirement.taskId)
      const prompt = planPrompt(requirement), onEvent = (event: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"] extends (event: infer E) => void ? E : never) => {
        job.audit!.events.push(event); this.save(job)
      }
      const candidate = await generateJson(model, semanticPlanSchema, prompt, signal, onEvent)
      const { plan, calls } = await parsePlanWithCorrection(candidate, requirement, id, version, undefined,
        model, signal, onEvent, 1)
      this.complete(job, this.repository.savePlan(plan).id, calls)
      return plan
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  async preexecute(job: TaskAuthoringJob, requirement: TaskRequirement, input: JsonValue, signal: AbortSignal,
    reusablePlanCandidate?: JsonValue) {
    try {
      const model = await this.begin(job, "chain_exploration_and_compilation", signal)
      let planningCalls = reusablePlanCandidate === undefined ? 1 : 0
      job.authoring = { stage: "planning", level: "E0", failureLayer: null, exploration: null, annotations: null,
        consumption: { explorationToolCalls: 0, explorationSessions: 0, compilationCalls: planningCalls, providerInvocations: null } }
      this.save(job)
      const value = reusablePlanCandidate ?? await generateJson(model, semanticPlanSchema, planPrompt(requirement, input), signal,
        (event) => { job.audit!.events.push(event); this.save(job) })
      const parsed = await parsePlanWithCorrection(value, requirement, stableUuid(requirement.taskId, "plan"),
        this.repository.nextPlanVersion(requirement.taskId), input, model, signal,
        (event) => { job.audit!.events.push(event); this.save(job) }, planningCalls)
      planningCalls = parsed.calls
      job.authoring.consumption.compilationCalls = planningCalls; this.save(job)
      const plan = parsed.plan
      parseTaskValue(plan.inputContract, input)
      this.repository.savePlan(plan)
      const compiled = await this.taskWithModel(job, requirement, plan, input, signal, model, planningCalls)
      return { plan, ...compiled }
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  async chain(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, stepId: string,
    input: JsonValue, signal: AbortSignal) {
    if (plan.steps.length !== 1 || plan.steps[0]?.id !== stepId) throw new Error("single_step_plan_required")
    const result = await this.task(job, requirement, plan, input, signal)
    return result.chains[0]!
  }

  async task(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue, signal: AbortSignal) {
    try {
      const model = await this.begin(job, "chain_exploration_and_compilation", signal)
      const result = await this.taskWithModel(job, requirement, plan, input, signal, model)
      return result
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  private async taskWithModel(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue,
    signal: AbortSignal, model: PreparedAIModel, priorCompilationCalls = 0) {
    if (plan.steps.some((step) => step.invocation.mode === "batch")) throw new Error("workflow_batch_input_unsupported")
    job.authoring = { stage: "exploring", level: "E0", failureLayer: null, exploration: null, annotations: null,
      consumption: { explorationToolCalls: 0, explorationSessions: 1,
        compilationCalls: priorCompilationCalls, providerInvocations: null } }
    job.browserRunId = stableUuid(job.id, "upstream-browser"); this.save(job)
    const progression = plannedProgression(plan, input), compiled: TaskChain[] = [], samples: Record<string, JsonValue> = {}
    const artifactSummaries: JsonValue[] = []
    let providerInvocations = 0
    await this.upstream.withSession({ selection: model.selection, signal, ownerId: job.browserRunId }, async (session) => {
      for (const step of plan.steps) {
        signal.throwIfAborted()
        const stepInput = progression.resolve(step), inputBindings = workflowInputs(step.inputContract.schema, stepInput)
        const result = await session.author({ task: browserUseTask({ requirement, plan, step, resolvedInput: stepInput,
          workflowInputs: inputBindings }), input: stepInput, inputSchema: step.inputContract.schema,
          outputSchema: step.outputContract.schema, workflowInputs: inputBindings,
          artifactKey: `${job.id}-${step.id}`, maxSteps: Math.min(100, Math.max(1, step.budget.maxBrowserCommands)) })
        progression.accept(step.id, stepInput, result.output)
        providerInvocations += completedModelInvocations(result.modelCalls)
        job.authoring!.consumption.explorationToolCalls += result.browserCommands
        const artifact = createWorkflowArtifact({ requirement, plan, step, stepInput, result })
        const reference = this.repository.saveArtifact(plan.taskId, job.id, workflowArtifactMediaType, z.json().parse(artifact))
        const chain = compileWorkflowChain(plan, step, this.repository.nextChainVersion(plan.taskId, step.chain.id),
          model.selection.modelId, artifact, reference)
        this.repository.saveChain(chain); compiled.push(chain); samples[step.id] = stepInput
        artifactSummaries.push(z.json().parse({ stepId: step.id, artifact: reference, definitionDigest: artifact.definitionDigest,
          sourceSuccess: true, sourceValidated: true, inputBindings: artifact.inputBindings,
          modelPurposes: [...new Set(result.modelCalls.map((call) => call.purpose))] }))
        job.authoring!.exploration = z.json().parse({ mode: "workflow-use-authoring/v1", artifacts: artifactSummaries })
        job.authoring!.stage = "explored"; job.authoring!.level = "E1"; this.save(job)
      }
    })
    progression.finish()
    const references = compiled.map((chain) => ({ id: chain.id, version: chain.version, digest: executableChainDigest(chain) }))
    job.authoring.stage = "compiled"; job.authoring.level = "E2"
    job.authoring.annotations = z.json().parse({ mode: "workflow-use/v1", steps: compiled.map((chain, index) => ({
      stepId: chain.stepId, chain: references[index] })) })
    job.authoring.compiledChain = references[0]!; job.authoring.compiledChains = references
    job.authoring.consumption.providerInvocations = providerInvocations
    this.complete(job, plan.id, priorCompilationCalls + providerInvocations)
    return { references, chains: compiled, samples }
  }

  private async begin(job: TaskAuthoringJob, purpose: "plan_creation" | "chain_exploration_and_compilation", signal: AbortSignal) {
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
      : `生成未完成：${error instanceof Error ? error.message : "authoring_failed"}`
    job.sequence++; job.updatedAt = new Date().toISOString()
    if (job.audit?.status === "intended") job.audit.status = signal.aborted ? "interrupted" : "failed"
    if (job.audit) job.audit.reportedInvocations = settledGenerationCount(job.audit.events)
    if (job.authoring) {
      job.audit!.reportedInvocations = null
      job.authoring.failureLayer = failureLayer(error, job.authoring.stage)
    }
    this.save(job)
  }
  private save(job: TaskAuthoringJob) { this.repository.saveJob(job) }
}

function plannedProgression(plan: TaskPlan, input: JsonValue) {
  const context: BindingContext = { input, nodeOutputs: {}, variables: {} }
  let position = 0
  const resolved = new Map<string, JsonValue>()
  const resolve = (step: TaskPlan["steps"][number]) => {
    if (plan.steps[position]?.id !== step.id) throw new Error(`preexecution_step_order_invalid:${step.id}`)
    if (step.invocation.mode === "batch") throw new Error("workflow_batch_input_unsupported")
    const value = step.invocation.mode === "each" ? eachInputs(step, context)[0]
      : parseTaskValue(step.inputContract, resolveBinding(step.input, context))
    if (value === undefined) throw new Error(`preexecution_step_representative_missing:${step.id}`)
    resolved.set(step.id, value)
    return value
  }
  const accept = (stepId: string, stepInput: JsonValue, raw: JsonValue | undefined) => {
    const step = plan.steps[position]
    if (!step || stepId !== step.id) throw new Error(`preexecution_step_order_invalid:${stepId}`)
    const expected = resolved.get(step.id)
    if (expected === undefined || digestJson(expected) !== digestJson(stepInput)) {
      throw new Error(`preexecution_step_input_mismatch:${step.id}`)
    }
    const output = parseTaskValue(step.outputContract, raw)
    context.nodeOutputs[step.id] = step.invocation.mode === "each" ? [output] : output
    position++
  }
  const finish = () => {
    if (position !== plan.steps.length) throw new Error("preexecution_step_result_missing")
    parseTaskValue(plan.outputContract, resolveBinding(plan.output, context))
  }
  return { resolve, accept, finish }
}

function eachInputs(step: TaskPlan["steps"][number], context: BindingContext) {
  const invocation = step.invocation
  if (invocation.mode !== "each") throw new Error("exploration_each_step_required")
  const collection = resolveBinding(invocation.collection, context)
  if (!Array.isArray(collection)) throw new Error(`exploration_step_collection_missing:${step.id}`)
  const unique: Array<{ item: JsonValue; digest: string; key: string }> = [], seen = new Map<string, string>()
  for (const item of collection) {
    const stableValue = readPath(item, invocation.stableKeyPath)
    if (!["string", "number", "boolean"].includes(typeof stableValue)) throw new Error(`exploration_step_stable_key_invalid:${step.id}`)
    const key = String(stableValue), itemDigest = digestJson(item), previous = seen.get(key)
    if (previous && previous !== itemDigest) throw new Error(`exploration_step_stable_key_collision:${step.id}`)
    if (!previous) { seen.set(key, itemDigest); unique.push({ item, digest: itemDigest, key }) }
  }
  return unique.slice(0, invocation.maxItems).map(({ item }) => parseTaskValue(step.inputContract,
    resolveBinding(step.input, { ...context, variables: { ...context.variables, [invocation.itemVariable]: item } })))
}

function failureLayer(error: unknown, stage: string) {
  const message = error instanceof Error ? error.message : "unknown"
  if (/workflow_.*input/.test(message)) return "workflow-use 输入合同"
  if (/workflow_.*action|upstream_author/.test(message)) return "workflow-use 候选准入"
  if (/upstream_start|runner|protocol/.test(message)) return "上游进程生命周期"
  if (/model_account|ai_|provider/i.test(message)) return "AI Connect/Provider"
  if (/browser|captcha|login|verification/.test(message)) return "browser-use/人工边界"
  return stage === "compiling" ? "workflow-use definition" : "browser-use 探索"
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
  const candidate = requireStartUrlInput(normalizeBoundStepContracts(
    normalizeEachCompletionBindings(semanticPlanSchema.parse(value))), requirement)
  const plan = taskPlanSchema.parse(materializePlan(candidate, requirement, id, version))
  const issues = taskPlanExecutionIssues(plan)
  if (issues.length) throw new Error(issues.join(","))
  return plan
}

async function parsePlanWithCorrection(candidate: JsonValue, requirement: TaskRequirement, id: string, version: number,
  representativeInput: JsonValue | undefined, model: PreparedAIModel, signal: AbortSignal,
  onEvent: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"], initialCalls: number) {
  try { return { plan: parsePlanCandidate(candidate, requirement, id, version), calls: initialCalls } }
  catch (error) {
    const issues = z.json().parse(error instanceof z.ZodError ? error.issues.map((issue) => ({
      path: issue.path, code: issue.code, message: issue.message,
    })) : [{ path: [], code: "plan_candidate_invalid", message: error instanceof Error ? error.message : "invalid" }])
    const corrected = await generateJson(model, semanticPlanSchema,
      planCorrectionPrompt(requirement, representativeInput, candidate, issues), signal, onEvent)
    return { plan: parsePlanCandidate(corrected, requirement, id, version), calls: initialCalls + 1 }
  }
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
    if (step && step.invocation.mode !== "each") step.outputContract = {
      ...step.outputContract, schema: structuredClone(normalized.outputContract.schema),
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

function requireStartUrlInput(candidate: PlanCandidate, requirement: TaskRequirement): PlanCandidate {
  if (/https?:\/\/[^\s<>()]+/iu.test(requirement.definition.body)) return candidate
  const normalized = structuredClone(candidate), planSchema = normalized.inputContract.schema
  if (planSchema.type !== "object") throw new Error("plan_start_url_input_object_required")
  const startUrl = planSchema.properties.startUrl
  if (startUrl && startUrl.type !== "string") throw new Error("plan_start_url_contract_invalid")
  planSchema.properties.startUrl = startUrl ?? { type: "string", minLength: 1 }
  if (!planSchema.required.includes("startUrl")) planSchema.required.push("startUrl")

  const first = normalized.steps[0]!
  if (first.input.source === "input" && first.input.path.length === 1 && first.input.path[0] === "startUrl") return normalized
  const stepSchema = first.inputContract.schema
  if (first.input.source !== "input" || first.input.path.length !== 0 || stepSchema.type !== "object") {
    throw new Error("plan_start_url_binding_required")
  }
  const stepStartUrl = stepSchema.properties.startUrl
  if (stepStartUrl && stepStartUrl.type !== "string") throw new Error("plan_start_url_contract_invalid")
  // WHY：规划模型只决定任务字段；缺少字面入口时，宿主补齐授权所需的通用动态参数，不猜测任何站点地址。
  stepSchema.properties.startUrl = stepStartUrl ?? { type: "string", minLength: 1 }
  if (!stepSchema.required.includes("startUrl")) stepSchema.required.push("startUrl")
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
