import assert from "node:assert/strict"
import test from "node:test"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { emptyInterview, type InterviewMessage, type InterviewMessagePart } from "@browser-capture/contracts/interview"
import {
  cardFromAuthoringBlock,
  createInterviewMainAuthoring,
  interviewCanonicalMessages,
  parseInterviewAuthoringOutput,
  settleInterviewMessageParts,
} from "../src/interview/protocol.js"

function calloutFixture() {
  const { session } = createInterviewMainAuthoring(structuredClone(emptyInterview), "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  session.push('<authoring><content-callout variant="highlight">范围</content-callout></authoring>')
  const result = session.finish()
  const card = cardFromAuthoringBlock(result.blocks[0]!, "run")!
  return { result, card }
}

function text(id: string, value: string): InterviewMessagePart {
  return { id, type: "text", text: value }
}

function message(value: Partial<InterviewMessage> & Pick<InterviewMessage, "id" | "role" | "text">): InterviewMessage {
  return {
    status: "complete", question: null, draftVersion: null, aiEvents: [],
    ...value,
  }
}

test("消息首尾空白跨过 Card 收敛，多个非空文本之间的间隔保持不变", () => {
  const { result, card } = calloutFixture()
  const settled = settleInterviewMessageParts([
    text("before", " \n前文\n\n"),
    { id: card.id, type: "card", card },
    text("after", "\n\n后文 \n"),
  ], result, "run", "前文\n\n\n\n后文")

  assert.deepEqual(settled.map((part) => part.type === "text" ? part.text : part.type), [
    "前文\n\n",
    "card",
    "\n\n后文",
  ])
})

test("只有 Card 时移除分散在其两侧的纯空白文本", () => {
  const { result, card } = calloutFixture()
  const settled = settleInterviewMessageParts([
    text("before", "\n\n"),
    { id: card.id, type: "card", card },
    text("after", " \n"),
  ], result, "run", "")

  assert.deepEqual(settled, [{ id: card.id, type: "card", card }])
})

test("正文出现在 Card 后时跨过 Card 清理全局前导空白", () => {
  const { result, card } = calloutFixture()
  const settled = settleInterviewMessageParts([
    text("before", " \n"),
    { id: card.id, type: "card", card },
    text("after", "\n\n后文 "),
  ], result, "run", "后文")

  assert.deepEqual(settled.map((part) => part.type === "text" ? part.text : part.type), ["card", "后文"])
})

test("消息 parts 的真实内容不一致时继续拒绝终态", () => {
  const { result, card } = calloutFixture()
  assert.throws(() => settleInterviewMessageParts([
    text("before", "实际正文"),
    { id: card.id, type: "card", card },
  ], result, "run", "另一段正文"), /interview_authoring_part_text_mismatch/)
})

test("通用浏览器任务由私有 raw Markdown candidate 投影到既有草稿", () => {
  const state = structuredClone(emptyInterview)
  const { session } = createInterviewMainAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  const markdown = [
    "# 任务目标", "播放指定内容并定位到目标时间。",
    "# 已知上下文与输入", "目标由用户给出。",
    "# 范围与约束", "不替换为其他内容。",
    "# 结果与步骤依赖", "先核实内容身份，再播放并定位。",
    "# 可观察完成标准", "目标内容正在播放且当前位置为 180 秒。",
    "# 需要现场调查", "核实最新内容身份和访问条件。",
    "# 执行权限与确认点", "本草稿确认不授权浏览器操作。",
    "# 当前支持边界", "当前仅保存并确认需求，下游执行能力待接入。",
  ].join("\n\n")
  const assistantText = "已将媒体目标和可观察完成状态整理为需求。"
  const raw = `${assistantText}\n\n<authoring><interview-markdown title="媒体 &quot;播放&quot; &amp; 定位">${markdown}\n\n` +
    '代码示意：`seek(180)`；页面文本可能包含 <button>。</interview-markdown></authoring>'
  session.push(raw)

  const output = parseInterviewAuthoringOutput(session.finish(), state, [text("message", `${assistantText}\n\n`)], "run")

  assert.equal(output.assistantText, assistantText)
  assert.deepEqual(output.draft, {
    title: '媒体 "播放" & 定位',
    markdown: `${markdown}\n\n代码示意：\`seek(180)\`；页面文本可能包含 <button>。`,
    brief: null,
  })
})

test("实际 composed prompt 只提供一个通用 raw Markdown 草稿示例", () => {
  const state = structuredClone(emptyInterview)
  const authored = createInterviewMainAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  const markdowns = authored.prompt.match(/<interview-markdown .*?<\/interview-markdown>/gs) ?? []
  assert.equal(markdowns.length, 1)
  assert.doesNotMatch(authored.prompt, /interview-result/)
  authored.session.push(`<authoring>${markdowns[0]}</authoring>`)
  const generic = parseInterviewAuthoringOutput(authored.session.finish(), state, [], "run")
  assert.equal(generic.draft?.title, "short title")
  assert.equal(generic.draft?.brief, null)
  assert.match(generic.draft?.markdown ?? "", /Complete browser-automation requirement/)
})

test("访谈注册 choice 与 multi_choice，缺失或未启用 free_form 都不进入业务状态", () => {
  const state = structuredClone(emptyInterview)
  const options = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const prompt = createInterviewMainAuthoring(state, "test skill", options).prompt
  assert.match(prompt, /Enabled Question modes: choice, multi_choice\./)
  assert.match(prompt, /<question-panel mode="choice"/)
  assert.match(prompt, /<question-panel mode="multi_choice"/)
  assert.doesNotMatch(prompt, /<question-panel mode="free_form"/)

  const multi = createInterviewMainAuthoring(state, "test skill", options)
  multi.session.push('<authoring><question-panel mode="multi_choice" prompt="选择字段"><question-option slot="name" label="名称" recommended="true"></question-option><question-option slot="price" label="价格"></question-option></question-panel></authoring>')
  assert.match(JSON.stringify(parseInterviewAuthoringOutput(multi.session.finish(), state, [], "run").question), /"multi_choice"/)

  for (const panel of [
    '<question-panel prompt="采集哪些数据？"></question-panel>',
    '<question-panel mode="free_form" prompt="采集哪些数据？"></question-panel>',
  ]) {
    const authored = createInterviewMainAuthoring(state, "test skill", options)
    authored.session.push(`<authoring>${panel}</authoring>`)
    assert.throws(() => parseInterviewAuthoringOutput(authored.session.finish(), state, [], "run"), /interview_authoring_invalid/)
  }
})

test("Question 与草稿混用或产生多个草稿时拒绝", () => {
  const state = structuredClone(emptyInterview)
  const options = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const reference = createInterviewMainAuthoring(state, "test skill", options).prompt
  const markdown = reference.match(/<interview-markdown .*?<\/interview-markdown>/s)?.[0]
  assert.ok(markdown)

  const multiple = createInterviewMainAuthoring(state, "test skill", options)
  multiple.session.push(`<authoring>${markdown}</authoring><authoring>${markdown}</authoring>`)
  assert.throws(() => parseInterviewAuthoringOutput(multiple.session.finish(), state, [], "run"), /interview_authoring_cardinality_invalid/)

  const mixed = createInterviewMainAuthoring(state, "test skill", options)
  mixed.session.push('需要确认。<authoring><question-panel mode="choice" prompt="选择范围"><question-option slot="1" label="小范围" recommended="true">较快</question-option><question-option slot="2" label="全范围">完整</question-option></question-panel></authoring>')
  mixed.session.push(`<authoring>${markdown}</authoring>`)

  assert.throws(() => parseInterviewAuthoringOutput(mixed.session.finish(), state, [text("message", "需要确认。")], "run"), /interview_output_invalid/)
})

test("旧 JSON 草稿标签不再是生产入口", () => {
  const state = structuredClone(emptyInterview)
  const legacy = createInterviewMainAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  legacy.session.push(`<authoring><interview-result>${JSON.stringify({
    draft: { title: "旧传输", markdown: "# 任务目标\n播放内容。", brief: null },
  })}</interview-result></authoring>`)

  assert.throws(() => parseInterviewAuthoringOutput(legacy.session.finish(), state, [], "run"), /interview_authoring_invalid/)
})

test("Main active task 不重复完整对话，canonical history 保留同一 ProductStore 的原始模型输出", () => {
  const state = structuredClone(emptyInterview)
  const raw = "已确认范围。\n<authoring><interview-markdown title=\"草稿\"># 目标\n完整需求。</interview-markdown></authoring>"
  state.messages.push(
    message({ id: "u1", role: "user", text: "整理完整需求" }),
    message({
      id: "a1", role: "assistant", text: "已确认范围。", parts: [text("a1:text", "已确认范围。")],
      aiEvents: [
        parseAIEvent({ type: "generation.started", invocationId: "i1", sequence: 0, createdAt: 1, output: "text",
          model: { connectionId: "c1", modelId: "m1", reasoningEffort: "medium" } }),
        parseAIEvent({ type: "text.delta", invocationId: "i1", sequence: 1, createdAt: 2, text: raw }),
        parseAIEvent({ type: "generation.completed", invocationId: "i1", sequence: 2, createdAt: 3,
          providerId: "fixture", modelId: "m1", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }),
      ],
    }),
  )

  const main = createInterviewMainAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  assert.doesNotMatch(main.prompt, /整理完整需求/)
  assert.doesNotMatch(main.prompt, /已确认范围。/)
  assert.deepEqual(interviewCanonicalMessages(state), [
    { role: "user", content: [{ type: "text", text: "整理完整需求" }] },
    { role: "assistant", content: [{ type: "text", text: raw }] },
  ])
})

test("accepted assistant 的模型事件不完整时 canonical history 失败关闭", () => {
  const state = structuredClone(emptyInterview)
  state.messages.push(message({
    id: "a1", role: "assistant", text: "安全投影",
    aiEvents: [parseAIEvent({ type: "text.delta", invocationId: "i1", sequence: 0, createdAt: 1, text: "原始输出" })],
  }))

  assert.throws(() => interviewCanonicalMessages(state), /interview_model_history_incomplete/)
})

test("迁移前无模型事件的 accepted assistant 只用已有安全事实建立首个 Pi session", () => {
  const state = structuredClone(emptyInterview)
  state.messages.push(message({
    id: "a1", role: "assistant", text: "旧安全正文", draftVersion: 2,
    parts: [text("a1:text", "旧安全正文")],
  }))

  assert.deepEqual(interviewCanonicalMessages(state), [{
    role: "assistant",
    content: [{ type: "text", text: JSON.stringify({
      assistantText: "旧安全正文", question: null, draftVersion: 2,
      parts: [text("a1:text", "旧安全正文")],
    }) }],
  }])
})
