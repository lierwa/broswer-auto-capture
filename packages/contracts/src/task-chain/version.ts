import { z } from "zod"
import { CONTRACT_VERSION } from "./common.js"
import { taskChainSchema } from "./chain.js"
import { taskPlanSchema } from "./plan.js"
import { taskRequirementSchema } from "./requirement.js"
import { taskRunSchema } from "./run.js"
import { jsonValueSchema, type JsonValue } from "./value.js"

export const taskContractSchema = z.union([taskRequirementSchema, taskPlanSchema, taskChainSchema, taskRunSchema])
export type TaskContract = z.infer<typeof taskContractSchema>
export type ContractReadResult =
  | { status: "current"; originalJson: string; record: TaskContract }
  | { status: "legacy_read_only"; originalJson: string; raw: JsonValue; reason: "missing_contract_version" }
  | { status: "unsupported_version"; originalJson: string; raw: JsonValue; version: JsonValue }
  | { status: "invalid"; originalJson: string; reason: "invalid_json" | "invalid_contract" }

/** WHY：不通过旧 parser 填默认值，不重写原件，不把解析失败伪装成空数据库。 */
export function readTaskContractJson(originalJson: string): ContractReadResult {
  let raw: JsonValue
  try { raw = jsonValueSchema.parse(JSON.parse(originalJson)) }
  catch { return { status: "invalid", originalJson, reason: "invalid_json" } }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw) || !Object.hasOwn(raw, "contractVersion")) {
    return { status: "legacy_read_only", originalJson, raw, reason: "missing_contract_version" }
  }
  if (raw.contractVersion !== CONTRACT_VERSION) {
    return { status: "unsupported_version", originalJson, raw, version: raw.contractVersion! }
  }
  const parsed = taskContractSchema.safeParse(raw)
  return parsed.success ? { status: "current", originalJson, record: parsed.data }
    : { status: "invalid", originalJson, reason: "invalid_contract" }
}

/** 只给新消费者返回已校验的新合同；current 不代表已编译、获授权或可运行。 */
export function requireCurrentTaskContract(result: ContractReadResult): TaskContract {
  if (result.status !== "current") throw new Error(`task_contract_${result.status}`)
  return taskContractSchema.parse(result.record)
}
