import { taskChainSchema, type TaskDataContract } from "@browser-capture/contracts"
import type { Platform } from "@browser-capture/contracts/platform-account"
import { platformChain, platformResultContract } from "./platform-chain.js"
import { unit } from "./account-runtime.js"
export const accountWaitInput: TaskDataContract = { id: "account-login-intent", version: 1, dialect: "bat-value-schema/v1",
  schema: { type: "object", properties: { expectedIdentityKey: { type: "string" }, expectedDisplayIdentity: { type: "string" }, switching: { type: "boolean" } },
    required: ["expectedIdentityKey", "expectedDisplayIdentity", "switching"], additionalProperties: false } }

/** WHY：有界登录观察由原 LangGraph loop 推进；间隔是普通等待能力，不另造轮询调度器。 */
export function accountWaitChain(platform: Platform, version: string, digest: string) {
  const base = platformChain(platform, version, digest)
  const original = platformResultContract.schema
  if (original.type !== "object") throw new Error("account_result_contract_invalid")
  const output: TaskDataContract = { ...platformResultContract, id: "account-login-observation", schema: {
    ...original, properties: { ...original.properties, pending: { type: "boolean" } }, required: [...original.required!, "pending"] } }
  const read = (id: string) => ({ id, label: "只读观察网站登录", kind: "capability", writes: [{ variable: "latest", path: [] }],
    outputContract: output, capability: { name: "browser.imported-read", version: 1 }, input: {},
    config: { platformId: platform.id, catalogVersion: version, sourceDigest: digest, action: "observe" }, effect: "read", timeoutMs: 20000 })
  const pending = (id: string) => ({ operator: "equals", left: { source: "node", nodeId: id, path: ["pending"] }, right: { source: "constant", value: true } })
  const last = { source: "variable", name: "latest", path: [] }
  return taskChainSchema.parse({ ...base, inputContract: accountWaitInput, stepId: "wait-session", name: `${platform.name}登录确认`,
    outputContract: output, variables: { cursor: { id: "cursor", version: 1, dialect: "bat-value-schema/v1", schema: { type: "integer", minimum: 0 } }, latest: output },
    entry: "initial", nodes: [read("initial"),
      { id: "poll", label: "等待用户登录", kind: "loop", writes: [], outputContract: unit,
        iteration: { mode: "while", condition: pending("initial"), repeatCondition: pending("check") },
        cursorVariable: "cursor", maxIterations: 99, body: { entry: "interval", exits: ["check"] } },
      { id: "interval", label: "观察间隔", kind: "capability", writes: [], outputContract: unit,
        capability: { name: "account.wait", version: 1 }, input: {}, config: { delayMs: 3000 }, effect: "read", timeoutMs: 4000 },
      read("check"),
      { id: "done", label: "保存登录观察", kind: "terminal", writes: [], outputContract: output, status: "completed", reason: "观察已取得有效登录",
        result: { name: "session", output: { kind: "value", value: last }, contract: output }, evidence: [last] },
      { id: "timeout", label: "等待超时", kind: "terminal", writes: [], outputContract: unit, status: "blocked", reason: "account_login_timeout",
        evidence: [{ source: "constant", value: "account_login_timeout" }] },
    ], edges: [{ from: "initial", port: "success", to: "poll" }, { from: "poll", port: "body", to: "interval" },
      { from: "interval", port: "success", to: "check" }, { from: "check", port: "success", to: "poll" },
      { from: "poll", port: "done", to: "done" }, { from: "poll", port: "limit", to: "timeout" }],
    completion: [{ id: "authenticated", description: "网站实际确认登录", predicate: { operator: "equals",
      left: { source: "variable", name: "latest", path: ["status"] }, right: { source: "constant", value: "authenticated" } } }],
    budget: { maxTransitions: 410, maxBrowserCommands: 1024, maxActiveMs: 300000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 } })
}
