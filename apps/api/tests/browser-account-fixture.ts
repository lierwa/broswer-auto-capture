import { randomUUID, randomBytes } from "node:crypto"
import { createServer } from "node:http"
import { CONTRACT_VERSION, taskChainSchema, type TaskDataContract } from "@browser-capture/contracts"
import { identityContract, unit } from "../src/browser/account-runtime.js"
import type { createApplication } from "../src/app.js"

export function retainAccountTestTask(api: Awaited<ReturnType<typeof createApplication>>) {
  const taskId = api.coordinator.taskAction({ type: "create", requestId: randomUUID() })
  const id = randomUUID(), ownerId = randomUUID(), stamp = new Date().toISOString()
  return api.taskChain.repository.saveExecution({ contractVersion: CONTRACT_VERSION, kind: "execution", id, taskId,
    authorizationId: randomUUID(), plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) },
    requirement: { id: randomUUID(), version: 1, revision: 0, digest: "a".repeat(64) },
    input: null, inputDigest: "a".repeat(64), browser: { mode: "daily", headless: false },
    browserHandoff: { status: "active", purpose: "delivery", ownerId, leaseId: ownerId,
      targetDigest: "b".repeat(64), reason: null, updatedAt: stamp },
    status: "completed", sequence: 1, currentStepId: null, currentRunId: null, steps: [], output: null,
    reason: "受控测试保留窗口", createdAt: stamp, updatedAt: stamp })
}

// WHY：两种 DOM 是版本化测试链数据；实际登录由服务端随机会话决定，不用页面常量替代身份。
export function accountFixtureChain(url: string, layout: "alpha" | "beta" = "alpha") {
  const row: TaskDataContract = { id: "account-observation", version: 1, dialect: "bat-value-schema/v1", schema: {
    type: "array", items: { type: "object", properties: { state: { type: "string" }, identity: { type: "string" } },
      required: ["state", "identity"], additionalProperties: false }, maxItems: 1 } }
  const from = (nodeId: string) => ({ source: "node", nodeId, path: [] })
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v2",
    id: randomUUID(), taskId: randomUUID(), version: 1, plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) },
    stepId: "identity", name: "受控身份检查", inputContract: unit, outputContract: identityContract, variables: {}, entry: "fresh",
    nodes: [
      { id: "fresh", label: "新鲜加载身份页", kind: "capability", writes: [], outputContract: unit,
        capability: { name: "browser.workflow-step", version: 2 }, effect: "idempotent_write", timeoutMs: 30000,
        input: { url: { source: "constant", value: url }, new_tab: { source: "constant", value: false } },
        config: { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] } },
      { id: "read", label: "读取当前会话区域", kind: "capability", writes: [], outputContract: row,
        capability: { name: "browser.read-fields", version: 2 }, effect: "read", timeoutMs: 30000, input: {}, config: {
          specification: { container: layout === "alpha" ? "main" : "article", maxItems: 1, outputSchema: row.schema,
            fields: layout === "alpha" ? {
              state: { selector: "[data-state]", attribute: "data-state", valueType: "string" },
              identity: { selector: "[data-user]", attribute: "data-user", valueType: "string" } } : {
              state: { selector: ".session-status", attribute: null, valueType: "string" },
              identity: { selector: ".member-name", attribute: null, valueType: "string" } } } } },
      { id: "classify", label: "分类身份依据", kind: "function", language: "javascript", writes: [], outputContract: identityContract,
        inputs: { rows: from("read") }, timeoutMs: 1000, source: `function main({rows}) { const r=rows[0];
          if(r && r.state==='signed-in' && r.identity) return {outcome:'verified',identityConfirmed:true,displayIdentity:r.identity,reason:'identity_observed'};
          if(r && r.state==='signed-out') return {outcome:'unauthenticated',identityConfirmed:false,displayIdentity:'',reason:'login_required'};
          return {outcome:'inconclusive',identityConfirmed:false,displayIdentity:'',reason:r&&r.state==='challenge'?'challenge':'evidence_missing'}; }` },
      { id: "done", label: "检查完成", kind: "terminal", status: "completed", reason: "已取得本次检查事实", writes: [], outputContract: identityContract,
        result: { name: "identity", output: { kind: "value", value: from("classify") }, contract: identityContract }, evidence: [from("classify")] } ],
    edges: [{ from: "fresh", port: "success", to: "read" }, { from: "read", port: "success", to: "classify" }, { from: "classify", port: "success", to: "done" }],
    budget: { maxTransitions: 10, maxBrowserCommands: 10, maxActiveMs: 60000, maxLlmCalls: 0, maxInvocations: 1, maxDepth: 1 },
    completion: [{ id: "result", description: "身份结果输出", predicate: { operator: "exists", value: from("classify") } }],
    reuseBoundary: { description: "同一只读身份入口在不同会话复用", assumptions: ["页面结构稳定"], invalidationConditions: ["页面结构变化"] },
    implementationSummary: "服务端会话测试站点的版本化数据", validation: { status: "candidate", evidence: [] } })
}

export async function accountFixtureSite(layout: "alpha" | "beta" = "alpha", port = 0) {
  const password = randomBytes(24).toString("base64url"), sessions = new Map<string, string>()
  const state = { challenge: false, broken: false, requests: 0 }
  const server = createServer(async (request, response) => {
    state.requests++
    response.setHeader("Cache-Control", "no-store")
    if (request.method === "POST" && request.url === "/login") {
      let body = ""; for await (const chunk of request) body += String(chunk)
      const form = new URLSearchParams(body)
      if (form.get("password") !== password) { response.writeHead(403).end(); return }
      const token = randomBytes(32).toString("base64url")
      sessions.set(token, form.get("account") === "beta" ? "Test Beta" : "Test Alpha")
      response.setHeader("Set-Cookie", `session=${token}; HttpOnly; SameSite=Strict; Path=/`)
      response.writeHead(303, { Location: "/identity" }).end(); return
    }
    const token = request.headers.cookie?.match(/(?:^|; )session=([^;]+)/)?.[1]
    const identity = token ? sessions.get(token) ?? "" : ""
    const status = state.challenge ? "challenge" : identity ? "signed-in" : "signed-out"
    const region = state.broken ? "<main>Page changed</main>" : layout === "alpha"
      ? `<main><h1>Account</h1><div data-state="${status}">${status}</div><span id="account-name" data-user="${identity}">${identity}</span>${identity ? "" : '<a id="login-entry">Sign in</a>'}</main>`
      : `<article><h1>Session</h1><p class="session-status">${status}</p><strong class="member-name">${identity}</strong></article>`
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(`<!doctype html><title>Controlled account test</title>${region}<form action="/login" method="post">
      <input name="account" value="alpha"><input type="password" name="password"><button>Sign in</button></form>`)
  })
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve) })
  const address = server.address() as { port: number }
  return { url: `http://127.0.0.1:${address.port}/identity`, password, state, expire: () => sessions.clear(),
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}
