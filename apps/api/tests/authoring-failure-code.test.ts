import assert from "node:assert/strict"
import test from "node:test"
import { DomainError } from "../src/errors.js"
import { authoringFailureCode, authoringFailureMessage, failureLayer } from "../src/task-chain/authoring-failure.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES, RuntimeCleanupRequiredError } from "../src/upstream-browser/cleanup.js"

// WHY：保留启动/协议原因，同时阻止异常正文中的页面、地址和凭据进入持久化诊断。
test("准备失败代码保留确定原因，剔除异常正文", () => {
  assert.equal(authoringFailureCode(new DomainError("daily_chrome_connection_paused", "sensitive text")),
    "daily_chrome_connection_paused")
  assert.equal(authoringFailureCode(new Error("upstream_start_failed:TimeoutError:https://user:secret@example.test")),
    "upstream_start_failed:TimeoutError")
  assert.equal(authoringFailureCode(new Error("browser text with secret")), "authoring_failure_unclassified")
})

test("业务失败与清理失败分别投影，清理不能伪装成浏览器启动失败", () => {
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map(stage => stage === "close_protocol"
    ? { stage, status: "unconfirmed", code: "cleanup_close_protocol_timeout" }
    : { stage, status: "confirmed", code: null }), false)
  const business = new Error("hybrid_completed_source_required:navigate:1")
  const both = new RuntimeCleanupRequiredError("owner", report, { status: "failed", error: business })
  assert.equal(authoringFailureCode(both), "hybrid_completed_source_required")
  assert.equal(failureLayer(both, "exploring"), "browser-use 探索")
  assert.match(authoringFailureMessage(both), /第 1 个动作 navigate 未通过.*清理尚未确认/)
  const cleanup = new RuntimeCleanupRequiredError("owner", report, { status: "completed", value: null })
  assert.equal(failureLayer(cleanup, "exploring"), "运行资源清理")
  assert.equal(authoringFailureCode(cleanup), "upstream_runner_cleanup_unconfirmed")
  for (const error of [cleanup, new Error("upstream_runner_cleanup_unconfirmed"),
    new AggregateError([new Error("upstream_runner_cleanup_unconfirmed"), cleanup], "hybrid_source_and_cleanup_failed")]) {
    assert.match(authoringFailureMessage(error), /来源和执行结果保留/)
    assert.doesNotMatch(authoringFailureMessage(error), /未能启动|页面操作前|重新准备/)
  }
})
