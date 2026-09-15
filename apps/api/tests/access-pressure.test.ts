import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, taskPlanSchema, type JsonValue, type TaskChain, type TaskExecution,
  type TaskRequirement, type TaskRun } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { TaskPlanExecutor } from "../src/task-chain/plan-executor.js"
import type { ProductStore } from "../src/database/store.js"
import type { TaskContractRepository } from "../src/task-chain/repository.js"
import type { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"

test("计划 each 在调度前去重；外部访问中断覆盖 continue 并熔断剩余输入", async () => {
  const successful = fixture(false)
  await successful.executor.execute(successful.record, new AbortController().signal)
  assert.equal(successful.record.status, "completed")
  assert.deepEqual(successful.inputs, ["first", "second"])
  assert.deepEqual(successful.record.output && successful.record.output.kind === "value"
    ? successful.record.output.value : null, [{ id: "first", value: "甲" }, { id: "second", value: "乙" }])

  const interrupted = fixture(true)
  await interrupted.executor.execute(interrupted.record, new AbortController().signal)
  assert.equal(interrupted.record.status, "blocked")
  assert.deepEqual(interrupted.inputs, ["first"])
  assert.match(interrupted.record.reason, /rate_limited.*HTTP 429/)
})

test("取消状态不会被异步执行栈晚到的 abort 覆盖成暂停", async () => {
  const current = fixture(false), controller = new AbortController()
  let persisted = structuredClone(current.record)
  current.repository.execution = () => structuredClone(persisted)
  current.repository.saveExecution = (value) => {
    const parsed = value as TaskExecution
    persisted = structuredClone(parsed)
    return parsed
  }
  current.host.group = async () => {
    persisted.status = "cancelled"; persisted.reason = "运行已取消；已有运行和产物记录保留。"
    persisted.sequence++; controller.abort()
    throw new Error("aborted_after_cancel_persisted")
  }

  const result = await current.executor.execute(current.record, controller.signal)

  assert.equal(result.status, "cancelled")
  assert.equal(current.repository.execution(current.record.taskId, current.record.id).status, "cancelled")
})

function fixture(failFirst: boolean) {
  const taskId = "access-pressure-task", now = "2026-09-13T00:00:00.000Z"
  const item = { id: "item", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "object" as const,
    properties: { id: { type: "string" as const }, value: { type: "string" as const } },
    required: ["id", "value"], additionalProperties: false } }
  const inputContract = { id: "batch", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "object" as const,
    properties: { items: { type: "array" as const, items: item.schema, maxItems: 10 } }, required: ["items"], additionalProperties: false } }
  const outputContract = { id: "results", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "array" as const, items: item.schema, maxItems: 10 } }
  const requirement: TaskRequirement = { contractVersion: CONTRACT_VERSION, kind: "requirement", id: randomUUID(), taskId,
    version: 1, revision: 1, goal: "处理动态页面", scope: "两个以上输入", definition: { format: "markdown", body: "处理页面" },
    inputContract, outputContract, constraints: [], completionCriteria: ["输出已保存"],
    authorization: { scope: "测试来源", risks: [], requiredApprovals: [] },
    confirmation: { confirmedAt: now, requestId: randomUUID() } }
  const chainId = randomUUID(), stepId = "perform", budget = { maxTransitions: 20, maxBrowserCommands: 20,
    maxActiveMs: 30_000, maxLlmCalls: 0, maxInvocations: 10, maxDepth: 1 }
  const completion = { id: "done", description: "输出已存在", predicate: { operator: "exists" as const,
    value: { source: "node" as const, nodeId: stepId, path: [] } } }
  const plan = taskPlanSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "plan", id: randomUUID(), taskId, version: 1,
    requirement: { id: requirement.id, version: 1, revision: 1, digest: digestJson(requirement) }, summary: "逐项处理",
    inputContract, outputContract, steps: [{ id: stepId, title: "逐项处理", goal: "输出结果", dependsOn: [], inputContract: item,
      outputContract: item, input: { source: "variable", name: "entry", path: [] }, invocation: { mode: "each", collection: {
        source: "input", path: ["items"] }, itemVariable: "entry", stableKeyPath: ["id"], maxItems: 10, onItemFailure: "continue" },
      chain: { id: chainId, version: 1 }, budget, completion: [completion], risks: [] }],
    output: { source: "node", nodeId: stepId, path: [] }, budget, completion: [completion], evidence: [], authorizationScope: "测试" })
  const planDigest = digestJson(plan)
  const chain = { contractVersion: CONTRACT_VERSION, kind: "chain", id: chainId, taskId, version: 1,
    plan: { id: plan.id, version: 1, digest: planDigest }, stepId, name: "逐项处理", inputContract: item, outputContract: item,
    variables: {}, entry: "done", nodes: [], edges: [], completion: [], budget,
    reuseBoundary: { description: "按输入复跑", assumptions: [], invalidationConditions: [] }, implementationSummary: "fixture",
    validation: { status: "verified", evidence: [] } } as unknown as TaskChain
  const chainRef = { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }
  const record: TaskExecution = { contractVersion: CONTRACT_VERSION, kind: "execution", id: randomUUID(), taskId,
    authorizationId: randomUUID(), plan: { id: plan.id, version: 1, digest: planDigest }, requirement: plan.requirement,
    input: { items: [{ id: "first", value: "甲" }, { id: "first", value: "甲" }, { id: "second", value: "乙" }] },
    inputDigest: "a".repeat(64), consumed: empty(), status: "queued", sequence: 0, currentStepId: null, currentRunId: null,
    steps: [{ stepId, chain: chainRef, invocationIds: [], runIds: [], consumed: empty(), status: "pending", output: null, reason: null }],
    output: null, reason: "等待执行", createdAt: now, updatedAt: now }
  record.inputDigest = digestJson(record.input)
  const inputs: string[] = [], runs: TaskRun[] = []
  const repository = { plan: () => plan, requirement: () => requirement, chain: () => chain, runs: () => runs,
    saveExecution: (value: TaskExecution) => value } as unknown as TaskContractRepository
  const store = { snapshot: () => ({ active: false, confirmedVersion: 1 }) } as unknown as ProductStore
  const host = { group: async (_input: unknown, work: (execute: (chain: TaskChain, request: { input: JsonValue }) => Promise<TaskRun>) => Promise<unknown>) => work(async (selected, request) => {
    const value = request.input as { id: string; value: string }; inputs.push(value.id)
    const run = failFirst && inputs.length === 1 ? failedRun(selected, request as never)
      : completedRun(selected, request as never, value)
    runs.push(run); return run
  }) } as unknown as TaskRuntimeHost
  return { executor: new TaskPlanExecutor(store, repository, host), record, inputs, repository, host }
}

function completedRun(chain: TaskChain, request: { binding: TaskRun["binding"]; input: JsonValue; mode: TaskRun["mode"] }, value: JsonValue): TaskRun {
  return { contractVersion: CONTRACT_VERSION, kind: "run", binding: request.binding, mode: request.mode, input: request.input,
    budget: chain.budget, sequence: 1, status: "completed", outputs: { result: { kind: "value",
      contract: { id: chain.outputContract.id, version: chain.outputContract.version }, value } }, checkpoint: null, consumed: empty(),
    outcome: { status: "completed", reason: "完成", evidence: [], completionEvidence: ["done"] }, events: [], modelCalls: [],
    auditComplete: true, externalFailure: null }
}

function failedRun(chain: TaskChain, request: { binding: TaskRun["binding"]; input: JsonValue; mode: TaskRun["mode"] }): TaskRun {
  const externalFailure = { category: "rate_limited" as const, code: "rate_limited", origin: "https://example.com",
    observedOrigin: "https://example.com", httpStatus: 429, retryAt: null }
  return { contractVersion: CONTRACT_VERSION, kind: "run", binding: request.binding, mode: request.mode, input: request.input,
    budget: chain.budget, sequence: 1, status: "failed", outputs: {}, checkpoint: null, consumed: empty(),
    outcome: { status: "failed", code: "rate_limited", reason: "来源限制访问", evidence: [] }, events: [], modelCalls: [],
    auditComplete: true, externalFailure }
}

function empty() { return { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 } }
