import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import {
  CONTRACT_VERSION, requiredStableNodeOutcomes, stableTaskChainSchema,
  type StableTaskChain,
} from "@browser-capture/contracts"
import {
  TaskChainRuntime, type LlmNodeInvocation, type ModelCallReport,
} from "@browser-capture/runtime"
import { requestFor } from "./task-chain-fixtures.js"

test("委托 llm 节点按每次真实模型调用和浏览器命令结算", async () => {
  const chain = delegatedChain()
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, "输入"), capabilities: {
    llm: async (invocation) => {
      await completeCall(invocation, "extract")
      await completeCall(invocation, "output_conversion")
      return { outcome: "success", output: "输出", reportedInvocations: 2, reportedBrowserCommands: 2 }
    },
  } })

  assert.equal(run.status, "completed", run.outcome?.reason)
  assert.deepEqual(run.modelCalls.map((call) => call.purpose), ["extract", "output_conversion"])
  assert.equal(run.consumed.llmCalls, 2)
  assert.equal(run.consumed.browserCommands, 2)
  assert.equal(run.auditComplete, true)
})

test("委托 llm 节点拒绝未声明、漏报和超过上限的模型调用", async (context) => {
  await context.test("拒绝未声明用途", async () => {
    const run = await executeWith(async (invocation) => {
      await completeCall(invocation, "agent")
      return { outcome: "success", output: "输出", reportedInvocations: 1, reportedBrowserCommands: 1 }
    })
    assertFailure(run, "delegated_model_purpose_undeclared:agent")
  })

  await context.test("拒绝缺失用途", async () => {
    const run = await executeWith(async (invocation) => {
      await completeCall(invocation, "extract")
      return { outcome: "success", output: "输出", reportedInvocations: 1, reportedBrowserCommands: 1 }
    })
    assertFailure(run, "delegated_model_audit_missing")
  })

  await context.test("拒绝超过声明上限", async () => {
    const run = await executeWith(async (invocation) => {
      await completeCall(invocation, "extract")
      await completeCall(invocation, "extract")
      await completeCall(invocation, "output_conversion")
      return { outcome: "success", output: "输出", reportedInvocations: 3, reportedBrowserCommands: 1 }
    })
    assertFailure(run, "delegated_model_count_exceeded")
  })
})

async function executeWith(llm: NonNullable<Parameters<TaskChainRuntime["execute"]>[0]["capabilities"]["llm"]>) {
  const chain = delegatedChain()
  return new TaskChainRuntime().execute({ chain, request: requestFor(chain, "输入"), capabilities: { llm } })
}

async function completeCall(invocation: LlmNodeInvocation, purpose: ModelCallReport["purpose"]) {
  const callId = randomUUID(), intendedAt = "2026-09-15T00:00:00.000Z"
  await invocation.onModelCall?.({ callId, purpose, model: "fixture-model", intendedAt,
    status: "intended", reportedInvocations: null })
  await invocation.onModelCall?.({ callId, purpose, model: "fixture-model", intendedAt,
    status: "completed", reportedInvocations: 1 })
}

function assertFailure(run: Awaited<ReturnType<TaskChainRuntime["execute"]>>, code: string) {
  assert.equal(run.status, "failed")
  assert.match(run.outcome?.reason ?? "", new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.equal(run.checkpoint?.pendingEffect?.status, "uncertain")
}

function delegatedChain(): StableTaskChain {
  const inputContract = contract("delegated-input"), outputContract = contract("delegated-output")
  const workflow = { id: "workflow", label: "workflow", kind: "llm" as const, instruction: "执行工作流",
    input: { source: "input" as const, path: [] }, model: "fixture-model", timeoutMs: 1_000,
    delegate: { capability: { name: "browser.workflow-use", version: 1 }, config: { adapter: "fixture" },
      effect: "read" as const, modelPurposes: ["extract", "output_conversion"] as const,
      maxInvocations: 2, maxBrowserCommands: 3 },
    outcomes: [...requiredStableNodeOutcomes.llm], outputContract, writes: [] }
  const completed = { id: "completed", label: "completed", kind: "terminal" as const, status: "completed" as const,
    reason: "完成", result: { name: "result", output: { kind: "value" as const,
      value: { source: "node" as const, nodeId: workflow.id, path: [] } }, contract: outputContract },
    evidence: [{ source: "node" as const, nodeId: workflow.id, path: [] }],
    outcomes: [], outputContract, writes: [] }
  const failed = { id: "failed", label: "failed", kind: "terminal" as const, status: "failed" as const,
    reason: "失败", evidence: [{ source: "input" as const, path: [] }], outcomes: [], outputContract, writes: [] }
  return stableTaskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v1",
    id: "21000000-0000-4000-8000-000000000001", taskId: "delegated-task", version: 1,
    plan: { id: "21000000-0000-4000-8000-000000000002", version: 1, digest: "a".repeat(64) },
    stepId: "perform", name: "delegated workflow", inputContract, outputContract, variables: {}, entry: workflow.id,
    nodes: [workflow, completed, failed], edges: workflow.outcomes.map((outcome) => ({ from: workflow.id, outcome,
      to: outcome === "success" ? completed.id : failed.id })),
    completion: [{ id: "result", description: "结果存在", predicate: { operator: "exists",
      value: { source: "node", nodeId: workflow.id, path: [] } } }],
    budget: { maxTransitions: 10, maxBrowserCommands: 3, maxActiveMs: 10_000, maxLlmCalls: 2,
      maxInvocations: 1, maxDepth: 1 },
    reuseBoundary: { description: "相同输入合同", assumptions: [], invalidationConditions: [] },
    implementationSummary: "fixture", validation: { status: "candidate", evidence: [] } })
}

function contract(id: string) {
  return { id, version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "string" as const } }
}
