import {
  CONTRACT_VERSION, chainEdgeSchema, chainEdgeV2Schema, taskDraftSchema, taskDraftContentSchema, taskChainSchema,
  type ChainPresentation, type ChainRevisionOperation, type RunnableTaskRelease, type TaskChain, type TaskDraft,
  type TaskDraftContent, type TaskExecution, type TaskPlan, type TaskRequirement, type VersionReference,
} from "@browser-capture/contracts"
import type { TaskAdjustmentCandidate } from "@browser-capture/contracts/api"
import { compileTaskChain, digestJson, executableChainDigest, stableUuid } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import { replaceCapability } from "./capability-descriptors.js"
import { createChainPresentation, validateChainPresentation } from "./presentation.js"

export function createTaskDraft(input: {
  taskId: string; requirement: TaskRequirement; baseRelease: VersionReference | null;
  plan: TaskPlan; chains: TaskChain[]; presentations?: ChainPresentation[]; current?: TaskDraft | null;
}) {
  const now = new Date().toISOString()
  const content = taskDraftContentSchema.parse({ plan: input.plan, steps: input.plan.steps.map((step) => {
    const chain = input.chains.find((candidate) => candidate.stepId === step.id)
    if (!chain) throw new DomainError("draft_chain_missing", `步骤“${step.title}”缺少链路。`, 409)
    const existing = input.presentations?.find((item) => item.chain.id === chain.id
      && item.chain.version === chain.version && item.chain.digest === executableChainDigest(chain))
    return { stepId: step.id, chain, presentation: existing
      ? validateChainPresentation(chain, existing) : createChainPresentation(chain) }
  }) })
  const requirement = input.plan.requirement
  const checksum = draftChecksum(requirement, input.baseRelease, content)
  return taskDraftSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "task_draft",
    id: input.current?.id ?? stableUuid(input.taskId, "task-draft"), taskId: input.taskId,
    revision: input.current ? input.current.revision + 1 : 0, requirement, baseRelease: input.baseRelease,
    content, checksum, validation: { records: [] },
    createdAt: input.current?.createdAt ?? now, updatedAt: now })
}

export function draftFromRelease(release: RunnableTaskRelease, current?: TaskDraft | null) {
  const requirement = release.requirement, baseRelease = releaseReference(release), content = structuredClone(release.content)
  const checksum = draftChecksum(requirement, baseRelease, content)
  const now = new Date().toISOString()
  return taskDraftSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "task_draft",
    id: current?.id ?? stableUuid(release.taskId, "task-draft"), taskId: release.taskId,
    revision: current ? current.revision + 1 : 0, requirement, baseRelease, content, checksum,
    validation: { records: [] }, createdAt: current?.createdAt ?? now, updatedAt: now })
}

export function updateTaskDraft(draft: TaskDraft, expectedRevision: number, expectedChecksum: string,
  chainId: string, operations: ChainRevisionOperation[], nextVersion: number) {
  assertDraftToken(draft, expectedRevision, expectedChecksum)
  const content = structuredClone(draft.content)
  const step = content.steps.find((item) => item.chain.id === chainId)
  if (!step) throw new DomainError("draft_chain_not_found", "草稿链路不存在。", 404)
  const planLimit = content.plan.steps.find((item) => item.id === step.stepId)?.budget.maxBrowserCommands
  if (planLimit === undefined) throw new DomainError("draft_plan_step_not_found", "计划步骤不存在。", 409)
  const chain = structuredClone(step.chain), beforeDigest = executableChainDigest(chain)
  let presentation = structuredClone(step.presentation)
  for (const operation of operations) presentation = applyOperation(chain, presentation, operation)
  // WHY：预算是已确认计划授权的子额度；所有编辑结束后统一核验，防止组合操作绕过上限。
  if (chain.budget.maxBrowserCommands > planLimit) {
    throw new DomainError("chain_budget_exceeds_plan_step", "浏览器命令预算不能超过计划步骤授权额度。", 409)
  }
  const executableChanged = executableChainDigest(chain) !== beforeDigest
  if (executableChanged) {
    chain.version = nextVersion
    chain.validation = { status: "candidate", evidence: [] }
  }
  const parsed = taskChainSchema.parse(chain)
  compileTaskChain(parsed)
  step.chain = parsed
  step.presentation = createChainPresentation(parsed, {
    stages: presentation.stages, overviewLayout: presentation.overviewLayout, focusLayouts: presentation.focusLayouts,
  })
  const next = taskDraftContentSchema.parse(content)
  const revision = draft.revision + 1, checksum = draftChecksum(draft.requirement, draft.baseRelease, next)
  return taskDraftSchema.parse({ ...draft, revision, content: next, checksum,
    validation: executableChanged || checksum !== draft.checksum ? { records: [] } : draft.validation,
    updatedAt: new Date().toISOString() })
}

export function previewTaskDraftAdjustment(base: TaskDraft,
  operations: TaskAdjustmentCandidate["operations"], nextVersion: (chainId: string) => number) {
  // WHY：一份建议可以触及多个步骤；先在内存中逐项用现有校验原语求值，接受时只持久化一次修订。
  const seen = new Set<string>()
  let candidate = base
  for (const item of operations) {
    if (seen.has(item.chainId)) throw new DomainError("adjustment_chain_duplicate", "同一建议不能重复修改同一步骤。", 409)
    seen.add(item.chainId)
    candidate = updateTaskDraft(candidate, candidate.revision, candidate.checksum, item.chainId,
      item.operations, nextVersion(item.chainId))
  }
  const diff = candidate.content.steps.flatMap((step) => {
    const prior = base.content.steps.find((item) => item.stepId === step.stepId)!
    const beforeDigest = executableChainDigest(prior.chain), afterDigest = executableChainDigest(step.chain)
    if (beforeDigest === afterDigest) return []
    const priorActions = new Map(prior.chain.nodes.map((node) => [node.id, digestJson(node)]))
    const nextActions = new Map(step.chain.nodes.map((node) => [node.id, digestJson(node)]))
    const changedActions = new Set([...priorActions.keys(), ...nextActions.keys()])
    const priorRoutes = new Set(prior.chain.edges.map((edge) => digestJson(edge)))
    const nextRoutes = new Set(step.chain.edges.map((edge) => digestJson(edge)))
    const changedRoutes = new Set([...priorRoutes, ...nextRoutes])
    return [{ stepId: step.stepId, title: base.content.plan.steps.find((item) => item.id === step.stepId)?.title ?? step.stepId,
      beforeDigest, afterDigest,
      changedActions: [...changedActions].filter((id) => priorActions.get(id) !== nextActions.get(id)).length,
      changedRoutes: [...changedRoutes].filter((edge) => priorRoutes.has(edge) !== nextRoutes.has(edge)).length }]
  })
  if (!diff.length) throw new DomainError("adjustment_no_executable_change", "修改建议没有改变可执行链路。", 409)
  return { draft: taskDraftSchema.parse({ ...candidate, revision: base.revision + 1 }), diff }
}

export function recordDraftTrial(draft: TaskDraft, execution: TaskExecution) {
  if (execution.status !== "completed" || !execution.draft || execution.draft.id !== draft.id
    || execution.draft.revision !== draft.revision || execution.draft.checksum !== draft.checksum
    || !executionMatchesDraft(execution, draft)) return draft
  const record = { executionId: execution.id, revision: draft.revision, checksum: draft.checksum,
    inputDigest: execution.inputDigest, completedAt: execution.updatedAt }
  return taskDraftSchema.parse({ ...draft,
    validation: { records: [...draft.validation.records.filter((item) => item.executionId !== execution.id), record].slice(-20) },
    updatedAt: new Date().toISOString() })
}

export function assertDraftToken(draft: TaskDraft, revision: number, checksum: string) {
  if (draft.revision !== revision || draft.checksum !== checksum) {
    throw new DomainError("task_draft_stale", "任务草稿已变化，请刷新后继续。", 409)
  }
}

export function releaseReference(release: RunnableTaskRelease) {
  return { id: release.id, version: release.version, digest: digestJson(release) }
}

export function draftReference(draft: TaskDraft) {
  return { id: draft.id, revision: draft.revision, checksum: draft.checksum }
}

function executionMatchesDraft(execution: TaskExecution, draft: TaskDraft) {
  return execution.plan.id === draft.content.plan.id && execution.plan.version === draft.content.plan.version
    && execution.plan.digest === digestJson(draft.content.plan) && execution.steps.length === draft.content.steps.length
    && execution.steps.every((step) => {
      const current = draft.content.steps.find((item) => item.stepId === step.stepId)
      return current && step.chain.id === current.chain.id && step.chain.version === current.chain.version
        && step.chain.digest === executableChainDigest(current.chain)
    })
}

function draftChecksum(requirement: TaskDraft["requirement"], baseRelease: VersionReference | null,
  content: TaskDraftContent) {
  return digestJson({ requirement, baseRelease, content })
}

type MutableTaskChain = {
  entry: string
  nodeModel?: string
  nodes: Array<TaskChain["nodes"][number]>
  edges: Array<TaskChain["edges"][number]>
}

function applyOperation(chain: TaskChain, presentation: ChainPresentation, operation: ChainRevisionOperation) {
  // WHY：编辑只改变当前 TaskDraft；每次试跑和发布再冻结独立快照，历史 execution/release 永不回写。
  const mutable = chain as unknown as MutableTaskChain
  if (operation.type === "set_browser_command_budget") {
    chain.budget.maxBrowserCommands = operation.maxBrowserCommands
    return presentation
  }
  if (operation.type === "move_node") {
    const item = presentation.focusLayouts.flatMap((focus) => focus.nodes)
      .find((candidate) => candidate.nodeId === operation.nodeId)
    if (!item) throw new DomainError("chain_node_not_found", "节点不在当前展示布局中。", 404)
    item.x = operation.position.x; item.y = operation.position.y
    return presentation
  }
  if (operation.type === "set_presentation") return createChainPresentation(chain, operation.presentation)
  if (operation.type === "replace_capability") {
    const index = mutable.nodes.findIndex((node) => node.id === operation.nodeId)
    if (index < 0) throw new DomainError("chain_node_not_found", "节点不存在。", 404)
    mutable.nodes[index] = replaceCapability(chain, operation) as TaskChain["nodes"][number]
    return presentation
  }
  if (operation.type === "add_node") {
    if (mutable.nodes.some((node) => node.id === operation.node.id)) {
      throw new DomainError("chain_node_exists", "节点标识已存在。", 409)
    }
    mutable.nodes.push(operation.node)
    const focus = presentation.focusLayouts[0]
    if (focus) focus.nodes.push({ nodeId: operation.node.id, ...operation.position })
    return presentation
  }
  if (operation.type === "replace_node") {
    const index = mutable.nodes.findIndex((node) => node.id === operation.node.id)
    if (index < 0) throw new DomainError("chain_node_not_found", "节点不存在。", 404)
    mutable.nodes[index] = operation.node; return presentation
  }
  if (operation.type === "remove_node") {
    if (!mutable.nodes.some((node) => node.id === operation.nodeId)) {
      throw new DomainError("chain_node_not_found", "节点不存在。", 404)
    }
    mutable.nodes = mutable.nodes.filter((node) => node.id !== operation.nodeId)
    mutable.edges = mutable.edges.filter((edge) => edge.from !== operation.nodeId && edge.to !== operation.nodeId)
    for (const focus of presentation.focusLayouts) {
      focus.nodes = focus.nodes.filter((item) => item.nodeId !== operation.nodeId)
    }
    return presentation
  }
  if (operation.type === "set_entry") { mutable.entry = operation.nodeId; return presentation }
  const edgePort = (edge: { outcome?: string; port?: string }) => edge.port ?? edge.outcome!
  if (operation.type === "remove_edge") {
    mutable.edges = mutable.edges.filter((edge) => edge.from !== operation.from || edgePort(edge) !== operation.port)
    return presentation
  }
  const edge = mutable.nodeModel === "stable/v2"
    ? chainEdgeV2Schema.parse(operation.edge) : chainEdgeSchema.parse(operation.edge)
  mutable.edges = [...mutable.edges.filter((item) => item.from !== edge.from || edgePort(item) !== edgePort(edge)), edge]
  return presentation
}
