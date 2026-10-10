import assert from "node:assert/strict"
import test from "node:test"
import { runtimeOutputEnvelope } from "../src/task-chain/runtime-host.js"
import { hybridCapabilityOutput, hybridExternalFailure } from "../src/upstream-browser/hybrid-runtime.js"

test("显式 llm 的标量结果跨供应商对象根边界后保留严格动态类型", () => {
  const result = runtimeOutputEnvelope({ type: "string", enum: ["completed", "not_completed"] })
  assert.equal(result.jsonSchema.type, "object")
  assert.deepEqual(result.jsonSchema.required, ["result"])
  assert.equal(result.parse({ result: "completed" }), "completed")
  assert.throws(() => result.parse("completed"))
  assert.throws(() => result.parse({ result: "unknown" }))
  assert.throws(() => result.parse({ result: "completed", unrelated: true }))
})

test("普通浏览器动作的供应商回执不会污染 unit 节点输出", () => {
  const unit = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "null" as const } }
  const record = { id: "record", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "object" as const, properties: {}, required: [], additionalProperties: true } }
  const receipt = { clicked: true }
  assert.equal(hybridCapabilityOutput(unit, receipt), null)
  assert.equal(hybridCapabilityOutput(record, receipt), receipt)
})

test("hybrid 主文档认证等待与外部阻断使用不同结果", () => {
  const browser = { sessionId: "session", tabId: "tab", url: "https://example.com/private",
    observationDigest: "a".repeat(64), observedAt: "2026-09-20T00:00:00.000Z" }
  const authentication = hybridExternalFailure(
    new Error("hybrid_runner_failed:RuntimeError:capture_authentication_required"), browser)
  assert.equal(authentication?.outcome, "human_required")
  assert.deepEqual(authentication?.externalFailure, { category: "authentication", code: "authentication_required",
    origin: "https://example.com", observedOrigin: "https://example.com", httpStatus: 401, retryAt: null })
  const limited = hybridExternalFailure(new Error("hybrid_runner_failed:RuntimeError:capture_rate_limited"), browser)
  assert.equal(limited?.outcome, "blocked")
  assert.equal(limited?.externalFailure?.category, "rate_limited")
  assert.equal(hybridExternalFailure(new Error("ordinary_target_missing"), browser), null)
})

test("主文档5xx保留实际状态并归为外部暂时阻断，不扩大到4xx或非法状态", () => {
  for (const status of [500, 503, 599]) {
    const result = hybridExternalFailure(new Error(`hybrid_runner_failed:RuntimeError:capture_server_error_${status}`), null)
    assert.equal(result?.outcome, "blocked")
    assert.equal(result?.externalFailure?.category, "transient")
    assert.equal(result?.externalFailure?.httpStatus, status)
    assert.equal(result?.externalFailure?.retryAt, null)
  }
  for (const status of [499, 600, 5030]) {
    assert.equal(hybridExternalFailure(new Error(`capture_server_error_${status}`), null), null)
  }
})

test('显式挑战进入原verification人工等待，保留实际HTTP状态；普通403仍阻断', () => {
  for (const status of [200, 403, 503]) {
    const result = hybridExternalFailure(new Error(`capture_verification_required_${status}`), null)
    assert.equal(result?.outcome, 'human_required')
    assert.equal(result?.externalFailure?.category, 'verification')
    assert.equal(result?.externalFailure?.httpStatus, status)
  }
  assert.equal(hybridExternalFailure(new Error('capture_access_denied'), null)?.outcome, 'blocked')
  for (const suffix of ['', '_99', '_600', '_4030'])
    assert.equal(hybridExternalFailure(new Error('capture_verification_required'+suffix), null), null)
})
