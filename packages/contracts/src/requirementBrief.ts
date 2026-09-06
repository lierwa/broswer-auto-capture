import { z } from "zod"

const text = z.string().trim().min(1).max(10_000)
const list = z.array(text).max(40)
// WHY：需求描述用户要什么和系统要查什么；不写未观察的选择器、节点图或固定链路数量。
export const requirementBriefSchema = z.object({
  goal: text,
  scope: text,
  sourceStrategy: z.object({
    mode: z.enum(["discover", "provided", "mixed"]),
    scope: text,
    providedUrls: z.array(z.string().url()).max(40),
  }).strict(),
  deliverables: z.array(z.object({ entity: text, fields: list.min(1), coverage: text, limit: text }).strict()).min(1).max(20),
  discoveryTasks: z.array(z.object({ objective: text, expectedOutput: text, acceptance: text }).strict()).max(20),
  completionCriteria: list.min(1),
  constraints: list,
  proposedDefaults: list,
}).strict()
export type RequirementBrief = z.infer<typeof requirementBriefSchema>

export function renderRequirementBrief(brief: RequirementBrief) {
  const bullets = (items: string[]) => items.map((item) => `- ${item}`).join("\n")
  return [
    "# 目标", brief.goal, "# 对象与范围", brief.scope,
    "# 来源要求", brief.sourceStrategy.scope,
    ...(brief.sourceStrategy.providedUrls.length ? ["已提供的待核验入口：", bullets(brief.sourceStrategy.providedUrls)] : []),
    "# 需要交付的数据", ...brief.deliverables.map((item) => `## ${item.entity}\n字段：${item.fields.join("、")}\n覆盖：${item.coverage}\n数量与终止：${item.limit}`),
    ...(brief.discoveryTasks.length ? ["# 交给系统调查", ...brief.discoveryTasks.map((item) => `- ${item.objective}\n  需要得到：${item.expectedOutput}\n  核验依据：${item.acceptance}`)] : []),
    "# 完成标准", bullets(brief.completionCriteria),
    ...(brief.constraints.length ? ["# 约束", bullets(brief.constraints)] : []),
    ...(brief.proposedDefaults.length ? ["# 建议采用的处理方式（随草稿一起确认）", bullets(brief.proposedDefaults)] : []),
  ].join("\n\n")
}
