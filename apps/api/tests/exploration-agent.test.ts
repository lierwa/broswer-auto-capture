import assert from "node:assert/strict"
import test from "node:test"
import { z } from "zod"
import { runExplorationAgent } from "../src/task-chain/exploration-agent.js"
import type { PreparedMainAIModel } from "../src/ai/model.js"
import { testSelection } from "./fixtures/ai-model.js"

test("Pi 工具会话执行多次工具并返回业务结果，关闭一次", async () => {
  let closed = 0, invoked = 0, runs = 0
  const model: PreparedMainAIModel = {
    selection: testSelection,
    async run(input) {
      runs++
      assert.match(input.activeTask, /当前步骤的 complete_step 被接受前，不得开始下一个步骤/)
      assert.match(input.activeTask, /发现或枚举多个可见候选时，必须先调用 page/)
      assert.match(input.activeTask, /达到该数量前不得提交较短集合/)
      assert.match(input.activeTask, /先用 tabs 查找来源页 URL 完全一致的现有标签并 tab_select/)
      assert.match(input.activeTask, /each authoring 只执行计划绑定的首项/)
      assert.match(input.activeTask, /本地工具错误必须在当前会话修正，不得转给用户/)
      const tool = input.tools![0]!
      const first = await tool.execute("call1", { command: { type: "navigate", url: "https://example.org/" } }, input.signal)
      assert.match(first.content[0]!.text, /call1/)
      assert.doesNotThrow(() => z.json().parse({ content: first.content, details: first.details }))
      await tool.execute("call2", { command: { type: "page" } }, input.signal)
      return { outputText: '{"title":"Example"}' }
    },
    async close() { closed++ },
  }
  const result = await runExplorationAgent(model, { jobId: "job", context: {}, signal: new AbortController().signal,
    onEvent() {}, async execute(command, callId) { invoked++; return { type: command.type, callId } } })
  assert.equal(result.outputText, '{"title":"Example"}')
  assert.equal(invoked, 2); assert.equal(runs, 1); assert.equal(closed, 1)
})

test("工具边界拒绝未授权动作和非法参数", async () => {
  let invoked = 0, closed = 0
  const model: PreparedMainAIModel = { selection: testSelection, async close() { closed++ }, async run(input) {
    const tool = input.tools![0]!
    await assert.rejects(tool.execute("bad", { command: { type: "evaluate", script: "arbitrary" } }), /Invalid/)
    await assert.rejects(tool.execute("bad", { command: { type: "download", out: "file" } }), /not_authorized/)
    return { outputText: "rejected" }
  } }
  await runExplorationAgent(model, { jobId: "job", context: {}, signal: new AbortController().signal,
    onEvent() {}, async execute() { invoked++; return null } })
  assert.equal(invoked, 0); assert.equal(closed, 1)
})

test("取消和 Provider 错误不重试，事件保真且 finally 关闭", async () => {
  for (const cancelled of [true, false]) {
    let closed = 0, runs = 0
    const controller = new AbortController(), events: unknown[] = []
    const model: PreparedMainAIModel = { selection: testSelection, async close() { closed++ }, async run(input) {
      runs++
      const event = { type: "generation.failed" as const, invocationId: "invocation", sequence: 1,
        createdAt: 1, code: "ai_generation_failed" as const }
      input.onEvent(event)
      if (cancelled) { controller.abort(); await input.tools![0]!.execute("cancelled", { command: { type: "page" } }) }
      throw new Error("model_account_auth_failed")
    } }
    await assert.rejects(runExplorationAgent(model, { jobId: "job", context: {}, signal: controller.signal,
      onEvent(event) { events.push(event) }, async execute() { assert.fail("cancelled command") } }),
    cancelled ? /abort/i : /model_account_auth_failed/)
    assert.equal(closed, 1); assert.equal(runs, 1); assert.equal(events.length, 1)
  }
})
