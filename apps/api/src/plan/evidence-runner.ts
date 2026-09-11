import { randomUUID } from "node:crypto"
import { BrowserError, pageSchema, type BrowserSession } from "@browser-capture/browser"
import { planEvidenceDecisionSchema, type PlanRecord } from "@browser-capture/contracts/plan"
import type { RequirementBrief } from "@browser-capture/contracts/interview"
import type { ModelSelection } from "@agent-platform/ai-connect/server"
import type { AIModelProvider, PreparedAIModel } from "../ai/model.js"
import { planEvidencePrompt, planEvidenceOutputSchema } from "./evidence-model.js"
import { assessEvidence, concludeEvidence, recordEvidencePage } from "./evidence-validation.js"

export interface PlanEvidenceWork {
  record: PlanRecord; brief: RequirementBrief; browser: Pick<BrowserSession, "command">; signal: AbortSignal;
  aiModel: AIModelProvider; selection: ModelSelection; save(): void; validate(): void;
}

export async function runPlanEvidence(work: PlanEvidenceWork) {
  check(work)
  const model = await work.aiModel.prepare(work.selection, work.signal)
  check(work)
  return loop(work, model)
}

function check(work: PlanEvidenceWork) {
  if (work.signal.aborted) throw new BrowserError("cancelled")
  work.validate()
}

async function decide(work: PlanEvidenceWork, model: PreparedAIModel, current: { id: string; text: string } | null) {
  check(work)
  const selected = model.selection
  const audit: PlanRecord["evidence"]["audits"][number] = { id: randomUUID(), purpose: "plan_evidence", at: new Date().toISOString(),
    model: selected.modelId, effort: selected.reasoningEffort,
    status: "intended", invocations: null, reportedModel: null, reportedEffort: null, aiEvents: [] }
  work.record.evidence.audits.push(audit); work.save()
  try {
    const output = await model.generateObject({ prompt: planEvidencePrompt(work.brief, work.record, current), jsonSchema: planEvidenceOutputSchema(),
      parse: (value) => planEvidenceDecisionSchema.parse(value), signal: work.signal,
      onEvent: (event) => { audit.aiEvents.push(event); work.save() } })
    check(work); audit.invocations = 1; audit.reportedModel = selected.modelId; audit.reportedEffort = selected.reasoningEffort
    audit.status = "completed"; work.save(); return output
  } catch (error) {
    if (audit.status === "intended") { audit.status = work.signal.aborted ? "interrupted" : "failed"; work.save() }
    throw error
  }
}

async function loop(work: PlanEvidenceWork, model: PreparedAIModel) {
  let current: { id: string; text: string } | null = null
  for (let step = 0; step < 16; step++) {
    const decision = await decide(work, model, current)
    check(work); assessEvidence(work.record, decision, current); work.save()
    if (decision.action === "finish") { const status = concludeEvidence(work.record, decision, work.brief); work.save(); return status }
    if (work.record.evidence.observations.length >= 15) throw new BrowserError("budget_exceeded")
    current = await visit(work, decision)
  }
  throw new BrowserError("budget_exceeded")
}

async function visit(work: PlanEvidenceWork, decision: ReturnType<typeof planEvidenceDecisionSchema.parse>) {
  const { evidence } = work.record, { browser } = work
  const candidate = decision.action === "visit" ? evidence.candidates.find((item) => item.id === decision.candidateId) : null
  let queryId: string | null = null
  if (decision.action === "search") {
    if (!decision.query || evidence.queries.length >= 5 || evidence.queries.some((item) => item.intent === decision.query)) throw new BrowserError("budget_exceeded")
    queryId = randomUUID()
    const url = `https://www.bing.com/search?q=${encodeURIComponent(decision.query)}`
    evidence.queries.push({ id: queryId, intent: decision.query, url, at: new Date().toISOString(), observationId: null })
    work.record.current = `正在搜索：${decision.query}`; work.save()
    await browser.command({ type: "navigate", url })
  } else {
    if (!candidate || candidate.status !== "candidate") throw new Error("invalid_candidate")
    if (evidence.observations.filter((item) => item.candidateId).length >= 10) throw new BrowserError("budget_exceeded")
    work.record.current = `正在核验：${candidate.title || new URL(candidate.url).hostname}`
    candidate.reason = decision.reason; work.save()
    try { await browser.command({ type: candidate.provenance === "provided" ? "navigate" : "follow", url: candidate.url }) }
    catch (error) { candidate.status = "unavailable"; work.save(); throw error }
  }
  check(work)
  try {
    const page = pageSchema.parse(JSON.parse(await browser.command({ type: "page" }) ?? "null"))
    check(work)
    const current = recordEvidencePage(work.record, page, candidate ?? null, queryId)
    work.save(); return current
  } catch (error) {
    if (candidate) { candidate.status = error instanceof BrowserError && error.code === "manual_required" ? "restricted" : "unavailable"; candidate.reason = "页面核验未完成，见计划终态"; work.save() }
    throw error
  }
}
