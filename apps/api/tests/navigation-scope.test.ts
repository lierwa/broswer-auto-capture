import assert from "node:assert/strict"
import test from "node:test"
import { emptyInterview } from "@browser-capture/contracts/interview"
import { recordUserProvidedSources, projectProvidedDraftSources, assertRequirementReady } from "../src/interview/source-resolution.js"
import { InterviewSourceReferences } from "../src/interview/source-references.js"
import { confirmedNavigationScope, planNavigationPolicy } from "../src/task-chain/navigation-scope.js"
import { isWithinAllowedSites } from "../src/upstream-browser/site-scope.js"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { capabilityEffectChain } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"

// 保护原始失败：入口不变，用户已确认的额外来源必须成为执行权限；正文/输入中的 URL 不授予权限。
test("原入口与确认的跳转范围分别保存，授权守卫仍拒绝越界", () => {
  const state = structuredClone(emptyInterview)
  recordUserProvidedSources(state, "从 https://localhost:4185 开始，允许 *.shield.localhost:4185；资料 https://unrelated.example/ 只作参考", 1)
  const refs = new InterviewSourceReferences(1, state)
  const candidates = refs.available()
  const entry = candidates.find(item => item.url === "https://localhost:4185/")!
  const scope = candidates.find(item => item.url === "https://*.shield.localhost:4185/")!
  assert.ok(scope, "明确的通配来源不能丢失")
  const body = refs.materialize(`## 试做入口\n1. [起点][${entry.ref}]\n## 访问范围\n- [起点][${entry.ref}]\n- [跳转站点][${scope.ref}]\n## 其他\n资料 https://unrelated.example/`)
  const selected = projectProvidedDraftSources(state, body)
  assertRequirementReady(selected, body, true)
  const policy = confirmedNavigationScope(selected, body)
  assert.equal(isWithinAllowedSites("https://localhost:4185/", policy.sites), true)
  assert.equal(isWithinAllowedSites("https://case-123.shield.localhost:4185/measurement/check", policy.sites), true)
  for (const url of ["http://case-123.shield.localhost:4185/", "https://case-123.shield.localhost:4186/",
    "https://shield.localhost.evil.example:4185/", "https://other.localhost:4185/", "https://unrelated.example/",
    "https://user:pass@case-123.shield.localhost:4185/"]) assert.equal(isWithinAllowedSites(url, policy.sites), false, url)
  const plan = { entryUrls: ["https://localhost:4185/"], navigationScope: policy }
  assert.deepEqual(planNavigationPolicy(plan).allowedSites, policy.sites)
  assert.equal(plan.entryUrls[0], "https://localhost:4185/")
})

test("未确认或伪造的访问范围拒绝，通配符不能作为可导航入口", () => {
  const state = structuredClone(emptyInterview)
  recordUserProvidedSources(state, "https://example.org/ https://*.example.net/", 1)
  for (const body of ["## 试做入口\n1. https://example.org/\n## 访问范围\n- https://evil.example/",
    "## 试做入口\n1. https://*.example.net/\n## 访问范围\n- https://*.example.net/"]) {
    const selected = projectProvidedDraftSources(state, body)
    assert.throws(() => { assertRequirementReady(selected, body, true); confirmedNavigationScope(selected, body) })
  }
})

test("旧版本保持入口派生权限，不从运行数据或链路 URL 追加权限", () => {
  const plan = { entryUrls: ["https://example.com/"] }
  const policy = planNavigationPolicy(plan)
  assert.equal(isWithinAllowedSites("https://login.example.com/result", policy.allowedSites), true)
  assert.equal(isWithinAllowedSites("https://other.example.org/", policy.allowedSites), false)
  assert.throws(() => planNavigationPolicy({}), /navigation_scope_unconfirmed/u)
  assert.equal(Object.hasOwn(plan, "navigationScope"), false, "读取旧版本不能改写历史合同")
})

test("真实 RuntimeHost 从计划取权限，业务 URL 与节点 URL 都不能扩权", async () => {
  const chain = capabilityEffectChain()
  for (const node of chain.nodes) if (node.kind === "capability") {
    node.capability = { name: "browser.workflow-step", version: 2 }
    node.config = { actionName: "navigate", target: null, postconditions: [] }
    node.input = { url: { source: "constant", value: "https://node-data.example/" } }
  }
  let observed: string[] | undefined
  const upstream: UpstreamBrowserRuntime = { async withCapabilities(input, work) {
    observed = input.allowedOrigins
    assert.equal(isWithinAllowedSites("https://input-data.example/", input.allowedSites!), false)
    assert.equal(isWithinAllowedSites("https://node-data.example/", input.allowedSites!), false)
    return work({})
  } }
  const host = new TaskRuntimeHost({} as never, {} as never, undefined, upstream)
  const consumed = { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }
  await host.group({ taskId: chain.taskId, authorizationId: "auth", browserRunId: "owner", requirementVersion: 1,
    purpose: "replay", chains: [chain], input: { url: "https://input-data.example/" }, signal: new AbortController().signal,
    budget: chain.budget, consumed, scopeConsumption: {}, navigationPlan: { entryUrls: ["https://confirmed.example/"] } }, async () => {})
  assert.deepEqual(observed, ["https://confirmed.example"])
})
