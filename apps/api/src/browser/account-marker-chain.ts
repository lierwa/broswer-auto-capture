import { randomUUID } from "node:crypto"
import { CONTRACT_VERSION, taskChainSchema, type TaskDataContract, type TaskChain } from "@browser-capture/contracts"
import { unit } from "./account-runtime.js"
import { platformResultContract } from "./platform-chain.js"

/** WHY：用户声明标识含义，宿主仅组合已有navigate/read-fields/QuickJS节点；没有新检查DSL。 */
export function markerChain(url: string, selector: string, meaning: "account" | "login", previous: TaskChain | null) {
  const rows: TaskDataContract = { id: "selected-marker", version: 1, dialect: "bat-value-schema/v1", schema: {
    type: "array", maxItems: 1, items: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false } } }
  const from = (nodeId: string) => ({ source: "node", nodeId, path: [] })
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v2",
    id: previous?.id ?? randomUUID(), taskId: previous?.taskId ?? randomUUID(), version: (previous?.version ?? 0) + 1,
    plan: previous?.plan ?? { id: randomUUID(), version: 1, digest: "0".repeat(64) }, stepId: "selected-marker", name: "用户绑定的页面登录标识",
    inputContract: unit, outputContract: platformResultContract, variables: {}, entry: "fresh",
    nodes: [
      { id: "fresh", label: "新鲜加载已绑定账号页", kind: "capability", writes: [], outputContract: unit,
        capability: { name: "browser.workflow-step", version: 2 }, effect: "idempotent_write", timeoutMs: 30000,
        input: { url: { source: "constant", value: url }, new_tab: { source: "constant", value: false } },
        config: { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] } },
      { id: "read", label: "读取用户选定的页面标识", kind: "capability", writes: [], outputContract: rows,
        capability: { name: "browser.read-fields", version: 2 }, effect: "read", timeoutMs: 15000, input: {},
        config: { specification: { container: "body", maxItems: 1, outputSchema: rows.schema,
          fields: { text: { selector, attribute: null, valueType: "string" } } } } },
      { id: "classify", label: "按用户声明的标识含义分类", kind: "function", language: "javascript", writes: [], outputContract: platformResultContract,
        inputs: { rows: from("read") }, timeoutMs: 1000, source: `function main({rows}) { const text=(rows[0]?.text||'').trim();
          return {status:text?'${meaning === "account" ? "authenticated" : "unauthenticated"}':'inconclusive',identityConfirmed:false,identityKey:'',
          displayIdentity:${meaning === "account" ? "text.slice(0,120)" : "''"},reason:text?'${meaning === "account" ? "identity_observed" : "login_required"}':'evidence_missing',
          evidence:['user_bound_marker'],sources:[],modelCalls:0,globalInitSuppressed:false}; }` },
      { id: "done", label: "保存本次检查结论", kind: "terminal", status: "completed", reason: "用户绑定标识读取完成", writes: [], outputContract: platformResultContract,
        result: { name: "identity", output: { kind: "value", value: from("classify") }, contract: platformResultContract }, evidence: [from("classify")] } ],
    edges: [{ from: "fresh", port: "success", to: "read" }, { from: "read", port: "success", to: "classify" }, { from: "classify", port: "success", to: "done" }],
    budget: { maxTransitions: 8, maxBrowserCommands: 5, maxActiveMs: 60000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    completion: [{ id: "result", description: "取得选定标识的结果", predicate: { operator: "exists", value: from("classify") } }],
    reuseBoundary: { description: "固定账号页的用户指定标识", assumptions: ["所选标识仅在声明的登录状态可见"], invalidationConditions: ["标识结构或含义变化"] },
    implementationSummary: "原生Chrome选取+原只读能力；不确认稳定UID，不共享认证状态", validation: { status: "candidate", evidence: [] } })
}
