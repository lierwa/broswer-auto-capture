import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { CONTRACT_VERSION, nodePorts, requiredNodeOutcomes, taskChainSchema, type JsonValue, type LegacyTaskChain, type TaskBudget, type TaskChain,
  type TaskConsumption, type TaskRun, type TaskRunRequest } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, stableUuid, type RuntimeControl } from "@browser-capture/runtime"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { TaskBudgetLedger } from "../src/task-chain/budget-ledger.js"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import type { TaskContractRepository } from "../src/task-chain/repository.js"
import type { BrowserService } from "../src/browser/service.js"
import type { AIModelProvider } from "../src/ai/model.js"

const budget: TaskBudget = { maxTransitions: 3, maxBrowserCommands: 2, maxActiveMs: 10_000,
  maxLlmCalls: 1, maxInvocations: 2, maxDepth: 2 }
const resumeBudget: TaskBudget = { ...budget, maxTransitions: 20, maxInvocations: 5, maxDepth: 3 }
const empty = (): TaskConsumption => ({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 })

test("步骤预算与计划总预算按实际消费原子扣减", () => {
  let persisted: TaskConsumption | null = null
  const ledger = new TaskBudgetLedger(budget, empty(), new Map([["step", { budget, consumed: empty() }]]),
    (_scope, snapshot) => { persisted = snapshot.total })
  ledger.account("step", { transitions: 2, invocations: 1 })
  ledger.account("step", { transitions: 1 })
  assert.deepEqual(persisted, { ...empty(), transitions: 3, invocations: 1 })
  assert.throws(() => ledger.account("step", { transitions: 1 }), /预算已用尽/)
  ledger.account("step", { llmCalls: 1 })
  ledger.account("step", { llmCalls: -1 }, "settle")
  assert.equal(ledger.remaining("step").maxLlmCalls, 1)
})

test("浏览器授权包含固定 invoke 子链的能力与来源", async () => {
  const taskId = "generic-task", child = fakeChain(taskId, "child", [{ kind: "browser", operation: "navigate",
    arguments: { url: { source: "constant", value: "https://nested.example/start" } } }])
  const root = fakeChain(taskId, "root", [{ kind: "invoke",
    chain: { id: child.id, version: child.version, digest: executableChainDigest(child) } }])
  const captured: { value?: { allowedOrigins: string[] } } = {}
  const repository = { chain: (_taskId: string, id: string, version: number, digest?: string) => {
    assert.equal(id, child.id); assert.equal(version, child.version); assert.equal(digest, executableChainDigest(child)); return child
  } } as unknown as TaskContractRepository
  const browser = {} as BrowserService
  const upstream: UpstreamBrowserRuntime = { async withCapabilities(input, work) {
    captured.value = input
    return work({})
  } }
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, ai, undefined, upstream)
  await host.group({ taskId, authorizationId: randomUUID(), browserRunId: randomUUID(), requirementVersion: 1,
    purpose: "replay", chains: [root], input: { start: "https://root.example/" }, signal: new AbortController().signal,
    budget, consumed: empty(), scopeConsumption: { root: empty() } }, async () => undefined)
  assert.deepEqual(new Set(captured.value?.allowedOrigins), new Set(["https://root.example", "https://nested.example"]))
})

test("真实浏览器底层命令数同步到 TaskRun 与计划总账", async () => {
  const taskId = "browser-command-accounting", chain = countedBrowserChain(taskId)
  const authorizationId = randomUUID(), runId = randomUUID(), snapshots: TaskConsumption[] = []
  const repository = { runs: () => [], saveRun: (run: TaskRun) => run } as unknown as TaskContractRepository
  const browser = {} as BrowserService
  const upstream: UpstreamBrowserRuntime = { async withCapabilities(_input, work) {
    let commands = 0
    return work({ browserCommandCount: () => commands, async browser() {
      this.accountConsumption?.({ browserCommands: 1 }); commands++
      this.accountConsumption?.({ browserCommands: 1 }); commands++
      return { outcome: "success", output: null }
    } })
  } }
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, ai, undefined, upstream)
  const request: TaskRunRequest = { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "replay", input: null,
    binding: { runId, invocationId: randomUUID(), taskId, authorizationId, plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(null) } }
  const run = await host.group({ taskId, authorizationId, browserRunId: randomUUID(), requirementVersion: 1,
    purpose: "replay", chains: [chain], input: null, signal: new AbortController().signal,
    budget: chain.budget, consumed: empty(), scopeConsumption: { [chain.stepId]: empty() },
    onConsumption: (_scopeId, snapshot) => { snapshots.push(snapshot.total) } }, (execute) => execute(chain, request))
  assert.equal(run.status, "completed")
  assert.equal(run.consumed.browserCommands, 2)
  assert.equal(snapshots.at(-1)?.browserCommands, 2)
})

test("只含本地 wait 的 browser 节点无需伪造浏览器授权也能执行", async () => {
  const taskId = "local-wait-task", chain = localWaitChain(taskId), authorizationId = randomUUID(), runId = randomUUID()
  let browserRuns = 0
  const repository = { runs: () => [], saveRun: (run: unknown) => run } as unknown as TaskContractRepository
  const browser = { setAuthorizationValidator() {}, async run() { browserRuns += 1; throw new Error("browser_not_expected") } } as unknown as BrowserService
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, ai)
  const request = { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "replay" as const, input: null,
    binding: { runId, invocationId: randomUUID(), taskId, authorizationId, plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(null) } }
  const run = await host.group({ taskId, authorizationId, browserRunId: randomUUID(), requirementVersion: 1,
    purpose: "replay", chains: [chain], input: null, signal: new AbortController().signal,
    budget, consumed: empty(), scopeConsumption: { [chain.stepId]: empty() } }, (execute) => execute(chain, request))
  assert.equal(run.status, "completed")
  assert.equal(browserRuns, 0)
})

test("invoke 子链人工等待后复用同一持久化运行与检查点", async () => {
  const taskId = "child-resume-task", child = waitingChildChain(taskId), parent = invokingParentChain(taskId, child)
  const authorizationId = randomUUID(), runId = randomUUID(), invocationId = randomUUID()
  const saved = new Map<string, TaskRun>(), resuming: boolean[] = []
  const repository = {
    chain: (_taskId: string, id: string, version: number, digest?: string) => {
      assert.equal(id, child.id); assert.equal(version, child.version); assert.equal(digest, executableChainDigest(child)); return child
    },
    runs: () => [...saved.values()],
    saveRun: (run: TaskRun) => { saved.set(run.binding.runId, structuredClone(run)); return run },
  } as unknown as TaskContractRepository
  const browser = { setAuthorizationValidator() {}, async run() { throw new Error("browser_not_expected") } } as unknown as BrowserService
  const ai = { selection() { throw new Error("unused") } } as unknown as AIModelProvider
  const host = new TaskRuntimeHost(repository, ai, () => ({ human: async ({ resuming: value }) => {
    resuming.push(value)
    return value ? { outcome: "success", output: null } : { outcome: "human_required", reason: "等待确认" }
  } }))
  const request: TaskRunRequest = { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "replay", input: null,
    binding: { runId, invocationId, taskId, authorizationId, plan: parent.plan,
      chain: { id: parent.id, version: parent.version, digest: executableChainDigest(parent) }, inputDigest: digestJson(null) } }
  const first = await executeInGroup(host, parent, request)
  assert.equal(first.status, "waiting_for_human")
  assert.ok(first.checkpoint)
  const childInvocation = first.checkpoint.invocations[0]!.invocationId
  const childRunId = stableUuid(runId, "child", childInvocation)
  assert.equal(saved.get(childRunId)?.status, "waiting_for_human")
  const resumed = await executeInGroup(host, parent, request, resumeControl(first), first.consumed)
  assert.equal(resumed.status, "completed")
  assert.deepEqual(resuming, [false, true])
  assert.equal(saved.get(childRunId)?.status, "completed")
  assert.equal([...saved.keys()].filter((id) => id === childRunId).length, 1)
})

function fakeChain(taskId: string, stepId: string, nodes: JsonValue[]): LegacyTaskChain {
  const contract = { id: `${stepId}-value`, version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "object" as const, properties: {}, required: [], additionalProperties: true } }
  return { contractVersion: CONTRACT_VERSION, kind: "chain", id: randomUUID(), taskId, version: 1,
    plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) }, stepId, name: stepId,
    inputContract: contract, outputContract: contract, variables: {}, entry: "entry", nodes: nodes as LegacyTaskChain["nodes"], edges: [],
    completion: [], budget, reuseBoundary: { description: "fixture", assumptions: [], invalidationConditions: [] },
    implementationSummary: "fixture", validation: { status: "verified", evidence: [] } }
}

function localWaitChain(taskId: string): TaskChain {
  const contract = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
  const wait = { id: "wait", label: "wait", kind: "browser" as const, operation: "wait" as const,
    arguments: { durationMs: { source: "constant" as const, value: 1 } }, timeoutMs: 100,
    outcomes: [...requiredNodeOutcomes.browser], outputContract: contract, writes: [] }
  const emit = { id: "emit", label: "emit", kind: "emit" as const, name: "result",
    output: { kind: "value" as const, value: { source: "constant" as const, value: null } }, contract,
    outcomes: [...requiredNodeOutcomes.emit], outputContract: contract, writes: [] }
  const terminal = (id: string, status: "completed" | "failed") => ({ id, label: id, kind: "terminal" as const,
    status, reason: status, evidence: [{ source: "input" as const, path: [] }], outcomes: [], outputContract: contract, writes: [] })
  const done = terminal("done", "completed"), failed = terminal("failed", "failed")
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", id: randomUUID(), taskId, version: 1,
    plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) }, stepId: "wait-step", name: "local wait",
    inputContract: contract, outputContract: contract, variables: {}, entry: wait.id, nodes: [wait, emit, done, failed],
    edges: [...wait.outcomes.map((outcome) => ({ from: wait.id, outcome, to: outcome === "success" ? emit.id : failed.id })),
      ...emit.outcomes.map((outcome) => ({ from: emit.id, outcome, to: outcome === "success" ? done.id : failed.id }))],
    completion: [{ id: "emitted", description: "output emitted", predicate: { operator: "equals", left: {
      source: "node", nodeId: emit.id, path: [] }, right: { source: "constant", value: null } } }], budget,
    reuseBoundary: { description: "local wait", assumptions: [], invalidationConditions: [] },
    implementationSummary: "local wait fixture", validation: { status: "candidate", evidence: [] } })
}

function countedBrowserChain(taskId: string): TaskChain {
  const contract = nullContract(), action = { id: "navigate", label: "navigate", kind: "browser" as const,
    operation: "navigate" as const, arguments: { url: { source: "constant" as const, value: "https://example.com/" } },
    timeoutMs: 10_000, outcomes: [...requiredNodeOutcomes.browser], outputContract: contract, writes: [] }
  return finishableChain(taskId, "browser-step", [action], action.id, contract, false)
}

function waitingChildChain(taskId: string): TaskChain {
  const contract = nullContract(), human = { id: "confirm", label: "confirm", kind: "human" as const,
    reason: "confirmation" as const, prompt: "请确认", resumeWhen: { operator: "equals" as const, path: [],
      expected: { source: "constant" as const, value: null } }, timeoutMs: 10_000,
    outcomes: [...requiredNodeOutcomes.human], outputContract: contract, writes: [] }
  return finishableChain(taskId, "child-step", [human], human.id, contract, true)
}

function invokingParentChain(taskId: string, child: TaskChain): TaskChain {
  const contract = nullContract(), invoke = { id: "invoke", label: "invoke", kind: "invoke" as const,
    chain: { id: child.id, version: child.version, digest: executableChainDigest(child) },
    input: { source: "input" as const, path: [] }, iteration: { mode: "once" as const },
    outcomes: [...requiredNodeOutcomes.invoke], outputContract: contract, writes: [] }
  return finishableChain(taskId, "parent-step", [invoke], invoke.id, contract, false)
}

function finishableChain(taskId: string, stepId: string, starts: TaskChain["nodes"], entry: string,
  contract: ReturnType<typeof nullContract>, verified: boolean): TaskChain {
  const emit = { id: "emit", label: "emit", kind: "emit" as const, name: "result",
    output: { kind: "value" as const, value: { source: "node" as const, nodeId: entry, path: [] } }, contract,
    outcomes: [...requiredNodeOutcomes.emit], outputContract: contract, writes: [] }
  const terminal = (id: string, status: "completed" | "failed") => ({ id, label: id, kind: "terminal" as const,
    status, reason: status, evidence: [{ source: "input" as const, path: [] }], outcomes: [], outputContract: contract, writes: [] })
  const done = terminal("done", "completed"), failed = terminal("failed", "failed")
  const evidence = verified ? [{ phase: "sample" as const, runId: randomUUID(), chainDigest: "c".repeat(64),
    inputDigest: "d".repeat(64), outputDigest: "e".repeat(64), passed: true, modelCalls: 0, at: "2026-09-12T00:00:00Z" },
    { phase: "verification" as const, runId: randomUUID(), chainDigest: "c".repeat(64), inputDigest: "f".repeat(64),
      outputDigest: "e".repeat(64), passed: true, modelCalls: 0, at: "2026-09-12T00:00:01Z" }] : []
  const first = starts[0]!
  return taskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", id: randomUUID(), taskId, version: 1,
    plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) }, stepId, name: stepId,
    inputContract: contract, outputContract: contract, variables: {}, entry, nodes: [...starts, emit, done, failed],
    edges: [...nodePorts(first).map((outcome) => ({ from: entry, outcome, to: outcome === "success" ? emit.id : failed.id })),
      ...emit.outcomes.map((outcome) => ({ from: emit.id, outcome, to: outcome === "success" ? done.id : failed.id }))],
    completion: [{ id: "emitted", description: "output emitted", predicate: { operator: "equals", left: {
      source: "node", nodeId: emit.id, path: [] }, right: { source: "constant", value: null } } }], budget: resumeBudget,
    reuseBoundary: { description: stepId, assumptions: [], invalidationConditions: [] }, implementationSummary: stepId,
    validation: { status: verified ? "verified" : "candidate", evidence } })
}

function nullContract() {
  return { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
}

async function executeInGroup(host: TaskRuntimeHost, chain: TaskChain, request: TaskRunRequest,
  control?: RuntimeControl, consumed = empty()) {
  return host.group({ taskId: chain.taskId, authorizationId: request.binding.authorizationId, browserRunId: randomUUID(),
    requirementVersion: 1, purpose: "replay", chains: [chain], input: request.input, signal: new AbortController().signal,
    budget: chain.budget, consumed, scopeConsumption: { [chain.stepId]: consumed } }, (execute) => execute(chain, request, control))
}

function resumeControl(run: TaskRun): RuntimeControl {
  const checkpoint = run.checkpoint!
  return { checkpoint, resumeRequest: { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), binding: run.binding,
    checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } }
}
