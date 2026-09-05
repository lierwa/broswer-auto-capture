import assert from "node:assert/strict"
import test from "node:test"
import { demoReducer, initialDemoState, type DemoAction } from "../src/demoState.ts"

function apply(actions: DemoAction[]) {
  return actions.reduce(demoReducer, initialDemoState)
}

test("演示流程只有确认后才能排队、执行、暂停、恢复与完成", () => {
  const complete = apply([
    { type: "confirm_plan" },
    { type: "queue_demo" },
    { type: "start_demo" },
    { type: "pause_demo" },
    { type: "resume_demo" },
    { type: "complete_demo" },
  ])

  assert.equal(complete.stage, "complete")
})

test("越过确认门的动作不会制造乐观运行状态", () => {
  assert.strictEqual(demoReducer(initialDemoState, { type: "start_demo" }), initialDemoState)
  assert.strictEqual(demoReducer(initialDemoState, { type: "complete_demo" }), initialDemoState)
})

test("编辑需求会使已确认计划失效并回到草稿", () => {
  const confirmed = demoReducer(initialDemoState, { type: "confirm_plan" })
  const edited = demoReducer(confirmed, { type: "edit_requirement", requirement: "仅采集一级能效冰箱" })

  assert.deepEqual(edited, { requirement: "仅采集一级能效冰箱", stage: "draft" })
})
