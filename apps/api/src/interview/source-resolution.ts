import { randomUUID } from "node:crypto"
import { getDomain } from "tldts"
import { z } from "zod"
import { createCommonQuestionFromPanel } from "@agent-platform/ai-connect/integration/authoring/question"
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

export { createSourceResolutionTools } from "./source-tools.js"

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
  for (const raw of text.match(/https?:\/\/[^\s<>"')`，。；]+/gu) ?? []) {
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
    if (!selected.some((source) => sourceSupportsEntry(source.url, url)) && !userProvided.includes(url)) {
      throw new Error("interview_draft_url_unverified")
    }
  }
  if (requireEntries || /^##\s+试做入口\s*$/mu.test(markdown)) preparationEntryFacts(state, markdown)
}

/** WHY：无题板的候选由模型写入同版草案，确认时才固定；宿主不凭排名或站名自动选择。 */
export function projectProvidedDraftSources(state: InterviewState, markdown: string): InterviewState {
  const citedUrls = new Set(markdownUrls(markdown))
  const projected = structuredClone(state)
  for (const resolution of projected.sourceResolutions) {
    if (resolution.status !== "open" || resolution.questionId !== null) continue
    const candidate = resolution.candidates[0]
    if (resolution.candidates.length === 1 && candidate && citedUrls.has(candidate.url)) {
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
    const source = selected.findLast((item) => sourceSupportsEntry(item.url, url))
    if (!source) throw new Error("interview_entry_reference_invalid")
    return { url, resolutionId: source.resolutionId }
  })
}

/** WHY：真实来源 URL 同时证明它的站点首页；只允许根路径，不把“同站”扩成任意深链授权。 */
export function sourceSupportsEntry(sourceUrl: string, entryUrl: string) {
  const source = new URL(sourceUrl), entry = new URL(entryUrl)
  return entry.href === source.href || entry.href === `${source.origin}/`
}

function draftEntryUrls(markdown: string) {
  const headings = [...markdown.matchAll(/^##\s+试做入口\s*$/gmu)]
  if (headings.length !== 1) throw new Error("interview_entry_section_required")
  const body = markdown.slice(headings[0]!.index! + headings[0]![0].length).split(/^#{1,6}\s+/mu, 1)[0]!
  // WHY：模型可以在入口列表后解释来源依据；解释段不是额外入口，不改变编号或授权 URL。
  const lines = body.split(/\r?\n/u).map((line) => line.trim()).filter(line => /^\d+\./u.test(line))
  if (!lines.length) throw new Error("interview_entry_required")
  const seen = new Set<string>()
  return lines.map((line, index) => {
    const match = line.match(/^(\d+)\.\s+(?:(https?:\/\/\S+)|<(https?:\/\/[^<>\s]+)>)$/u)
    if (!match || Number(match[1]) !== index + 1) throw new Error("interview_entry_order_invalid")
    const url = new URL((match[2] ?? match[3])!).href
    if (seen.has(url)) throw new Error("interview_entry_reference_invalid")
    seen.add(url)
    return url
  })
}

function markdownUrls(markdown: string) {
  // WHY：宿主回填使用 Markdown autolink，尖括号内的 URL 字节必须完整保留；不能把括号路径或查询值当标点剥离。
  // 旧手写草案的裸 URL 仍按原兼容规则读取，不扩大已确认来源授权。
  return [...markdown.matchAll(/<(https?:\/\/[^<>\s]+)>|https?:\/\/[^\s<>"'`，。；]+/gu)].map((match) => {
    const raw = match[1] ?? match[0].replace(/[),.;\]，。；）]+$/u, "")
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
