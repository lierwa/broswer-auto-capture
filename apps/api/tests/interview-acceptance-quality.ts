import type { InterviewAcceptanceCase } from "./interview-acceptance-cases.js"

type DraftUnderReview = Readonly<{
  markdown: string
  brief: null | Readonly<{ scope: string; constraints: readonly string[] }>
}>

// WHY：纠正前的初稿必须保留用户当时提供的值；只有纠正后的终稿才能检查旧值是否仍混入硬范围。
export function assertAcceptanceDraftQuality(
  scenario: InterviewAcceptanceCase,
  value: DraftUnderReview,
  phase: "initial" | "final",
) {
  if (value.markdown.includes("本需求仅授权") && value.markdown.includes("不构成任何浏览器操作授权")) {
    throw new Error("quality:草稿同时声称已授权后续浏览器工作与不构成浏览器操作授权")
  }
  if (phase !== "final" || !value.brief || !scenario.hardScopeMustNotContain?.length) return
  const hardScope = JSON.stringify({ scope: value.brief.scope, constraints: value.brief.constraints })
  const stale = scenario.hardScopeMustNotContain.filter((term) => hardScope.includes(term))
  if (stale.length) throw new Error(`quality:草稿把纠正前的值留在硬范围：${stale.join("、")}`)
}
