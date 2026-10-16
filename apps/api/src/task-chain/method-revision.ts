import { isDeepStrictEqual } from "node:util"
import {
  CONTRACT_VERSION, parseTaskValue, type ChainNode, type ChainPresentation, type JsonValue,
  type TaskAuthoringJob, type TaskChain, type TaskConsumption, type TaskDraft, type TaskRunRequest,
  type TaskDraftContent, type TaskMethodRevisionBase, type TaskMethodRevisionContext,
  type TaskMethodRevisionOptions, type TaskMethodRevisionSource, type TaskRequirement,
} from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid, type TaskChainCapabilities } from "@browser-capture/runtime"
import { conflict, DomainError } from "../errors.js"
import { assertCapturedSourceIdentity, readHybridSourceArtifact } from "../upstream-browser/hybrid-artifact.js"
import { hybridNaturalRequestSchema } from "../upstream-browser/hybrid-schema.js"
import { createTaskDraft, draftReference, releaseReference } from "./chain-revision.js"
import { methodRevisionHybridSource, sourceReferencesSchema } from "./hybrid-source-reuse.js"
import { plannedProgression } from "./authoring-progression.js"
import { outputFor, outputValue } from "./plan-values.js"
import type { TaskContractRepository } from "./repository.js"
import { validatePreparationResearch } from "./preparation-research.js"
import { executionBudget } from "./execution-budget.js"
import type { TaskRuntimeHost } from "./runtime-host.js"

export type MethodRevisionBase = { content: TaskDraftContent; current: TaskDraft | null;
  baseRelease: TaskDraft["baseRelease"]; base: TaskMethodRevisionBase }

export function resolveMethodRevisionBase(repository: TaskContractRepository, taskId: string,
  requirement: TaskRequirement, base: TaskMethodRevisionBase): MethodRevisionBase {
  const current = repository.draft(taskId)
  let content: TaskDraftContent, baseRelease: TaskDraft["baseRelease"]
  if (base.kind === "draft") {
    if (!current || !isDeepStrictEqual(draftReference(current), base.reference))
      conflict("修订依据的草稿已变化，请刷新后继续。")
    content = current.content; baseRelease = current.baseRelease
  } else {
    if (current) conflict("当前已有活动草稿，请从该草稿修订，避免覆盖现有修改。")
    const latest = repository.releases(taskId).at(-1)
    if (!latest || !isDeepStrictEqual(releaseReference(latest), base.reference))
      conflict("当前发布版本已变化，请刷新后从最新版本修订。")
    const release = repository.release(taskId, base.reference.id, base.reference.version, base.reference.digest)
    content = release.content; baseRelease = releaseReference(release)
  }
  const reference = content.plan.requirement
  if (content.plan.taskId !== taskId || reference.id !== requirement.id || reference.version !== requirement.version
    || reference.revision !== requirement.revision || reference.digest !== digestJson(requirement))
    conflict("修订依据与当前已确认需求不一致，请刷新后继续。")
  return { content: structuredClone(content), current, baseRelease, base: structuredClone(base) }
}

export function assertMethodRevisionBaseCurrent(repository: TaskContractRepository, taskId: string,
  requirement: TaskRequirement, base: MethodRevisionBase) {
  const current = resolveMethodRevisionBase(repository, taskId, requirement, base.base)
  if (!isDeepStrictEqual(current.content, base.content)) conflict("修订依据内容已变化；新来源已保留，未覆盖草稿。")
}

export function validateMethodRevisionSource(repository: TaskContractRepository, taskId: string,
  requirement: TaskRequirement, base: MethodRevisionBase,
  context: Pick<TaskMethodRevisionContext, "stepId" | "nodeIds" | "source" | "problem" | "input">) {
  const plan = base.content.plan, item = base.content.steps.find(step => step.stepId === context.stepId)
  if (!item || !context.nodeIds.length || new Set(context.nodeIds).size !== context.nodeIds.length
    || context.nodeIds.some(id => !item.chain.nodes.some(node => node.id === id)))
    conflict("选中的方法节点不属于修订依据，请刷新后重新选择。")
  const input = parseTaskValue(plan.inputContract, context.input)
  validatePreparationResearch(repository, taskId, requirement, { ...context.source, stepId: context.stepId,
    notes: context.problem }, "method_revision")
  const captured = methodRevisionHybridSource(repository, taskId, requirement, plan, input,
    context.stepId, item.chain, context.source)
  const previous = captured.job, progression = plannedProgression(plan, input)
  for (const step of plan.steps) {
    const stepInput = progression.resolve(step)
    if (step.id === context.stepId) {
      if (captured.artifact.inputDigest !== digestJson(stepInput))
        conflict("所选方法来源的业务输入与原准备记录不一致，不能用于本次修订。")
      assertCapturedSourceIdentity(requirement, plan, step.id, stepInput, captured.artifact.result,
        previous.preparation?.methodRevision)
      return { ...captured, input }
    }
    const reference = captured.references.find(source => source.stepId === step.id)
    if (reference?.closed) {
      const row = repository.artifact(taskId, reference.artifact.artifactId)
      const artifact = readHybridSourceArtifact(row.body)
      if (row.runId !== previous.id || row.digest !== reference.artifact.digest || row.digest !== digestJson(row.body)
        || artifact.planDigest !== digestJson(plan) || artifact.requirementDigest !== digestJson(requirement)
        || artifact.stepId !== step.id || artifact.inputDigest !== digestJson(stepInput) || !artifact.result.sourceSuccess)
        conflict("原准备记录缺少可核验的前置结果，无法确认所选来源输入。")
      assertCapturedSourceIdentity(requirement, plan, step.id, stepInput, artifact.result,
        previous.preparation?.methodRevision)
      progression.acceptSource(step.id, stepInput, artifact.result)
      continue
    }
    const runs = (previous.preparation?.methodRevision?.prefixRunIds ?? []).map(id => repository.run(taskId, id))
    const chain = base.content.steps.find(item => item.stepId === step.id)?.chain
    const run = chain && runs.find(run => run.binding.chain.id === chain.id && run.binding.chain.version === chain.version
      && run.binding.chain.digest === executableChainDigest(chain) && run.binding.inputDigest === digestJson(stepInput))
    const output = chain && run && run.status === "completed" && run.auditComplete && outputFor(chain, run)
    if (!output) conflict("原方法修订缺少已完成的前置运行结果，无法确认所选来源输入。")
    progression.accept(step.id, stepInput, outputValue(output))
  }
  throw new Error("preparation_method_step_missing")
}

export function assertMethodRevisionSourceCompatible(oldSource: ReturnType<typeof validateMethodRevisionSource>,
  newSource: { request: unknown; history: { localRef: string; digest: string } }) {
  const previous = hybridNaturalRequestSchema.parse(oldSource.artifact.result.request)
  const current = hybridNaturalRequestSchema.parse(newSource.request)
  const provider = (source: typeof previous) => ({ provider: source.trace.source.provider, version: source.trace.source.version })
  // WHY：旧来源只定位问题；新来源须由当前工具工厂独立编译，不能用旧 registry 限制修订能力。
  if (previous.trace.source.provider !== "browser-use" || typeof previous.trace.source.version !== "string"
    || !previous.trace.source.version || !isDeepStrictEqual(provider(previous), provider(current)))
    throw new Error("preparation_method_provider_changed")
  if (previous.trace.source.historyRef === current.trace.source.historyRef || previous.trace.digest === current.trace.digest)
    throw new Error("preparation_method_fresh_source_required")
}

export function mergeMethodRevision(repository: TaskContractRepository, taskId: string, requirement: TaskRequirement,
  base: MethodRevisionBase, stepId: string, replacement: { chains: TaskChain[]; presentations: ChainPresentation[] }) {
  assertMethodRevisionBaseCurrent(repository, taskId, requirement, base)
  if (replacement.chains.length !== 1 || replacement.chains[0]?.stepId !== stepId)
    throw new Error("preparation_method_replacement_scope_invalid")
  const selected = base.content.steps.find(step => step.stepId === stepId)!
  if (replacement.chains[0].id !== selected.chain.id || replacement.chains[0].version <= selected.chain.version)
    throw new Error("preparation_method_replacement_version_invalid")
  const steps = base.content.steps.map(step => step.stepId === stepId
    ? { chain: replacement.chains[0]!, presentation: replacement.presentations[0]! } : step)
  const draft = createTaskDraft({ taskId, requirement, baseRelease: base.baseRelease, plan: base.content.plan,
    current: base.current, chains: steps.map(step => step.chain), presentations: steps.map(step => step.presentation) })
  if (!isDeepStrictEqual(draft.content.plan, base.content.plan) || draft.validation.records.length
    || base.content.steps.some(step => step.stepId !== stepId
      && !isDeepStrictEqual(step, draft.content.steps.find(current => current.stepId === step.stepId))))
    throw new Error("preparation_method_unaffected_content_changed")
  return draft
}

/** WHY：仅展示有精确 closed 来源的方法，不以 completed 标签推断方法正确。 */
export function methodRevisionOptions(repository: TaskContractRepository, taskId: string): TaskMethodRevisionOptions | null {
  const draft = repository.draft(taskId), release = draft ? null : repository.releases(taskId).at(-1)
  if (!draft && !release) return null
  const base: TaskMethodRevisionBase = draft ? { kind: "draft", reference: draftReference(draft) }
    : { kind: "release", reference: releaseReference(release!) }
  const content = draft?.content ?? release!.content
  const requirement = repository.findRequirement(taskId, content.plan.requirement.version)
  return { base, steps: content.plan.steps.map(step => {
    const chain = content.steps.find(item => item.stepId === step.id)!.chain
    const nodeIds = chain.nodes.filter(node => node.kind !== "terminal").map(node => node.id)
    let reason = "本步骤尚无可核验的已结束来源，请查看原准备记录。", source: TaskMethodRevisionSource | null = null
    if (requirement) for (const job of repository.jobs(taskId)) {
      const references = methodSourceReferences(job, step.id)
      if (!references) continue
      try {
        const candidate = { sourceJobId: job.id, sourceSequence: job.sequence, artifact: references.artifact }
        const resolved = resolveMethodRevisionBase(repository, taskId, requirement, base)
        methodRevisionPrefix(repository, resolved.content, step.id)
        validateMethodRevisionSource(repository, taskId, requirement, resolved, { stepId: step.id, nodeIds,
          source: candidate, problem: "核验修订依据", input: job.preparation!.representativeInput })
        source = candidate; reason = ""; break
      } catch (error) { if (error instanceof DomainError) reason = error.message }
    }
    return { stepId: step.id, title: step.title, nodeIds, source, available: Boolean(source), reason: source ? null : reason }
  }) }
}

function methodSourceReferences(job: ReturnType<TaskContractRepository["jobs"]>[number], stepId: string) {
  if (!["completed", "failed"].includes(job.status) || !job.preparation) return null
  const parsed = sourceReferencesSchema.safeParse(job.authoring?.exploration)
  return parsed.success ? parsed.data.sources.find(source => source.stepId === stepId && source.closed) : null
}

export function methodRevisionPrefix(repository: TaskContractRepository, content: TaskDraftContent, stepId: string) {
  const position = content.plan.steps.findIndex(step => step.id === stepId)
  if (position < 0) conflict("所选步骤不属于修订依据。")
  const steps = content.plan.steps.slice(0, position)
  if (steps.some(step => step.invocation.mode !== "once"))
    conflict("本步骤依赖重复处理的前置现场，目前无法安全建立局部修订现场；原链路保留。")
  const chains = steps.map(step => content.steps.find(item => item.stepId === step.id)!.chain)
  const queue = [...chains], seen = new Set<string>()
  while (queue.length) {
    const chain = queue.shift()!, key = executableChainDigest(chain)
    if (seen.has(key)) continue
    seen.add(key)
    for (const node of chain.nodes) {
      if (!safePrefixNode(node)) conflict(`前置步骤“${chain.name}”含需重新授权的动作或未知副作用；本次局部修订已停止，未重放。`)
      if (node.kind === "invoke") queue.push(repository.chain(chain.taskId, node.chain.id, node.chain.version, node.chain.digest))
    }
  }
  return { steps, chains }
}

export async function executeMethodRevisionPrefix(input: { repository: TaskContractRepository; host?: TaskRuntimeHost;
  content: TaskDraftContent; stepId: string; job: TaskAuthoringJob; input: JsonValue; signal: AbortSignal;
  capabilities?: TaskChainCapabilities; touch: () => void }) {
  const { content, job, repository, signal } = input
  const prefix = methodRevisionPrefix(repository, content, input.stepId)
  const progression = plannedProgression(content.plan, input.input)
  if (!prefix.steps.length) return progression
  if (!input.capabilities || !input.host) throw new Error("preparation_method_same_session_capabilities_required")
  const chains = content.steps.map(step => step.chain), zero = (): TaskConsumption =>
    ({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 })
  await input.host.group({ taskId: job.taskId, authorizationId: job.id, browserRunId: job.browserRunId!,
    navigationPlan: content.plan, requirementVersion: content.plan.requirement.version, purpose: "sample",
    chains, input: input.input, signal, browser: job.browser, sessionCapabilities: input.capabilities,
    ...executionBudget(content.plan, chains), consumed: zero(),
    scopeConsumption: Object.fromEntries(chains.map(chain => [chain.stepId, zero()])) }, async execute => {
    for (const step of prefix.steps) {
      signal.throwIfAborted()
      const chain = prefix.chains.find(chain => chain.stepId === step.id)!, stepInput = progression.resolve(step)
      const invocationId = stableUuid(job.id, "method-prefix", step.id), runId = stableUuid(invocationId, "run")
      const request: TaskRunRequest = { contractVersion: CONTRACT_VERSION, requestId: stableUuid(runId, "request"),
        mode: "sample", input: stepInput, binding: { taskId: job.taskId, authorizationId: job.id,
          runId, invocationId, inputDigest: digestJson(stepInput), plan: chain.plan,
          chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) } } }
      const context = job.preparation!.methodRevision!
      if (context.prefixRunIds.includes(runId)) throw new Error("preparation_method_prefix_already_attempted")
      context.prefixRunIds.push(runId); input.touch()
      const run = await execute(chain, request), output = outputFor(chain, run)
      if (run.status !== "completed" || !run.auditComplete || run.modelCalls.length || run.consumed.llmCalls !== 0 || !output)
        throw new Error("preparation_method_prefix_not_completed")
      progression.accept(step.id, stepInput, outputValue(output))
    }
  })
  return progression
}

function safePrefixNode(node: ChainNode) {
  if (["function", "branch", "loop", "invoke", "terminal", "data", "emit"].includes(node.kind)) return true
  if (node.kind === "browser") return node.operation === "navigate"
  if (node.kind === "observe") return true
  if (node.kind !== "capability" || node.human) return false
  if (node.capability.name === "browser.workflow-step")
    return node.config !== null && typeof node.config === "object" && !Array.isArray(node.config)
      && node.config.actionName === "navigate"
  return node.effect === "read" && ["browser.read-fields", "browser.target-readiness", "data.transform"].includes(node.capability.name)
}
