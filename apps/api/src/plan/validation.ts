import { adoptedPlanSources, planEvidenceSchema, planProposalSchema, planRecordSchema, type PlanEvidence, type PlanRecord } from "@browser-capture/contracts/plan"
import { digest } from "../database/store.js"

export function validateProposal(raw: unknown, record: PlanRecord) {
  const proposal = planProposalSchema.parse(raw), brief = record.requirement
  // WHY：程序可支持较大批量，但旧计划及默认计划仍绑定原上限；新预算只作用于显式请求的新版本。
  for (const key of ["maxCommands", "timeoutMs", "maxModelCalls", "maxLlmCalls"] as const) {
    if (proposal.steps.reduce((sum, step) => sum + (step.budget[key] ?? 0), 0) > (record.budgetCeiling[key] ?? 0)) throw new Error("计划超出本次申请预算")
    for (const kind of ["enumerate", "collect", "derive"] as const) {
      const limit = record.stepBudgetLimits?.[kind]
      if (limit && proposal.steps.filter((step) => step.kind === kind).reduce((sum, step) => sum + (step.budget[key] ?? 0), 0) > (limit[key] ?? 0)) throw new Error("步骤类别超出申请预算")
    }
  }
  const adopted = adoptedPlanSources(record.evidence)
  const sourceIds = new Set(adopted.map((item) => item.id)), stepIds = new Set(proposal.steps.map((item) => item.id))
  const sources = (ids: string[]) => { if (ids.some((id) => !sourceIds.has(id))) throw new Error("计划引用了未采纳来源") }
  const steps = (ids: string[]) => { if (ids.some((id) => !stepIds.has(id))) throw new Error("计划引用了不存在的步骤") }
  const pendingStep = (id: string) => proposal.gaps.some((gap) => ["execution", "blocking"].includes(gap.disposition) && gap.stepIds.includes(id))
  const blockedStep = (id: string) => proposal.gaps.some((gap) => gap.disposition === "blocking" && gap.stepIds.includes(id))
  for (const step of proposal.steps) {
    sources(step.sourceIds)
    if (step.kind !== "derive" && !step.sourceIds.length && !blockedStep(step.id)) throw new Error("无来源步骤必须保持阻塞")
    if (step.kind === "enumerate" && !adopted.some((item) => step.sourceIds.includes(item.id) && item.assessment?.enumeration) && !pendingStep(step.id)) throw new Error("枚举步骤缺少真实方法依据或待核验缺口")
  }
  const fields = brief.deliverables.flatMap((item, deliverable) => item.fields.map((name, field) => ({ name, deliverable, field })))
  if (proposal.fields.length !== fields.length) throw new Error("计划没有覆盖全部需求字段")
  const rules = [...brief.constraints, ...brief.proposedDefaults]
  for (const field of fields) {
    const mapped = proposal.fields.filter((item) => item.deliverable === field.deliverable && item.field === field.field)
    if (mapped.length !== 1) throw new Error("字段映射必须完整且唯一")
    const item = mapped[0]!; sources(item.sourceIds); steps([item.stepId])
    if (item.sourceIds.some((id) => !proposal.steps.find((step) => step.id === item.stepId)!.sourceIds.includes(id))) throw new Error("字段来源必须属于承担步骤")
    if (item.mode === "observed" && !adopted.some((page) => item.sourceIds.includes(page.id) && page.assessment?.fields.some((value) => value.name === field.name))) throw new Error("页面字段缺少对应原始证据")
    // WHY：派生说明和允许留空只能引用用户确认规则，不能把模型解释升级为来源字段。
    const pendingMissing = item.mode === "missing" && item.ruleIndex === null && pendingStep(item.stepId)
    if (item.mode !== "observed" && !pendingMissing && (item.ruleIndex === null || !rules[item.ruleIndex])) throw new Error("派生或缺失处理缺少已确认规则")
    if (item.mode === "derived" && proposal.steps.find((step) => step.id === item.stepId)?.kind !== "derive") throw new Error("派生输出必须由派生步骤负责")
  }
  const objectives = [...brief.deliverables.map((item) => item.entity), ...brief.discoveryTasks.map((item) => item.objective)]
  if (proposal.objectives.length !== objectives.length) throw new Error("计划没有覆盖全部来源目标")
  for (const objective of objectives) {
    const mapped = proposal.objectives.filter((item) => item.objective === objective)
    if (mapped.length !== 1) throw new Error("目标映射必须完整且唯一")
    const item = mapped[0]!; sources(item.sourceIds); steps(item.stepIds)
    const grounded = item.sourceIds.length > 0 && record.evidence.coverage.some((value) => value.objective === objective && item.sourceIds.every((id) => value.observationIds.includes(id)))
    const pending = item.sourceIds.length === 0 && item.stepIds.length > 0 && item.stepIds.every(blockedStep)
    if (!grounded && !pending) throw new Error("来源尚未提供该目标的规划依据或待核验步骤")
  }
  if (!proposal.steps.some((step) => step.kind === "enumerate")) throw new Error("完整范围需要有依据的枚举步骤")
  if (proposal.gaps.length !== record.evidence.gaps.length) throw new Error("来源缺口没有逐项处理")
  for (const [gapIndex, gap] of record.evidence.gaps.entries()) {
    const mapped = proposal.gaps.filter((item) => item.gapIndex === gapIndex)
    if (mapped.length !== 1) throw new Error("缺口映射必须完整且唯一")
    const item = mapped[0]!; steps(item.stepIds)
    if (gap.requiresUser && item.disposition !== "blocking") throw new Error("待用户决策缺口必须阻塞启动")
    if (item.disposition !== "blocking" && !item.stepIds.length) throw new Error("非阻塞缺口必须由明确步骤处理")
    if (item.disposition === "derived" && !item.stepIds.some((id) => proposal.steps.find((step) => step.id === id)?.kind === "derive")) throw new Error("派生缺口缺少派生步骤")
  }
  if (["manual_required", "cleanup_required"].includes(record.evidence.outcome) && !proposal.gaps.some((gap) => gap.disposition === "blocking")) throw new Error("人工处理或会话清理必须阻止启动")
  return proposal
}
export function planDigest(record: PlanRecord) {
  const value = planRecordSchema.parse(record)
  return digest({ taskId: value.taskId, version: value.version, requirementVersion: value.requirementVersion, requirementRevision: value.requirementRevision,
    evidenceDigest: value.evidenceDigest, requirement: value.requirement, evidence: value.evidence, proposal: value.proposal })
}

export function evidenceDigest(evidence: PlanEvidence) {
  const { reusedFromPlanId: _, ...facts } = planEvidenceSchema.parse(evidence)
  return digest(facts)
}
