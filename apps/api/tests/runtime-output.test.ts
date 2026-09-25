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
