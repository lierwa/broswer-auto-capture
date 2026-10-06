import { randomUUID } from "node:crypto"
import { CONTRACT_VERSION, taskChainSchema, type TaskDataContract } from "@browser-capture/contracts"
import { type Platform } from "@browser-capture/contracts/platform-account"
import { unit } from "./account-runtime.js"

export const platformResultContract: TaskDataContract = { id: "platform-session-result", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: {
    status: { type: "string", enum: ["authenticated", "unauthenticated", "inconclusive"] }, reason: { type: "string" },
    identityKey: { type: "string" }, displayIdentity: { type: "string" }, identityConfirmed: { type: "boolean" },
    evidence: { type: "array", items: { type: "string" } }, sources: { type: "array", items: { type: "object",
      properties: { package: { type: "string" }, commit: { type: "string" }, file: { type: "string" }, callable: { type: "string" }, startLine: { type: "integer" }, endLine: { type: "integer" } },
      required: ["package", "commit", "file", "callable", "startLine", "endLine"], additionalProperties: false } },
    modelCalls: { type: "integer", minimum: 0, maximum: 0 }, globalInitSuppressed: { type: "boolean" },
  }, required: ["status", "reason", "identityKey", "displayIdentity", "identityConfirmed", "evidence", "sources", "modelCalls", "globalInitSuppressed"],
  additionalProperties: false } }

/** WHY：固定来源是版本化链路数据；每次按钮检查仍是原TaskChainRuntime/LangGraph独立运行。 */
export function platformChain(platform: Platform, catalogVersion: string, sourceDigest: string, action: "check" | "observe" = "check") {
  const source = { source: "node", nodeId: "check", path: [] }
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v2",
    id: randomUUID(), taskId: randomUUID(), version: 1,
    plan: { id: randomUUID(), version: 1, digest: sourceDigest }, stepId: `${action}-session`,
    name: `${platform.name}登录检查`, inputContract: unit, outputContract: platformResultContract,
    variables: {}, entry: "check", nodes: [
      { id: "check", label: "运行固定来源的只读会话检查", kind: "capability", writes: [],
        outputContract: platformResultContract, capability: { name: "browser.imported-read", version: 1 },
        input: {}, config: { platformId: platform.id, catalogVersion, sourceDigest, source: platform.source, action },
        effect: "read", timeoutMs: action === "observe" ? 20000 : 60000 },
      { id: "done", label: "保存本次检查事实", kind: "terminal", status: "completed", reason: "本次登录检查已结束",
        writes: [], outputContract: platformResultContract,
        result: { name: "session", output: { kind: "value", value: source }, contract: platformResultContract }, evidence: [source] },
    ], edges: [{ from: "check", port: "success", to: "done" }],
    budget: { maxTransitions: 4, maxBrowserCommands: 64, maxActiveMs: 65000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    completion: [{ id: "session-result", description: "已取得本次检查输出", predicate: { operator: "exists", value: source } }],
    reuseBoundary: { description: "同一平台策略在选定Profile执行", assumptions: ["固定来源及平台范围"],
      invalidationConditions: ["平台策略版本变化"] }, implementationSummary: "固定检查来源适配，无模型",
    validation: { status: "candidate", evidence: [] } })
}
