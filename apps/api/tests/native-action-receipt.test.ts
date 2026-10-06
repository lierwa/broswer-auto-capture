import assert from "node:assert/strict"
import test from "node:test"
import { hybridCommandSchema } from "../src/upstream-browser/hybrid-protocol.js"

// WHY：原生动作负责执行结果；没有附加页面断言不是非法协议，也不能省略条件字段。
test("普通动作允许明确为空的附加页面条件，仍拒绝缺失或非法条件", () => {
  const command = { name: "browser.workflow-step", version: 2, actionName: "click", args: {},
    target: { strategy: "xpath", value: "//button" }, postconditions: [] }
  assert.equal(hybridCommandSchema.safeParse(command).success, true)
  assert.equal(hybridCommandSchema.safeParse({ ...command, postconditions: undefined }).success, false)
  assert.equal(hybridCommandSchema.safeParse({ ...command, postconditions: [null] }).success, false)
})
