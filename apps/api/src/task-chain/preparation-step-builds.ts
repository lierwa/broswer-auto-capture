import { z } from "zod"
import { artifactReferenceSchema, taskAuthoringBuildViewSchema, type TaskAuthoringJob } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import type { TaskContractRepository } from "./repository.js"

const MEDIA_TYPE = "application/vnd.bat.preparation-step-view+json;version=1"
const references = z.object({ steps: z.array(z.object({ stepId: z.string(),
  buildArtifact: artifactReferenceSchema.optional() })).max(100) })

export function saveStepBuild(repository: TaskContractRepository, job: TaskAuthoringJob, value: unknown) {
  const view = taskAuthoringBuildViewSchema.parse(value)
  return repository.saveArtifact(job.taskId, job.id, MEDIA_TYPE, z.json().parse(view))
}

export function storedStepBuilds(repository: TaskContractRepository, job: TaskAuthoringJob) {
  const parsed = references.safeParse(job.authoring?.annotations)
  if (!parsed.success) return []
  // WHY：展示只引用本次准备的已收尾事实；没有可运行入口，不能提前保存/覆盖链路版本。
  return parsed.data.steps.flatMap(({ stepId, buildArtifact }) => {
    if (!buildArtifact) return [] // 旧记录不补造历史展示事实。
    const artifact = repository.artifact(job.taskId, buildArtifact.artifactId)
    if (artifact.runId !== job.id || artifact.mediaType !== MEDIA_TYPE || buildArtifact.mediaType !== MEDIA_TYPE
      || artifact.digest !== buildArtifact.digest || digestJson(artifact.body) !== artifact.digest) {
      throw new Error("preparation_step_view_identity_mismatch")
    }
    const view = taskAuthoringBuildViewSchema.parse(artifact.body)
    if (view.stepId !== stepId || view.phase !== "final") throw new Error("preparation_step_view_identity_mismatch")
    return [view]
  })
}
