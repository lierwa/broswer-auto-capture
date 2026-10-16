import type { TaskPreparationResearch, TaskRequirement } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { DomainError } from "../errors.js"
import { hybridSourceMediaType } from "../upstream-browser/hybrid-artifact.js"
import { sourceReferencesSchema } from "./hybrid-source-reuse.js"
import type { TaskContractRepository } from "./repository.js"

/** WHY：技术备注不能借用其它任务/版本/未关闭现场的来源；只授权新探索，不使失败来源变成成功。 */
export function validatePreparationResearch(repository: TaskContractRepository, taskId: string,
  requirement: TaskRequirement, research: TaskPreparationResearch | undefined,
  purpose: "preparation" | "method_revision" = "preparation") {
  if (!research) return undefined
  const reject = () => { throw new DomainError("preparation_research_source_mismatch", "准备资料与已结束的同版来源不一致。", 409) }
  const previous = repository.job(taskId, research.sourceJobId)
  const plan = previous.preparation?.candidatePlan
  const ended = previous.status === "failed" || purpose === "method_revision" && previous.status === "completed"
  if (previous.taskId !== taskId || !ended || previous.sequence !== research.sourceSequence
    || !plan || plan.requirement.digest !== digestJson(requirement)
    || !plan.steps.some(step => step.id === research.stepId)) return reject()
  const sources = sourceReferencesSchema.safeParse(previous.authoring?.exploration)
  const source = sources.success ? sources.data.sources.find(item => item.stepId === research.stepId
    && item.artifact.artifactId === research.artifact.artifactId) : undefined
  if (!source?.closed || source.artifact.digest !== research.artifact.digest
    || research.artifact.mediaType !== hybridSourceMediaType) return reject()
  const row = repository.artifact(taskId, research.artifact.artifactId), body = row.body
  if (row.runId !== previous.id || row.mediaType !== research.artifact.mediaType
    || row.digest !== research.artifact.digest || row.digest !== digestJson(body)
    || !body || typeof body !== "object" || Array.isArray(body)
    || body.requirementDigest !== digestJson(requirement) || body.planDigest !== digestJson(plan)
    || body.stepId !== research.stepId) return reject()
  return structuredClone(research)
}
