import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { interviewCommandSchema, interviewOutputSchema } from "../src/interview.js"
import { taskCommandSchema } from "../src/task.js"

test("正式命令强制幂等键、修订及精确取消轮次，并保留用户原文", () => {
  const command = { type: "message", requestId: randomUUID(), expectedRevision: 0, text: "  原文\n" }
  assert.equal(interviewCommandSchema.parse(command).type, "message")
  assert.deepEqual(interviewCommandSchema.parse(command), command)
  assert.equal(interviewCommandSchema.safeParse({ ...command, requestId: undefined }).success, false)
  assert.equal(interviewCommandSchema.safeParse({ ...command, text: "  " }).success, false)
  assert.equal(interviewCommandSchema.safeParse({ type: "cancel" }).success, false)
  assert.equal(taskCommandSchema.safeParse({ type: "create" }).success, false)
})

test("负责人问题与可确认草稿互斥，建议不能自动成为决策", () => {
  const question = { prompt: "范围？", options: [{ label: "小", description: "少", recommended: true }, { label: "大", description: "多", recommended: false }] }
  assert.equal(interviewOutputSchema.safeParse({ assistantText: "请确认范围", question, draft: { title: "范围", markdown: "# 范围" } }).success, false)
  assert.equal(interviewOutputSchema.safeParse({ assistantText: "请确认范围", question, draft: null }).success, true)
})
