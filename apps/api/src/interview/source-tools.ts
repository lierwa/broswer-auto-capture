import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { MainModelTool } from "@agent-platform/pi-agent-session"
import { sourceResolutionSchema, type SourceResolution } from "@browser-capture/contracts/interview"
import type { ReadOnlySourceResolver, SourceSearch } from "./source-resolution.js"
import type { PiSourceSearchObserver } from "./source-search-evidence.js"
import { InterviewSourceReferences } from "./source-references.js"

type ToolInput = {
  resolver: ReadOnlySourceResolver; piSearches?: PiSourceSearchObserver; revision: number; questionId: string;
  references?: InterviewSourceReferences; onSearch(): void; onResolution(value: SourceResolution): void
}
const proposalSchema = z.object({ subject: z.string().trim().min(1).max(200),
  candidateRefs: z.array(z.string().min(1).max(100)).max(2) }).strict()
// WHY：已持久化 Pi 对话可能含旧工具调用；兼容读取旧调用，不再向模型声明这些重复字段。
const legacyProposalSchema = z.object({ subject: z.string().trim().min(1).max(200),
  query: z.string().trim().min(1).max(500), searchId: z.string().trim().min(1).max(300),
  candidateIds: z.array(z.string().trim().min(1).max(200)).max(2),
  confirmation: z.enum(["question", "draft"]).default("question") }).strict()

export function createSourceResolutionTools(input: ToolInput): MainModelTool[] {
  const searches: SourceSearch[] = [], references = input.references ?? new InterviewSourceReferences(input.revision)
  let resolved = false, proposals = 0
  return [{
    name: "search_sources", label: "通用只读搜索后备",
    description: "活动搜索工具不可用或失败时的通用只读后备。按完整对话调查公开业务事实；宿主不判断相关性。",
    parameters: { type: "object", additionalProperties: false, required: ["query"], properties: {
      query: { type: "string", description: "根据完整对话确定的公开搜索词" },
    } },
    async execute(_callId: string, params: unknown, signal?: AbortSignal) {
      if (searches.length >= 6) throw new Error("interview_source_search_budget_exhausted")
      const value = z.object({ query: z.string().trim().min(1).max(500),
        subject: z.string().trim().min(1).max(200).optional() }).strict().parse(params)
      const search = await input.resolver.search({ query: value.query, subject: value.subject ?? value.query.slice(0, 200) }, signal)
      searches.push(search); input.onSearch()
      const results = references.addSearch({ ...search, provider: "bing_rss" })
      return { content: [{ type: "text", text: JSON.stringify({ status: search.status, results,
        instruction: referenceInstruction }) }], details: search }
    },
  }, {
    name: "present_source_candidates", label: "请求来源选择",
    description: "仅询问尚未确定的起始网站或服务。入口明确后直接在草案引用 ref；最终内容由准备任务现场查找。不能用此工具询问权限、范围或其他业务取舍。候选来自同次搜索；空列表表示本轮可见调查中没有可靠的起始网站或服务候选，不特指最后一次搜索。",
    parameters: { type: "object", additionalProperties: false, required: ["subject", "candidateRefs"], properties: {
      subject: { type: "string", description: "需要用户决定的起始网站或服务" },
      candidateRefs: { type: "array", maxItems: 2, items: { type: "string" }, description: "公开工具返回的 ref；起始网站或服务没有可靠候选时留空" },
    } },
    async execute(_callId: string, params: unknown) {
      if (resolved) throw new Error("interview_source_proposal_already_submitted")
      if (proposals >= 6) throw new Error("interview_source_proposal_budget_exhausted")
      const parsed = proposalSchema.safeParse(params)
      const value = parsed.success ? references.propose(parsed.data.subject, parsed.data.candidateRefs, input.questionId)
        : legacyResolution(input, searches, params)
      resolved = value.questionId !== null; proposals += 1; input.onResolution(value)
      return { content: [{ type: "text", text: resolved
        ? "候选引用已校验；宿主会生成来源确认 Question，本轮不要再生成问题或草稿。"
        : "引用已校验，尚未由用户确认。继续形成同版草案；不得替换用户明确路径。" }], details: value }
    },
  }, {
    name: "source_search_references", label: "查看原生搜索引用",
    description: "web_search 后取得已完成搜索的稳定 ref/siteRef。用原始搜索正文判断相关性；宿主负责网址和证据绑定，不需要重填查询、搜索 ID 或网址。",
    parameters: { type: "object", additionalProperties: false, required: [], properties: {} },
    async execute() {
      const searches = (input.piSearches?.expose() ?? []).map((visible) => {
        const evidence = input.piSearches!.findById(visible.searchId)!
        return { queries: evidence.queries, status: evidence.status, results: references.addSearch({
          ...evidence, query: evidence.queries.join("\n"), provider: "pi-web-access:web_search",
        }) }
      })
      return { content: [{ type: "text", text: JSON.stringify({ searches, instruction: referenceInstruction }) }] }
    },
  }]
}

const referenceInstruction = "你负责判断业务相关性。明确来源直接在草案写 [业务名称][ref]；指定站点首页用 [首页][siteRef]，实际替换为返回的引用值。仅在本轮需要确认或改选来源时调用 present_source_candidates 提出 Question。网址、搜索身份和来源清单由宿主填写，不重复生成。"

function legacyResolution(input: ToolInput, searches: SourceSearch[], params: unknown) {
  const proposal = legacyProposalSchema.parse(params)
  if (proposal.confirmation === "draft" && proposal.candidateIds.length !== 1) throw new Error("interview_source_draft_candidate_required")
  const fallback = searches.find((search) => search.id === proposal.searchId)
  const native = input.piSearches?.findById(proposal.searchId)
  if ((!fallback && !native) || (fallback && fallback.query !== proposal.query)
    || (native && !native.queries.includes(proposal.query))) throw new Error("interview_source_search_reference_invalid")
  if (new Set(proposal.candidateIds).size !== proposal.candidateIds.length) throw new Error("interview_source_candidate_count_invalid")
  const evidence = fallback ?? native!
  if (proposal.confirmation === "draft" && evidence.status !== "ok") throw new Error("interview_source_search_reference_invalid")
  const candidates = proposal.candidateIds.map((id) => evidence.candidates.find((candidate) => candidate.id === id))
  if (candidates.some((candidate) => !candidate)) throw new Error("interview_source_candidate_reference_invalid")
  return sourceResolutionSchema.parse({ id: randomUUID(), revision: input.revision, subject: proposal.subject,
    query: evidence === fallback ? fallback!.query : proposal.query, searchId: evidence.id,
    provider: native ? "pi-web-access:web_search" : "bing_rss", searchStatus: evidence.status,
    outcome: candidates.length === 0 ? "none" : candidates.length === 1 ? "unique" : "multiple",
    status: "open", candidates, questionId: proposal.confirmation === "question" ? input.questionId : null,
    selectedCandidateId: null, answerMessageId: null, createdAt: new Date().toISOString() })
}
