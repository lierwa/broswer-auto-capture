import { z } from "zod"
import type { JsonValue, TaskAuthoringJob, TaskPlan, TaskRequirement } from "@browser-capture/contracts"
import { digestJson } from "@browser-capture/runtime"
import { readHybridSourceArtifact, hybridSourceMediaType } from "../upstream-browser/hybrid-artifact.js"
import type { HybridSourceResult } from "../upstream-browser/hybrid-exploration.js"
import { UpstreamProtocolError } from "../upstream-browser/service.js"
import type { TaskContractRepository } from "./repository.js"

const exploration = z.object({ mode: z.literal("workflow-use-authoring/v2"), sources: z.array(z.object({ stepId: z.string(),
  artifact: z.object({ artifactId: z.string(), digest: z.string(), mediaType: z.literal(hybridSourceMediaType) }) })) }).passthrough()
type Progression = { resolve(step: TaskPlan["steps"][number]): JsonValue;
  accept(stepId: string, input: JsonValue, output: JsonValue): void; finish(): void }

export function incompatibleSourceRegistry(error: unknown) {
  // WHY：只替换公开动作合同已变化的旧来源；进程、清理、取消等错误不能偷偷再开浏览器。
  return error instanceof UpstreamProtocolError && error.code === "hybrid_runner_failed"
    && error.reason === "ValueError:hybrid_action_registry_mismatch"
}

/** WHY：完整来源若只缺浏览器证据，显式续做可重采；旧来源与失败审计仍只读。 */
export function canRecollectHybridSources(repository: TaskContractRepository, job: TaskAuthoringJob) {
  const parsed = exploration.safeParse(job.authoring?.exploration)
  if (!parsed.success || parsed.data.sources.length === 0) return false
  let needsEvidence = false
  for (const reference of parsed.data.sources) {
    const row = repository.artifact(job.taskId, reference.artifact.artifactId)
    if (row.runId !== job.id || row.mediaType !== hybridSourceMediaType
      || row.digest !== reference.artifact.digest || row.digest !== digestJson(row.body)) return false
    const source = readHybridSourceArtifact(row.body)
    if (!source.closed || !source.result.sourceSuccess) return false
    for (const issue of source.result.response.compilation.gaps) {
      if (issue.resolution !== "collect_evidence") return false
      needsEvidence = true
    }
  }
  return needsEvidence
}

/** WHY：复用已完整关闭的同版本来源；样本验证失败后的 compiled 来源仍可由修复后的编译器离线重编译，
 *  但部分探索不能在新 Browser 中假装接着执行。 */
export function reusableHybridSources(repository: TaskContractRepository, job: TaskAuthoringJob,
  requirement: TaskRequirement, plan: TaskPlan, progression: Progression, sourceJobId?: string) {
  const candidates = repository.jobs(job.taskId).filter((candidate) => candidate.id !== job.id && candidate.key === job.key
    && candidate.status === "failed" && ["compiling", "compiled"].includes(candidate.authoring?.stage ?? "")
    && (sourceJobId === undefined || candidate.id === sourceJobId))
  const reusable = candidates.toReversed().map((candidate) => ({ candidate,
    parsed: exploration.safeParse(candidate.authoring?.exploration) }))
    .find(({ parsed }) => parsed.success && parsed.data.sources.length === plan.steps.length)
  if (!reusable || !reusable.parsed.success) return undefined
  const previous = reusable.candidate, parsed = reusable.parsed
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
    if (!artifact.closed || !artifact.result.sourceSuccess
      || artifact.requirementDigest !== digestJson(requirement) || artifact.planDigest !== digestJson(plan)
      || artifact.stepId !== step.id || artifact.inputDigest !== digestJson(stepInput)) return undefined
    // WHY：编译 gap 是派生结果，可能来自已经修复的旧编译器；来源本身已通过身份和输出合同校验时，
    // 应交给当前编译器重新判定。预先信任旧 gap 会丢弃可恢复来源并无意义地再次启动浏览器。
    progression.accept(step.id, stepInput, artifact.result.output)
    sources.push({ step, stepInput, result: { ...artifact.result, modelCalls: artifact.modelCalls,
      forkSourceDigest: artifact.forkSourceDigest } })
  }
  progression.finish()
  return { sources, exploration: { ...parsed.data, reusedFromJobId: previous.id } }
}
