import assert from "node:assert/strict"
import test from "node:test"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { emptyInterview, type InterviewMessagePart } from "@browser-capture/contracts/interview"
import {
  cardFromAuthoringBlock,
  createInterviewAuthoring,
  parseInterviewAuthoringOutput,
  settleInterviewMessageParts,
} from "../src/interview/protocol.js"

function calloutFixture() {
  const { session } = createInterviewAuthoring(structuredClone(emptyInterview), "test skill", {
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

test("通用浏览器任务由私有 raw Markdown candidate 投影到既有草稿且不伪造采集 brief", () => {
  const state = structuredClone(emptyInterview)
  const { session } = createInterviewAuthoring(state, "test skill", {
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

test("实际 composed prompt 的采集 JSON 与通用 raw Markdown 示例均可由现有协议提交", () => {
  const state = structuredClone(emptyInterview)
  const first = createInterviewAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  const captures = first.prompt.match(/<interview-result>.*?<\/interview-result>/gs) ?? []
  const markdowns = first.prompt.match(/<interview-markdown .*?<\/interview-markdown>/gs) ?? []
  assert.equal(captures.length, 1)
  assert.equal(markdowns.length, 1)
  first.session.push(`<authoring>${captures[0]}</authoring>`)

  const capture = parseInterviewAuthoringOutput(first.session.finish(), state, [], "run")
  assert.equal(capture.draft?.title, "short title")
  assert.notEqual(capture.draft?.brief, null)

  const second = createInterviewAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  second.session.push(`<authoring>${markdowns[0]}</authoring>`)
  const generic = parseInterviewAuthoringOutput(second.session.finish(), state, [], "run")
  assert.equal(generic.draft?.title, "short title")
  assert.equal(generic.draft?.brief, null)
  assert.match(generic.draft?.markdown ?? "", /Complete browser-automation requirement/)
})

test("Question、采集和通用候选混用或产生多个结果时拒绝", () => {
  const state = structuredClone(emptyInterview)
  const options = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const reference = createInterviewAuthoring(state, "test skill", options).prompt
  const capture = reference.match(/<interview-result>.*?<\/interview-result>/s)?.[0]
  const markdown = reference.match(/<interview-markdown .*?<\/interview-markdown>/s)?.[0]
  assert.ok(capture && markdown)

  const multiple = createInterviewAuthoring(state, "test skill", options)
  multiple.session.push(`<authoring>${capture}</authoring><authoring>${markdown}</authoring>`)
  assert.throws(() => parseInterviewAuthoringOutput(multiple.session.finish(), state, [], "run"), /interview_authoring_cardinality_invalid/)

  const mixed = createInterviewAuthoring(state, "test skill", options)
  mixed.session.push('需要确认。<authoring><question-panel prompt="选择范围"><question-option slot="1" label="小范围" recommended="true">较快</question-option><question-option slot="2" label="全范围">完整</question-option></question-panel></authoring>')
  mixed.session.push(`<authoring>${markdown}</authoring>`)

  assert.throws(() => parseInterviewAuthoringOutput(mixed.session.finish(), state, [text("message", "需要确认。")], "run"), /interview_output_invalid/)
})

test("通用 Markdown 只有私有 raw candidate 一个生产入口", () => {
  const state = structuredClone(emptyInterview)
  const legacy = createInterviewAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  legacy.session.push(`<authoring><interview-result>${JSON.stringify({
    draft: { title: "旧传输", markdown: "# 任务目标\n播放内容。", brief: null },
  })}</interview-result></authoring>`)

  assert.throws(() => parseInterviewAuthoringOutput(legacy.session.finish(), state, [], "run"), /interview_authoring_invalid/)
})
