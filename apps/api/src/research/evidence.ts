import { randomUUID, createHash } from "node:crypto"
import { BrowserError, type BrowserPage } from "@browser-capture/browser"
import type { RequirementBrief } from "@browser-capture/contracts/interview"
import type { ResearchDecision, ResearchRecord, SourceCandidate } from "@browser-capture/contracts/research"

export function recordPage(record: ResearchRecord, page: BrowserPage, candidate: SourceCandidate | null, queryId: string | null) {
  const id = randomUUID(), at = new Date().toISOString()
  const corpus = [page.text, `当前实际地址：${page.url}`, ...page.links.map((item) => `${item.title} ${item.url}`)].join("\n")
  record.observations.push({ id, at, url: page.url, title: page.title, candidateId: candidate?.id ?? null, queryId,
    digest: createHash("sha256").update(corpus).digest("hex"), truncated: page.truncated, assessment: null })
  if (candidate) candidate.status = "observed"
  const query = record.queries.find((item) => item.id === queryId)
  if (query) query.observationId = id
  const known = new Set(record.candidates.map((item) => item.url))
  for (const link of page.links) {
    if (known.has(link.url) || record.candidates.length >= 800) continue
    known.add(link.url)
    record.candidates.push({ id: randomUUID(), ...link, discoveredAt: at, provenance: "page_link", discoveredOn: id, status: "candidate", reason: "实际页面链接，目标尚待核验" })
  }
  // WHY：模型选择证据编号，服务取回原文；避免模型重写标点/空格导致真实观察被整轮丢弃。
  const text = corpus.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => `[E${index}] ${line.slice(0, 200)}`).join("\n")
  return { id, text }
}
export function assess(record: ResearchRecord, decision: ResearchDecision, current: { id: string; text: string } | null) {
  const value = decision.assessment
  if (!value) return
  if (!current || value.observationId !== current.id) throw new Error("invalid_evidence_reference")
  const observation = record.observations.find((item) => item.id === current.id)!
  const candidate = record.candidates.find((item) => item.id === observation.candidateId)
  if (value.access === "manual_required") {
    observation.assessment = { ...value, adopted: false, fields: [], enumeration: null }
    if (candidate) { candidate.status = "restricted"; candidate.reason = value.reason }
    throw new BrowserError("manual_required")
  }
  if (value.access === "unavailable" && value.adopted) throw new Error("unavailable_is_not_source")
  // WHY：引用必须由当前真实观察支持；模型输出通过 schema 仍不等于证据成立。
  const resolve = (field: { name: string; evidence: string }) => {
    const prefix = `[${field.evidence}] `
    const line = current.text.split("\n").find((item) => item.startsWith(prefix))
    if (!/^E\d+$/.test(field.evidence) || !line) throw new Error("unsupported_evidence")
    return { name: field.name, evidence: line.slice(prefix.length) }
  }
  const fields = value.fields.map(resolve), enumeration = value.enumeration ? resolve(value.enumeration) : null
  if (observation.queryId && value.adopted) throw new Error("search_is_not_source")
  observation.assessment = { ...value, fields, enumeration }
  if (candidate) candidate.reason = value.reason
}
export function conclude(record: ResearchRecord, decision: ResearchDecision, brief: RequirementBrief) {
  const known = new Set(record.observations.map((item) => item.id))
  const adopted = record.observations.filter((item) => item.assessment?.adopted)
  const supported = new Set(adopted.map((item) => item.id))
  if (decision.gaps.some((gap) => gap.observationIds.some((id) => !known.has(id)))) throw new Error("invalid_gap_reference")
  if (decision.coverage.some((item) => item.observationIds.some((id) => !supported.has(id)))) throw new Error("invalid_coverage_reference")
  record.coverage = decision.coverage; record.gaps = decision.gaps
  const add = (description: string) => record.gaps.push({ description, observationIds: adopted.map((item) => item.id), requiresUser: false })
  const fields = new Set(adopted.flatMap((item) => item.assessment!.fields.map((field) => field.name)))
  for (const field of new Set(brief.deliverables.flatMap((item) => item.fields))) if (!fields.has(field)) add(`尚无字段可得性证据：${field}`)
  for (const objective of [...brief.discoveryTasks.map((item) => item.objective), ...brief.deliverables.map((item) => item.entity)]) {
    if (!record.coverage.some((item) => item.objective === objective)) add(`尚无覆盖依据：${objective}`)
  }
  if (!adopted.some((item) => item.assessment!.enumeration)) add("尚无完整范围的枚举或入口衔接依据")
  if (!adopted.length) add("尚无已采纳的真实来源页面")
  record.current = decision.reason
  return record.gaps.length ? "partial" as const : "completed" as const
}
