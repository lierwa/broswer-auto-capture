import { z } from "zod"
import type { JsonValue, TaskAuthoringJob, TaskPlan, TaskRequirement } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { readHybridSourceArtifact, hybridSourceMediaType } from "../upstream-browser/hybrid-artifact.js"
import type { HybridSourceResult } from "../upstream-browser/hybrid-exploration.js"
import type { TaskContractRepository } from "./repository.js"

const exploration = z.object({ mode: z.literal("workflow-use-authoring/v2"), sources: z.array(z.object({ stepId: z.string(),
  artifact: z.object({ artifactId: z.string(), digest: z.string(), mediaType: z.literal(hybridSourceMediaType) }) })) }).passthrough()
type Progression = { resolve(step: TaskPlan["steps"][number]): JsonValue;
  accept(stepId: string, input: JsonValue, output: JsonValue): void; finish(): void }

/** WHY：只复用编译阶段失败且完整关闭的同版本来源；部分探索不能在新 Browser 中假装接着执行。 */
export function reusableHybridSources(repository: TaskContractRepository, job: TaskAuthoringJob,
  requirement: TaskRequirement, plan: TaskPlan, progression: Progression) {
  const previous = repository.jobs(job.taskId).findLast((candidate) => candidate.id !== job.id && candidate.key === job.key
    && candidate.status === "failed" && candidate.authoring?.stage === "compiling")
  if (!previous) return undefined
  const parsed = exploration.safeParse(previous.authoring?.exploration)
  if (!parsed.success || parsed.data.sources.length !== plan.steps.length) return undefined
  const sources: Array<{ step: TaskPlan["steps"][number]; stepInput: JsonValue; result: HybridSourceResult }> = []
  for (const [index, reference] of parsed.data.sources.entries()) {
    const step = plan.steps[index]!
    if (reference.stepId !== step.id) return undefined
    const row = repository.artifact(job.taskId, reference.artifact.artifactId)
    if (row.mediaType !== hybridSourceMediaType || row.digest !== reference.artifact.digest || row.digest !== digestJson(row.body)) {
      throw new Error("hybrid_source_artifact_digest_mismatch")
    }
    const artifact = readHybridSourceArtifact(row.body), stepInput = progression.resolve(step)
    if (!artifact.closed || !artifact.result.sourceSuccess || !artifact.result.sourceValidated
      || artifact.requirementDigest !== digestJson(requirement) || artifact.planDigest !== digestJson(plan)
      || artifact.stepId !== step.id || artifact.inputDigest !== digestJson(stepInput)) return undefined
    // Normalization/annotation failures carry information not recoverable from a request alone.
    if (artifact.result.response.compilation.gaps.some((gap) => gap.code === "invalid_source"
      || gap.reason === "semantic_annotation_failed")) return undefined
    progression.accept(step.id, stepInput, artifact.result.output)
    sources.push({ step, stepInput, result: { ...artifact.result, modelCalls: artifact.modelCalls,
      forkSourceDigest: artifact.forkSourceDigest } })
  }
  progression.finish()
  return { sources, exploration: { ...parsed.data, reusedFromJobId: previous.id } }
}
