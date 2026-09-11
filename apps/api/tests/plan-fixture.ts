import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import assert from "node:assert/strict"
import type { RequirementBrief } from "@browser-capture/contracts/interview"
import type { PlanEvidence, PlanEvidenceDecision, PlanProposal } from "@browser-capture/contracts/plan"
import { createApplication } from "../src/app.js"
import type { PlanExecutor } from "../src/plan/queue.js"
import { authoredInterview, succeeded, brief } from "./helpers.js"
import { testAIModel } from "./fixtures/ai-model.js"

export const sourceBrief = { ...brief, goal: "核验样例机构公开目录", scope: "样例机构目录与名称", deliverables: [{ entity: "目录", fields: ["名称"], coverage: "目录内全部条目", limit: "按目录终止" }],
  discoveryTasks: [{ objective: "发现目录", expectedOutput: "目录与详情链接", acceptance: "实际页面可见" }] }
export const headers = { host: "127.0.0.1:4175" }

export function evidenceDecisionFor(prompt: string): PlanEvidenceDecision {
  const { evidence, current } = JSON.parse(prompt.split("\n\n").at(-1)!) as { evidence: PlanEvidence; current: { id: string; text: string } | null }
  const result: PlanEvidenceDecision = { action: "search", query: "样例机构公开目录", candidateId: null, reason: "寻找机构目录入口", assessment: null, gaps: [], coverage: [] }
  if (!current) return result
  result.assessment = { observationId: current.id, adopted: false, access: "normal", reason: "搜索页提供候选", fields: [], enumeration: null, limitations: [] }
  const observation = evidence.observations.find((item) => item.id === current.id)!
  if (observation.queryId) return { ...result, action: "visit", query: null, candidateId: evidence.candidates.find((item) => item.url === "https://example.com/catalog")!.id }
  const token = current.text.match(/\[(E\d+)\] 名称/)![1]!
  result.assessment = { ...result.assessment, adopted: true, reason: "目录归属与入口可见", fields: [{ name: "名称", evidence: token }], enumeration: { name: "目录下一页", evidence: token } }
  return { ...result, action: "finish", query: null, reason: "已观察到规划所需目录和字段", coverage: ["目录", "发现目录"].map((objective) => ({ objective, observationIds: [current.id], reason: "真实目录包含名称和下一页" })) }
}

export function proposalFor(prompt: string): PlanProposal {
  const { requirement, source } = JSON.parse(prompt.split("\n\n").at(-1)!) as { requirement: RequirementBrief; source: PlanEvidence }
  const sourceIds = source.observations.filter((item) => item.assessment?.adopted).map((item) => item.id)
  const base = { sourceIds, input: "当前来源范围", output: "来源键和名称", termination: "目录末页结束；预算到达暂停，受限转人工", risks: ["代表页不能代替末页验证"], budget: { maxCommands: 100, timeoutMs: 60000, maxModelCalls: 2 } }
  return { summary: "覆盖完整目录并按来源键去重。", steps: [
    { ...base, id: "enumerate", title: "枚举完整目录", kind: "enumerate", goal: requirement.scope, dependsOn: [] },
    { ...base, id: "collect", title: "采集目录名称", kind: "collect", goal: requirement.goal, dependsOn: ["enumerate"] }],
  fields: requirement.deliverables.flatMap((item, deliverable) => item.fields.map((name, field) => {
    const observed = source.observations.some((entry) => entry.assessment?.fields.some((value) => value.name === name))
    return { deliverable, field, stepId: "collect", mode: observed ? "observed" as const : "missing" as const,
      sourceIds: observed ? sourceIds : [], ruleIndex: null, explanation: observed ? "已核验页面名称" : "字段将在执行该步骤时核验" }
  })),
  objectives: [...requirement.deliverables.map((item) => item.entity), ...requirement.discoveryTasks.map((item) => item.objective)].map((objective) => {
    const coverage = source.coverage.find((item) => item.objective === objective)
    return { objective, sourceIds: coverage?.observationIds ?? [], stepIds: ["enumerate", "collect"],
      explanation: coverage?.reason ?? "来源与覆盖将在执行枚举步骤时核验" }
  }),
  gaps: source.gaps.map((item, gapIndex) => ({ gapIndex, disposition: item.requiresUser || sourceIds.length === 0
    || ["manual_required", "cleanup_required"].includes(source.outcome) ? "blocking" : "execution",
    stepIds: ["enumerate", "collect"], explanation: item.requiresUser ? "需要用户处理后才能启动" : sourceIds.length === 0
      ? "尚无可授权来源，保留计划并重新核验" : "在执行枚举与采集步骤时核验" })) }
}

export async function planFixture(serveUi = false, executor?: PlanExecutor, chainDecision?: (prompt: string) => Promise<unknown>) {
  const directory = await mkdtemp(path.join(tmpdir(), "browser-plan-test-"))
  const fake = { url: "about:blank", restricted: false, failure: false, badStop: false, calls: [] as string[][], modelCalls: 0, closeCalls: 0,
    selectionCalls: 0, failSelectionAt: null as number | null,
    decide: async (prompt: string): Promise<unknown> => evidenceDecisionFor(prompt), close: () => {}, beforeCommand: null as ((args: readonly string[]) => Promise<void>) | null,
    links: [] as { title: string; url: string }[], text: null as string | null, textForUrl: null as ((url: string) => string) | null,
    linksForUrl: null as ((url: string) => { title: string; url: string }[]) | null }
  const planFake = { calls: 0, decide: async (prompt: string): Promise<unknown> => proposalFor(prompt), close: () => {} }
  const baseAIModel = testAIModel(async function* (prompt) {
      if (prompt.includes("用途 requirement_interview")) { yield authoredInterview({ assistantText: "已整理", question: null, draft: { title: "目录调研", brief: sourceBrief } }); return }
      fake.modelCalls++
      if (prompt.includes("用途 plan_evidence")) { yield succeeded(await fake.decide(prompt)); return }
      if (prompt.includes("用途 plan_creation")) { planFake.calls++; yield succeeded(await planFake.decide(prompt)); return }
      if (chainDecision) { yield succeeded(await chainDecision(prompt)); return }
      throw new Error("unexpected_fixture_model_call")
    }, undefined, () => { fake.closeCalls++; fake.close(); planFake.close() })
  const aiModel = { ...baseAIModel, selection: () => {
    fake.selectionCalls++
    if (fake.selectionCalls === fake.failSelectionAt) throw new Error("fixture_selection_failed")
    return baseAIModel.selection()
  } }
  const options = { root: fileURLToPath(new URL("../../..", import.meta.url)), directory, serveUi, planExecutor: executor ?? null, aiModel,
    browserExecutor: async (args: readonly string[]) => {
      await fake.beforeCommand?.(args); fake.calls.push([...args])
      if (fake.failure && args[1] === "navigate") return { exitCode: 1, stdout: "{}" }
      const search = fake.url.startsWith("https://www.bing.com")
      let value: unknown = { tab_id: 1 }
      if (args[1] === "session") value = args[2] === "start" ? { session_id: "abcd" } : { stopped: fake.badStop ? [] : ["abcd"], failed: fake.badStop ? [1] : [], return_failures: [] }
      if (args[1] === "navigate") fake.url = args[2]!
      if (args[1] === "tab") value = { tabs: [{ tab_id: 1, url: fake.url, active: true, scope: "agent" }] }
      if (args[1] === "observe") value = { tab_id: 1, truncated: false, text: fake.restricted && !search ? "请先登录 private-sensitive-data" : search ? "搜索结果 样例机构目录" : fake.textForUrl?.(fake.url) ?? fake.text ?? '名称 样例目录 @e1 link "下一页"' }
      if (args[1] === "evaluate") value = { ok: true, tab_id: 1, value: { url: fake.url, title: search ? "搜索结果" : "样例目录", links: search ? [{ title: "样例机构目录", url: "https://example.com/catalog" }] : fake.linksForUrl?.(fake.url) ?? fake.links } }
      return { exitCode: 0, stdout: JSON.stringify(value) }
    } }
  let current = await createApplication(options)
  const create = async (confirm = true) => {
    const response = await current.app.inject({ method: "POST", url: "/api/tasks", headers, payload: { type: "create", requestId: randomUUID() } })
    const id = response.json().id as string
    if (!confirm) return id
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: { type: "message", requestId: randomUUID(), expectedRevision: 0, text: "核验样例机构公开目录，无入口链接，系统负责发现。" } })
    await current.coordinator.waitForIdle()
    await current.app.inject({ method: "POST", url: `/api/interview?taskId=${id}`, headers, payload: { type: "confirm", requestId: randomUUID(), expectedRevision: 1, version: 1 } })
    return id
  }
  const planPost = (id: string, payload: Record<string, unknown>) => current.app.inject({ method: "POST", url: `/api/plan?taskId=${id}`, headers, payload })
  const generate = (id: string, requestId = randomUUID(), requirementVersion = 1) => planPost(id, { type: "generate", requestId, requirementVersion })
  const waitPlan = async (id: string) => {
    for (let i = 0; i < 400; i++) { const state = current.plan.snapshot(id); if (!state.generating) return state.records[0]!; await delay(10) }
    assert.fail("plan did not settle")
  }
  const startPlan = (id: string, requestId = randomUUID()) => {
    const record = current.plan.snapshot(id).records[0]!
    return planPost(id, { type: "start", requestId, planId: record.id, planDigest: record.digest })
  }
  return { get current() { return current }, directory, fake, planFake, create, ready: create, planPost, generate, waitPlan, startPlan,
    reopen: async () => { await current.app.close(); current = await createApplication(options) },
    close: async () => { fake.close(); planFake.close(); await current.app.close(); await rm(directory, { recursive: true, force: true }) } }
}

export async function withPlan(work: (value: Awaited<ReturnType<typeof planFixture>>) => Promise<void>, executor?: PlanExecutor) {
  const value = await planFixture(false, executor)
  try { await work(value) } finally { await value.close() }
}
