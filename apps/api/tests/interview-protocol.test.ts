import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { createCommonQuestionFromPanel } from "@agent-platform/ai-connect/integration/authoring/question"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { emptyInterview, type InterviewMessage, type InterviewMessagePart } from "@browser-capture/contracts/interview"
import {
  cardFromAuthoringBlock,
  createInterviewMainAuthoring,
  interviewCanonicalMessages,
  parseInterviewAuthoringOutput,
  parseInterviewOutput,
  settleInterviewMessageParts,
} from "../src/interview/protocol.js"
import { recordUserProvidedSources } from "../src/interview/source-resolution.js"
import { beginRound, confirmDraft, finishRound } from "../src/interview/transitions.js"

const entry = "https://example.org/"
function sourcedState() {
  const state = structuredClone(emptyInterview)
  recordUserProvidedSources(state, entry, 1)
  return state
}

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
  const state = sourcedState()
  const { session } = createInterviewMainAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  const markdown = [
    "# 任务目标", "播放指定内容并定位到目标时间。",
    "## 已确认来源", "仅使用 example.org；具体页面由试做调查。",
    "## 试做入口", `1. ${entry}`,
    "## 运行输入", "- 无",
    "## 代表试做", "从已确认入口核实内容身份，再播放并定位。",
    "## 结果与完成", "- 交付：完成状态\n- 页面交付：保留现场\n目标内容正在播放且当前位置为 180 秒。",
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
  const state = sourcedState()
  const authored = createInterviewMainAuthoring(state, "test skill", {
    schemaVersion: 1,
    packages: [CommonContentUIProtocol],
  })
  const markdowns = authored.prompt.match(/<interview-markdown .*?<\/interview-markdown>/gs) ?? []
  assert.equal(markdowns.length, 1)
  assert.doesNotMatch(authored.prompt, /interview-result/)
  authored.session.push(`<authoring>${markdowns[0]!.replace("已选来源候选的真实 URL", entry)}</authoring>`)
  const generic = parseInterviewAuthoringOutput(authored.session.finish(), state, [], "run")
  assert.equal(generic.draft?.title, "short title")
  assert.equal(generic.draft?.brief, null)
  assert.match(generic.draft?.markdown ?? "", /已确认的业务目标/)
  assert.match(authored.prompt, /根据完整对话决定/)
  assert.match(authored.prompt, /不按关键词或网站猜/)
  assert.match(authored.prompt, /结果形状：记录列表/)
  assert.match(authored.prompt, /不把平行文本列表冒充成组记录/)
})

test("动作型与数据型草稿都明确结果形态且继续写 brief=null", () => {
  const state = sourcedState()
  const action = parseInterviewOutput({ assistantText: "已整理播放完成条件。", question: null, draft: {
    title: "播放任务", brief: null,
    markdown: `# 任务目标\n播放目标内容。\n\n## 试做入口\n1. ${entry}\n\n## 运行输入\n- 无\n\n## 代表试做\n从入口调查并播放目标内容。\n\n## 结果与完成\n- 交付：完成状态\n- 页面交付：保留现场\n以目标内容正在播放作为完成事实。`,
  } }, state)
  const data = parseInterviewOutput({ assistantText: "已整理列表结果。", question: null, draft: {
    title: "列表任务", brief: null,
    markdown: `# 任务目标\n读取列表。\n\n## 试做入口\n1. ${entry}\n\n## 运行输入\n- 无\n\n## 代表试做\n从入口读取列表。\n\n## 结果与完成\n- 交付：数据结果\n- 结果形状：记录列表\n- 页面交付：无需保留\n- 字段：标题（文本）：每项的标题\n- 字段：链接（文本）：同一项的链接\n空列表时说明不足且不进入详情页。`,
  } }, state)
  assert.equal(action.draft?.brief, null)
  assert.equal(data.draft?.brief, null)
  assert.throws(() => parseInterviewOutput({ assistantText: "缺少结果段。", question: null, draft: {
    title: "无效草稿", brief: null, markdown: "# 任务目标\n播放目标内容。",
  } }, state), /interview_result_and_completion_required/)
})

test("访谈数据草案缺少结果形状时拒绝本轮，保留上一有效草案", () => {
  const state = sourcedState()
  const markdown = `# 任务目标\n读取页面数据。\n\n## 试做入口\n1. ${entry}\n\n## 运行输入\n- 无\n\n## 代表试做\n从入口读取数据。\n\n## 结果与完成\n- 交付：数据结果\n- 结果形状：单条记录\n- 页面交付：无需保留\n- 字段：标题（文本）：页面标题\n读取不到时报告原因。`
  const candidate = { assistantText: "已整理数据草案。", question: null,
    draft: { title: "数据任务", brief: null, markdown } }
  const first = beginRound(state, { type: "message", requestId: randomUUID(), expectedRevision: 0,
    text: "读取已确认来源的页面标题。" })
  const valid = parseInterviewOutput(candidate, state)
  finishRound(state, first, "succeeded", { ...valid, parts: [] })
  const priorDrafts = structuredClone(state.drafts)
  assert.equal(priorDrafts.length, 1)

  const second = beginRound(state, { type: "message", requestId: randomUUID(), expectedRevision: 1,
    text: "请继续整理数据结果。" })
  const missingShape = { ...candidate, draft: { ...candidate.draft,
    markdown: markdown.replace("- 结果形状：单条记录\n", "") } }
  const authored = createInterviewMainAuthoring(state, "test skill", {
    schemaVersion: 1, packages: [CommonContentUIProtocol],
  })
  authored.session.push(`<authoring><interview-markdown title="${missingShape.draft.title}">${missingShape.draft.markdown}</interview-markdown></authoring>`)
  assert.throws(() => parseInterviewAuthoringOutput(authored.session.finish(), state, [], second),
    /preparation_draft_result_shape_required/)
  finishRound(state, second, "failed", undefined, "preparation_draft_result_shape_required")
  assert.deepEqual(state.drafts, priorDrafts)
  assert.equal(state.turns.at(-1)?.status, "failed")
})

test("自由文本澄清旧题板后允许草案；失败轮次不篡改旧题板", () => {
  const state = sourcedState()
  state.revision = 1
  const question = createCommonQuestionFromPanel({ id: "access", panel: { mode: "choice",
    prompt: "你是否具备并愿意使用所需访问资格？", options: [
      { id: "yes", label: "具备并愿意使用" }, { id: "no", label: "不具备或不愿使用" },
    ],
  } })
  state.messages.push(message({ id: "access", role: "assistant", text: "请确认访问资格。", question }))
  state.unresolved.push({ id: "access", revision: 1, question, status: "open", answerMessageId: null })
  const draft = { title: "播放任务", brief: null, markdown: `# 任务目标\n播放最新正片。\n\n## 试做入口\n1. ${entry}\n\n## 运行输入\n- 无\n\n## 代表试做\n从入口调查最新正片并尝试播放。\n\n## 结果与完成\n- 交付：完成状态\n- 页面交付：保留现场\n播放成功才算完成；看不了则报告原因。` }
  const candidate = { assistantText: "已按你的要求整理。", question: null, draft }
  assert.throws(() => parseInterviewOutput(candidate, state), /interview_unresolved_items_open/)

  const first = beginRound(state, { type: "message", requestId: randomUUID(), expectedRevision: 1,
    text: "我不确定有没有会员；看不了就报告原因，不要换播旧集。" })
  assert.equal(parseInterviewOutput(candidate, state).draft?.title, "播放任务")
  assert.equal(state.unresolved[0]?.status, "open")
  finishRound(state, first, "failed", undefined, "模拟本轮后续失败")
  assert.equal(state.unresolved[0]?.status, "open")

  const retry = beginRound(state, { type: "retry", requestId: randomUUID(), expectedRevision: 2 })
  const output = parseInterviewOutput(candidate, state)
  finishRound(state, retry, "succeeded", { ...output, parts: [] })
  assert.equal(state.unresolved[0]?.status, "superseded")
  confirmDraft(state, 1)
  assert.equal(state.confirmedVersion, 1)
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

test("用户自身资格问题可无推荐答案，多个推荐仍被协议拒绝", () => {
  const state = structuredClone(emptyInterview)
  const ui = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const question = '<question-panel mode="choice" prompt="你是否具备并愿意使用所需访问资格？">' +
    '<question-option slot="yes" label="具备且愿意使用"></question-option>' +
    '<question-option slot="no" label="不具备或不愿使用"></question-option></question-panel>'
  const authored = createInterviewMainAuthoring(state, "test skill", ui)
  authored.session.push(`<authoring>${question}</authoring>`)
  const parsed = parseInterviewAuthoringOutput(authored.session.finish(), state, [], "run")
  assert.ok(parsed.question && "type" in parsed.question && parsed.question.type === "choice")
  assert.deepEqual(parsed.question.data.options.map((option) => option.recommended), [false, false])

  const invalid = createInterviewMainAuthoring(state, "test skill", ui)
  invalid.session.push(`<authoring>${question.replaceAll('<question-option slot=', '<question-option recommended="true" slot=')}</authoring>`)
  assert.throws(() => parseInterviewAuthoringOutput(invalid.session.finish(), state, [], "run"), /interview_question_projection_invalid/)
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
