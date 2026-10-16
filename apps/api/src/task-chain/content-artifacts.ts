import { createHash } from "node:crypto"
import { z } from "zod"
import { jsonValueSchema, pageContentSchema, type JsonValue, type NodeCapabilityResult } from "@browser-capture/contracts"
import type { TaskContractRepository } from "./repository.js"

/** WHY：产物复用本地 Artifact 事实源；原图不进日志，不另建文件或工作流存储。 */
export function persistContentArtifacts(repository: TaskContractRepository, taskId: string, runId: string,
  config: JsonValue, result: NodeCapabilityResult): NodeCapabilityResult {
  if (result.outcome === "success" && config && typeof config === "object" && !Array.isArray(config)
    && config.nativeFileOutput === true) return persistNativeFiles(repository, taskId, runId, result)
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

const nativeFileBodySchema = z.object({ format: z.literal("bat-native-file/v1"),
  fileName: z.string().min(1).max(255), mediaType: z.string().min(1).max(200),
  digest: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  bytesBase64: z.string().min(1).max(90 * 1024 * 1024) }).strict()

function persistNativeFiles(repository: TaskContractRepository, taskId: string, runId: string,
  result: NodeCapabilityResult): NodeCapabilityResult {
  const value = z.object({ text: z.string(), files: z.array(nativeFileBodySchema).max(100) }).strict().parse(result.output)
  // WHY：先核完所有字节，避免一份非法产物让同批剩余路径被误当成已持久化附件。
  for (const file of value.files) {
    const bytes = Buffer.from(file.bytesBase64, "base64")
    if (bytes.toString("base64") !== file.bytesBase64 || bytes.length !== file.byteLength
      || createHash("sha256").update(bytes).digest("hex") !== file.digest) {
      throw new Error("native_file_artifact_digest_mismatch")
    }
  }
  const files = value.files.map(file => repository.saveArtifact(taskId, runId,
    "application/vnd.bat.native-file+json;version=1", jsonValueSchema.parse(file)))
  return { ...result, output: { text: value.text, files }, artifacts: [...result.artifacts ?? [], ...files] }
}
