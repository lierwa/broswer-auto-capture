import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { legacyCapabilities } from "../src/upstream-browser/legacy-capabilities.js"
import { requiredLegacyNodeOutcomes, type ChainNode, type TaskCheckpoint } from "@browser-capture/contracts"

const unit = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
const reference = { id: randomUUID(), version: 1, digest: "a".repeat(64) }
const binding = { runId: randomUUID(), invocationId: randomUUID(), taskId: "legacy-sample", authorizationId: randomUUID(),
  plan: reference, chain: reference, inputDigest: "b".repeat(64) }
const browser = { sessionId: randomUUID(), tabId: "native-owned-target", url: "https://example.test/",
  observedAt: new Date().toISOString(), observationDigest: "a".repeat(64) }
const node = (operation: Extract<ChainNode, { kind: "browser" }>["operation"]) => ({ id: "action", label: "action",
  kind: "browser" as const, operation, arguments: {}, timeoutMs: 1000,
  outcomes: [...requiredLegacyNodeOutcomes.browser], outputContract: unit, writes: [] })

test("旧节点通过一个受管端口保留输出和原生身份，无第二会话或模型", async () => {
  const calls: unknown[] = []
  const capabilities = legacyCapabilities({ async request(command) {
    calls.push(command)
    return { output: null, browser, tabId: 17, text: "changed", truncated: false }
  } })
  const signal = new AbortController().signal
  const result = await capabilities.browser!({ binding, idempotencyKey: "fill", node: node("fill"), arguments: { value: "changed" },
    target: { kind: "locator", strategy: "css", value: "#field" }, signal })
  assert.equal(result.outcome, "success")
  assert.equal(result.output, null)
  assert.deepEqual(result.browser, browser)
  assert.deepEqual(calls, [{ type: "fill", target: { selector: "#field" }, value: "changed" }])
  const unsupported = await capabilities.browser!({ binding, idempotencyKey: "drag", node: node("drag"), arguments: {}, signal })
  assert.equal(unsupported.outcome, "blocked")
  assert.equal(calls.length, 1)
})

test("旧 target 读取沿原解析器过滤私密字段，截断与实际时间保留", async () => {
  const capabilities = legacyCapabilities({ async request() {
    return { output: { html: '<p class="row">changed</p><input value="secret">', truncated: true },
      browser, tabId: 17, text: "changed", truncated: false }
  } })
  const result = await capabilities.observe!({ binding, node: { id: "read", label: "read", kind: "observe", scope: "target",
    stableWhen: { operator: "exists", path: [] }, timeoutMs: 1000, outcomes: [...requiredLegacyNodeOutcomes.observe],
    outputContract: unit, writes: [] }, target: { kind: "locator", strategy: "css", value: ".row" }, signal: new AbortController().signal })
  assert.deepEqual(result.output, { url: browser.url, observedAt: browser.observedAt,
    matches: [{ text: "changed", tag: "p", attributes: { class: "row" } }], truncated: true })
})

test("旧失败路由保留missing/ambiguous及外部限制，人工等待复用原现场身份", async () => {
  const signal = new AbortController().signal
  for (const [code, outcome, reason] of [
    ["ordinary_target_missing", "missing", "target_missing"],
    ["ambiguous_stable_target", "failed", "target_ambiguous"],
    ["capture_authentication_required", "human_required", "authentication_required"],
    ["capture_rate_limited", "blocked", "rate_limited"],
  ]) {
    const capabilities = legacyCapabilities({ inspect: async () => browser,
      request: async () => { throw new Error(`hybrid_runner_failed:RuntimeError:${code}`) } })
    const result = await capabilities.browser!({ binding, idempotencyKey: "click", node: node("click"), arguments: {},
      target: { kind: "locator", strategy: "css", value: "#button" }, signal })
    assert.equal(result.outcome, outcome)
    assert.equal(result.reason, reason)
    assert.deepEqual(result.browser, browser)
  }
  const capabilities = legacyCapabilities({ request: async () => ({ output: null, browser, tabId: 17, text: "waiting", truncated: false }) })
  const checkpoint = { browser, resumeWhen: { operator: "equals", path: ["text"], expected: "ready" } } as unknown as TaskCheckpoint
  assert.equal((await capabilities.verifyResume!(checkpoint, signal)).ok, true)
  assert.equal((await capabilities.verifyResume!({ ...checkpoint, browser: { ...browser, tabId: "foreign" } }, signal)).ok, false)
  const result = await capabilities.human!({ binding, node: { id: "human", label: "human", kind: "human", reason: "confirmation",
    prompt: "确认页面后继续", timeoutMs: 1000, outcomes: [...requiredLegacyNodeOutcomes.human],
    outputContract: unit, writes: [], resumeWhen: { operator: "exists", path: [] } }, checkpoint,
    resuming: false, resumeCondition: { operator: "equals", path: ["text"], expected: "ready" }, signal })
  assert.equal(result.outcome, "human_required")
  assert.deepEqual(result.browser, browser)
})
