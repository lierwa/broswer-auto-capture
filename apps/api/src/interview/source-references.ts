import { createHash, randomUUID } from "node:crypto"
import { sourceResolutionSchema, type InterviewState, type SourceCandidate,
  type SourceResolution } from "@browser-capture/contracts/interview"

type SearchEvidence = {
  id: string; query: string; provider: string; status: "ok" | "unavailable";
  candidates: readonly SourceCandidate[]
}
type Reference = { ref: string; evidence: SearchEvidence; candidate: SourceCandidate; existing?: SourceResolution }

/** WHY：模型只选引用；搜索身份、原始 URL、候选 ID 和时间均由宿主事实绑定。 */
export class InterviewSourceReferences {
  private readonly references = new Map<string, Reference>()
  private readonly searches = new Map<string, SearchEvidence>()
  readonly draftResolutions: SourceResolution[] = []

  constructor(private readonly revision: number, state?: InterviewState) {
    for (const resolution of state?.sourceResolutions ?? []) {
      if (resolution.status === "superseded" || resolution.status === "needs_clarification") continue
      const candidates = resolution.status === "selected"
        ? resolution.candidates.filter((candidate) => candidate.id === resolution.selectedCandidateId)
        : resolution.questionId === null ? resolution.candidates : []
      const evidence = { id: resolution.searchId ?? resolution.id, query: resolution.query,
        provider: resolution.provider, status: resolution.searchStatus, candidates }
      for (const candidate of candidates) this.register(evidence, candidate, resolution)
    }
  }

  addSearch(evidence: SearchEvidence) {
    this.searches.set(evidence.id, evidence)
    if (evidence.status === "ok") for (const candidate of evidence.candidates) this.register(evidence, candidate)
    return this.available(evidence.id)
  }

  available(searchId?: string) {
    return [...this.references.values()].filter((value) => !searchId || value.evidence.id === searchId)
      .map(({ ref, candidate }) => ({ ref, siteRef: ref.replace("source-", "site-"),
        title: candidate.title, url: candidate.url, description: candidate.description }))
  }

  propose(subject: string, refs: string[], questionId: string) {
    const selected = refs.map((ref) => this.get(ref))
    if (new Set(refs).size !== refs.length) throw new Error("interview_source_candidate_count_invalid")
    if (!selected.length) return this.emptyProposal(subject, questionId)
    const evidence = selected[0]!.evidence
    if (selected.some((value) => value.evidence.id !== evidence.id)) {
      throw new Error("interview_source_search_reference_invalid")
    }
    return this.resolution(evidence, selected.map((value) => value.candidate), subject, questionId)
  }

  private emptyProposal(subject: string, questionId: string) {
    const searches = [...this.searches.values()]
    if (!searches.length) throw new Error("interview_source_search_reference_invalid")
    // WHY：模型没有选择候选，宿主也不能按 subject 猜哪次搜索相关；保留完整调查范围，不绑定最后一次。
    const value = this.resolution(searches[0]!, [], subject, questionId)
    delete value.searchId
    return sourceResolutionSchema.parse({ ...value, searchIds: searches.map((search) => search.id),
      query: [...new Set(searches.map((search) => search.query))].join("\n"),
      provider: [...new Set(searches.map((search) => search.provider))].join(", "),
      searchStatus: searches.some((search) => search.status === "ok") ? "ok" : "unavailable" })
  }

  materialize(markdown: string) {
    const used = new Map<string, Reference>()
    // WHY：这里只展开宿主签发的 Markdown 引用，不解析公共 Authoring，也不模糊匹配/改写 URL。
    const expanded = markdown.replace(/\[([^\]\r\n]+)\]\[((?:source|site)-[a-z0-9]+)\]/gu, (_match, _label, ref: string) => {
      const value = this.get(ref.replace(/^site-/u, "source-"))
      used.set(value.ref, value)
      const url = ref.startsWith("site-") ? `${new URL(value.candidate.url).origin}/` : value.candidate.url
      return `<${url}>`
    })
    this.draftResolutions.length = 0
    for (const value of used.values()) {
      if (!value.existing) this.draftResolutions.push(this.resolution(value.evidence, [value.candidate],
        value.candidate.url, null))
    }
    if (!used.size) return expanded
    // WHY：首页引用仍保留证明它的原始深链；代码补来源清单，模型不用把同一地址再抄一遍。
    const urls = [...new Set([...used.values()].map((value) => value.candidate.url))]
    return `${expanded.trim()}\n\n## 来源引用\n${urls.map((url) => `- <${url}>`).join("\n")}`
  }

  private register(evidence: SearchEvidence, candidate: SourceCandidate, existing?: SourceResolution) {
    const ref = `source-${createHash("sha256").update(`${evidence.id}\0${candidate.id}`).digest("hex").slice(0, 16)}`
    const previous = this.references.get(ref)
    if (previous && (previous.evidence.id !== evidence.id || previous.candidate.id !== candidate.id)) {
      throw new Error("interview_source_reference_collision")
    }
    this.references.set(ref, { ref, evidence, candidate, ...(existing ? { existing } : {}) })
  }

  private get(ref: string) {
    const value = this.references.get(ref)
    if (!value) throw new Error("interview_source_candidate_reference_invalid")
    return value
  }

  private resolution(evidence: SearchEvidence, candidates: SourceCandidate[], subject: string, questionId: string | null) {
    return sourceResolutionSchema.parse({ id: randomUUID(), revision: this.revision, subject,
      query: evidence.query, searchId: evidence.id, provider: evidence.provider, searchStatus: evidence.status,
      outcome: candidates.length === 0 ? "none" : candidates.length === 1 ? "unique" : "multiple",
      status: "open", candidates, questionId, selectedCandidateId: null, answerMessageId: null,
      createdAt: new Date().toISOString() })
  }
}
