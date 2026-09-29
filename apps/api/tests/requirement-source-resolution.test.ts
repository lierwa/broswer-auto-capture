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
import { beginRound, confirmDraft, finishRound } from "../src/interview/transitions.js"
import {
  applySourceResolutionAnswer,
  assertRequirementReady,
  createSourceResolutionTools,
  PiSourceSearchObserver,
  ReadOnlySourceResolver,
  recordSourceResolution,
  recordUserProvidedSources,
  preparationEntryFacts,
  projectProvidedDraftSources,
  sourceResolutionOutput,
  type SourceSearch,
} from "../src/interview/source-resolution.js"
import { testSelection } from "./fixtures/ai-model.js"
import { authoredInterview, projectRoot } from "./helpers.js"

const markdown = (domain: string, ...entries: string[]) => `# 任务目标与最终结果\n\n从 ${domain} 完成已确认任务。${entries.length ? `\n\n## 试做入口\n\n${entries.map((url, index) => `${index + 1}. ${url}`).join("\n")}` : ""}\n\n## 运行输入\n- 无\n\n## 代表试做\n从已选入口执行已确认任务。\n\n## 结果与完成\n- 交付：完成状态\n- 页面交付：无需保留\n返回实际结果；没有结果时明确说明为空。`
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
  await tools[1]!.execute("proposal", { subject: input.subject, query: input.query,
    searchId: search.id, candidateIds: input.selected.map((index) => search.candidates[index]!.id) })
  assert.equal(searched, true)
  assert.ok(resolution)
  assert.equal(resolution.outcome, input.outcome)
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

test("同轮后备搜索可核查多个公开事实，来源提案只能引用对应查询的真实结果", async () => {
  const responses = new Map([
    ["Acme 官方入口", rss({ title: "Acme 官网", link: "https://acme.example/" })],
    ["Acme 当前访问说明", rss({ title: "Acme 访问说明", link: "https://help.example/access" })],
  ])
  const searches: string[] = []
  const sourceResolver = new ReadOnlySourceResolver(async (url) => {
    const query = new URL(String(url)).searchParams.get("q")!
    return new Response(responses.get(query) ?? rss(), { status: 200 })
  })
  let resolution: SourceResolution | undefined
  const tools = createSourceResolutionTools({ resolver: sourceResolver, revision: 1,
    questionId: "source-q", onSearch: () => { searches.push("called") },
    onResolution: (value) => { resolution = value } })
  const entry = (await tools[0]!.execute("entry", { subject: "Acme", query: "Acme 官方入口" }) as { details: SourceSearch }).details
  const facts = await tools[0]!.execute("facts", { subject: "Acme", query: "Acme 当前访问说明" }) as { details: SourceSearch; content: unknown }
  assert.equal(searches.length, 2)
  assert.match(JSON.stringify(facts), /仅在本轮需要确认或改选来源时/)
  await assert.rejects(tools[1]!.execute("wrong", { subject: "Acme", searchId: facts.details.id,
    query: "Acme 当前访问说明", candidateIds: [entry.candidates[0]!.id] }),
    /candidate_reference_invalid/)
  await tools[1]!.execute("right", { subject: "Acme", searchId: entry.id,
    query: "Acme 官方入口", candidateIds: [entry.candidates[0]!.id] })
  assert.equal(resolution?.candidates[0]?.url, "https://acme.example/")
})

test("Pi web_search 原始工具事实可被精确引用，宿主不判断语义", async () => {
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
  const [reference] = piSearches.expose()
  await tools[1]!.execute("proposal", { subject: "Acme", query: "Acme official",
    searchId: reference!.searchId, candidateIds: [reference!.results[0]!.id] })
  assert.equal(searched, 1)
  assert.equal(resolution?.provider, "pi-web-access:web_search")
  assert.equal(resolution?.candidates[0]?.title, "Acme Official")
  const rejecting = createSourceResolutionTools({ resolver: resolver(rss()), piSearches, revision: 2,
    questionId: "question-pi-reject", onSearch: () => undefined, onResolution: () => undefined })
  await assert.rejects(rejecting[1]!.execute("proposal-reject", { subject: "Acme", searchId: reference!.searchId,
    query: "Acme official", candidateIds: ["source:fabricated"] }),
  /candidate_reference_invalid/)
})

test("Pi 搜索正文先给动作链接时，来源列表原标题仍进入同 URL 候选题板", async () => {
  const piSearches = new PiSourceSearchObserver()
  let resolution: SourceResolution | undefined
  const query = "Series A official collection"
  const tools = createSourceResolutionTools({ resolver: resolver(rss()), piSearches, revision: 1,
    questionId: "question-list-title", onSearch: () => undefined, onResolution: (value) => { resolution = value } })
  const envelope = { invocationId: "invocation-list-title", createdAt: 1, type: "extension" as const,
    namespace: PI_AGENT_SESSION_AI_EVENT_NAMESPACE, version: 1 as const }
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 0, name: "tool.execution.started", payload: {
    type: "tool.execution.started", callId: "call-list-title", toolName: "web_search", input: { query },
  } }))
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 1, name: "tool.execution.completed", payload: {
    type: "tool.execution.completed", callId: "call-list-title", toolName: "web_search", output: {
      content: [{ type: "text", text: [
        "Series A official collection", "[Watch now](https://media.example/collection)",
        "**Sources:**", "1. Series A | Official Collection", "   https://media.example/collection",
      ].join("\n") }],
      details: { queries: [query], successfulQueries: 1 },
    },
  } }))
  const [reference] = piSearches.expose()
  await tools[1]!.execute("proposal-title", { subject: "Series A", query,
    searchId: reference!.searchId, candidateIds: [reference!.results[0]!.id] })
  assert.equal(resolution?.candidates[0]?.title, "Series A | Official Collection")
  assert.match(resolution?.candidates[0]?.description ?? "", /搜索来源列表标题：Series A/)
  const question = sourceResolutionOutput(resolution!, "run-list-title").question
  assert.match(JSON.stringify(question), /Series A \| Official Collection/)
})

test("Pi 搜索摘要原样留在来源事实，短摘要进入题板且候选不自动推荐", async () => {
  const piSearches = new PiSourceSearchObserver()
  let resolution: SourceResolution | undefined
  const tools = createSourceResolutionTools({ resolver: resolver(rss()), piSearches, revision: 1,
    questionId: "question-evidence", onSearch: () => undefined, onResolution: (value) => { resolution = value } })
  const envelope = { invocationId: "invocation-evidence", createdAt: 1, type: "extension" as const,
    namespace: PI_AGENT_SESSION_AI_EVENT_NAMESPACE, version: 1 as const }
  const query = "Series A official source"
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 0, name: "tool.execution.started", payload: {
    type: "tool.execution.started", callId: "call-evidence", toolName: "web_search", input: { query },
  } }))
  piSearches.accept(parseAIEvent({ ...envelope, sequence: 1, name: "tool.execution.completed", payload: {
    type: "tool.execution.completed", callId: "call-evidence", toolName: "web_search", output: {
      content: [{ type: "text", text: [
        "【Clip】 Series A episode 1, uploaded two years ago",
        "Source: Series A clip (https://video.example/clip/1)",
        "Official Series A collection with current episodes",
        "Source: Series A collection (https://official.example/series/a)",
        "Sources:", "1. Series A clip", "https://video.example/clip/1",
        "2. Series A collection", "https://official.example/series/a",
      ].join("\n") }],
      details: { queries: [query], successfulQueries: 1, totalResults: 2 },
    },
  } }))
  const [reference] = piSearches.expose()
  await tools[1]!.execute("proposal-evidence", { subject: "Series A", query,
    searchId: reference!.searchId, candidateIds: reference!.results.map((item) => item.id) })
  assert.ok(resolution)
  assert.match(resolution.candidates[0]!.description, /episode 1, uploaded two years ago/)
  assert.match(resolution.candidates[1]!.description, /current episodes/)
  const question = sourceResolutionOutput(resolution, "run-evidence").question
  if (!question || !("type" in question) || question.type !== "choice") throw new Error("source_question_not_choice")
  assert.match(question.data.options[0]!.subtitle ?? "", /episode 1, uploaded two years ago/)
  assert.match(question.data.options[0]!.subtitle ?? "", /https:\/\/video\.example\/clip\/1/)
  assert.match(question.data.options[1]!.subtitle ?? "", /https:\/\/official\.example\/series\/a/)
  assert.equal(question.data.options[0]!.recommended, false)
  assert.equal(question.data.options[1]!.recommended, false)
  assert.doesNotMatch(question.data.stem, /多个合理来源/)
})

test("长搜索摘要只在来源题板预览，原始候选证据完整保留", async () => {
  const excerpt = `官方作品栏目与当前目录。${"说明页面范围和内容身份。".repeat(14)}`
  const { resolution } = await modelProposal({
    body: rss({ title: "Collection", link: "https://example.org/collection", description: excerpt }),
    subject: "Collection", query: "Collection official", outcome: "unique", selected: [0],
  })
  const candidate = resolution.candidates[0]!
  assert.equal(candidate.description, excerpt.slice(0, 280))
  const question = sourceResolutionOutput(resolution, "run-preview").question
  if (!question || !("type" in question) || question.type !== "choice") throw new Error("source_question_not_choice")
  const subtitle = question.data.options[0]!.subtitle ?? ""
  assert.match(subtitle, /https:\/\/example\.org\/collection/)
  assert.match(subtitle, /官方作品栏目与当前目录/)
  assert.match(subtitle, /完整摘要见上方搜索记录/)
  assert.ok(subtitle.length < 150)
  assert.doesNotMatch(subtitle, /说明页面范围和内容身份。说明页面范围和内容身份。说明页面范围和内容身份。$/)
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
  const [reference] = piSearches.expose()
  await assert.rejects(tools[1]!.execute("proposal-fabricated", { subject: "Acme",
    query: "Acme", searchId: reference!.searchId, candidateIds: ["source:fabricated"] }),
  /candidate_reference_invalid/)
  await tools[1]!.execute("proposal-markdown", { subject: "Acme", query: "Acme",
    searchId: reference!.searchId, candidateIds: reference!.results.map((item) => item.id) })
  assert.deepEqual(resolution?.candidates.map((item) => item.title), ["Acme Official", "Acme Guide"])
})

test("用户提及的同站 URL 保留原文引用，草案决定入口顺序且确认时才固定", () => {
  const state = structuredClone(emptyInterview)
  recordUserProvidedSources(state, "https://acme.example/start https://acme.example/search", 1)
  assert.equal(state.sourceResolutions.length, 2)
  assert.deepEqual(state.sourceResolutions.map((item) => item.provider), ["user_provided", "user_provided"])
  assert.deepEqual(state.sourceResolutions.map((item) => item.status), ["open", "open"])
  const draft = markdown("acme.example", "https://acme.example/search", "https://acme.example/start")
  const projected = projectProvidedDraftSources(state, draft)
  assert.deepEqual(state.sourceResolutions.map((item) => item.status), ["open", "open"])
  assert.deepEqual(projected.sourceResolutions.map((item) => item.status), ["selected", "selected"])
  assert.deepEqual(preparationEntryFacts(projected, draft), [
    { url: "https://acme.example/search", resolutionId: state.sourceResolutions[1]!.id },
    { url: "https://acme.example/start", resolutionId: state.sourceResolutions[0]!.id },
  ])
  assert.doesNotThrow(() => assertRequirementReady(projected, draft, true))
  assert.throws(() => assertRequirementReady(projected, markdown("acme.example", "https://acme.example/unverified"), true),
    /draft_url_unverified/)
  assert.throws(() => preparationEntryFacts(projected, draft.replace("2. https", "3. https")), /entry_order_invalid/)
})

test("访谈草案排除的原文网址不会成为入口，重复提及会撤销旧版本引用", () => {
  const state = structuredClone(emptyInterview)
  recordUserProvidedSources(state, "不要用 https://wrong.example/show；使用 https://right.example/start", 1)
  const draft = markdown("right.example", "https://right.example/start")
  const projected = projectProvidedDraftSources(state, draft)
  assert.equal(projected.sourceResolutions[0]?.status, "superseded")
  assert.equal(projected.sourceResolutions[1]?.status, "selected")
  assert.doesNotThrow(() => assertRequirementReady(projected, draft, true))
  assert.throws(() => preparationEntryFacts(projected,
    markdown("wrong.example", "https://wrong.example/show")), /entry_reference_invalid/)
  state.revision = 1
  state.drafts.push({ version: 1, revision: 1, title: "Right task", markdown: draft, brief: null })
  confirmDraft(state, 1)
  assert.equal(state.confirmedVersion, 1)
  assert.deepEqual(state.sourceResolutions.map((item) => item.status), ["superseded", "selected"])
  recordUserProvidedSources(state, "不要再用 https://right.example/start", 2)
  assert.equal(state.sourceResolutions[1]?.status, "superseded")
  assert.equal(state.sourceResolutions.at(-1)?.status, "open")
  const revised = markdown("right.example", "https://right.example/start")
  const revisedProjection = projectProvidedDraftSources(state, revised)
  assert.equal(revisedProjection.sourceResolutions.at(-1)?.status, "selected")
  assert.doesNotThrow(() => assertRequirementReady(revisedProjection, revised, true))
})

test("用户提及 URL 不由宿主固定提问，仍交给访谈 Skill 判断歧义", () => {
  const state = structuredClone(emptyInterview)
  beginRound(state, { type: "message", requestId: randomUUID(), expectedRevision: 0,
    text: "不要用 https://wrong.example/show；改用 https://right.example/start" })
  assert.equal(state.turns[0]?.status, "running")
  assert.equal(state.unresolved.length, 0)
  assert.deepEqual(state.sourceResolutions.map((item) => item.status), ["open", "open"])
})

test("来源 Question 被新一轮取代时撤销对应待决来源，并收敛已持久化孤儿状态", async () => {
  const { resolution } = await modelProposal({ body: rss({ title: "Acme Official", link: "https://acme.example/" }),
    subject: "Acme", query: "Acme official", outcome: "unique", selected: [0], questionId: "old-source-question" })
  const previous = sourceResolutionOutput(resolution, "previous")
  const state = structuredClone(emptyInterview)
  state.revision = 1
  state.messages.push({ id: "old-source-question", role: "assistant", text: previous.assistantText,
    status: "complete", question: previous.question, draftVersion: null, aiEvents: [] })
  state.unresolved.push({ id: "old-source-question", revision: 1, question: previous.question!,
    status: "open", answerMessageId: null })
  recordSourceResolution(state, resolution)

  const roundId = beginRound(state, { type: "message", requestId: randomUUID(), expectedRevision: 1,
    text: "补充真正的业务要求" })
  assert.equal(state.sourceResolutions[0]?.status, "open")
  finishRound(state, roundId, "succeeded", { assistantText: "已理解补充。", question: null, draft: null, parts: [] })
  assert.equal(state.unresolved[0]?.status, "superseded")
  assert.equal(state.sourceResolutions[0]?.status, "superseded")
  assert.doesNotThrow(() => assertRequirementReady(state))

  const restored = structuredClone(state)
  restored.sourceResolutions[0]!.status = "open"
  beginRound(restored, { type: "message", requestId: randomUUID(), expectedRevision: 2,
    text: "继续确认业务范围" })
  assert.equal(restored.sourceResolutions[0]?.status, "superseded")
})

test("未选搜索结果、被替换来源和草案正文中的错误深链都不能进入确认入口", async () => {
  const state = structuredClone(emptyInterview)
  const first = await modelProposal({ body: rss(
    { title: "Acme Official", link: "https://acme.example/old" },
    { title: "Acme Other", link: "https://other.example/page" },
  ), subject: "Acme", query: "Acme official", outcome: "multiple", selected: [0, 1] })
  first.resolution.status = "selected"
  first.resolution.selectedCandidateId = first.resolution.candidates[0]!.id
  recordSourceResolution(state, first.resolution)
  assert.throws(() => preparationEntryFacts(state, markdown("acme.example", "https://other.example/page")),
    /entry_reference_invalid/)

  const second = await modelProposal({ body: rss(
    { title: "Acme New", link: "https://acme.example/new" },
  ), subject: "Acme", query: "Acme new", outcome: "unique", selected: [0] })
  second.resolution.status = "selected"
  second.resolution.selectedCandidateId = second.resolution.candidates[0]!.id
  recordSourceResolution(state, second.resolution)
  assert.equal(first.resolution.status, "superseded")
  assert.throws(() => preparationEntryFacts(state, markdown("acme.example", "https://acme.example/old")),
    /entry_reference_invalid/)
  const wrongDeepLink = `${markdown("acme.example", "https://acme.example/new")}\n\n浏览器随后进入 https://acme.example/content/remembered。`
  assert.throws(() => assertRequirementReady(state, wrongDeepLink, true), /draft_url_unverified/)
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
  state.drafts.push({ version: 1, revision: 1, title: "Acme task", markdown: markdown("acme.example", "https://acme.example/"), brief: null })
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

test("未发起搜索但未有入口证据时不允许确认；已选搜索来源进入确认事实", async () => {
  const state = structuredClone(emptyInterview)
  assert.throws(() => parseInterviewOutput({ assistantText: "形成草稿", question: null,
    draft: { title: "Task", markdown: markdown("已确认的业务来源"), brief: null } }, state),
  /entry_section_required/)
  state.revision = 1
  state.drafts.push({ version: 1, revision: 1, title: "Task", markdown: markdown("已确认的业务来源"), brief: null })
  assert.throws(() => confirmDraft(state, 1), /试做入口/)

  const directory = await mkdtemp(path.join(tmpdir(), "bat-r1-source-"))
  let store: ProductStore | undefined
  try {
    store = await ProductStore.open(directory)
    const taskId = randomUUID()
    store.insertTask({ id: taskId, title: "Acme task", renamed: false, archived: false,
      updatedAt: new Date().toISOString() }, structuredClone(emptyInterview))
    const candidateId = "source:acme"
    const resolution: SourceResolution = {
      id: randomUUID(), revision: 1, subject: "Acme", query: "Acme official", searchId: "search-acme", provider: "bing_rss", searchStatus: "ok", outcome: "unique",
      status: "selected", candidates: [{ id: candidateId, title: "Acme Official", url: "https://acme.example/",
        origin: "https://acme.example", domain: "acme.example", description: "Acme service" }],
      questionId: "question-source", selectedCandidateId: candidateId, answerMessageId: "answer-source",
      createdAt: new Date().toISOString(),
    }
    store.mutate(taskId, (value) => {
      value.revision = 1; value.confirmedVersion = 1
      value.drafts.push({ version: 1, revision: 1, title: "Acme task",
        markdown: markdown("acme.example", "https://acme.example/"), brief: null })
      value.sourceResolutions.push(resolution)
      value.decisions.push({ id: randomUUID(), revision: 1, kind: "option", text: "Acme Official", messageId: "answer-source",
        questionId: "question-source", draftVersion: null, createdAt: new Date().toISOString() })
      value.decisions.push({ id: randomUUID(), revision: 1, kind: "draft_confirmation", text: "确认需求草稿 v1",
        messageId: null, questionId: null, draftVersion: 1, createdAt: new Date().toISOString() })
    })
    const requirement = syncConfirmedRequirement(store, new TaskContractRepository(store), taskId)!
    assert.equal(requirement.inputContract, null)
    assert.equal(requirement.outputContract, null)
    assert.equal(requirement.completionCriteria[0], "- 交付：完成状态\n- 页面交付：无需保留\n返回实际结果；没有结果时明确说明为空。")
    assert.equal(requirement.confirmationFacts?.sources[0]?.domain, "acme.example")
    assert.equal(requirement.confirmationFacts?.unresolvedItemCount, 0)
    await store.close(); store = undefined

    store = await ProductStore.open(directory)
    const restored = store.snapshot(taskId)
    assert.equal(restored.policyVersion, 1)
    assert.equal(restored.sourceResolutions[0]?.selectedCandidateId, candidateId)
    assert.equal(restored.sourceResolutions[0]?.searchId, "search-acme")
    assert.equal(syncConfirmedRequirement(store, new TaskContractRepository(store), taskId)?.id, requirement.id)
  } finally {
    await store?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
