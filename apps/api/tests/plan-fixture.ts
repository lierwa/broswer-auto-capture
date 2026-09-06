import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import assert from "node:assert/strict"
import type { RequirementBrief } from "@browser-capture/contracts/interview"
import type { PlanProposal } from "@browser-capture/contracts/plan"
import type { ResearchRecord } from "@browser-capture/contracts/research"
import type { PlanExecutor } from "../src/plan/queue.js"
import { researchFixture, headers } from "./research-fixture.js"
import { succeeded } from "./helpers.js"
import type { AppOptions } from "../src/app.js"

export function proposalFor(prompt: string): PlanProposal {
  const { requirement, source } = JSON.parse(prompt.split("\n\n").at(-1)!) as { requirement: RequirementBrief; source: ResearchRecord }
  const sourceIds = source.observations.filter((item) => item.assessment?.adopted).map((item) => item.id)
  const base = { sourceIds, input: "当前来源范围", output: "来源键和名称", termination: "目录末页结束；预算到达暂停，受限转人工", risks: ["代表页不能代替末页验证"], budget: { maxCommands: 100, timeoutMs: 60000, maxModelCalls: 2 } }
  return { summary: "覆盖完整目录并按来源键去重。", steps: [
    { ...base, id: "enumerate", title: "枚举完整目录", kind: "enumerate", goal: requirement.scope, dependsOn: [] },
    { ...base, id: "collect", title: "采集目录名称", kind: "collect", goal: requirement.goal, dependsOn: ["enumerate"] },
  ], fields: requirement.deliverables.flatMap((item, deliverable) => item.fields.map((_name, field) => ({ deliverable, field, stepId: "collect", mode: "observed", sourceIds, ruleIndex: null, explanation: "已核验页面名称" }))),
  objectives: source.coverage.map((item) => ({ objective: item.objective, sourceIds: item.observationIds, stepIds: ["enumerate", "collect"], explanation: item.reason })),
  gaps: source.gaps.map((_item, gapIndex) => ({ gapIndex, disposition: "execution", stepIds: ["enumerate"], explanation: "在正式枚举时验证" })) }
}
export async function planFixture(serveUi = false, executor?: PlanExecutor, chainOptions: Pick<AppOptions, "explorationFactory" | "llmFactory"> = {}) {
  const fake = { calls: 0, decide: async (prompt: string): Promise<unknown> => proposalFor(prompt), close: () => {} }
  const value = await researchFixture(serveUi, { ...chainOptions, ...(executor ? { planExecutor: executor } : {}), planFactory: async () => ({
    client: { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => { fake.close() },
      async *runTurn(prompt) { fake.calls++; yield succeeded(await fake.decide(prompt)) } }, dispose: async () => { fake.close() },
  }) })
  const post = (id: string, payload: Record<string, unknown>) => value.current.app.inject({ method: "POST", url: `/api/plan?taskId=${id}`, headers, payload })
  const ready = async () => { const id = await value.create(); await value.start(id); await value.wait(id); return id }
  const generate = async (id: string, requestId = randomUUID()) => {
    const source = value.current.research.snapshot(id).records[0]!
    return post(id, { type: "generate", requestId, requirementVersion: source.requirementVersion, sourceId: source.id, sourceVersion: source.version })
  }
  const wait = async (id: string) => {
    for (let i = 0; i < 400; i++) { const state = value.current.plan.snapshot(id); if (!state.generating) return state.records[0]!; await delay(10) }
    assert.fail("plan did not settle")
  }
  const start = (id: string, requestId = randomUUID()) => {
    const record = value.current.plan.snapshot(id).records[0]!
    return post(id, { type: "start", requestId, planId: record.id, planDigest: record.digest })
  }
  return { ...value, get current() { return value.current }, planFake: fake, planPost: post, ready, generate, waitPlan: wait, startPlan: start,
    close: async () => { fake.close(); await value.close() } }
}
export async function withPlan(work: (value: Awaited<ReturnType<typeof planFixture>>) => Promise<void>, executor?: PlanExecutor) {
  const value = await planFixture(false, executor)
  try { await work(value) } finally { await value.close() }
}
