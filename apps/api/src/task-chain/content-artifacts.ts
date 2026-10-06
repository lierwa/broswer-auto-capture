import { jsonValueSchema, pageContentSchema, type JsonValue, type NodeCapabilityResult } from "@browser-capture/contracts"
import type { TaskContractRepository } from "./repository.js"

/** WHY：产物复用本地 Artifact 事实源；原图不进日志，不另建文件或工作流存储。 */
export function persistContentArtifacts(repository: TaskContractRepository, taskId: string, runId: string,
  config: JsonValue, result: NodeCapabilityResult): NodeCapabilityResult {
  if (result.outcome !== "success" || !config || typeof config !== "object" || Array.isArray(config)
    || !config.specification || typeof config.specification !== "object" || Array.isArray(config.specification)) return result
  const fields = config.specification.fields
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return result
  const names = Object.entries(fields).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value)
    && value.contentSource === "page-content").map(([name]) => name)
  if (!names.length) return result
  const records = Array.isArray(result.output) ? result.output : [result.output]
  const artifacts = records.flatMap(record => names.map(name => {
    if (!record || typeof record !== "object" || Array.isArray(record) || typeof record[name] !== "string") {
      throw new Error("content_artifact_value_invalid")
    }
    const body = pageContentSchema.parse(JSON.parse(record[name]))
    return repository.saveArtifact(taskId, runId, "application/vnd.bat.page-content+json", jsonValueSchema.parse(body))
  }))
  return { ...result, artifacts: [...result.artifacts ?? [], ...artifacts] }
}
