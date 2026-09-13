import { CONTRACT_VERSION, taskRequirementSchema, type TaskRequirement } from "@browser-capture/contracts"
import { stableUuid } from "@browser-capture/runtime"
import { currentDraft } from "@browser-capture/contracts/interview"
import type { ProductStore } from "../database/store.js"
import type { TaskContractRepository } from "./repository.js"

const openObject = (id: string, version: number) => ({ id, version, dialect: "bat-value-schema/v1" as const,
  schema: { type: "object" as const, properties: {}, required: [], additionalProperties: true } })

export function syncConfirmedRequirement(store: ProductStore, repository: TaskContractRepository, taskId: string): TaskRequirement | null {
  const state = store.snapshot(taskId), draft = currentDraft(state)
  if (state.active || !draft || state.confirmedVersion !== draft.version) return null
  const confirmation = state.decisions.findLast((decision) => decision.kind === "draft_confirmation"
    && decision.draftVersion === draft.version)
  if (!confirmation) return null
  const requirement = taskRequirementSchema.parse({
    contractVersion: CONTRACT_VERSION, kind: "requirement", id: stableUuid(taskId, "requirement"), taskId,
    version: draft.version, revision: draft.revision, goal: draft.title, scope: `已确认需求草稿 v${draft.version} 的完整边界。`,
    definition: { format: "markdown", body: draft.markdown },
    inputContract: openObject("task-input", draft.version), outputContract: openObject("task-output", draft.version),
    constraints: ["任务特有字段和数量只存在于本需求版本的数据中。"],
    completionCriteria: ["满足已确认草稿中列出的可观察完成标准，并保存证据、覆盖与缺口。"],
    authorization: { scope: "仅限该需求草稿确认的浏览器任务范围。",
      risks: ["页面现场、登录状态或可访问能力可能与草稿假设不同。"],
      requiredApprovals: ["开始浏览器会话或产生外部副作用前，需单独提交运行授权。"] },
    confirmation: { confirmedAt: confirmation.createdAt,
      requestId: stableUuid(taskId, "confirmation", String(draft.version), confirmation.id) },
  })
  return repository.saveRequirement(requirement)
}
