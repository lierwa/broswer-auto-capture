import { randomUUID } from "node:crypto"
import { CONTRACT_VERSION, type TaskChain, type TaskRun, type TaskDataContract, type JsonValue } from "@browser-capture/contracts"
import { TaskChainRuntime, digestJson, executableChainDigest, type TaskChainCapabilities } from "@browser-capture/runtime"
import { identityResultSchema, type IdentityResult } from "@browser-capture/contracts/browser-account"
import { DomainError } from "../errors.js"

export const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1", schema: { type: "null" } }
export const identityContract: TaskDataContract = { id: "browser-identity-result", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: { outcome: { type: "string", enum: ["verified", "unauthenticated", "inconclusive"] },
    identityConfirmed: { type: "boolean" }, displayIdentity: { type: "string", maxLength: 120 },
    reason: { type: "string", enum: ["identity_observed", "login_required", "challenge", "evidence_missing", "page_changed"] } },
  required: ["outcome", "identityConfirmed", "displayIdentity", "reason"], additionalProperties: false } }

export function admitAccountChain(chain: TaskChain, url: string) {
  if (chain.inputContract.schema.type !== "null" || chain.budget.maxLlmCalls !== 0) throw new Error("account_check_input_or_model_invalid")
  const entry = chain.nodes.find(node => node.id === chain.entry)
  if (entry?.kind !== "capability" || entry.capability.name !== "browser.workflow-step") throw new Error("account_fresh_navigation_required")
  for (const node of chain.nodes) {
    if (["function", "branch", "terminal"].includes(node.kind)) continue
    if (node.kind !== "capability") throw new Error("account_read_only_chain_required")
    const config = node.config as Record<string, unknown>
    if (node.capability.name === "browser.workflow-step") {
      if (config.actionName !== "navigate" || node.input.url?.source !== "constant"
        || typeof node.input.url.value !== "string" || new URL(node.input.url.value).href !== new URL(url).href) throw new Error("account_navigation_scope_invalid")
    } else if (node.capability.name !== "browser.read-fields" || node.effect !== "read") throw new Error("account_read_only_chain_required")
  }
}

/** WHY：只在能力边界限制副作用；Function/Branch/图调度仍全部归现有运行器。 */
export function readOnlyCapabilities(capabilities: TaskChainCapabilities, url: string): TaskChainCapabilities {
  return { ...capabilities, async capability(invocation) {
    const config = invocation.config as Record<string, unknown>
    const name = invocation.node.capability.name
    if (name === "browser.workflow-step" && (config.actionName !== "navigate" || typeof invocation.input.url !== "string"
      || new URL(invocation.input.url).href !== new URL(url).href
      || invocation.input.new_tab === true)) {
      throw new DomainError("account_read_only_required", "账号检查只允许新鲜加载已确认的身份入口和读取页面。", 409)
    }
    if (name !== "browser.workflow-step" && name !== "browser.read-fields") throw new Error("account_capability_denied")
    return capabilities.capability!.call(capabilities, invocation)
  } }
}

export function accountRequest(chain: TaskChain, runId: string, ownerId: string, input: JsonValue = null) {
  return { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "replay", input,
    binding: { runId, invocationId: randomUUID(), taskId: chain.taskId, authorizationId: ownerId,
      plan: chain.plan, chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(input) } }
}
export function executeAccount(chain: TaskChain, runId: string, ownerId: string, url: string,
  capabilities: TaskChainCapabilities, signal: AbortSignal, persist: (run: TaskRun) => void) {
  admitAccountChain(chain, url)
  return new TaskChainRuntime().execute({ chain, request: accountRequest(chain, runId, ownerId),
    capabilities: { ...readOnlyCapabilities(capabilities, url), persist }, control: { signal } })
}
export function accountResult(run: TaskRun, redact = true): IdentityResult {
  if (run.status !== "completed" || run.consumed.llmCalls !== 0 || !run.auditComplete) return unknownResult("runtime_failed")
  const output = Object.values(run.outputs)[0]
  const value = output?.kind === "value" ? output.value : undefined
  const normalized = value && typeof value === "object" && !Array.isArray(value)
    ? { ...value, displayIdentity: value.displayIdentity || null } : value
  const parsed = identityResultSchema.safeParse(normalized)
  return parsed.success ? { ...parsed.data, displayIdentity: parsed.data.displayIdentity && redact ? displayAccountIdentity(parsed.data.displayIdentity) : parsed.data.displayIdentity }
    : unknownResult("invalid_output")
}
export function displayAccountIdentity(value: string) {
  return value.replace(/([\w.+-])[\w.+-]*(@[\w.-]+\.[A-Za-z]{2,})/g, "$1***$2")
    .replace(/\b(\d{3})\d{4,8}(\d{2})\b/g, "$1****$2")
}
export function unknownResult(reason: IdentityResult["reason"]): IdentityResult {
  return { outcome: "inconclusive", identityConfirmed: false, displayIdentity: null, reason }
}
