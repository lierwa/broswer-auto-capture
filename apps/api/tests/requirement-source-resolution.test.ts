import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { emptyInterview, type InterviewState, type SourceResolution } from "@browser-capture/contracts/interview"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { PI_AGENT_SESSION_AI_EVENT_NAMESPACE } from "@agent-platform/pi-agent-session"
import type { AIModelProvider } from "../src/ai/model.js"
import { ProductStore } from "../src/database/store.js"
import { InterviewCoordinator } from "../src/interview/coordinator.js"
import { loadInterviewSkill } from "../src/interview/protocol.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { syncConfirmedRequirement } from "../src/task-chain/requirement.js"
import { parseInterviewOutput } from "../src/interview/protocol.js"
import { confirmDraft } from "../src/interview/transitions.js"
import {
  applySourceResolutionAnswer,
  assertRequirementReady,
  createSourceResolutionTools,
  PiSourceSearchObserver,
  ReadOnlySourceResolver,
  recordSourceResolution,
  sourceResolutionOutput,
  type SourceSearch,
} from "../src/interview/source-resolution.js"
import { testSelection } from "./fixtures/ai-model.js"
import { authoredInterview, projectRoot } from "./helpers.js"

const markdown = (domain: string) => `# 任务目标与最终结果\n\n从 ${domain} 完成已确认任务。\n\n## 结果与完成\n\n返回实际结果；没有结果时明确说明为空。`
const rss = (...items: Array<{ title: string; link: string; description?: string }>) =>
  `<?xml version="1.0"?><rss><channel>${items.map((item) => `<item><title>${item.title}</title><link>${item.link}</link><description>${item.description ?? ""}</description></item>`).join("")}</channel></rss>`
const resolver = (body: string) => new ReadOnlySourceResolver(async () => new Response(body, {
  status: 200, headers: { "content-type": "text/xml" },
}))

async function modelProposal(input: {
  body: string
  subject: string
  query: string
  outcome: "unique" | "multiple" | "none"
  selected: number[]
  questionId?: string
}) {
  let resolution: SourceResolution | undefined
  let searched = false
  const tools = createSourceResolutionTools({ resolver: resolver(input.body), revision: 1,
    questionId: input.questionId ?? "question-source", onSearch: () => { searched = true },
    onResolution: (value) => { resolution = value } })
  const raw = await tools[0]!.execute("search", { subject: input.subject, query: input.query }, new AbortController().signal)
  const search = (raw as { details: SourceSearch }).details
  await tools[1]!.execute("proposal", { searchTool: "search_sources", subject: input.subject, query: input.query,
    outcome: input.outcome, candidateUrls: input.selected.map((index) => search.candidates[index]!.url) })
  assert.equal(searched, true)
  assert.ok(resolution)
  return { search, resolution }
}

test("宿主只返回原始搜索结果，唯一、多候选和无候选完全由模型提案决定", async () => {
  const unique = await modelProposal({ body: rss(
    { title: "Acme Official", link: "https://acme.example/", description: "Acme service" },
    { title: "Acme review", link: "https://other.example/story", description: "Acme review" },
  ), subject: "Acme", query: "Acme official", outcome: "unique", selected: [0] })
  assert.deepEqual(unique.search.candidates.map((item) => item.domain), ["acme.example", "other.example"])
  assert.equal(unique.resolution.outcome, "unique")
  assert.deepEqual(unique.resolution.candidates.map((item) => item.domain), ["acme.example"])

  const multiple = await modelProposal({ body: rss(
    { title: "Alpha One", link: "https://alpha-one.com/" },
    { title: "Alpha Two", link: "https://alpha-two.com/" },
  ), subject: "Alpha", query: "Alpha", outcome: "multiple", selected: [0, 1] })
  assert.equal(multiple.resolution.outcome, "multiple")
  assert.equal(multiple.resolution.candidates.length, 2)

  const none = await modelProposal({ body: rss(
    { title: "Google News", link: "https://news.google.com/", description: "News aggregated from sources worldwide" },
  ), subject: "Qzxv-Source-20260920", query: "Qzxv-Source-20260920", outcome: "none", selected: [] })
  assert.equal(none.search.candidates.length, 1)
  assert.equal(none.resolution.outcome, "none")
  assert.deepEqual(none.resolution.candidates, [])

  const clarification = structuredClone(emptyInterview)
  none.resolution.status = "needs_clarification"
  clarification.sourceResolutions.push(none.resolution)
  recordSourceResolution(clarification, unique.resolution)
  assert.equal(clarification.sourceResolutions[0]?.status, "superseded")
  assert.equal(clarification.sourceResolutions[1]?.status, "open")
})

test("Pi web_search 原始工具事实可被引用，宿主只校验 URL 而不判断语义", async () => {
  let searched = 0
  let resolution: SourceResolution | undefined
  const piSearches = new PiSourceSearchObserver(() => { searched += 1 })
  const tools = createSourceResolutionTools({ resolver: resolver(rss()), piSearches, revision: 2,
    questionId: "question-pi", onSearch: () => { searched += 1 }, onResolution: (value) => { resolution = value } })
  const envelope = { invocationId: "invocation-pi", createdAt: 1, type: "extension" as const,
    namespace: PI_AGENT_SESSION_AI_EVENT_NAMESPACE, version: 1 as const }
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 0, name: "tool.execution.started", payload: {
    type: "tool.execution.started", callId: "call-pi", toolName: "web_search", input: { query: "Acme official" },
  } }))
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 1, name: "tool.execution.completed", payload: {
    type: "tool.execution.completed", callId: "call-pi", toolName: "web_search", output: {
      content: [{ type: "text", text: "1. Acme Official\n   https://acme.example/\n\n2. Acme Review\n   https://other.example/story" }],
      details: { queries: ["Acme official"], successfulQueries: 1, totalResults: 2 },
    },
  } }))
  await tools[1]!.execute("proposal", { searchTool: "web_search", subject: "Acme", query: "Acme official",
    outcome: "unique", candidateUrls: ["https://acme.example/"] })
  assert.equal(searched, 1)
  assert.equal(resolution?.provider, "pi-web-access:web_search")
  assert.equal(resolution?.candidates[0]?.title, "Acme Official")

  const rejecting = createSourceResolutionTools({ resolver: resolver(rss()), piSearches, revision: 2,
    questionId: "question-pi-reject", onSearch: () => undefined, onResolution: () => undefined })
  await assert.rejects(rejecting[1]!.execute("proposal-reject", { searchTool: "web_search", subject: "Acme",
    query: "Acme official", outcome: "unique", candidateUrls: ["https://fabricated.example/"] }),
  /candidate_reference_invalid/)
})

test("Pi web_search 的内联和引用式 Markdown 链接都可作为严格来源证据", async () => {
  const piSearches = new PiSourceSearchObserver()
  let resolution: SourceResolution | undefined
  const tools = createSourceResolutionTools({ resolver: resolver(rss()), piSearches, revision: 3,
    questionId: "question-markdown", onSearch: () => undefined, onResolution: (value) => { resolution = value } })
  const envelope = { invocationId: "invocation-markdown", createdAt: 1, type: "extension" as const,
    namespace: PI_AGENT_SESSION_AI_EVENT_NAMESPACE, version: 1 as const }
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 0, name: "tool.execution.started", payload: {
    type: "tool.execution.started", callId: "call-markdown", toolName: "web_search", input: { query: "Acme" },
  } }))
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 1, name: "tool.execution.completed", payload: {
    type: "tool.execution.completed", callId: "call-markdown", toolName: "web_search", output: {
      content: [{ type: "text", text: "- [Acme Official](https://acme.example/)\n- [Acme Guide][guide]\n\n[guide]: https://guide.example/acme\nUnlinked https://fabricated.example/" }],
      details: { queries: ["Acme"], successfulQueries: 1 },
    },
  } }))
  await assert.rejects(tools[1]!.execute("proposal-fabricated", { searchTool: "web_search", subject: "Acme",
    query: "Acme", outcome: "unique", candidateUrls: ["https://fabricated.example/"] }),
  /candidate_reference_invalid/)
  await tools[1]!.execute("proposal-markdown", { searchTool: "web_search", subject: "Acme", query: "Acme",
    outcome: "multiple", candidateUrls: ["https://acme.example/", "https://guide.example/acme"] })
  assert.deepEqual(resolution?.candidates.map((item) => item.title), ["Acme Official", "Acme Guide"])
})

test("业务调研搜索后没有来源提案仍可提交正常说明和业务问题", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-research-turn-"))
  let store: ProductStore | undefined, coordinator: InterviewCoordinator | undefined
  try {
    store = await ProductStore.open(directory)
    const authored = authoredInterview({ assistantText: "查阅公开资料后，仍需你确认范围。", question: {
      prompt: "希望覆盖哪个时间范围？", options: [
        { label: "最近一年", description: "只看近期", recommended: true },
        { label: "全部历史", description: "覆盖全部", recommended: false },
      ],
    }, draft: null })
    assert.equal(authored.type, "turn_succeeded")
    if (authored.type !== "turn_succeeded") throw new Error("fixture authoring missing")
    const outputText = authored.outputText
    const provider: AIModelProvider = {
      selection: () => testSelection,
      prepare: async () => { throw new Error("unused") },
      prepareMain: async (selection) => ({ selection, close: async () => undefined,
        run: async (input) => {
          const invocationId = "business-research"
          input.onEvent(parseAIEvent({ type: "generation.started", invocationId, sequence: 0,
            createdAt: 1, output: "text", model: selection }))
          for (const [sequence, name, payload] of [
            [1, "tool.execution.started", { type: "tool.execution.started", callId: "research-1",
              toolName: "web_search", input: { query: "public history" } }],
            [2, "tool.execution.completed", { type: "tool.execution.completed", callId: "research-1",
              toolName: "web_search", output: { content: [{ type: "text", text: "[History](https://history.example/)" }],
                details: { queries: ["public history"], successfulQueries: 1 } } }],
          ] as const) input.onEvent(parseAIEvent({ type: "extension", invocationId, sequence, createdAt: sequence + 1,
            namespace: PI_AGENT_SESSION_AI_EVENT_NAMESPACE, name, version: 1, payload }))
          input.onEvent(parseAIEvent({ type: "text.delta", invocationId, sequence: 3, createdAt: 4, text: outputText }))
          input.onEvent(parseAIEvent({ type: "generation.completed", invocationId, sequence: 4, createdAt: 5,
            providerId: "fixture", modelId: selection.modelId, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
          return { outputText }
        },
      }),
    }
    coordinator = new InterviewCoordinator(store, provider, loadInterviewSkill(projectRoot))
    const id = coordinator.taskAction({ type: "create", requestId: randomUUID() })
    coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: 0,
      text: "研究公共资料并澄清范围" })
    await coordinator.waitForIdle()
    const state = store.snapshot(id)
    assert.equal(state.turns[0]?.status, "succeeded", state.turns[0]?.reason ?? undefined)
    assert.match(state.messages.at(-1)?.text ?? "", /查阅公开资料后/)
    assert.ok(state.messages.at(-1)?.question)
    assert.deepEqual(state.sourceResolutions, [])
    assert.equal(state.messages.at(-1)?.aiEvents.filter((event) => event.type === "extension").length, 2)
  } finally {
    await coordinator?.close(); await store?.close(); await rm(directory, { recursive: true, force: true })
  }
})

test("来源 Question 的 typed 选择写回事实，待决未清零时服务端拒绝草稿和确认", async () => {
  const { resolution } = await modelProposal({ body: rss(
    { title: "Acme Official", link: "https://acme.example/", description: "Acme service" },
  ), subject: "Acme", query: "Acme official", outcome: "unique", selected: [0], questionId: "question-source" })
  const projected = sourceResolutionOutput(resolution, "run-1", { assistantText: "已找到来源。", question: null,
    draft: null, parts: [] })
  assert.equal(projected.question && "type" in projected.question ? projected.question.type : null, "choice")
  assert.match(projected.assistantText, /^已找到来源。\n\n/)
  assert.equal(projected.parts?.[0]?.type, "text")
  assert.equal(projected.parts?.[0]?.type === "text" ? projected.parts[0].text : null, "已找到来源。")
  const state = structuredClone(emptyInterview)
  state.revision = 1
  state.messages.push({ id: "question-source", role: "assistant", text: projected.assistantText, status: "complete",
    question: projected.question, draftVersion: 1, aiEvents: [] })
  state.drafts.push({ version: 1, revision: 1, title: "Acme task", markdown: markdown("acme.example"), brief: null })
  state.unresolved.push({ id: "question-source", revision: 1, question: projected.question!, status: "open", answerMessageId: null })
  recordSourceResolution(state, resolution)
  assert.throws(() => assertRequirementReady(state, state.drafts[0]!.markdown), /unresolved_items_open/)
  assert.throws(() => confirmDraft(state, 1), /待决事项/)

  state.unresolved[0]!.status = "answered"
  state.unresolved[0]!.answerMessageId = "answer-source"
  applySourceResolutionAnswer(state, "question-source", { selectedOptionIds: [resolution.candidates[0]!.id] }, "answer-source")
  assert.doesNotThrow(() => assertRequirementReady(state, state.drafts[0]!.markdown))
  confirmDraft(state, 1)
  assert.equal(state.confirmedVersion, 1)
})

test("未发起来源搜索时不强迫生成 URL，已搜索来源仍进入确认需求事实", async () => {
  const state = structuredClone(emptyInterview)
  assert.doesNotThrow(() => parseInterviewOutput({ assistantText: "形成草稿", question: null,
    draft: { title: "Task", markdown: markdown("已确认的业务来源"), brief: null } }, state))

  const directory = await mkdtemp(path.join(tmpdir(), "bat-r1-source-"))
  let store: ProductStore | undefined
  try {
    store = await ProductStore.open(directory)
    const sourceFreeTaskId = randomUUID()
    store.insertTask({ id: sourceFreeTaskId, title: "Current page task", renamed: false, archived: false,
      updatedAt: new Date().toISOString() }, structuredClone(emptyInterview))
    store.mutate(sourceFreeTaskId, (value) => {
      value.revision = 1; value.confirmedVersion = 1
      value.drafts.push({ version: 1, revision: 1, title: "Current page task",
        markdown: markdown("已确认的业务来源"), brief: null })
      value.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
        messageId: null, questionId: null, draftVersion: 1, createdAt: new Date().toISOString() })
    })
    const sourceFreeRequirement = syncConfirmedRequirement(store, new TaskContractRepository(store), sourceFreeTaskId)!
    assert.deepEqual(sourceFreeRequirement.confirmationFacts?.sources, [])
    assert.match(sourceFreeRequirement.scope, /需求正文中的来源与范围/)

    const taskId = randomUUID()
    store.insertTask({ id: taskId, title: "Acme task", renamed: false, archived: false,
      updatedAt: new Date().toISOString() }, structuredClone(emptyInterview))
    const candidateId = "source:acme"
    const resolution: SourceResolution = {
      id: randomUUID(), revision: 1, subject: "Acme", query: "Acme official", provider: "bing_rss", searchStatus: "ok", outcome: "unique",
      status: "selected", candidates: [{ id: candidateId, title: "Acme Official", url: "https://acme.example/",
        origin: "https://acme.example", domain: "acme.example", description: "Acme service" }],
      questionId: "question-source", selectedCandidateId: candidateId, answerMessageId: "answer-source",
      createdAt: new Date().toISOString(),
    }
    store.mutate(taskId, (value) => {
      value.revision = 1; value.confirmedVersion = 1
      value.drafts.push({ version: 1, revision: 1, title: "Acme task", markdown: markdown("acme.example"), brief: null })
      value.sourceResolutions.push(resolution)
      value.decisions.push({ id: randomUUID(), revision: 1, kind: "option", text: "Acme Official", messageId: "answer-source",
        questionId: "question-source", draftVersion: null, createdAt: new Date().toISOString() })
      value.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
        messageId: null, questionId: null, draftVersion: 1, createdAt: new Date().toISOString() })
    })
    const requirement = syncConfirmedRequirement(store, new TaskContractRepository(store), taskId)!
    assert.equal(requirement.inputContract, null)
    assert.equal(requirement.outputContract, null)
    assert.equal(requirement.completionCriteria[0], "返回实际结果；没有结果时明确说明为空。")
    assert.equal(requirement.confirmationFacts?.sources[0]?.domain, "acme.example")
    assert.equal(requirement.confirmationFacts?.unresolvedItemCount, 0)
    await store.close(); store = undefined

    store = await ProductStore.open(directory)
    const restored = store.snapshot(taskId)
    assert.equal(restored.policyVersion, 1)
    assert.equal(restored.sourceResolutions[0]?.selectedCandidateId, candidateId)
    assert.equal(syncConfirmedRequirement(store, new TaskContractRepository(store), taskId)?.id, requirement.id)
  } finally {
    await store?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
