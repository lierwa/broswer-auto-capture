import { createHash, randomUUID } from "node:crypto"
import { getDomain } from "tldts"
import { z } from "zod"
import type { AIEvent } from "@agent-platform/ai-connect/server"
import { createCommonQuestionFromPanel } from "@agent-platform/ai-connect/integration/authoring/question"
import { PI_AGENT_SESSION_AI_EVENT_NAMESPACE, type MainModelTool } from "@agent-platform/pi-agent-session"
import {
  sourceResolutionSchema,
  type InterviewOutput,
  type InterviewState,
  type SourceCandidate,
  type SourceResolution,
} from "@browser-capture/contracts/interview"

const searchInputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(500),
}).strict()
const httpUrlInput = z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
const proposalInputSchema = z.object({
  searchTool: z.enum(["web_search", "search_sources"]),
  subject: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(500),
  outcome: z.enum(["unique", "multiple", "none"]),
  candidateUrls: z.array(httpUrlInput).max(2),
}).strict()
const piSearchEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool.execution.started"), callId: z.string().min(1),
    toolName: z.literal("web_search"), input: z.unknown() }).passthrough(),
  z.object({ type: z.literal("tool.execution.completed"), callId: z.string().min(1),
    toolName: z.literal("web_search"), output: z.unknown() }).passthrough(),
  z.object({ type: z.literal("tool.execution.failed"), callId: z.string().min(1),
    toolName: z.literal("web_search") }).passthrough(),
])
const piSearchOutputSchema = z.object({
  content: z.array(z.object({ type: z.literal("text"), text: z.string() }).passthrough()),
  details: z.object({ queries: z.array(z.string().trim().min(1)).optional(),
    successfulQueries: z.number().int().nonnegative().optional(), error: z.string().optional() }).passthrough(),
}).passthrough()
type Fetcher = typeof fetch
export type SourceSearch = {
  id: string
  subject: string
  query: string
  status: "ok" | "unavailable"
  candidates: SourceCandidate[]
}

type PiSourceSearch = Readonly<{
  queries: readonly string[]
  status: SourceSearch["status"]
  candidates: readonly SourceCandidate[]
}>

export class PiSourceSearchObserver {
  private readonly pending = new Map<string, readonly string[]>()
  private readonly completed: PiSourceSearch[] = []
  private readonly usedCalls = new Set<string>()

  constructor(private readonly onSearch: () => void = () => undefined) {}

  accept(event: AIEvent) {
    if (event.type !== "extension" || event.namespace !== PI_AGENT_SESSION_AI_EVENT_NAMESPACE) return
    const parsed = piSearchEventSchema.safeParse(event.payload)
    if (!parsed.success) return
    const value = parsed.data
    this.markUsed(value.callId)
    if (value.type === "tool.execution.started") {
      this.pending.set(value.callId, searchQueries(value.input))
      return
    }
    if (value.type === "tool.execution.failed") {
      this.completed.push({ queries: this.pending.get(value.callId) ?? [], status: "unavailable", candidates: [] })
      return
    }
    const output = piSearchOutputSchema.safeParse(value.output)
    if (!output.success) {
      this.completed.push({ queries: this.pending.get(value.callId) ?? [], status: "unavailable", candidates: [] })
      return
    }
    const queries = output.data.details.queries ?? this.pending.get(value.callId) ?? []
    const status = output.data.details.error || output.data.details.successfulQueries === 0 ? "unavailable" : "ok"
    const text = output.data.content.map((item) => item.text).join("\n")
    this.completed.push({ queries, status, candidates: piSearchCandidates(text) })
  }

  find(query: string) {
    return this.completed.findLast((item) => item.queries.includes(query))
  }

  private markUsed(callId: string) {
    if (this.usedCalls.has(callId)) return
    this.usedCalls.add(callId)
    this.onSearch()
  }
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
  let search: SourceSearch | undefined
  let resolved = false
  const searchTool: MainModelTool = {
    name: "search_sources",
    label: "通用只读搜索后备",
    description: "仅在来源歧义确实需要搜索、且没有更合适的活动搜索工具时使用。按你根据完整对话决定的搜索词执行一次只读公开搜索，只返回原始结果；宿主不判断相关性、唯一性或可信度。",
    parameters: {
      type: "object", additionalProperties: false, required: ["subject", "query"], properties: {
        subject: { type: "string", description: "需要确认来源的用户可读业务对象" },
        query: { type: "string", description: "你根据完整对话自行确定的公开搜索词" },
      },
    },
    async execute(_callId: string, params: unknown, signal?: AbortSignal) {
      if (search) throw new Error("interview_source_search_already_performed")
      search = await input.resolver.search(searchInputSchema.parse(params), signal)
      input.onSearch()
      return { content: [{ type: "text", text: sourceSearchResult(search) }], details: search }
    },
  }
  const proposalTool: MainModelTool = {
    name: "present_source_candidates",
    label: "提交来源候选判断",
    description: "阅读本轮 web_search 或 search_sources 原始结果后，由你判断相关性并提交要让用户确认的真实结果 URL。宿主只校验 URL 来自该次结果，不替你做语义判断。",
    parameters: {
      type: "object", additionalProperties: false,
      required: ["searchTool", "subject", "query", "outcome", "candidateUrls"], properties: {
        searchTool: { type: "string", enum: ["web_search", "search_sources"], description: "实际产生这些原始结果的工具" },
        subject: { type: "string", description: "需要用户确认的业务来源对象" },
        query: { type: "string", description: "传给该搜索工具的原样搜索词" },
        outcome: { type: "string", enum: ["unique", "multiple", "none"], description: "你对原始结果的语义判断" },
        candidateUrls: { type: "array", maxItems: 2, items: { type: "string" },
          description: "从原始结果逐字复制 URL：unique 提交 1 个；multiple 按推荐顺序提交 2 个；none 提交空数组" },
      },
    },
    async execute(_callId: string, params: unknown) {
      if (resolved) throw new Error("interview_source_proposal_already_submitted")
      const proposal = proposalInputSchema.parse(params)
      const evidence = proposal.searchTool === "web_search"
        ? input.piSearches?.find(proposal.query)
        : search && search.query === proposal.query && search.subject === proposal.subject
          ? { status: search.status, candidates: search.candidates }
          : undefined
      if (!evidence) throw new Error("interview_source_search_reference_invalid")
      const urls = [...new Set(proposal.candidateUrls)]
      const expected = proposal.outcome === "none" ? 0 : proposal.outcome === "unique" ? 1 : 2
      if (urls.length !== expected) throw new Error("interview_source_candidate_count_invalid")
      const candidates = urls.map((url) => evidence.candidates.find((candidate) => candidate.url === url))
      if (candidates.some((candidate) => !candidate)) throw new Error("interview_source_candidate_reference_invalid")
      const value = sourceResolutionSchema.parse({
        id: randomUUID(), revision: input.revision, subject: proposal.subject, query: proposal.query,
        provider: proposal.searchTool === "web_search" ? "pi-web-access:web_search" : "bing_rss",
        searchStatus: evidence.status, outcome: proposal.outcome, status: "open",
        candidates, questionId: input.questionId, selectedCandidateId: null, answerMessageId: null,
        createdAt: new Date().toISOString(),
      })
      resolved = true; input.onResolution(value)
      return { content: [{ type: "text", text: "候选引用已校验；宿主会生成来源确认 Question，本轮不要再生成问题或草稿。" }], details: value }
    },
  }
  return [searchTool, proposalTool]
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
  for (const existing of state.sourceResolutions) {
    if (existing.status !== "superseded" && normalize(existing.subject) === subject) existing.status = "superseded"
  }
  state.sourceResolutions.push(value)
}

export function recordUserProvidedSources(state: InterviewState, text: string, revision: number) {
  for (const raw of text.match(/https?:\/\/[^\s<>"')，。；]+/gu) ?? []) {
    let url: URL
    try { url = new URL(raw) } catch { continue }
    const candidate = candidateFromUrl(url)
    if (state.sourceResolutions.some((item) => item.status === "selected"
      && item.candidates.some((source) => source.url === candidate.url))) continue
    const value = sourceResolutionSchema.parse({
      id: randomUUID(), revision, subject: candidate.domain, query: candidate.url, provider: "user_provided",
      searchStatus: "ok", outcome: "provided", status: "selected", candidates: [candidate], questionId: null,
      selectedCandidateId: candidate.id, answerMessageId: null, createdAt: new Date().toISOString(),
    })
    recordSourceResolution(state, value)
  }
}

export function assertRequirementReady(state: InterviewState, markdown?: string) {
  if (state.unresolved.some((item) => item.status === "open")) throw new Error("interview_unresolved_items_open")
  const active = state.sourceResolutions.filter((item) => item.status !== "superseded")
  // WHY：搜索是否必要由访谈模型根据完整对话决定。宿主只阻止已经开始但尚未由用户结算的来源解析，
  // 不能用“必须存在 URL 候选”反向强迫每个浏览器任务搜索。
  if (active.some((item) => item.status !== "selected")) throw new Error("interview_source_decision_pending")
  if (!markdown || !active.length) return
  const normalizedMarkdown = normalize(markdown)
  for (const resolution of active) {
    const candidate = resolution.candidates.find((item) => item.id === resolution.selectedCandidateId)!
    if (!normalizedMarkdown.includes(normalize(candidate.domain)) && !normalizedMarkdown.includes(normalize(candidate.title))) {
      throw new Error("interview_source_decision_missing_from_draft")
    }
  }
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
  const options = value.candidates.slice(0, 2).map((candidate, index) => ({
    id: candidate.id, label: candidate.title, description: [candidate.domain, candidate.description].filter(Boolean).join(" · "),
    recommended: index === 0,
  }))
  options.push({ id: "source:none", label: "都不是这些来源", description: "继续补充业务名称或内容身份", recommended: false })
  return createCommonQuestionFromPanel({ id: value.questionId!, panel: {
    mode: "choice", prompt: value.outcome === "unique" ? `请确认“${value.subject}”是否来自这个来源。` : `“${value.subject}”存在多个合理来源，请选择。`,
    options,
    inputs: [{ id: "other", label: "其他补充", kind: "textarea", role: "follow_up",
      placeholder: "可补充所属服务或内容身份（可选）" }],
  } })
}

function sourceSearchResult(value: SourceSearch) {
  return JSON.stringify({ searchId: value.id, status: value.status, results: value.candidates.map((item) => ({
    id: item.id, title: item.title, url: item.url, domain: item.domain, description: item.description,
  })), instruction: "你负责判断这些原始结果的相关性；随后调用 present_source_candidates，searchTool 使用 search_sources，并逐字提交真实结果 URL。" })
}

function sourceLead(value: SourceResolution) {
  if (value.outcome === "none") return value.searchStatus === "unavailable"
    ? "这次公开来源搜索暂时不可用，需要你补充一个业务线索。"
    : "我还不能可靠确定业务来源，需要你补充一个业务线索。"
  return value.outcome === "unique" ? "我从搜索结果中选出一个来源，请确认是否就是它。" : "我从搜索结果中选出几个合理来源，需要你确认具体是哪一个。"
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

function searchQueries(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return []
  const value = input as { query?: unknown; queries?: unknown }
  const raw = Array.isArray(value.queries) ? value.queries : [value.query]
  return raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

function piSearchCandidates(text: string) {
  const lines = text.split(/\r?\n/u)
  const references = new Map<string, string>()
  for (const line of lines) {
    const match = line.match(/^\s{0,3}\[([^\]\r\n]{1,100})\]:\s*<?(https?:\/\/[^\s>]+)>?(?:\s+.*)?$/u)
    if (match) references.set(match[1]!.trim().toLowerCase(), match[2]!)
  }
  const candidates = new Map<string, SourceCandidate>()
  const add = (rawUrl: string, title: string) => {
    let url: URL
    try { url = new URL(rawUrl) } catch { return }
    if (!['http:', 'https:'].includes(url.protocol)) return
    url.hash = ""
    const domain = getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname
    if (!candidates.has(url.href)) candidates.set(url.href, {
      id: candidateId(url.href), title: title.slice(0, 200) || domain, url: url.href, origin: url.origin, domain,
      description: "来自 Pi web_search 的原始只读搜索结果。",
    })
  }
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    for (const match of line.matchAll(/(?<!!)\[([^\]\r\n]{1,200})\]\((https?:\/\/[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/gu)) {
      add(match[2]!, match[1]!)
    }
    for (const match of line.matchAll(/(?<!!)\[([^\]\r\n]{1,200})\]\[([^\]\r\n]{1,100})\]/gu)) {
      const url = references.get(match[2]!.trim().toLowerCase())
      if (url) add(url, match[1]!)
    }
    const rawUrl = line.trim()
    if (/^https?:\/\/\S+$/u.test(rawUrl)) {
      const title = (lines[index - 1] ?? "").trim().replace(/^\d+\.\s*/u, "").slice(0, 200)
      add(rawUrl, title)
    }
    if (candidates.size >= 20) break
  }
  return [...candidates.values()]
}

function candidateFromUrl(url: URL): SourceCandidate {
  const domain = getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname
  return { id: candidateId(url.href), title: domain, url: url.href, origin: url.origin, domain,
    description: "用户在需求对话中提供的业务资料；可访问性留给准备任务核验。" }
}

function candidateId(url: string) { return `source:${createHash("sha256").update(url).digest("hex").slice(0, 20)}` }
function normalize(value: string) { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") }
