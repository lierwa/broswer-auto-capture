import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { CONTRACT_VERSION, nodePorts, stableTaskChainV2Schema, type StableChainNodeV2, type TaskCheckpoint,
  type TaskConsumption, type TaskRun, type TaskRunRequest } from "@browser-capture/contracts"
import { digestJson, executableChainDigest } from "@browser-capture/runtime"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { TaskBudgetLedger } from "../src/task-chain/budget-ledger.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { assertExecutionBrowserSupported } from "../src/upstream-browser/retirement.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"

const root = fileURLToPath(new URL("../../../", import.meta.url)), taskId = "hybrid-command-accounting"
const unit = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "null" as const } }
const browser = { sessionId: "session", tabId: "tab", url: "https://example.test/items", documentId: "document",
  observationDigest: "a".repeat(64), observedAt: "2026-09-21T00:00:00.000Z" }
const empty = (): TaskConsumption => ({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 })
const budget = { maxTransitions: 20, maxBrowserCommands: 4, maxActiveMs: 10_000, maxLlmCalls: 0, maxInvocations: 5, maxDepth: 3 }

test("显式浏览器显示模式覆盖环境默认值，旧调用仍使用环境后备", async () => {
  for (const [selected, environment, expected] of [
    [false, true, false], [true, false, true], [undefined, true, true],
  ] as const) {
    const started: boolean[] = []
    const runner = { ...controlledRunner([]), envBoolean: () => environment,
      startHybrid: async (config: { headless: boolean }) => { started.push(config.headless) } }
    await withHybridCapabilities({ root, directory: tmpdir(), ownerId: randomUUID(),
      signal: new AbortController().signal, allowedOrigins: ["https://example.test"],
      ...(selected !== undefined ? { headless: selected } : {}), createRunner: () => runner }, async () => null)
    assert.deepEqual(started, [expected])
  }
})

test("没有 hybrid Browser-Use 的链路在接单前拒绝 headless", () => {
  assert.throws(() => assertExecutionBrowserSupported([], true),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "headless_runtime_unsupported")
  assert.doesNotThrow(() => assertExecutionBrowserSupported([], false))
})

test("hybrid scope观察和动作同步到 TaskRun 与 execution 总账，invoke 不双计", async () => {
  for (const nested of [false, true]) {
    const { run, saved, requests, wireRequests, consumption } = await execute({ nested, limit: 3 })
    assert.equal(run.status, "completed")
    assert.deepEqual(requests, ["hybrid_execute", "hybrid_observe", "hybrid_execute"])
    assert.equal(consumption.browserCommands, 3)
    const browserRun = [...saved.values()].find((item) => item.binding.chain.id !== (nested ? run.binding.chain.id : ""))!
    assert.equal(browserRun.consumed.browserCommands, 3)
    assert.equal(consumption.llmCalls, 0)
    assert.deepEqual(wireRequests.filter((request) => request.type === "hybrid_execute")
      .map((request) => request.actionRef), ["navigate", "read"])
  }
})

test("hybrid 失败派发和诊断观察计费，预算不足的诊断不覆盖原业务错误", async () => {
  for (const limit of [3, 4]) {
    const { run, consumption, requests, errors } = await execute({ limit, failRead: true })
    assert.equal(run.status, "failed")
    assert.equal(run.consumed.browserCommands, limit)
    assert.equal(consumption.browserCommands, limit)
    assert.equal(requests.length, limit)
    assert.deepEqual(errors, ["provider_primary_failure"])
  }
})

test("hybrid scope观察用尽预算时在下一条动作派发前拒绝", async () => {
  const { run, consumption, requests } = await execute({ limit: 2 })
  assert.notEqual(run.status, "completed")
  assert.deepEqual(requests, ["hybrid_execute", "hybrid_observe"])
  assert.equal(run.consumed.browserCommands, 2)
  assert.equal(consumption.browserCommands, 2)
})

test("hybrid 写动作派发前预算拒绝保留 typed 暂停与未决副作用", async () => {
  const { run, consumption, requests } = await execute({ limit: 3, ledgerLimit: 0 })
  assert.equal(run.status, "paused")
  assert.equal(run.outcome?.status, "paused")
  assert.equal(run.checkpoint?.pendingEffect?.status, "uncertain")
  assert.deepEqual(requests, [])
  assert.equal(consumption.browserCommands, 0)
})

test("恢复的初始观察也通过同一计数接口计费", async () => {
  const requests: string[] = [], runner = controlledRunner(requests)
  const ledger = new TaskBudgetLedger(budget, empty(), new Map([["step", { budget, consumed: empty() }]]))
  await withHybridCapabilities({ root, directory: tmpdir(), ownerId: "resume-owner", signal: new AbortController().signal,
    allowedOrigins: ["https://example.test"], createRunner: () => runner }, async (base) => {
    const capabilities = { ...base, accountConsumption: (delta: Partial<TaskConsumption>) => ledger.account("step", delta) }
    const checkpoint = { browser, resumeWhen: null, pendingEffect: null, events: [] } as unknown as TaskCheckpoint
    const result = await capabilities.verifyResume!(checkpoint, new AbortController().signal)
    assert.equal(result.ok, true)
    assert.equal(capabilities.browserCommandCount!(), 1)
  })
  assert.deepEqual(requests, ["hybrid_observe"])
  assert.equal(ledger.scopeConsumption("step").browserCommands, 1)
})

test("人工处理后，同一 session 与授权来源内的页面跳转可从原检查点继续", async () => {
  const moved = { ...browser, url: "https://example.test/after-human" }
  const runner = { ...controlledRunner([]), request: async () => moved }
  await withHybridCapabilities({ root, directory: tmpdir(), ownerId: randomUUID(),
    signal: new AbortController().signal, allowedOrigins: ["https://example.test"], createRunner: () => runner },
  async (capabilities) => {
    const checkpoint = { browser, resumeWhen: { operator: "exists", path: ["url"] }, pendingEffect: null,
      events: [] } as unknown as TaskCheckpoint
    const resumed = await capabilities.verifyResume!(checkpoint, new AbortController().signal)
    assert.equal(resumed.ok, true)
    assert.equal(resumed.browser?.url, moved.url)
  })
})

test("保留原窗口时只交付已确认的 lease，Runner 清理回执仍独立记录", async () => {
  const ownerId = randomUUID(), report = cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({
    stage, status: stage === "browser_close" ? "not_required" as const : "confirmed" as const, code: null })), false)
  const lease = { leaseId: ownerId, ownerId, targetDigest: "a".repeat(64), active: true as const, reason: null }
  let started: unknown = null, handoffs = 0, directCloses = 0, handed: unknown = null, cleaned: unknown = null
  const runner = { ...controlledRunner([]), startHybrid: async (config: unknown) => { started = config },
    handoff: async () => { handoffs++; return { lease, report } },
    close: async () => { directCloses++; return report } }
  const result = await withHybridCapabilities({ root, directory: tmpdir(), ownerId,
    signal: new AbortController().signal, allowedOrigins: ["https://example.test"],
    managedWindow: { ownerId, resume: false }, handoffPurpose: () => "delivery",
    onHandoff: (purpose, value) => { handed = { purpose, value } }, onCleanup: (value) => { cleaned = value },
    createRunner: () => runner }, async () => "complete")
  assert.equal(result, "complete")
  assert.deepEqual((started as { managedWindow: unknown }).managedWindow, { ownerId, resume: false })
  assert.equal(handoffs, 1)
  assert.equal(directCloses, 0)
  assert.deepEqual(handed, { purpose: "delivery", value: lease })
  assert.equal(cleaned, report)
})

async function execute(options: { limit: number; ledgerLimit?: number; nested?: boolean; failRead?: boolean }) {
  const child = readChain(options.limit), chain = options.nested ? parentChain(child) : child
  const saved = new Map<string, TaskRun>(), requests: string[] = [], wireRequests: Array<{ type: string; actionRef?: string }> = [], errors: string[] = []
  let consumption = empty()
  const runner = controlledRunner(requests, options.failRead, wireRequests)
  const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("model_session_forbidden") },
    withCapabilities: (input, work) => withHybridCapabilities({ ...input, root, directory: tmpdir(), createRunner: () => runner },
      (base) => work({ ...base, async capability(invocation) {
        try { return await base.capability!.call(this, invocation) }
        catch (error) { errors.push(error instanceof Error ? error.message : String(error)); throw error }
      } })) }
  const repository = { chain: () => child, runs: () => [...saved.values()],
    saveRun: (run: TaskRun) => { saved.set(run.binding.runId, structuredClone(run)); return run } }
  const host = new TaskRuntimeHost(repository as never, { setAuthorizationValidator() {} } as never,
    { selection() { throw new Error("model_forbidden") } } as never, undefined, upstream)
  const request: TaskRunRequest = { contractVersion: CONTRACT_VERSION, requestId: randomUUID(), mode: "sample", input: null,
    binding: { taskId, authorizationId: randomUUID(), invocationId: randomUUID(), runId: randomUUID(), plan: chain.plan,
      chain: { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }, inputDigest: digestJson(null) } }
  const run = await host.group({ taskId, authorizationId: request.binding.authorizationId, browserRunId: randomUUID(),
    requirementVersion: 1, purpose: "sample", chains: [chain], input: null, signal: new AbortController().signal,
    budget: { ...chain.budget, maxBrowserCommands: options.ledgerLimit ?? options.limit },
    consumed: empty(), scopeConsumption: { [chain.stepId]: empty() },
    onConsumption: (_scope, snapshot) => { consumption = snapshot.total } }, (runChain) => runChain(chain, request))
  return { run, saved, requests, wireRequests, consumption, errors }
}

function controlledRunner(requests: string[], failRead = false,
  wireRequests: Array<{ type: string; actionRef?: string }> = []) {
  return { startHybrid: async () => {}, envBoolean: () => true,
    request: async (raw: unknown) => {
      const request = raw as { type: string; command?: { name: string } }
      requests.push(request.type)
      wireRequests.push(request as { type: string; actionRef?: string })
      if (request.type === "hybrid_observe") return browser
      if (failRead && request.command?.name === "browser.read-fields") throw new Error("provider_primary_failure")
      return { output: null, browser, browserCommands: 1, modelCalls: 0 }
    },
    close: async () => cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "confirmed", code: null })), false),
  }
}

function readChain(limit: number) {
  const base = { effect: "read" as const, timeoutMs: 1000, outputContract: unit, writes: [] }
  const nodes: StableChainNodeV2[] = [
    { ...base, effect: "idempotent_write", id: "navigate", label: "导航", kind: "capability", capability: { name: "browser.workflow-step", version: 2 },
      input: { url: { source: "constant", value: browser.url } }, config: { actionName: "navigate", target: null,
        postconditions: [{ kind: "url", bindingArgument: "url" }] } },
    { ...base, id: "read", label: "读取", kind: "capability", capability: { name: "browser.read-fields", version: 2 }, input: {},
      config: { runtimeScopeFrom: "navigate", scope: { url: browser.url }, specification: { container: "body", fields: {},
        maxItems: 1, outputSchema: { type: "null" } } } },
  ]
  return finishChain(nodes, limit)
}

function parentChain(child: ReturnType<typeof readChain>) {
  return finishChain([{ id: "invoke", label: "复用子链", kind: "invoke", outputContract: unit, writes: [],
    chain: { id: child.id, version: child.version, digest: executableChainDigest(child) },
    input: { source: "input", path: [] }, iteration: { mode: "once" } }], child.budget.maxBrowserCommands)
}

function finishChain(nodes: StableChainNodeV2[], limit: number) {
  const terminals = (["completed", "failed"] as const).map((status) => ({ id: status, label: status, kind: "terminal" as const,
    status, reason: status, evidence: [{ source: "constant" as const, value: true }], outputContract: unit, writes: [],
    ...(status === "completed" ? { result: { name: "result", contract: unit,
      output: { kind: "value" as const, value: { source: "constant" as const, value: null } } } } : {}) }))
  return stableTaskChainV2Schema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v2",
    id: randomUUID(), version: 1, taskId, plan: { id: randomUUID(), version: 1, digest: "b".repeat(64) },
    stepId: "step", name: "计量边界", inputContract: unit, outputContract: unit, variables: {}, entry: nodes[0]!.id,
    nodes: [...nodes, ...terminals], edges: nodes.flatMap((node, index) => nodePorts(node).map((port) => ({
      from: node.id, port, to: port === "success" ? nodes[index + 1]?.id ?? "completed" : "failed" }))),
    completion: [{ id: "done", description: "完成通用计量样本", predicate: { operator: "equals",
      left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    budget: { ...budget, maxBrowserCommands: limit },
    reuseBoundary: { description: "计量合同", assumptions: [], invalidationConditions: [] }, implementationSummary: "计量合同",
    validation: { status: "verified", evidence: ["sample", "verification"].map((phase) => ({ phase,
      runId: randomUUID(), chainDigest: "c".repeat(64), inputDigest: digestJson(null), outputDigest: digestJson(null),
      passed: true, modelCalls: 0, at: "2026-09-21T00:00:00.000Z" })) } })
}
