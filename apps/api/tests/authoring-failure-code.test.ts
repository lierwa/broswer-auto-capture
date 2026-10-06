import assert from "node:assert/strict"
import test from "node:test"
import { DomainError } from "../src/errors.js"
import { authoringFailureCode } from "../src/task-chain/authoring-failure.js"

// WHY：保留启动/协议原因，同时阻止异常正文中的页面、地址和凭据进入持久化诊断。
test("准备失败代码保留确定原因，剔除异常正文", () => {
  assert.equal(authoringFailureCode(new DomainError("daily_chrome_connection_paused", "sensitive text")),
    "daily_chrome_connection_paused")
  assert.equal(authoringFailureCode(new Error("upstream_start_failed:TimeoutError:https://user:secret@example.test")),
    "upstream_start_failed:TimeoutError")
  assert.equal(authoringFailureCode(new Error("browser text with secret")), "authoring_failure_unclassified")
})
