import { createHash } from "node:crypto"
import { getDomain } from "tldts"
import { z } from "zod"
import type { AIEvent } from "@agent-platform/ai-connect/server"
import { PI_AGENT_SESSION_AI_EVENT_NAMESPACE } from "@agent-platform/pi-agent-session"
import type { SourceCandidate } from "@browser-capture/contracts/interview"

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

type PiSourceSearch = Readonly<{
  id: string
  queries: readonly string[]
  status: "ok" | "unavailable"
  candidates: readonly SourceCandidate[]
}>

export class PiSourceSearchObserver {
  private readonly pending = new Map<string, readonly string[]>()
  private readonly completed: PiSourceSearch[] = []
  private readonly exposed = new Set<string>()
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
    if (this.completed.some((item) => item.id === `pi:${value.callId}`)) return
    if (value.type === "tool.execution.failed") {
      this.completed.push({ id: `pi:${value.callId}`, queries: this.pending.get(value.callId) ?? [],
        status: "unavailable", candidates: [] })
      return
    }
    const output = piSearchOutputSchema.safeParse(value.output)
    if (!output.success) {
      this.completed.push({ id: `pi:${value.callId}`, queries: this.pending.get(value.callId) ?? [],
        status: "unavailable", candidates: [] })
      return
    }
    const queries = output.data.details.queries ?? this.pending.get(value.callId) ?? []
    const status = output.data.details.error || output.data.details.successfulQueries === 0 ? "unavailable" : "ok"
    const resultText = output.data.content.map((item) => item.text).join("\n")
    this.completed.push({ id: `pi:${value.callId}`, queries, status, candidates: piSearchCandidates(resultText) })
  }

  // WHY：旁听得到的 ID 原本不在原生工具结果里；只有此公开工具把它实际交给模型后才允许提案引用。
  expose() {
    for (const item of this.completed) this.exposed.add(item.id)
    return this.completed.map((item) => ({ searchId: item.id, queries: item.queries,
      status: item.status, results: item.candidates.map((candidate) => ({
        id: candidate.id, title: candidate.title, url: candidate.url,
      })) }))
  }

  findById(id: string) {
    return this.exposed.has(id) ? this.completed.find((item) => item.id === id) : undefined
  }

  private markUsed(callId: string) {
    if (this.usedCalls.has(callId)) return
    this.usedCalls.add(callId)
    this.onSearch()
  }
}

export function candidateId(url: string) {
  return `source:${createHash("sha256").update(url).digest("hex").slice(0, 20)}`
}

function searchQueries(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return []
  const value = input as { query?: unknown; queries?: unknown }
  const raw = Array.isArray(value.queries) ? value.queries : [value.query]
  return raw.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

function piSearchExcerpts(lines: string[]) {
  const excerpts = new Map<string, string>()
  for (let index = 1; index < lines.length; index += 1) {
    const match = /^\s*Source:\s+.+\((https?:\/\/[^)\s]+)\)\s*$/u.exec(lines[index]!)
    const excerpt = lines[index - 1]?.trim()
    if (!match || !excerpt || excerpt.startsWith("Source:")) continue
    try {
      const url = new URL(match[1]!); url.hash = ""
      excerpts.set(url.href, excerpt.slice(0, 280))
    } catch { /* Ignore malformed external search links. */ }
  }
  return excerpts
}

function piSearchCandidates(resultText: string) {
  const lines = resultText.split(/\r?\n/u)
  const excerpts = piSearchExcerpts(lines)
  const references = new Map<string, string>()
  for (const line of lines) {
    const match = line.match(/^\s{0,3}\[([^\]\r\n]{1,100})\]:\s*<?(https?:\/\/[^\s>]+)>?(?:\s+.*)?$/u)
    if (match) references.set(match[1]!.trim().toLowerCase(), match[2]!)
  }
  const candidates = new Map<string, SourceCandidate>()
  const add = (rawUrl: string, title: string, listedTitle = false) => {
    let url: URL
    try { url = new URL(rawUrl) } catch { return }
    if (!["http:", "https:"].includes(url.protocol)) return
    url.hash = ""
    const domain = getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname
    const existing = candidates.get(url.href)
    // WHY：搜索正文的动作链接可能先出现；来源列表的原标题才是同一 URL 的身份文字。
    if (existing && listedTitle) {
      existing.title = title.slice(0, 200)
      if (!excerpts.has(url.href)) existing.description = `搜索来源列表标题：${existing.title}；未提供独立摘要。`
    } else if (!existing) candidates.set(url.href, {
      id: candidateId(url.href), title: title.slice(0, 200) || domain, url: url.href, origin: url.origin, domain,
      description: excerpts.has(url.href) ? `搜索摘要：${excerpts.get(url.href)}` : listedTitle
        ? `搜索来源列表标题：${title.slice(0, 200)}；未提供独立摘要。` : "搜索结果未提供摘要；来源身份尚待确认。",
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
      const previous = (lines[index - 1] ?? "").trim()
      const listed = /^\d+\.\s+(.+)/u.exec(previous)?.[1]?.trim()
      const listedTitle = Boolean(listed && !/^https?:\/\//u.test(listed))
      add(rawUrl, listed ?? previous, listedTitle)
    }
    if (candidates.size >= 20) break
  }
  return [...candidates.values()]
}
