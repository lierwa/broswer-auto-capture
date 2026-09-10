import assert from "node:assert/strict"
import test from "node:test"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { emptyInterview, type InterviewMessagePart } from "@browser-capture/contracts/interview"
import {
  cardFromAuthoringBlock,
  createInterviewAuthoring,
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
