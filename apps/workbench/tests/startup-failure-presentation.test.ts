import assert from "node:assert/strict"
import test from "node:test"
import { executionFailureReason } from "../src/ExecutionPresentation.js"

// WHY：脱敏诊断中有固定错误码时，不能把真实首次失败覆盖成“未记录”。
test("已记录的启动租约错误可读，并兼容缺失诊断的历史运行", () => {
  const execution = { status: "failed" as const, result: null,
    reason: "运行失败：hybrid_runner_failed:ValueError:hybrid_attached_window_busy" }
  const reason = executionFailureReason(execution, { stage: "reserve", occurredAt: "2026-10-04T15:11:33.923Z",
    errorKind: "value_error", code: "hybrid_attached_window_busy" })
  assert.match(reason, /租约|占用/)
  assert.doesNotMatch(reason, /未记录/)
  assert.match(executionFailureReason(execution, null), /租约|占用/)
})

test("已记录的外部异常类型不被说成没有记录", () => {
  const reason = executionFailureReason({ status: "failed", result: null }, {
    stage: "sdk_connect", occurredAt: "2026-10-04T15:11:33.923Z", errorKind: "value_error", code: "external_error" })
  assert.match(reason, /校验/)
  assert.doesNotMatch(reason, /未记录/)
})
