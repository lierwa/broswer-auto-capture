import assert from "node:assert/strict"
import test from "node:test"
import { canConfirmDraft, demoReducer, initialDemoState, nextQuestion, questions } from "../src/workflowState.ts"
import { planSteps, stepGraph } from "../src/chainData.ts"

const answered = () => questions.reduce((state, question) => demoReducer(state, { type: "accept_recommendation", id: question.id }), initialDemoState)

test("一句初始需求不能确认草稿，也没有计划和运行", () => {
  assert.equal(canConfirmDraft(initialDemoState), false)
  assert.strictEqual(demoReducer(initialDemoState, { type: "confirm_draft" }), initialDemoState)
  assert.equal("plan" in initialDemoState, false)
  assert.equal("run" in initialDemoState, false)
})

test("每次只有当前取舍可回答，重复或乱序回答无效", () => {
  assert.strictEqual(demoReducer(initialDemoState, { type: "accept_recommendation", id: "content" }), initialDemoState)
  const once = demoReducer(initialDemoState, { type: "accept_recommendation", id: "scope" })
  assert.equal(nextQuestion(once)?.id, "content")
  assert.strictEqual(demoReducer(once, { type: "accept_recommendation", id: "scope" }), once)
})

test("推荐决策逐轮保存问题、答案和不可变的草稿历史", () => {
  const state = answered()
  assert.equal(state.version, 3)
  assert.deepEqual(state.history.map((item) => item.version), [0, 1, 2])
  assert.deepEqual(state.history[0]!.answers, {})
  assert.equal(Object.keys(state.history[1]!.answers).length, 1)
  assert.equal(state.messages[1]!.question?.includes(questions[0].title), true)
  assert.equal(state.messages[3]!.text, questions[2].answer)
  assert.equal(canConfirmDraft(state), true)
})

test("需求确认仅绑定当前版本，不制造来源、计划或执行授权", () => {
  const state = demoReducer(answered(), { type: "confirm_draft" })
  assert.equal(state.confirmedVersion, 3)
  assert.equal(canConfirmDraft(state), false)
  assert.strictEqual(demoReducer(state, { type: "confirm_draft" }), state)
  assert.equal("sources" in state, false)
  assert.equal("executionAuthorization" in state, false)
})

test("自由输入保留原文为待澄清内容，不伪装理解、不跳过问题", () => {
  const state = demoReducer(initialDemoState, { type: "add_note", text: "只抓一级能效的，为什么需要评论？" })
  assert.equal(state.notes[0]!.text, "只抓一级能效的，为什么需要评论？")
  assert.deepEqual(state.answers, {})
  assert.strictEqual(demoReducer(state, { type: "accept_recommendation", id: "scope" }), state)
  assert.strictEqual(demoReducer(state, { type: "confirm_draft" }), state)
})

test("确认后补充使旧确认失效，保留已确认版本内容供审阅", () => {
  const confirmed = demoReducer(answered(), { type: "confirm_draft" })
  const changed = demoReducer(confirmed, { type: "add_note", text: "改成两家店铺" })
  assert.equal(changed.confirmedVersion, null)
  assert.equal(changed.version, 4)
  assert.equal(changed.history.at(-1)!.version, 3)
  assert.deepEqual(changed.history.at(-1)!.answers, confirmed.answers)
  assert.equal(canConfirmDraft(changed), false)
})

test("空输入及不存在的撤回没有副作用", () => {
  assert.strictEqual(demoReducer(initialDemoState, { type: "add_note", text: "  " }), initialDemoState)
  assert.strictEqual(demoReducer(initialDemoState, { type: "withdraw_note", id: 100 }), initialDemoState)
})

test("逐项撤回待决补充仍保留历史，只在全部解决后恢复确认资格", () => {
  let state = demoReducer(answered(), { type: "add_note", text: "补充一" })
  state = demoReducer(state, { type: "add_note", text: "补充二" })
  const ids = state.notes.map((note) => note.id)
  state = demoReducer(state, { type: "withdraw_note", id: ids[0]! })
  assert.equal(canConfirmDraft(state), false)
  state = demoReducer(state, { type: "withdraw_note", id: ids[1]! })
  assert.equal(canConfirmDraft(state), true)
  assert.equal(state.messages.some((message) => message.text === "补充一"), true)
})

test("三个计划步骤各自有可检查链路，所有边都有端点与详情", () => {
  for (const step of planSteps) {
    const graph = stepGraph(step.id)
    const ids = new Set(graph.nodes.map((node) => node.id))
    assert.equal(graph.nodes.length, graph.details.length)
    assert.equal(ids.size, graph.nodes.length)
    assert.ok(graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)))
    assert.ok(graph.details.every((item) => item.input && item.output && item.rule && item.finish))
  }
})

test("枚举和评价链路都有条件出口与回到提取的翻页循环", () => {
  for (const step of ["catalog", "reviews"] as const) {
    const graph = stepGraph(step)
    assert.equal(graph.details[3]!.kind, "条件分支")
    assert.ok(graph.edges.some((edge) => edge.source === "3" && edge.label === "结束"))
    assert.ok(graph.edges.some((edge) => edge.source === "4" && edge.target === "1"))
  }
})
