import {
  CONTRACT_VERSION, taskPlanExecutionIssues, taskPlanSchema, type TaskPlan, type TaskRequirement,
} from "@browser-capture/contracts"
import { digestJson, stableUuid } from "@browser-capture/runtime"
import { browserGrantLimits } from "@browser-capture/browser"
import { parsePreparationDraft } from "../interview/preparation-draft.js"
import { sourceSupportsEntry } from "../interview/source-resolution.js"

/** WHY：预算是宿主技术上界；访谈草案与模型都不能填写图执行预算。 */
export function planningEnvelope(invocations: number) {
  return { maxTransitions: 500 * invocations, maxBrowserCommands: browserGrantLimits.maxCommands * invocations,
    maxActiveMs: browserGrantLimits.timeoutMs * invocations, maxLlmCalls: 500 * invocations,
    maxInvocations: invocations, maxDepth: 16 }
}

export function aggregatePlanBudget(steps: TaskPlan["steps"]) {
  return {
    maxTransitions: steps.reduce((sum, step) => sum + step.budget.maxTransitions, 0),
    maxBrowserCommands: steps.reduce((sum, step) => sum + step.budget.maxBrowserCommands, 0),
    maxActiveMs: steps.reduce((sum, step) => sum + step.budget.maxActiveMs, 0),
    maxLlmCalls: steps.reduce((sum, step) => sum + step.budget.maxLlmCalls, 0),
    maxInvocations: steps.reduce((sum, step) => sum + step.budget.maxInvocations, 0),
    maxDepth: Math.max(...steps.map((step) => step.budget.maxDepth)),
  }
}

/** WHY：计划仅是确认版本的技术投影；入口必须逐条引用同版所选来源，不能从模型记忆或正文猜。 */
export function projectPreparationPlan(requirement: TaskRequirement, version: number): TaskPlan {
  if (!requirement.confirmation || !requirement.confirmationFacts?.entries?.length) {
    throw new Error("preparation_entries_unconfirmed")
  }
  const sources = new Map(requirement.confirmationFacts.sources.map((source) => [source.resolutionId, source.url]))
  const entries = requirement.confirmationFacts.entries
  if (entries.some((entry) => !sources.has(entry.resolutionId)
    || !sourceSupportsEntry(sources.get(entry.resolutionId)!, entry.url))
    || new Set(entries.map((entry) => entry.url)).size !== entries.length) {
    throw new Error("preparation_entry_reference_mismatch")
  }
  const draft = parsePreparationDraft(requirement.definition.body)
  const id = stableUuid(requirement.taskId, "plan"), stepId = "main"
  const inputContract = { id: "draft-input", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: draft.inputSchema }
  const outputContract = { id: "draft-output", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: draft.outputSchema }
  // WHY：正式完成由合法控制流和节点错误决定；此处合同谓词只作技术占位，不把空输入或空输出误判为失败。
  const completion = { id: "draft-completion", description: draft.completion,
    predicate: { operator: "exists" as const, value: { source: "constant" as const, value: true } } }
  const step = { id: stepId, title: requirement.goal, goal: draft.representativeGoal, dependsOn: [],
    inputContract, outputContract, input: { source: "input" as const, path: [] }, invocation: { mode: "once" as const },
    chain: { id: stableUuid(requirement.taskId, id, String(version), stepId), version: 1 },
    budget: planningEnvelope(1), completion: [completion],
    risks: requirement.authorization.risks, resultSpec: draft.resultSpec }
  const plan = taskPlanSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "plan", id,
    taskId: requirement.taskId, version,
    requirement: { id: requirement.id, version: requirement.version, revision: requirement.revision,
      digest: digestJson(requirement) },
    summary: requirement.goal, entryUrls: entries.map((entry) => entry.url), browserHandoff: draft.browserHandoff,
    inputContract, outputContract,
    steps: [step], output: { source: "node", nodeId: stepId, path: [] },
    budget: aggregatePlanBudget([step]), completion: [completion], evidence: [],
    authorizationScope: requirement.authorization.scope })
  const issues = taskPlanExecutionIssues(plan)
  if (issues.length) throw new Error(`preparation_plan_projection_invalid:${issues.join(",")}`)
  return plan
}
