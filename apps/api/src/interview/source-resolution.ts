import { randomUUID } from "node:crypto"
import { getDomain } from "tldts"
import { z } from "zod"
import { createCommonQuestionFromPanel } from "@agent-platform/ai-connect/integration/authoring/question"
import { type MainModelTool } from "@agent-platform/pi-agent-session"
import {
  sourceResolutionSchema,
  type InterviewOutput,
  type InterviewState,
  type SourceCandidate,
  type SourceResolution,
} from "@browser-capture/contracts/interview"
import { candidateId, PiSourceSearchObserver } from "./source-search-evidence.js"
export { PiSourceSearchObserver } from "./source-search-evidence.js"

const searchInputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(500),
}).strict()
const proposalInputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(500),
  searchId: z.string().trim().min(1).max(300),
  candidateIds: z.array(z.string().trim().min(1).max(200)).max(2),
}).strict()
type Fetcher = typeof fetch
export type SourceSearch = {
  id: string
  subject: string
  query: string
  status: "ok" | "unavailable"
  candidates: SourceCandidate[]
}


export class ReadOnlySourceResolver {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async search(input: z.infer<typeof searchInputSchema>, signal?: AbortSignal): Promise<SourceSearch> {
    const parsed = searchInputSchema.parse(input)
    let candidates: SourceCandidate[] = []
    let status: SourceSearch["status"] = "ok"
    try {
      const url = new URL("https://www.bing.com/search")
      url.searchParams.set("q", parsed.query); url.searchParams.set("format", "rss")
      const timeout = AbortSignal.timeout(20_000)
      const response = await this.fetcher(url, { headers: { "user-agent": "B-A-T/1.0 source-resolver" },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
      if (!response.ok) throw new Error("source_search_unavailable")
      const content = await response.text()
      if (content.length > 1_000_000) throw new Error("source_search_response_too_large")
      candidates = rawCandidates(parseRssItems(content))
    } catch (error) {
      if (signal?.aborted) throw error
      status = "unavailable"
    }
    return { id: randomUUID(), subject: parsed.subject, query: parsed.query, status, candidates }
  }
}

export function createSourceResolutionTools(input: {
  resolver: ReadOnlySourceResolver
  piSearches?: PiSourceSearchObserver
  revision: number
  questionId: string
  onSearch(): void
  onResolution(value: SourceResolution): void
}): MainModelTool[] {
  const searches: SourceSearch[] = []
  let resolved = false
  const searchTool: MainModelTool = {
    name: "search_sources",
    label: "通用只读搜索后备",
    description: "活动搜索工具不可用或失败时的通用只读后备。按完整对话需要调查来源或其他公开业务事实时使用；可有界追加查询并比较相反证据。只返回原始结果，宿主不判断业务相关性。",
    parameters: {
      type: "object", additionalProperties: false, required: ["subject", "query"], properties: {
        subject: { type: "string", description: "需要调查的用户可读业务对象" },
        query: { type: "string", description: "你根据完整对话自行确定的公开搜索词" },
      },
    },
    async execute(_callId: string, params: unknown, signal?: AbortSignal) {
      // WHY：一次搜索可能只覆盖一个假设；允许同轮有界核查反证或其他业务事实，不把首条结果当全集。
      if (searches.length >= 6) throw new Error("interview_source_search_budget_exhausted")
      const search = await input.resolver.search(searchInputSchema.parse(params), signal)
      searches.push(search)
      input.onSearch()
      return { content: [{ type: "text", text: sourceSearchResult(search) }], details: search }
    },
  }
  const piReferenceTool: MainModelTool = {
    name: "source_search_references",
    label: "查看原生搜索引用",
    description: "使用 web_search 后调用，取得本轮已完成搜索的可引用 searchId、原样查询和结果 ID；仍以原生搜索正文判断相关性。",
    parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
    async execute() {
      return { content: [{ type: "text", text: JSON.stringify({
        searches: input.piSearches?.expose() ?? [],
        instruction: "仅引用本结果中可见的 searchId 和该调用下的结果 ID；没有可靠候选时提交空 candidateIds。",
      }) }] }
    },
  }
  const proposalTool: MainModelTool = {
    name: "present_source_candidates",
    label: "提交来源候选判断",
    description: "仅在需要新增或改选业务来源、试做入口时调用。比较原始搜索结果的支持及反证，引用模型已看到的 searchId 和该次结果 ID；无可靠候选交空数组。web_search 后先调用 source_search_references 取得可见 ID。已选来源内其他业务事实的搜索不调用本工具。",
    parameters: {
      type: "object", additionalProperties: false,
      required: ["subject", "query", "searchId", "candidateIds"], properties: {
        subject: { type: "string", description: "需要用户确认的业务来源对象" },
        query: { type: "string", description: "传给该搜索工具的原样搜索词" },
        searchId: { type: "string", description: "实际看到的指定搜索调用 ID" },
        candidateIds: { type: "array", maxItems: 2, items: { type: "string" },
          description: "按推荐顺序引用同一搜索调用中真实可见的结果 ID；没有可靠候选时留空" },
      },
    },
    async execute(_callId: string, params: unknown) {
      if (resolved) throw new Error("interview_source_proposal_already_submitted")
      const proposal = proposalInputSchema.parse(params)
      const fallback = searches.find((search) => search.id === proposal.searchId)
      const native = input.piSearches?.findById(proposal.searchId)
      if ((!fallback && !native) || (fallback && fallback.query !== proposal.query)
        || (native && !native.queries.includes(proposal.query))) {
        throw new Error("interview_source_search_reference_invalid")
      }
      if (new Set(proposal.candidateIds).size !== proposal.candidateIds.length) {
        throw new Error("interview_source_candidate_count_invalid")
      }
      const evidence = fallback ?? native!
      const candidates = proposal.candidateIds.map((id) => evidence.candidates.find((candidate) => candidate.id === id))
      if (candidates.some((candidate) => !candidate)) throw new Error("interview_source_candidate_reference_invalid")
      const outcome = candidates.length === 0 ? "none" : candidates.length === 1 ? "unique" : "multiple"
      const value = sourceResolutionSchema.parse({
        id: randomUUID(), revision: input.revision, subject: proposal.subject, query: proposal.query,
        searchId: proposal.searchId, provider: native ? "pi-web-access:web_search" : "bing_rss",
        searchStatus: evidence.status, outcome, status: "open",
        candidates, questionId: input.questionId, selectedCandidateId: null, answerMessageId: null,
        createdAt: new Date().toISOString(),
      })
      resolved = true; input.onResolution(value)
      return { content: [{ type: "text", text: "候选引用已校验；宿主会生成来源确认 Question，本轮不要再生成问题或草稿。" }], details: value }
    },
  }
  return [searchTool, proposalTool, piReferenceTool]
}

export function sourceResolutionOutput(value: SourceResolution, runId: string, output?: InterviewOutput): InterviewOutput {
  // WHY：候选和待决方式由宿主事实决定，不能让模型正文反向要求用户填写 URL、selector 或其他技术参数。
  const lead = sourceLead(value)
  const original = output?.assistantText.trim() ?? ""
  const text = original ? `${original}\n\n${lead}` : lead
  const originalParts = output?.parts?.filter((part) => part.type === "text") ?? []
  const parts = originalParts.length ? originalParts : original
    ? [{ id: `${runId}:source-context`, type: "text" as const, text: original }] : []
  return {
    assistantText: text,
    question: sourceQuestion(value),
    draft: null,
    parts: [...parts, { id: `${runId}:source-resolution`, type: "text", text: original ? `\n\n${lead}` : lead }],
  }
}

export function applySourceResolutionAnswer(
  state: InterviewState,
  questionId: string,
  answer: Record<string, unknown>,
  messageId: string,
) {
  const resolution = state.sourceResolutions.findLast((item) => item.questionId === questionId && item.status === "open")
  if (!resolution) return
  const selected = Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds.filter((id): id is string => typeof id === "string") : []
  const candidate = resolution.candidates.find((item) => selected.includes(item.id))
  resolution.answerMessageId = messageId
  resolution.selectedCandidateId = candidate?.id ?? null
  resolution.status = candidate ? "selected" : "needs_clarification"
}

export function recordSourceResolution(state: InterviewState, value: SourceResolution) {
  const subject = normalize(value.subject)
  // WHY：用户回答“都不是”或无候选自由输入后，下一次解析就是对同一待决来源的替代事实；旧待决不能永久卡住确认门。
  const clarified = state.sourceResolutions.findLast((item) => item.status === "needs_clarification")
  if (clarified) clarified.status = "superseded"
  // WHY：用户逐条提供的同站 URL 都是独立证据，不能仅因域名相同而丢失较早的入口引用。
  if (value.provider === "user_provided") {
    state.sourceResolutions.push(value)
    return
  }
  for (const existing of state.sourceResolutions) {
    if (existing.status !== "superseded" && normalize(existing.subject) === subject) existing.status = "superseded"
  }
  state.sourceResolutions.push(value)
}

export function recordUserProvidedSources(state: InterviewState, text: string, revision: number) {
  const seen = new Set<string>()
  for (const raw of text.match(/https?:\/\/[^\s<>"')，。；]+/gu) ?? []) {
    let url: URL
    try { url = new URL(raw) } catch { continue }
    const candidate = candidateFromUrl(url)
    if (seen.has(candidate.url)) continue
    seen.add(candidate.url)
    // WHY：后续原文可以修正早先提供的 URL；新提及先保留为候选，交给访谈 Skill 写入或排除草案。
    for (const existing of state.sourceResolutions) {
      if (existing.status !== "superseded" && existing.candidates.some((source) => source.url === candidate.url)) {
        existing.status = "superseded"
      }
    }
    const value = sourceResolutionSchema.parse({
      id: randomUUID(), revision, subject: candidate.domain, query: candidate.url, provider: "user_provided",
      searchStatus: "ok", outcome: "provided", status: "open", candidates: [candidate], questionId: null,
      selectedCandidateId: null, answerMessageId: null, createdAt: new Date().toISOString(),
    })
    recordSourceResolution(state, value)
  }
}

export function assertRequirementReady(state: InterviewState, markdown?: string, requireEntries = false) {
  if (state.unresolved.some((item) => item.status === "open")) throw new Error("interview_unresolved_items_open")
  const active = state.sourceResolutions.filter((item) => item.status !== "superseded")
  // WHY：搜索是否必要由访谈模型根据完整对话决定；确认门只核对入口的实际来源引用和未决选择，
  // 不要求每轮搜索，也不按站名或词表替模型判断哪个候选符合业务目标。
  if (active.some((item) => item.status !== "selected")) throw new Error("interview_source_decision_pending")
  if (!markdown) return
  const selected = selectedSourceFacts(state)
  const userProvided = state.sourceResolutions.filter((item) => item.provider === "user_provided")
    .flatMap((item) => item.candidates.map((candidate) => candidate.url))
  for (const url of markdownUrls(markdown)) {
    if (!selected.some((source) => source.url === url) && !userProvided.includes(url)) {
      throw new Error("interview_draft_url_unverified")
    }
  }
  if (requireEntries || /^##\s+试做入口\s*$/mu.test(markdown)) preparationEntryFacts(state, markdown)
}

/** WHY：用户原文 URL 是来源候选；访谈 Skill 负责业务取舍，用户确认同版草案时才固定所选入口。 */
export function projectProvidedDraftSources(state: InterviewState, markdown: string): InterviewState {
  const entryUrls = new Set(draftEntryUrls(markdown))
  const projected = structuredClone(state)
  for (const resolution of projected.sourceResolutions) {
    if (resolution.provider !== "user_provided" || resolution.status !== "open" || resolution.questionId !== null) continue
    const candidate = resolution.candidates[0]
    if (candidate && entryUrls.has(candidate.url)) {
      resolution.status = "selected"
      resolution.selectedCandidateId = candidate.id
    } else resolution.status = "superseded"
  }
  return projected
}

// WHY：入口次序只来自同版草案；来源表可以包含调研依据，不能把每个已选 URL 都当成 B-U 起点。
export function preparationEntryFacts(state: InterviewState, markdown: string) {
  const entryUrls = draftEntryUrls(markdown)
  const selected = selectedSourceFacts(state)
  return entryUrls.map((url) => {
    const source = selected.findLast((item) => item.url === url)
    if (!source) throw new Error("interview_entry_reference_invalid")
    return { url, resolutionId: source.resolutionId }
  })
}

function draftEntryUrls(markdown: string) {
  const headings = [...markdown.matchAll(/^##\s+试做入口\s*$/gmu)]
  if (headings.length !== 1) throw new Error("interview_entry_section_required")
  const body = markdown.slice(headings[0]!.index! + headings[0]![0].length).split(/^#{1,6}\s+/mu, 1)[0]!
  const lines = body.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error("interview_entry_required")
  const seen = new Set<string>()
  return lines.map((line, index) => {
    const match = line.match(/^(\d+)\.\s+(https?:\/\/\S+)$/u)
    if (!match || Number(match[1]) !== index + 1) throw new Error("interview_entry_order_invalid")
    const url = new URL(match[2]!).href
    if (seen.has(url)) throw new Error("interview_entry_reference_invalid")
    seen.add(url)
    return url
  })
}

function markdownUrls(markdown: string) {
  return [...markdown.matchAll(/https?:\/\/[^\s<>"']+/gu)].map((match) => {
    const raw = match[0].replace(/[),.;\]，。；）]+$/u, "")
    try { return new URL(raw).href } catch { throw new Error("interview_draft_url_invalid") }
  })
}

export function selectedSourceFacts(state: InterviewState) {
  return state.sourceResolutions.filter((item) => item.status === "selected").flatMap((resolution) => {
    const source = resolution.candidates.find((candidate) => candidate.id === resolution.selectedCandidateId)
    return source ? [{ resolutionId: resolution.id, label: source.title, url: source.url, origin: source.origin,
      domain: source.domain, provider: resolution.provider, query: resolution.query }] : []
  })
}

function sourceQuestion(value: SourceResolution) {
  if (value.outcome === "none") return createCommonQuestionFromPanel({ id: value.questionId!, panel: {
    mode: "free_form", prompt: value.searchStatus === "unavailable"
      ? `暂时无法完成“${value.subject}”的公开来源搜索。请补充业务名称、所属服务或内容身份。`
      : `没有找到“${value.subject}”的可靠公开来源。请补充业务名称、所属服务或内容身份。`,
    options: [], placeholder: "补充业务线索，不需要填写技术入口或选择器", multiline: true,
  } })
  const options = value.candidates.slice(0, 2).map((candidate) => ({
    id: candidate.id, label: candidate.title,
    // WHY：候选描述和原始工具输出分别留在来源与事件事实；题板只给可扫读的预览。
    description: [candidate.url, sourceSummaryPreview(candidate.description)].filter(Boolean).join(" · "),
    // WHY：搜索排名与模型提交顺序都不是版权或动态目标入口的证明，题板不替候选背书。
    recommended: false,
  }))
  options.push({ id: "source:none", label: "都不是这些来源", description: "继续补充业务名称或内容身份", recommended: false })
  return createCommonQuestionFromPanel({ id: value.questionId!, panel: {
    mode: "choice", prompt: value.outcome === "unique" ? `请核对“${value.subject}”的这个搜索候选是否符合你的来源要求。` : `请核对“${value.subject}”的这些搜索候选；都不符合就选择“都不是这些来源”。`,
    options,
    inputs: [{ id: "other", label: "其他补充", kind: "textarea", role: "follow_up",
      placeholder: "可补充所属服务或内容身份（可选）" }],
  } })
}

function sourceSummaryPreview(description: string) {
  const text = description.replace(/\s+/gu, " ").trim()
  const characters = Array.from(text)
  return characters.length > 88
    ? `${characters.slice(0, 88).join("")}…（完整摘要见上方搜索记录）`
    : text
}

function sourceSearchResult(value: SourceSearch) {
  return JSON.stringify({ searchId: value.id, status: value.status, results: value.candidates.map((item) => ({
    id: item.id, title: item.title, url: item.url, domain: item.domain, description: item.description,
  })), instruction: "你负责判断原始结果的相关性。仅在本轮需要确认或改选来源时，才调用 present_source_candidates 并引用本次 searchId 与相关结果 ID。" })
}

function sourceLead(value: SourceResolution) {
  if (value.outcome === "none") return value.searchStatus === "unavailable"
    ? "这次公开来源搜索暂时不可用，需要你补充一个业务线索。"
    : "我还不能可靠确定业务来源，需要你补充一个业务线索。"
  return value.outcome === "unique" ? "我找到一个搜索候选，请核对是否符合你的来源要求。" : "我找到几个搜索候选，请核对是否符合你的来源要求。"
}

function parseRssItems(xml: string) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gu)].map((match) => ({
    title: xmlField(match[1]!, "title"), link: xmlField(match[1]!, "link"),
    description: stripMarkup(xmlField(match[1]!, "description")),
  })).filter((item) => item.title && item.link)
}

function xmlField(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "u"))
  return decodeXml(match?.[1]?.trim() ?? "")
}

function decodeXml(value: string) {
  return value.replace(/&#(x?[0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(
    code.toLowerCase().startsWith("x") ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10)))
    .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'")
}

function stripMarkup(value: string) { return value.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 280) }

function rawCandidates(items: Array<{ title: string; link: string; description: string }>) {
  const candidates = new Map<string, SourceCandidate>()
  for (const item of items) {
    let url: URL
    try { url = new URL(item.link) } catch { continue }
    if (!['http:', 'https:'].includes(url.protocol)) continue
    const domain = getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname
    const canonical = new URL(url.href); canonical.hash = ""
    if (!candidates.has(canonical.href)) candidates.set(canonical.href, {
      id: candidateId(canonical.href), title: item.title.slice(0, 200), url: canonical.href,
      origin: canonical.origin, domain, description: item.description,
    })
    if (candidates.size === 8) break
  }
  return [...candidates.values()]
}

function candidateFromUrl(url: URL): SourceCandidate {
  const domain = getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname
  return { id: candidateId(url.href), title: domain, url: url.href, origin: url.origin, domain,
    description: "用户在需求对话中提供的业务资料；可访问性留给准备任务核验。" }
}

function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") }
