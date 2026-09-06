import { randomUUID } from "node:crypto"
import { BrowserError, pageSchema, type BrowserSession } from "@browser-capture/browser"
import { researchDecisionSchema, type ResearchRecord } from "@browser-capture/contracts/research"
import type { RequirementBrief } from "@browser-capture/contracts/interview"
import type { ModelSessionFactory, ModelSession } from "../interview/modelSession.js"
import { researchPrompt, researchOutputSchema } from "./model.js"
import { assess, conclude, recordPage } from "./evidence.js"

export interface ResearchWork {
  record: ResearchRecord; brief: RequirementBrief; browser: Pick<BrowserSession, "command">; signal: AbortSignal;
  modelFactory: ModelSessionFactory; save(): void; validate(): void;
}
export async function runResearch(work: ResearchWork) {
  let model: ModelSession | undefined
  const closeOnAbort = () => { void model?.client.close().catch(() => {}) }
  work.signal.addEventListener("abort", closeOnAbort, { once: true })
  try {
    check(work); model = await work.modelFactory(); check(work)
    return await loop(work, model)
  } finally {
    work.signal.removeEventListener("abort", closeOnAbort)
    await model?.dispose()
  }
}
function check(work: ResearchWork) {
  if (work.signal.aborted) throw new BrowserError("cancelled")
  work.validate()
}
async function decide(work: ResearchWork, model: ModelSession, current: { id: string; text: string } | null) {
  check(work)
  const audit: ResearchRecord["audits"][number] = { id: randomUUID(), purpose: "source_research", at: new Date().toISOString(), model: "gpt-5.6-terra", effort: "medium",
    status: "intended", invocations: null, reportedModel: null, reportedEffort: null }
  work.record.audits.push(audit); work.save()
  let output: unknown
  try {
    for await (const event of model.client.runTurn(researchPrompt(work.brief, work.record, current), researchOutputSchema(), work.signal)) {
      if (event.type !== "turn_succeeded" && event.type !== "interrupted") continue
      audit.invocations = event.audit.invocationCount; audit.reportedModel = event.audit.reportedModel; audit.reportedEffort = event.audit.reportedEffort
      audit.status = event.type === "interrupted" ? "interrupted" : "completed"
      work.save()
      check(work)
      if (event.type === "turn_succeeded") output = JSON.parse(event.outputText)
    }
    check(work)
    return researchDecisionSchema.parse(output)
  } catch (error) {
    if (audit.status === "intended") { audit.status = work.signal.aborted ? "interrupted" : "failed"; work.save() }
    throw error
  }
}
async function loop(work: ResearchWork, model: ModelSession) {
  const { record, browser } = work
  let current: { id: string; text: string } | null = null
  for (let step = 0; step < 16; step++) {
    const decision = await decide(work, model, current)
    check(work); assess(record, decision, current); work.save()
    if (decision.action === "finish") { const status = conclude(record, decision, work.brief); work.save(); return status }
    if (record.observations.length >= 15) throw new BrowserError("budget_exceeded")
    current = await visit(work, decision)
  }
  throw new BrowserError("budget_exceeded")
}
async function visit(work: ResearchWork, decision: ReturnType<typeof researchDecisionSchema.parse>) {
  const { record, browser } = work
  const candidate = decision.action === "visit" ? record.candidates.find((item) => item.id === decision.candidateId) : null
  let queryId: string | null = null
  if (decision.action === "search") {
    if (!decision.query || record.queries.length >= 5 || record.queries.some((item) => item.intent === decision.query)) throw new BrowserError("budget_exceeded")
    queryId = randomUUID()
    const url = `https://www.bing.com/search?q=${encodeURIComponent(decision.query)}`
    record.queries.push({ id: queryId, intent: decision.query, url, at: new Date().toISOString(), observationId: null })
    record.current = `正在搜索：${decision.query}`; work.save()
    await browser.command({ type: "navigate", url })
  } else {
    if (!candidate || candidate.status !== "candidate") throw new Error("invalid_candidate")
    if (record.observations.filter((item) => item.candidateId).length >= 10) throw new BrowserError("budget_exceeded")
    record.current = `正在核验：${candidate.title || new URL(candidate.url).hostname}`
    candidate.reason = decision.reason; work.save()
    try { await browser.command({ type: candidate.provenance === "provided" ? "navigate" : "follow", url: candidate.url }) }
    catch (error) { candidate.status = "unavailable"; work.save(); throw error }
  }
  check(work)
  try {
    const page = pageSchema.parse(JSON.parse(await browser.command({ type: "page" }) ?? "null"))
    check(work)
    const current = recordPage(record, page, candidate ?? null, queryId)
    work.save(); return current
  } catch (error) {
    if (candidate) { candidate.status = error instanceof BrowserError && error.code === "manual_required" ? "restricted" : "unavailable"; candidate.reason = "页面核验未完成，见调研终态"; work.save() }
    throw error
  }
}
