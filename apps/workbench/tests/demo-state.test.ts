import assert from "node:assert/strict"
import test from "node:test"
import { demoReducer, initialDemoState, type DemoAction } from "../src/demoState.ts"

function apply(actions: DemoAction[]) { return actions.reduce(demoReducer, initialDemoState) }
const example = () => demoReducer(initialDemoState, { type: "load_example" })

test("空任务没有可确认的计划", () => {
  assert.equal(initialDemoState.planRevision, null)
  assert.strictEqual(demoReducer(initialDemoState, { type: "confirm_plan" }), initialDemoState)
})
test("明确载入示例且确认后才能排队、暂停、恢复与完成", () => {
  const result = apply([
    { type: "load_example" }, { type: "confirm_plan" }, { type: "queue_demo" },
    { type: "start_demo" }, { type: "pause_demo" }, { type: "resume_demo" }, { type: "complete_demo" },
  ])
  assert.equal(result.stage, "complete")
  assert.equal(result.planRevision, result.revision)
})
test("越过确认与排队门无效", () => {
  const state = example()
  for (const type of ["queue_demo", "start_demo", "complete_demo"] as const) {
    assert.strictEqual(demoReducer(state, { type }), state)
  }
})
test("修改已确认需求清除旧计划，不能确认或执行过期示例", () => {
  const confirmed = demoReducer(example(), { type: "confirm_plan" })
  const changed = demoReducer(confirmed, { type: "edit_requirement", requirement: "博物馆展览名称和日期" })
  assert.equal(changed.stage, "draft")
  assert.equal(changed.planRevision, null)
  assert.equal(changed.revision, 2)
  assert.equal(changed.messages.at(-2)?.text, "博物馆展览名称和日期")
  assert.strictEqual(demoReducer(changed, { type: "confirm_plan" }), changed)
  assert.strictEqual(demoReducer(changed, { type: "queue_demo" }), changed)
})
test("任意需求不会通过关键词获得预制方案", () => {
  const state = demoReducer(initialDemoState, { type: "edit_requirement", requirement: "冰箱，不要评价" })
  assert.equal(state.planRevision, null)
  assert.strictEqual(demoReducer(state, { type: "load_example" }), state)
})
test("空白和超长输入不改变当前计划", () => {
  const state = example()
  for (const requirement of ["   ", "长".repeat(4001)]) {
    assert.strictEqual(demoReducer(state, { type: "edit_requirement", requirement }), state)
  }
})
test("活动运行期间禁止换输入、换示例和重置", () => {
  const queued = apply([{ type: "load_example" }, { type: "confirm_plan" }, { type: "queue_demo" }])
  const running = demoReducer(queued, { type: "start_demo" })
  const paused = demoReducer(running, { type: "pause_demo" })
  for (const state of [queued, running, paused]) {
    assert.strictEqual(demoReducer(state, { type: "edit_requirement", requirement: "不同任务" }), state)
    assert.strictEqual(demoReducer(state, { type: "reset" }), state)
    assert.strictEqual(demoReducer(state, { type: "load_example" }), state)
  }
})
test("新建任务清除示例与对话", () => {
  assert.deepEqual(demoReducer(example(), { type: "reset" }), initialDemoState)
})
