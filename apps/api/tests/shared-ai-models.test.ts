import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { parseAIEvent, type AIEvent, type ModelSelection } from "@agent-platform/ai-connect/client"
import type { AIModelProvider, PreparedAIModel } from "../src/ai/model.js"
import { lazyAIModel } from "../src/ai/model.js"
import { executeCapture } from "../src/capture/executor.js"
import { modelDecision } from "../src/chain/model.js"
import type { ChainRepository } from "../src/chain/repository.js"
import { generatePlan } from "../src/plan/model.js"
import { runPlanEvidence } from "../src/plan/evidence-runner.js"
import { graphFor } from "./chain-fixture.js"
import { proposalFor } from "./plan-fixture.js"
import { evidenceDecisionFor, sourceBrief } from "./plan-fixture.js"
import type { PlanExecutor } from "../src/plan/queue.js"
import type { ChainRecord } from "@browser-capture/contracts/chain"
import { emptyPlanEvidence, type PlanRecord } from "@browser-capture/contracts/plan"
import { DomainError } from "../src/errors.js"

const selection: ModelSelection = { connectionId: randomUUID(), modelId: "gpt-5.6-sol", reasoningEffort: "high" }

function providerFor(decide: (prompt: string) => unknown) {
  const state = { selections: 0, prepares: 0, generates: 0 }
  const provider: AIModelProvider = {
    selection: () => { state.selections++; return selection },
    async prepare(model) {
      state.prepares++
      assert.deepEqual(model, selection)
      const prepared: PreparedAIModel = {
        selection,
        async generateObject<T>(input: Readonly<{ prompt: string; jsonSchema: Record<string, unknown>; parse(value: unknown): T; signal: AbortSignal; onEvent(event: AIEvent): void }>): Promise<T> {
          const invocationId = `fixture-${++state.generates}`
          input.onEvent(parseAIEvent({ type: "generation.started", invocationId, sequence: 0, createdAt: 1, output: "object", model: selection }))
          const output = input.parse(decide(input.prompt))
          input.onEvent(parseAIEvent({ type: "generation.completed", invocationId, sequence: 1, createdAt: 2,
            providerId: "openai", modelId: selection.modelId, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
          return output
        },
      }
      return prepared
    },
    async prepareMain() { throw new Error("main session not used by this fixture") },
  }
  return { provider, state }
}

test("plan evidence 与 plan drafting 分别冻结一次共享选择且不调用旧 Codex factory", async () => {
  const evidenceAI = providerFor(evidenceDecisionFor)
  let currentUrl = "about:blank"
  const at = new Date().toISOString()
  const plan: PlanRecord = { id: randomUUID(), taskId: randomUUID(), version: 1, requirementVersion: 1, requirementRevision: 1,
    requirement: sourceBrief, evidence: emptyPlanEvidence(), evidenceDigest: null, stage: "source_evidence",
    status: "generating", createdAt: at, updatedAt: at, sequence: 0, current: "正在核验来源证据", reason: null,
    proposal: null, digest: null, budgetCeiling: { maxCommands: 500, timeoutMs: 300000, maxModelCalls: 12, maxLlmCalls: 12 }, stepBudgetLimits: null, audit: null }
  const status = await runPlanEvidence({ record: plan, brief: sourceBrief, signal: new AbortController().signal,
    aiModel: evidenceAI.provider, selection,
    save: () => {}, validate: () => {}, browser: { command: async (command: unknown) => {
      const value = command as { type: string; url?: string }
      if (value.type === "navigate" || value.type === "follow") { currentUrl = value.url!; return null }
      const search = currentUrl.includes("bing.com")
      return JSON.stringify({ url: currentUrl, title: search ? "搜索结果" : "样例目录", truncated: false,
        text: search ? "搜索结果 样例机构目录" : "名称 样例目录 下一页",
        links: search ? [{ title: "样例机构目录", url: "https://example.com/catalog" }] : [] })
    } } })
  assert.equal(status, "completed"); assert.equal(evidenceAI.state.prepares, 1)
  assert.equal(plan.evidence.audits.length, 3); assert.ok(plan.evidence.audits.every((audit) => audit.aiEvents.length === 2 && audit.model === selection.modelId))

  const planAI = providerFor(proposalFor)
  plan.audit = { purpose: "plan_creation", model: selection.modelId, effort: selection.reasoningEffort, invocations: null,
    status: "intended", reportedModel: null, reportedEffort: null, aiEvents: [] }
  await generatePlan(plan, new AbortController().signal, () => {}, () => {}, planAI.provider)
  assert.equal(plan.status, "ready"); assert.equal(planAI.state.prepares, 1)
  assert.deepEqual(plan.audit!.aiEvents.map((event) => event.type), ["generation.started", "generation.completed"])
})

test("execution 首次模型判断才 prepare 且多个判断复用同一 handle", async () => {
  const ai = providerFor(() => ({ value: "ok" }))
  const shared = lazyAIModel(ai.provider, new AbortController().signal)
  const record: Pick<ChainRecord, "audits" | "consumed"> = { audits: [], consumed: { commands: 0, modelCalls: 0, elapsedMs: 0 } }
  for (let index = 0; index < 2; index++) {
    const result = await modelDecision({ shared, schema: z.object({ value: z.string() }), prompt: "fixture",
      record, purpose: "exploration", phase: "exploration", nodeId: null, signal: new AbortController().signal, save: () => {} })
    assert.equal(result.value, "ok")
  }
  assert.equal(ai.state.selections, 1); assert.equal(ai.state.prepares, 1); assert.equal(ai.state.generates, 2)
  assert.equal(record.audits.length, 2); assert.ok(record.audits.every((audit) => audit.aiEvents.length === 2))
})

test("纯确定性 replay 不 prepare 模型", async () => {
  const ai = providerFor(() => ({ value: "unused" })), shared = lazyAIModel(ai.provider, new AbortController().signal)
  const taskId = randomUUID(), planId = randomUUID(), chainId = randomUUID(), sourceId = randomUUID()
  const step = { id: "enumerate", title: "枚举", goal: "枚举", kind: "enumerate" as const, sourceIds: [sourceId], dependsOn: [],
    input: "目录", output: "链接", termination: "完成", budget: { maxCommands: 20, timeoutMs: 10000, maxModelCalls: 0, maxLlmCalls: 0 }, risks: [] }
  const plan = { id: planId, taskId, evidence: { observations: [{ id: sourceId, url: "https://example.com/catalog", queryId: null,
    assessment: { adopted: true, access: "normal" } }] }, requirement: { deliverables: [] }, proposal: { steps: [step], fields: [] } }
  const execution = { mode: "replay", repairStepId: null, resumeRequested: false, capture: null }
  const input = { plan, execution, signal: new AbortController().signal, save: () => {}, browser: {
    beginStep: () => {}, command: async (raw: unknown) => (raw as { type: string }).type === "page"
      ? JSON.stringify({ url: "https://example.com/catalog", title: "目录", text: "目录", truncated: false,
        links: [{ url: "https://example.com/item/one", title: "条目" }] }) : null,
  } } as unknown as Parameters<PlanExecutor>[0]
  const chain = { id: chainId, planId, stepId: step.id, status: "verified", graph: graphFor("enumerate"),
    sample: { url: "https://example.com/catalog", value: "" }, validationOutcomes: [] }
  const repository = { list: () => [chain] } as unknown as ChainRepository
  await executeCapture(input, repository, shared, async () => { throw new Error("explore must not run") })
  assert.equal(ai.state.selections, 0); assert.equal(ai.state.prepares, 0); assert.equal(ai.state.generates, 0)
})

test("未保存模型时给出设置提示且不调用模型", async () => {
  const provider: AIModelProvider = {
    selection: () => { throw new DomainError("model_selection_required", "请先在模型设置中保存账号和模型。", 409) },
    prepare: async () => { throw new Error("unreachable") },
    prepareMain: async () => { throw new Error("unreachable") },
  }
  await assert.rejects(modelDecision({ shared: lazyAIModel(provider, new AbortController().signal),
    schema: z.object({ value: z.string() }), prompt: "fixture",
    record: { audits: [], consumed: { commands: 0, modelCalls: 0, elapsedMs: 0 } }, purpose: "exploration", phase: "exploration", nodeId: null,
    signal: new AbortController().signal, save: () => {} }), /请先在模型设置中保存账号和模型/)
})
