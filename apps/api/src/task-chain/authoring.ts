import { z } from "zod"
import {
  CONTRACT_VERSION, parseTaskValue, taskPlanExecutionIssues, taskPlanSchema, taskPlanStepSchema,
  type JsonValue, type TaskAuthoringJob, type TaskChain, type TaskPlan, type TaskRequirement,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, readPath, resolveBinding, stableUuid, type BindingContext } from "@browser-capture/runtime"
import type { BrowserHelpState } from "@browser-capture/browser"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import type { TaskContractRepository } from "./repository.js"
import type { TaskRuntimeHost } from "./runtime-host.js"
import type { ExplorationStepResult, ExplorationTrace } from "./exploration-trace.js"
import { compilationModelAnnotationsSchema, validateAnnotations } from "./compilation-annotations.js"
import { compileExplorationTrace } from "./trace-compiler.js"

export const semanticPlanSchema = taskPlanSchema.omit({ contractVersion: true, kind: true, id: true, taskId: true,
  version: true, requirement: true, evidence: true, steps: true, budget: true })
  .extend({ steps: z.array(taskPlanStepSchema.omit({ chain: true, budget: true })).min(1).max(100) }).strict()
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
        }))), signal, onTrace: (trace) => {
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
      job.authoring = { stage: reusableExploration ? "explored" : "exploring", level: reusableExploration ? "E1" : "E0",
        failureLayer: null, exploration: reusableExploration ? z.json().parse(reusableExploration) : null, annotations: null,
        consumption: { explorationToolCalls: 0, explorationSessions: reusableExploration ? 0 : 1,
          compilationCalls: 0, providerInvocations: null } }
      job.browserRunId = reusableExploration?.browserRunId ?? stableUuid(job.id, "task-exploration-browser"); this.save(job)
      const progression = taskProgression(plan, input)
      const exploration = reusableExploration ?? await this.host.explore({ taskId: plan.taskId, authorizationId: job.id,
        browserRunId: job.browserRunId, requirementVersion: requirement.version, budget: plan.budget,
        outputContract: plan.outputContract, representativeInput: input,
        stepContracts: plan.steps.map((step) => ({ id: step.id, inputContract: step.inputContract,
          outputContract: step.outputContract, invocation: step.invocation })),
        acceptStepResult: progression.accept,
        context: z.json().parse(JSON.parse(JSON.stringify({ requirement: requirement.definition.body, plan, input }))), signal,
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
          const raw = await generateJson(model, compilationModelAnnotationsSchema, annotationPrompt(trace), signal, onEvent)
          annotations = validateAnnotations({ ...compilationModelAnnotationsSchema.parse(raw),
            outputMappings: trace.result!.provenance }, trace)
        }
        const version = this.repository.nextChainVersion(plan.taskId, step.chain.id)
        const chain = compileExplorationTrace(trace, annotations, plan, step.id, version, model.selection.modelId)
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
      return references
    } catch (error) { this.fail(job, signal, error); throw error }
  }

  private async begin(job: TaskAuthoringJob, purpose: "plan_creation" | "chain_exploration_and_compilation", signal: AbortSignal) {
    const selection = this.ai.selection()
    job.status = "running"; job.sequence++; job.updatedAt = new Date().toISOString(); job.reason = null
    job.audit = { purpose, model: selection.modelId, effort: selection.reasoningEffort,
      status: "intended", reportedInvocations: null, events: [] }
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
    if (step.invocation.mode === "once") expected = parseTaskValue(step.inputContract, resolveBinding(step.input, context))
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
    if (step.invocation.mode === "once") {
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

function planPrompt(requirement: TaskRequirement) {
  return `你在为通用浏览器任务生成可组合 TaskPlan。计划步骤只表示用户要求在每次正式执行中发生的业务动作。`+
    `每个步骤之后都会由宿主独立执行代表输入探索、链路编译、样本验证、换输入验证和授权复跑；这些产品生命周期动作绝不能成为计划步骤。`+
    `每个步骤必须对应一条可独立探索和复跑的浏览器流程；纯本地汇总、拼接或报告排版不能另建步骤，计划输出应直接绑定已有步骤输出。`+
    `一个无需拆分的浏览器任务只生成一个步骤；存在不同数据依赖或可独立复用的浏览器流程时必须拆步。`+
    `上一步产出集合、下一步对每项重复同一流程时，下一步使用 invocation.mode=each 和集合 binding，不得塞进一个巨型 once 步骤，也不得把同构输入展开成多份步骤。`+
    `列表页公开目标 href 时，发现步骤直接输出本次页面的有序落点集合，后续 each 步骤消费这些落点。`+
    `列表页只暴露可点击语义目标时，发现步骤输出本次页面的有序稳定目标及已观察来源 URL；紧随其后的 each 步骤在同一产品运行和浏览器会话中逐项进入目标，并在这一次访问中完成该目标要求的全部业务动作和真实落点记录。不得再生成一个只解析落点、随后又重新访问同一落点的中间步骤。`+
    `可点击语义目标必须把 role、name 和可选 occurrence 声明为对象中的独立字段并原样传给 each 输入；不得把“role: name”拼成一个 locator 字符串，因为该字符串无法形成类型化参数 binding。`+
    `首个浏览器步骤需要导航、但已确认需求没有可绑定的字面公开 URL 时，计划级 inputContract 必须声明必填的 startUrl 字符串，并由首步骤 input binding 引用；该 URL 只能由后续授权输入提供，模型不得猜测或硬编码。`+
    `不得根据站点标识拼接或猜测 URL，也不得把多个目标展开成多份步骤。`+
    `each.collection 必须引用任务输入或已依赖步骤输出中的数组，step.input 必须引用同一 invocation.itemVariable；maxItems 只声明业务数量。`+
    `each 步骤的 outputContract 描述单次链路输出，计划运行时会把多次输出聚合成数组；后续 each 可用 collection 指向该步骤及数组路径，不要把单次 outputContract 人为包成数组。`+
    `计划级引用 each 步骤输出时看到的是聚合数组，不能直接引用单项字段；该步骤完成条件使用自身输出空路径，计划 outputContract 则声明与该聚合数组完全相同的数组结构。`+
    `登录态、验证码和页面可访问性属于链路在真实浏览器中观察或 human 节点处理的现场事实，不得让运行输入用 authenticated、loggedIn 等布尔值自行宣称已经满足。`+
    `不得写入网站或业务专用平台类型；网站名称和字段只能存在于本计划的版本化任务合同与文字中。\n\n`+
    `已确认需求：\n${requirement.definition.body}\n\n根据需求声明计划级动态输入与输出合同；任务字段只能出现在这些版本化合同中。`+
    `每个步骤声明单次链路调用的动态输入输出、依赖、binding、调用模式、完成条件和风险；不得生成技术预算或节点图。`+
    `每个步骤的 input binding 必须产生符合该步骤 inputContract 的完整值；不能把 string 绑定给 object 合同。`+
    `需要逐项处理集合时使用 invocation.mode=each，itemVariable 的 schema 必须与步骤输入合同一致。`+
    `各项互相独立且部分结果仍有业务价值时，each 使用 onItemFailure=continue；只有任一项失败会使全部结果无效时才用 stop。认证、验证码、限流、拒绝和其他外部访问阻断由宿主熔断，不能用 continue 忽略。`+
    `binding 路径只能引用合同中明确定义的属性或数组索引，不能使用 length 等计算属性。`+
    `候选必须少于 8000 个字符：使用完成依赖所需的最少步骤，通常二至四步且不得超过六步；每步只写一个完成条件和至多三个简短风险，不复述需求正文。`+
    `链路引用和计划总预算由宿主分配与汇总，不要输出。`
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
  const candidate = requireStartUrlInput(semanticPlanSchema.parse(value), requirement)
  const plan = taskPlanSchema.parse(materializePlan(candidate, requirement, id, version))
  const issues = taskPlanExecutionIssues(plan)
  if (issues.length) throw new Error(issues.join(","))
  return plan
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

function annotationPrompt(trace: ExplorationTrace) {
  return "只给真实探索轨迹的紧凑编译注解。不要生成节点、连线、脚本、技术预算或轨迹外动作。" +
    "replayEventIds 按原轨迹顺序列出正式复跑实际需要的 completed 事件；失败探针必须排除但会由宿主保留审计，所有 binding、来源、完成条件和循环引用的事件都必须在该列表中。" +
    "tabs、tab_select 和 tab_close 只管理首次探索的临时标签，不得列入 replayEventIds、来源或完成条件；如果后续业务事件必须依赖临时标签编号才能成立，这条轨迹不可复现。" +
    "continueOnMissingEventIds 只列出成功轨迹中用于关闭临时遮罩等非必要目标交互：同类页面没有该目标时仍能完成任务；只容忍 target missing，超时、认证、验证、限流、拒绝和其他失败仍停止。导航、读取、填写、选择、业务提交及任何被来源、绑定、完成条件或循环引用的事件不得列入。" +
    "inputBindings 把 command 内样本常量映射到 input 的分段路径；同一个动态目标的 name、role 等 locator 字段只要来自 input 就必须分别绑定。字段来源由宿主直接复用 result.provenance，不要再输出 outputMappings。" +
    "completion 的 resultPath 从对应事件的 output 根开始，例如 output 中有 text 就写 [\"text\"]，绝不能写 [\"output\",\"text\"]；只引用可观察的非空工具结果。" +
    "repeatRegions 只标记真实重复区域、输入集合、稳定键和业务上限；无重复填空数组。" +
    "不能参数化或来源不可复现时不要伪造。reuseBoundary 说明适用条件和失效条件。\n" + JSON.stringify(trace)
}
