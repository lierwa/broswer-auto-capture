import assert from "node:assert/strict"
import test from "node:test"
import { workflowSchema } from "../src/workflow.js"

const baseWorkflow = {
  id: "3fca9a11-5d6f-4c95-8ad7-2092e4aa6bee",
  version: 1,
  stepId: "22bca257-a4a8-4e89-a6ea-c8bffbe9e076",
  name: "评论复跑",
  defaultSort: "页面默认排序",
  nodes: [
    { id: "open-page", label: "打开商品页", kind: "browser", action: "navigate", next: ["save"] },
    { id: "save", label: "保存", kind: "extract", fields: ["model"], next: [] },
  ],
}

test("接受 ID 唯一且连线完整的受控链路", () => {
  assert.equal(workflowSchema.parse(baseWorkflow).nodes.length, 2)
})

test("拒绝重复节点 ID", () => {
  const duplicate = { ...baseWorkflow, nodes: [baseWorkflow.nodes[0], { ...baseWorkflow.nodes[1], id: "open-page" }] }
  assert.equal(workflowSchema.safeParse(duplicate).success, false)
})

test("拒绝悬空 next", () => {
  const dangling = { ...baseWorkflow, nodes: [{ ...baseWorkflow.nodes[0], next: ["missing"] }] }
  assert.equal(workflowSchema.safeParse(dangling).success, false)
})

test("拒绝 workflow 和 node 未知字段", () => {
  assert.equal(workflowSchema.safeParse({ ...baseWorkflow, completed: ["open-page"] }).success, false)
  assert.equal(workflowSchema.safeParse({ ...baseWorkflow, nodes: [{ ...baseWorkflow.nodes[0], modelInvocations: 0 }] }).success, false)
})
