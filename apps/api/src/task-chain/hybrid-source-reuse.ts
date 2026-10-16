import { z } from "zod"
import type { JsonValue, TaskAuthoringJob, TaskChain, TaskMethodRevisionSource, TaskPlan, TaskRequirement } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { conflict } from "../errors.js"
import { assertCapturedSourceIdentity, readHybridSourceArtifact, hybridSourceMediaType } from "../upstream-browser/hybrid-artifact.js"
import type { HybridSourceResult } from "../upstream-browser/hybrid-exploration.js"
import type { TaskContractRepository } from "./repository.js"
import type { plannedProgression } from "./authoring-progression.js"

export const sourceReferencesSchema = z.object({ mode: z.literal("workflow-use-authoring/v3"), sources: z.array(z.object({ stepId: z.string(), closed: z.boolean(),
  artifact: z.object({ artifactId: z.string(), digest: z.string(), mediaType: z.literal(hybridSourceMediaType) }) })) }).passthrough()
type Progression = Pick<ReturnType<typeof plannedProgression>, "resolve" | "acceptSource" | "finish">

/** WHY：显式方法修订可引用已完成或失败的 closed 来源；这只是问题依据，不能离线改写旧方法。 */
export function methodRevisionHybridSource(repository: TaskContractRepository, taskId: string,
  requirement: TaskRequirement, plan: TaskPlan, input: JsonValue, stepId: string, chain: TaskChain,
  source: TaskMethodRevisionSource) {
  const job = repository.job(taskId, source.sourceJobId), preparation = job.preparation
  const references = sourceReferencesSchema.safeParse(job.authoring?.exploration)
  const reference = references.success ? references.data.sources.find(item => item.stepId === stepId
    && item.artifact.artifactId === source.artifact.artifactId) : undefined
  const chainReferences = [...(preparation?.chains ?? []), ...(job.authoring?.compiledChains ?? [])]
  if (job.taskId !== taskId || !["completed", "failed"].includes(job.status) || job.sequence !== source.sourceSequence
    || !preparation?.candidatePlan || digestJson(preparation.candidatePlan) !== digestJson(plan)
    || preparation.plan?.id !== plan.id || preparation.plan.version !== plan.version || preparation.plan.digest !== digestJson(plan)
    || digestJson(preparation.representativeInput) !== digestJson(input) || !reference?.closed
    || !chainReferences.some(item => item.id === chain.id && item.version === chain.version
      && item.digest === executableChainDigest(chain)))
    conflict("所选来源不属于当前方法版本或原业务输入，不能用于本次局部修订。")
  const row = repository.artifact(taskId, source.artifact.artifactId)
  if (row.runId !== job.id || row.mediaType !== hybridSourceMediaType || source.artifact.mediaType !== row.mediaType
    || row.digest !== source.artifact.digest || row.digest !== reference.artifact.digest || row.digest !== digestJson(row.body))
    conflict("所选方法来源摘要或归属不一致，原记录保留。")
  const artifact = readHybridSourceArtifact(row.body)
  if (artifact.requirementDigest !== digestJson(requirement) || artifact.planDigest !== digestJson(plan)
    || artifact.stepId !== stepId) conflict("所选方法来源与当前需求或方案不一致。")
  return { job, artifact, references: references.success ? references.data.sources : [] }
}

/** WHY：复用已完整关闭的同版本来源；样本验证失败后的 compiled 来源仍可由修复后的编译器离线重编译，
 *  但部分探索不能在新 Browser 中假装接着执行。 */
export function reusableHybridSources(repository: TaskContractRepository, job: TaskAuthoringJob,
  requirement: TaskRequirement, plan: TaskPlan, progression: Progression, sourceJobId: string) {
  const previous = repository.job(job.taskId, sourceJobId)
  if (previous.id === job.id || previous.key !== job.key || previous.status !== "failed"
    || !["compiling", "compiled"].includes(previous.authoring?.stage ?? "")) return undefined
  const parsed = sourceReferencesSchema.safeParse(previous.authoring?.exploration)
  if (!parsed.success || parsed.data.sources.length !== plan.steps.length) return undefined
  const sources: Array<{ step: TaskPlan["steps"][number]; stepInput: JsonValue; result: HybridSourceResult }> = []
  for (const [index, reference] of parsed.data.sources.entries()) {
    const step = plan.steps[index]!
    if (reference.stepId !== step.id) return undefined
    const row = repository.artifact(job.taskId, reference.artifact.artifactId)
    if (row.runId !== previous.id || row.mediaType !== hybridSourceMediaType
      || row.digest !== reference.artifact.digest || row.digest !== digestJson(row.body)) {
      throw new Error("hybrid_source_artifact_digest_mismatch")
    }
    const artifact = readHybridSourceArtifact(row.body), stepInput = progression.resolve(step)
    // WHY：完整 fork 摘要包含编译器实现，不能用它把“编译器修复”误判成“来源事实失效”。
    // 来源是否仍兼容由版本化 natural request/trace、provider 版本和 action registry 摘要在当前离线编译器中复验；
    // fork 摘要仍保留在 artifact 里用于审计，但不替代这些公开合同。
    if (!reference.closed || !artifact.result.sourceSuccess
      || artifact.requirementDigest !== digestJson(requirement) || artifact.planDigest !== digestJson(plan)
      || artifact.stepId !== step.id || artifact.inputDigest !== digestJson(stepInput)) return undefined
    assertCapturedSourceIdentity(requirement, plan, step.id, stepInput, artifact.result)
    // WHY：编译 gap 是派生结果，可能来自已经修复的旧编译器；来源本身已通过身份和输出合同校验时，
    // 应交给当前编译器重新判定。预先信任旧 gap 会丢弃可恢复来源并无意义地再次启动浏览器。
    progression.acceptSource(step.id, stepInput, artifact.result)
    sources.push({ step, stepInput, result: artifact.result })
  }
  progression.finish()
  return { sources, exploration: { ...parsed.data, reusedFromJobId: previous.id } }
}
