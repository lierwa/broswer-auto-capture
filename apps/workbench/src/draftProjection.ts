import { renderRequirementBrief, type InterviewState } from "./interviewContract.js"

type Draft = InterviewState["drafts"][number]

export function projectDraftMarkdown(draft: Draft | undefined) {
  if (!draft) return ""
  // WHY：新草稿以结构化 brief 为事实源，保证审阅内容与下一阶段收到的范围一致；旧草稿没有 brief 时保留原文可读。
  return draft.brief ? renderRequirementBrief(draft.brief) : draft.markdown
}
