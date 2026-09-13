import type { InterviewState } from "./interviewContract.js"

type Draft = InterviewState["drafts"][number]

export function projectDraftMarkdown(draft: Draft | undefined) {
  if (!draft) return ""
  return draft.markdown
}
