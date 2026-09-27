import assert from "node:assert/strict"
import test from "node:test"
import { buildCommonSurfaceReplyPayload, createCommonQuestionFromPanel, createCommonQuestionSurface } from "@agent-platform/ai-connect/ui-contracts"
import { emptyInterview } from "../src/interviewContract.js"
import { projectInterviewTimeline } from "../src/interviewTimelineProjection.js"

test("旧来源题的活动和历史副标题只作只读预览，不裁剪存储问题或业务题", () => {
  const url = "https://source.example/work/1"
  const raw = `搜索摘要：${"公开资料的原始长摘要".repeat(30)}`
  const sourceQuestion = createCommonQuestionFromPanel({ id: "source-q", panel: {
    mode: "choice", prompt: "核对来源", options: [
      { id: "candidate-1", label: "作品入口", description: `${url} · ${raw}`, recommended: false },
      { id: "source:none", label: "都不是", description: "继续补充", recommended: false },
    ],
  } })
  const state = structuredClone(emptyInterview)
  state.messages.push({ id: "source-q", role: "assistant", text: "请选择来源。", status: "complete",
    question: sourceQuestion, draftVersion: null, aiEvents: [] })
  state.sourceResolutions.push({ id: "source-resolution", revision: 0, subject: "作品", query: "作品 官方",
    provider: "fixture", searchStatus: "ok", outcome: "unique", status: "open",
    candidates: [{ id: "candidate-1", title: "作品入口", url, origin: "https://source.example/",
      domain: "source.example", description: raw }], questionId: "source-q", selectedCandidateId: null,
    answerMessageId: null, createdAt: "2026-09-26T00:00:00.000Z" })
  state.unresolved.push({ id: "source-q", revision: 0, question: sourceQuestion, status: "open", answerMessageId: null })
  const project = () => projectInterviewTimeline({ state, blocked: false, onDraft: () => undefined,
    onPlan: () => undefined, onRetry: async () => undefined })
  const resolution = state.sourceResolutions.pop()!
  assert.equal(project().activeInteraction?.questions[0]?.options[0]?.description, `${url} · ${raw}`,
    "没有来源决议的业务题不受预览规则影响")
  state.sourceResolutions.push(resolution)
  const active = project().activeInteraction?.questions[0]?.options[0]?.description ?? ""
  assert.ok(active.length < 170)
  assert.match(active, /https:\/\/source\.example\/work\/1/)
  assert.ok(JSON.stringify(state.messages[0]!.question).includes(raw), "持久化来源题仍保留原摘要")

  state.unresolved[0]!.status = "answered"
  const originalSurface = createCommonQuestionSurface({ id: "source-q", questions: [sourceQuestion] })
  state.messages.push({ id: "source-answer", role: "user", text: "作品入口", status: "complete", question: null,
    draftVersion: null, aiEvents: [], interactionReply: buildCommonSurfaceReplyPayload({
      surface: originalSurface, submit: { answers: [{ questionId: "source-q", data: { selectedOptionIds: ["candidate-1"] } }],
        displayText: "作品入口" },
    }) })
  state.decisions.push({ id: "decision", revision: 1, kind: "option", text: "作品入口", messageId: "source-answer",
    questionId: "source-q", draftVersion: null, createdAt: "2026-09-26T00:00:01.000Z" })
  const answered = project().turns.flatMap((turn) => turn.entries)
    .find((entry) => entry.value.kind === "answered-interaction")
  assert.equal(answered?.value.kind, "answered-interaction")
  if (answered?.value.kind !== "answered-interaction") return
  const historical = (answered.value.interaction.surface.questions[0]!.data as {
    options: Array<{ subtitle: string }>
  }).options[0]!.subtitle
  assert.ok(historical.length < 170)
  assert.match(historical, /https:\/\/source\.example\/work\/1/)
  assert.ok(JSON.stringify(state.messages[0]!.question).includes(raw))
})
