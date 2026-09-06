import { planProposalSchema, type PlanRecord } from "@browser-capture/contracts/plan"
import type { ResearchRecord } from "@browser-capture/contracts/research"
import { digest } from "../database/store.js"

export function validateProposal(raw: unknown, record: PlanRecord, source: ResearchRecord) {
  const proposal = planProposalSchema.parse(raw), brief = record.requirement
  const adopted = source.observations.filter((item) => !item.queryId && item.assessment?.adopted && item.assessment.access === "normal")
  const sourceIds = new Set(adopted.map((item) => item.id)), stepIds = new Set(proposal.steps.map((item) => item.id))
  const sources = (ids: string[]) => { if (ids.some((id) => !sourceIds.has(id))) throw new Error("计划引用了未采纳来源") }
  const steps = (ids: string[]) => { if (ids.some((id) => !stepIds.has(id))) throw new Error("计划引用了不存在的步骤") }
  for (const step of proposal.steps) {
    sources(step.sourceIds)
    if (step.kind === "enumerate" && !adopted.some((item) => step.sourceIds.includes(item.id) && item.assessment?.enumeration)) throw new Error("枚举步骤缺少真实方法依据")
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
    if (item.mode !== "observed" && (item.ruleIndex === null || !rules[item.ruleIndex])) throw new Error("派生或缺失处理缺少已确认规则")
    if (item.mode === "derived" && proposal.steps.find((step) => step.id === item.stepId)?.kind !== "derive") throw new Error("派生输出必须由派生步骤负责")
  }
  const objectives = [...brief.deliverables.map((item) => item.entity), ...brief.discoveryTasks.map((item) => item.objective)]
  if (proposal.objectives.length !== objectives.length) throw new Error("计划没有覆盖全部来源目标")
  for (const objective of objectives) {
    const mapped = proposal.objectives.filter((item) => item.objective === objective)
    if (mapped.length !== 1) throw new Error("目标映射必须完整且唯一")
    const item = mapped[0]!; sources(item.sourceIds); steps(item.stepIds)
    if (!source.coverage.some((value) => value.objective === objective && item.sourceIds.every((id) => value.observationIds.includes(id)))) throw new Error("来源尚未提供该目标的规划依据")
  }
  if (!proposal.steps.some((step) => step.kind === "enumerate")) throw new Error("完整范围需要有依据的枚举步骤")
  if (proposal.gaps.length !== source.gaps.length) throw new Error("来源缺口没有逐项处理")
  for (const [gapIndex, gap] of source.gaps.entries()) {
    const mapped = proposal.gaps.filter((item) => item.gapIndex === gapIndex)
    if (mapped.length !== 1) throw new Error("缺口映射必须完整且唯一")
    const item = mapped[0]!; steps(item.stepIds)
    if (gap.requiresUser && item.disposition !== "blocking") throw new Error("待用户决策缺口必须阻塞启动")
    if (item.disposition !== "blocking" && !item.stepIds.length) throw new Error("非阻塞缺口必须由明确步骤处理")
    if (item.disposition === "derived" && !item.stepIds.some((id) => proposal.steps.find((step) => step.id === id)?.kind === "derive")) throw new Error("派生缺口缺少派生步骤")
  }
  return proposal
}
export function planDigest(record: PlanRecord) {
  return digest({ taskId: record.taskId, version: record.version, requirementVersion: record.requirementVersion, requirementRevision: record.requirementRevision,
    sourceId: record.sourceId, sourceVersion: record.sourceVersion, sourceDigest: record.sourceDigest, requirement: record.requirement, proposal: record.proposal })
}
