import type { TaskExecution } from "@browser-capture/contracts"
import { recordDraftTrial } from "./chain-revision.js"
import type { TaskContractRepository } from "./repository.js"

/**
 * 草稿试跑只更新同一份活动 TaskDraft 的验证引用；计划和链路不再拥有另一套可变验证状态。
 */
export function recordPlanValidation(repository: TaskContractRepository, record: TaskExecution) {
  if (!record.draft || !record.mode || record.mode === "replay" || record.status !== "completed") return
  const draft = repository.draft(record.taskId)
  if (!draft || draft.id !== record.draft.id || draft.revision !== record.draft.revision
    || draft.checksum !== record.draft.checksum) return
  repository.saveDraft(recordDraftTrial(draft, record))
}
