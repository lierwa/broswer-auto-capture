import assert from "node:assert/strict"
import test from "node:test"
import { authoringFailureMessage, failureLayer } from "../src/task-chain/authoring-failure.js"

test("daily Chrome connection errors identify the connection layer and never suggest private retry", () => {
  for (const code of ["endpoint_required", "endpoint_invalid", "headless_unsupported", "owner_required"]) {
    const error = new Error(`hybrid_existing_browser_${code}`)
    assert.equal(failureLayer(error, "exploring"), "日常 Chrome 连接")
    assert.match(authoringFailureMessage(error), /日常 Chrome/)
    assert.doesNotMatch(authoringFailureMessage(error), /请重试|专用浏览器中/)
  }
})

test("website login guidance refers to the user's daily Chrome", () => {
  assert.match(authoringFailureMessage(new Error("browser_login_required")), /日常 Chrome/)
  assert.doesNotMatch(authoringFailureMessage(new Error("browser_login_required")), /专用浏览器/)
})
