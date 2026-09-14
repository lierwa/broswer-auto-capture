import { z } from "zod"
import {
  CONTRACT_VERSION, parseTaskValue, taskPlanExecutionIssues, taskPlanSchema, taskPlanStepSchema,
  type JsonValue, type TaskAuthoringJob, type TaskChain, type TaskDataContract, type TaskPlan, type TaskRequirement,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, readPath, resolveBinding, stableUuid, type BindingContext } from "@browser-capture/runtime"
import type { BrowserHelpState } from "@browser-capture/browser"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import type { TaskContractRepository } from "./repository.js"
import type { TaskRuntimeHost } from "./runtime-host.js"
import type { ExplorationStepResult, ExplorationTrace } from "./exploration-trace.js"
import { compilationModelAnnotationsSchema, validateAnnotations } from "./compilation-annotations.js"
import { compileExplorationTrace } from "./trace-compiler.js"
import { annotationPrompt, planPrompt, repairAnnotationPrompt } from "./authoring-prompts.js"
export { compactTraceForModel } from "./authoring-prompts.js"

export const semanticPlanSchema = taskPlanSchema.omit({ contractVersion: true, kind: true, id: true, taskId: true,
  version: true, requirement: true, evidence: true, steps: true, budget: true })
  .extend({ steps: z.array(taskPlanStepSchema.omit({ chain: true, budget: true })).min(1).max(6) }).strict()
export class TaskChainAuthoring {
  constructor(private readonly repository: TaskContractRepository, private readonly ai: AIModelProvider,
    private readonly host: TaskRuntimeHost) {}

  async plan(job: TaskAuthoringJob, requirement: TaskRequirement, signal: AbortSignal) {
    try {
      const model = await this.begin(job, "plan_creation", signal)
      const id = stableUuid(requirement.taskId, "plan"), version = this.repository.nextPlanVersion(requirement.taskId)
      const prompt = planPrompt(requirement), onEvent = (event: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"] extends (event: infer E) => void ? E : never) => {
        job.audit!.events.push(event); this.save(job)
      }
      const candidate = await generateJson(model, semanticPlanSchema, prompt, signal, onEvent)
      const plan = parsePlanCandidate(candidate, requirement, id, version)
      this.complete(job, this.repository.savePlan(plan).id, 1)
      return plan
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  async preexecute(job: TaskAuthoringJob, requirement: TaskRequirement, input: JsonValue, signal: AbortSignal,
    reusablePlanCandidate?: JsonValue) {
    try {
      const model = await this.begin(job, "chain_exploration_and_compilation", signal)
      const planningCalls = reusablePlanCandidate === undefined ? 1 : 0
      job.authoring = { stage: "planning", level: "E0", failureLayer: null, exploration: null, annotations: null,
        consumption: { explorationToolCalls: 0, explorationSessions: 0, compilationCalls: planningCalls, providerInvocations: null } }
      this.save(job)
      const value = reusablePlanCandidate ?? await generateJson(model, semanticPlanSchema, planPrompt(requirement, input), signal,
        (event) => { job.audit!.events.push(event); this.save(job) })
      const plan = parsePlanCandidate(value, requirement, stableUuid(requirement.taskId, "plan"),
        this.repository.nextPlanVersion(requirement.taskId))
      parseTaskValue(plan.inputContract, input)
      this.repository.savePlan(plan)
      const compiled = await this.taskWithModel(job, requirement, plan, input, signal, model, undefined, undefined, planningCalls)
      return { plan, ...compiled }
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  async repair(job: TaskAuthoringJob, plan: TaskPlan, chain: TaskChain, failedRun: {
    status: string; outcome: unknown; input: JsonValue; binding: { runId: string }
  }, trace: ExplorationTrace, signal: AbortSignal) {
    try {
      const model = await this.begin(job, "chain_exploration_and_compilation", signal)
      job.authoring = { stage: "compiling", level: "E2", failureLayer: "链路验证", exploration: z.json().parse(trace),
        annotations: null, consumption: { explorationToolCalls: 0, explorationSessions: 0,
          compilationCalls: 1, providerInvocations: null } }
      job.browserRunId = trace.browserRunId; this.save(job)
      const raw = await generateJson(model, compilationModelAnnotationsSchema,
        repairAnnotationPrompt(trace, chain, failedRun), signal,
        (event) => { job.audit!.events.push(event); this.save(job) })
      const annotations = validateAnnotations({ ...compilationModelAnnotationsSchema.parse(raw),
        outputMappings: trace.result!.provenance }, trace)
      const repaired = compileExplorationTrace(trace, annotations, plan, chain.stepId,
        this.repository.nextChainVersion(plan.taskId, chain.id), model.selection.modelId)
      requirePlannedChainShape(plan.steps.find((item) => item.id === chain.stepId)!, repaired)
      this.repository.saveChain(repaired)
      const reference = { id: repaired.id, version: repaired.version, digest: executableChainDigest(repaired) }
      job.authoring.annotations = z.json().parse(annotations); job.authoring.compiledChain = reference
      job.authoring.compiledChains = [reference]; job.authoring.stage = "compiled"; job.authoring.level = "E2"
      this.complete(job, repaired.id, 1)
      return repaired
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  async chain(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, stepId: string,
    input: JsonValue, signal: AbortSignal, reusableExploration?: ExplorationTrace) {
    const step = plan.steps.find((item) => item.id === stepId)
    if (!step) throw new Error("plan_step_not_found")
    try {
      const model = await this.begin(job, "chain_exploration_and_compilation", signal)
      job.authoring = { stage: reusableExploration ? "explored" : "exploring", level: reusableExploration ? "E1" : "E0",
        failureLayer: null, exploration: reusableExploration ? z.json().parse(reusableExploration) : null, annotations: null,
        consumption: { explorationToolCalls: 0, explorationSessions: reusableExploration ? 0 : 1,
          compilationCalls: 0, providerInvocations: null } }
      job.browserRunId = reusableExploration?.browserRunId ?? stableUuid(job.id, "exploration-browser"); this.save(job)
      const exploration = reusableExploration ?? await this.host.explore({ taskId: plan.taskId, authorizationId: job.id,
        browserRunId: job.browserRunId, requirementVersion: requirement.version,
        budget: step.budget, outputContract: step.outputContract, representativeInput: input, context: z.json().parse(JSON.parse(JSON.stringify({
          requirement: requirement.definition.body, plan: plan.summary, step, input,
        }))), signal, onModelEscalation: (selection, reason) => {
          job.audit!.escalations.push({ model: selection.modelId, effort: selection.reasoningEffort, reason }); this.save(job)
        }, onTrace: (trace) => {
          job.authoring!.exploration = z.json().parse(trace)
          job.authoring!.consumption.explorationToolCalls = trace.events.filter((event) => event.id !== "initial").length
          if (trace.result) { job.authoring!.stage = "explored"; job.authoring!.level = "E1" }
          this.save(job)
        }, onHumanWait: (waitpoint) => this.humanWait(job, waitpoint) },
      await this.ai.prepareMain(model.selection, "exploration"), (event) => { job.audit!.events.push(event); this.save(job) })
      const version = this.repository.nextChainVersion(plan.taskId, step.chain.id)
      job.authoring.stage = "compiling"; job.authoring.consumption.compilationCalls = 1; this.save(job)
      const onEvent: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"] = (event) => {
        job.audit!.events.push(event); this.save(job)
      }
      const raw = await generateJson(model, compilationModelAnnotationsSchema,
        annotationPrompt(exploration), signal, onEvent)
      const annotations = validateAnnotations({ ...compilationModelAnnotationsSchema.parse(raw), outputMappings: exploration.result!.provenance }, exploration)
      job.authoring.annotations = z.json().parse(annotations); this.save(job)
      const chain = compileExplorationTrace(exploration, annotations, plan, stepId, version, model.selection.modelId)
      requirePlannedChainShape(step, chain)
      job.authoring.stage = "compiled"; job.authoring.level = "E2"
      job.authoring.compiledChain = { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }
      // WHY：Pi bridge 的 generation 是会话边界，不等于内部 Provider 请求次数，未知总数保持 null。
      this.complete(job, this.repository.saveChain(chain).id, null)
      return chain
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  async task(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue, signal: AbortSignal,
    reusableExploration?: ExplorationTrace, reusableAnnotations?: JsonValue) {
    try {
      const model = await this.begin(job, "chain_exploration_and_compilation", signal)
      const result = await this.taskWithModel(job, requirement, plan, input, signal, model,
        reusableExploration, reusableAnnotations)
      return result
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  private async taskWithModel(job: TaskAuthoringJob, requirement: TaskRequirement, plan: TaskPlan, input: JsonValue,
    signal: AbortSignal, model: PreparedAIModel, reusableExploration?: ExplorationTrace,
    reusableAnnotations?: JsonValue, priorCompilationCalls = 0) {
      job.authoring = { stage: reusableExploration ? "explored" : "exploring", level: reusableExploration ? "E1" : "E0",
        failureLayer: null, exploration: reusableExploration ? z.json().parse(reusableExploration) : null, annotations: null,
        consumption: { explorationToolCalls: 0, explorationSessions: reusableExploration ? 0 : 1,
          compilationCalls: priorCompilationCalls, providerInvocations: null } }
      job.browserRunId = reusableExploration?.browserRunId ?? stableUuid(job.id, "task-exploration-browser"); this.save(job)
      const progression = taskProgression(plan, input)
      const exploration = reusableExploration ?? await this.host.explore({ taskId: plan.taskId, authorizationId: job.id,
        browserRunId: job.browserRunId, requirementVersion: requirement.version, budget: plan.budget,
        outputContract: plan.outputContract, representativeInput: input,
        stepContracts: plan.steps.map((step) => ({ id: step.id, inputContract: step.inputContract,
          outputContract: step.outputContract, invocation: step.invocation })),
        acceptStepResult: progression.accept,
        context: z.json().parse(JSON.parse(JSON.stringify({ requirement: requirement.definition.body, plan, input }))), signal,
        onModelEscalation: (selection, reason) => {
          job.audit!.escalations.push({ model: selection.modelId, effort: selection.reasoningEffort, reason }); this.save(job)
        },
        onTrace: (trace) => {
          job.authoring!.exploration = z.json().parse(trace)
          job.authoring!.consumption.explorationToolCalls = trace.events.filter((event) => event.id !== "initial").length
          if (trace.result) { job.authoring!.stage = "explored"; job.authoring!.level = "E1" }
          this.save(job)
        }, onHumanWait: (waitpoint) => this.humanWait(job, waitpoint) },
      await this.ai.prepareMain(model.selection, "exploration"), (event) => { job.audit!.events.push(event); this.save(job) })
      if (reusableExploration) {
        for (const stepResult of exploration.stepResults ?? []) progression.accept(stepResult)
      }
      const results = new Map((exploration.stepResults ?? []).map((item) => [item.stepId, item]))
      if (results.size !== plan.steps.length) throw new Error("exploration_step_result_missing")
      progression.finish(exploration)
      job.authoring.exploration = z.json().parse(exploration)
      job.authoring.stage = "explored"; job.authoring.level = "E1"; this.save(job)
      job.authoring.stage = "compiling"; this.save(job)
      const savedAnnotations = reusableAnnotations ? taskCompilationAnnotationsSchema.parse(reusableAnnotations).steps : null
      const compiled: Array<{ chain: TaskChain; annotations: JsonValue }> = []
      for (const step of plan.steps) {
        const stepResult = results.get(step.id)
        if (!stepResult) throw new Error(`exploration_step_result_missing:${step.id}`)
        const { stepResults: _stepResults, ...baseTrace } = exploration
        const trace: ExplorationTrace = { ...baseTrace, input: stepResult.input, result: stepResult.result }
        const saved = savedAnnotations?.find((item) => item.stepId === step.id)?.annotations
        let annotations
        if (saved) annotations = validateAnnotations(saved, trace)
        else {
          job.authoring.consumption.compilationCalls++; this.save(job)
          const onEvent: Parameters<PreparedAIModel["generateObject"]>[0]["onEvent"] = (event) => {
            job.audit!.events.push(event); this.save(job)
          }
          const raw = await generateJson(model, compilationModelAnnotationsSchema,
            annotationPrompt(trace, step.invocation), signal, onEvent)
          annotations = validateAnnotations({ ...compilationModelAnnotationsSchema.parse(raw),
            outputMappings: trace.result!.provenance }, trace)
        }
        const version = this.repository.nextChainVersion(plan.taskId, step.chain.id)
        const chain = compileExplorationTrace(trace, annotations, plan, step.id, version, model.selection.modelId)
        requirePlannedChainShape(step, chain)
        compiled.push({ chain, annotations: z.json().parse(annotations) })
      }
      for (const item of compiled) this.repository.saveChain(item.chain)
      const references = compiled.map(({ chain }) => ({ id: chain.id, version: chain.version,
        digest: executableChainDigest(chain) }))
      job.authoring.annotations = z.json().parse({ mode: "task", steps: compiled.map((item, index) => ({
        stepId: item.chain.stepId, chain: references[index]!, annotations: item.annotations })) })
      job.authoring.stage = "compiled"; job.authoring.level = "E2"
      job.authoring.compiledChain = references[0]!; job.authoring.compiledChains = references
      this.complete(job, plan.id, null)
      return { references, chains: compiled.map((item) => item.chain), exploration }
  }

  private async begin(job: TaskAuthoringJob, purpose: "plan_creation" | "chain_exploration_and_compilation", signal: AbortSignal) {
    const selection = this.ai.selection()
    job.status = "running"; job.sequence++; job.updatedAt = new Date().toISOString(); job.reason = null
    job.audit = { purpose, model: selection.modelId, effort: selection.reasoningEffort,
      status: "intended", reportedInvocations: null, events: [], escalations: [] }
    this.save(job)
    return this.ai.prepare(selection, signal)
  }
  private humanWait(job: TaskAuthoringJob, state: BrowserHelpState) {
    job.waitpoint = { ...state, owner: "authoring_job", ownerId: job.id, stepId: null }
    if (state.status === "waiting") {
      job.status = "waiting_for_human"
      job.reason = "浏览器现场等待人工处理；完成后在 Agent Window 点击 Done 继续同一探索。"
    } else if (state.status === "completed") {
      job.status = "running"
      job.reason = null
    }
    job.sequence++; job.updatedAt = new Date().toISOString(); this.save(job)
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

const taskCompilationAnnotationsSchema = z.object({ mode: z.literal("task"), steps: z.array(z.object({
  stepId: z.string().min(1), chain: z.unknown(), annotations: z.json(),
}).passthrough()) }).passthrough()

function taskProgression(plan: TaskPlan, input: JsonValue) {
  const context: BindingContext = { input, nodeOutputs: {}, variables: {} }
  let position = 0
  const accept = (submitted: ExplorationStepResult) => {
    const step = plan.steps[position]
    if (!step || submitted.stepId !== step.id) throw new Error(`exploration_step_order_invalid:${submitted.stepId}`)
    let expected: JsonValue
    if (step.invocation.mode !== "each") expected = parseTaskValue(step.inputContract, resolveBinding(step.input, context))
    else {
      const inputs = eachInputs(step, context)
      if (!inputs.length) throw new Error(`exploration_step_representative_missing:${step.id}`)
      expected = inputs[0]!
      const aggregate = submitted.runtimeResult.result
      // WHY：authoring 只探索一条 each 代表路线；完整集合必须由验证后的普通执行器复跑，不能让 Pi 逐项找路或补造结果。
      if (!Array.isArray(aggregate) || aggregate.length !== 1) throw new Error(`exploration_step_representative_aggregate_invalid:${step.id}`)
      if (digestJson(aggregate[0]) !== digestJson(submitted.result.result)) {
        throw new Error(`exploration_step_representative_result_mismatch:${step.id}`)
      }
    }
    if (step.invocation.mode !== "each") {
      if (digestJson(expected) !== digestJson(submitted.input)) throw new Error(`exploration_step_input_mismatch:${step.id}`)
    } else {
      const expectedKey = readPath(expected, step.invocation.stableKeyPath)
      const submittedKey = readPath(submitted.input, step.invocation.stableKeyPath)
      if (digestJson(expectedKey) !== digestJson(submittedKey)) throw new Error(`exploration_step_input_mismatch:${step.id}`)
      // WHY：each 的代表项由计划绑定产生；模型只能提交该稳定键对应的结果，不能改写其他输入字段并成为新事实。
      submitted.input = expected
    }
    context.nodeOutputs[step.id] = submitted.runtimeResult.result
    position++
    return submitted
  }
  const finish = (trace: ExplorationTrace) => {
    if (position !== plan.steps.length) throw new Error("exploration_step_result_missing")
    const expectedOutput = parseTaskValue(plan.outputContract, resolveBinding(plan.output, context))
    if (!trace.result) {
      const finalStepResult = trace.stepResults?.at(-1)?.runtimeResult
      // WHY：计划输出等于末步骤已验收 aggregate 时，宿主可确定派生；让模型再抄一遍只会制造遗漏或漂移。
      if (!finalStepResult || digestJson(expectedOutput) !== digestJson(finalStepResult.result)) {
        throw new Error("exploration_business_result_missing")
      }
      trace.result = { ...structuredClone(finalStepResult), result: expectedOutput }
    }
    if (digestJson(expectedOutput) !== digestJson(trace.result.result)) throw new Error("exploration_task_output_mismatch")
  }
  return { accept, finish }
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
  if (stage === "compiling") return "Trace-to-Graph 编译"
  if (/model_account|ai_|provider/i.test(message)) return "AI Connect/Provider"
  if (/pi_agent/i.test(message)) return "Pi AgentSession"
  if (/provenance|business_result/.test(message)) return "结果/provenance"
  if (/浏览器|browser|origin|target/.test(message)) return "BrowserSkill/工具桥"
  return "探索会话"
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
  return { maxTransitions: 500 * invocations, maxBrowserCommands: 3850 * invocations, maxActiveMs: 1_440_000 * invocations,
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
