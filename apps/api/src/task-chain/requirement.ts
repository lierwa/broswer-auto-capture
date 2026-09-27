import { CONTRACT_VERSION, taskRequirementSchema, type TaskRequirement } from "@browser-capture/contracts"
import { stableUuid } from "@browser-capture/runtime"
import { currentDraft } from "@browser-capture/contracts/interview"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"
import { assertRequirementReady, preparationEntryFacts, selectedSourceFacts } from "../interview/source-resolution.js"
import { resultAndCompletionBody } from "../interview/protocol.js"
import { parsePreparationDraft } from "../interview/preparation-draft.js"

export function syncConfirmedRequirement(store: ProductStore, repository: TaskContractRepository, taskId: string): TaskRequirement | null {
  const state = store.snapshot(taskId), draft = currentDraft(state)
  if (state.active || !draft || state.confirmedVersion !== draft.version) return null
  const confirmation = state.decisions.findLast((decision) => decision.kind === "draft_confirmation"
    && decision.draftVersion === draft.version)
  if (!confirmation) return null
  const existing = repository.findRequirement(taskId, draft.version)
  if (existing?.revision === draft.revision) return existing
  assertRequirementReady(state, draft.markdown, true)
  parsePreparationDraft(draft.markdown)
  const resultExpectation = resultAndCompletionBody(draft.markdown)
  const entries = preparationEntryFacts(state, draft.markdown)
  const entryResolutions = new Set(entries.map((entry) => entry.resolutionId))
  const sources = selectedSourceFacts(state).filter((source) => entryResolutions.has(source.resolutionId))
  const decisions = state.decisions.filter((decision) => decision.kind !== "draft_confirmation")
    .map(({ id, kind, text, createdAt }) => ({ id, kind: kind as "option" | "free_text", text, createdAt }))
  const requirement = taskRequirementSchema.parse({
    contractVersion: CONTRACT_VERSION, kind: "requirement", id: stableUuid(taskId, "requirement"), taskId,
    version: draft.version, revision: draft.revision, goal: draft.title,
    scope: sources.length ? `仅限已确认来源：${sources.map((item) => `${item.label}（${item.domain}）`).join("、")}。`
      : "以已确认需求正文中的来源与范围描述为准；具体页面入口由准备任务调查。",
    definition: { format: "markdown", body: draft.markdown },
    inputContract: null, outputContract: null,
    constraints: decisions.length ? decisions.map((item) => item.text) : ["以已确认需求正文中的范围与约束为准。"],
    completionCriteria: [resultExpectation],
    authorization: { scope: "仅限该需求草稿确认的浏览器任务范围。",
      risks: ["页面现场、登录状态或可访问能力可能与草稿假设不同。"],
      requiredApprovals: ["开始浏览器会话或产生外部副作用前，需单独提交运行授权。"] },
    confirmation: { confirmedAt: confirmation.createdAt,
      requestId: stableUuid(taskId, "confirmation", String(draft.version), confirmation.id) },
    confirmationFacts: state.policyVersion >= 1 ? {
      decisions, sources, entries, resultExpectation, unresolvedItemCount: 0,
    } : null,
  })
  return repository.saveRequirement(requirement)
}
