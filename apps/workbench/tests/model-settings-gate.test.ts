import assert from "node:assert/strict"
import test from "node:test"
import { modelInvocationReady } from "../src/useModelSettings.js"
import { requireModelInvocation, sendInterviewMessage } from "../src/ChatTimeline.js"

const selection = { connectionId: "account", modelId: "model", reasoningEffort: "medium" as const }

test("只有模型设置成功加载且已有选择时才允许发起模型轮次", () => {
  assert.equal(modelInvocationReady({ selection, loading: false, error: "" }), true)
  assert.equal(modelInvocationReady({ selection: undefined, loading: false, error: "" }), false)
  assert.equal(modelInvocationReady({ selection, loading: true, error: "" }), false)
  assert.equal(modelInvocationReady({ selection, loading: false, error: "无法读取模型设置" }), false)
})

test("未选择模型时在请求到达业务API前拒绝", () => {
  assert.throws(() => requireModelInvocation(false), /model_selection_required/)
  assert.doesNotThrow(() => requireModelInvocation(true))
})

test("无模型时发送不会调用需求API，配置完成后沿用原文本发送", async () => {
  const sent: string[] = []
  const send = async (text: string) => { sent.push(text) }
  await assert.rejects(sendInterviewMessage("保留这段草稿", false, send), /model_selection_required/)
  assert.deepEqual(sent, [])
  await sendInterviewMessage("保留这段草稿", true, send)
  assert.deepEqual(sent, ["保留这段草稿"])
})
