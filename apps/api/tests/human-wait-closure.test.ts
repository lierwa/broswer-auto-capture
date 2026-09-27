import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { CONTRACT_VERSION, taskPlanSchema, type TaskChain, type TaskCheckpoint } from "@browser-capture/contracts"
import { digestJson, executableChainDigest, TaskChainRuntime } from "@browser-capture/runtime"
import { capabilityEffectChain, nullContract, requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { ProductStore } from "../src/database/store.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { TaskPlanExecutor } from "../src/task-chain/plan-executor.js"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { HybridRuntimeScopeState } from "../src/upstream-browser/hybrid-runtime-scope.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"

const root = path.resolve(import.meta.dirname, "../../..")
const browser = { sessionId: "owned-session", tabId: "owned-tab", documentId: "current-document",
  url: "https://example.test/private", observationDigest: "a".repeat(64), observedAt: "2026-09-27T08:00:00.000Z" }
const report = cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "confirmed", code: null })), false)
const resume = (checkpoint: TaskCheckpoint) => ({ checkpoint, resumeRequest: { contractVersion: CONTRACT_VERSION,
  requestId: randomUUID(), binding: checkpoint.binding, checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence } })

// 真实生产层负责路由、预算、handoff、SQLite 与恢复；runner 回执受控，不声称通过真实网站登录。
test("认证未处理仍等待；SQLite 重建后恢复同 execution/run/owner，仅重试当前读取", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-human-wait-closure-"))
  let store = await ProductStore.open(directory), authenticated = false
  const commands: string[] = [], starts: unknown[] = [], handoffs: string[] = []
  try {
    const taskId = store.taskAction({ type: "create", requestId: randomUUID() })
    const fixture = makeFixture(taskId)
    let ownerId = ""
    const runner = { envBoolean: () => false, close: async () => report,
      startHybrid: async (config: unknown) => {
        starts.push(config); ownerId = (config as { managedWindow: { ownerId: string } }).managedWindow.ownerId
      },
      handoff: async () => { handoffs.push(ownerId); return { report, lease: {
        leaseId: ownerId, ownerId, targetDigest: "c".repeat(64), active: true as const, reason: null } } },
      request: async (raw: unknown) => {
        const request = raw as { type: string; command?: { name: string } }
        if (request.type === "hybrid_observe") return browser
        commands.push(request.command!.name)
        if (request.command!.name === "browser.read-fields" && !authenticated) {
          throw new Error("hybrid_runner_failed:RuntimeError:capture_authentication_required")
        }
        return { output: null, browser, browserCommands: 1, modelCalls: 0 }
      } }
    const create = () => {
      const repository = new TaskContractRepository(store)
      // 固定计划/需求是测试输入；运行与 execution 始终使用真实 repository 和 SQLite。
      repository.plan = () => fixture.plan; repository.chain = () => fixture.chain
      repository.requirement = () => fixture.requirement
      const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("model_forbidden") },
        withCapabilities: (input, work) => withHybridCapabilities({ ...input, root, directory, createRunner: () => runner }, work) }
      const host = new TaskRuntimeHost(repository, { setAuthorizationValidator() {} } as never,
        { selection() { throw new Error("model_forbidden") } } as never, undefined, upstream)
      const state = { snapshot: () => ({ active: false, confirmedVersion: 1 }) } as unknown as ProductStore
      return { repository, executor: new TaskPlanExecutor(state, repository, host) }
    }
    let service = create()
    const record = service.repository.saveExecution(fixture.record)
    const waiting = await service.executor.execute(record, new AbortController().signal)
    assert.equal(waiting.status, "waiting_for_human")
    assert.equal(waiting.result?.nextAction, "resume")
    assert.equal(waiting.browserHandoff.purpose, "human_wait")
    assert.equal(waiting.cleanup.status, "confirmed")
    const runId = waiting.currentRunId!, checkpoint = service.repository.run(taskId, runId).checkpoint!
    assert.equal(checkpoint.cursor, "capability")
    await store.close(); store = await ProductStore.open(directory); service = create()
    const restored = service.repository.execution(taskId, record.id)
    assert.deepEqual(restored, waiting)
    assert.deepEqual(service.repository.run(taskId, runId).checkpoint, checkpoint)
    const stillWaiting = await service.executor.execute(restored, new AbortController().signal, true)
    assert.equal(stillWaiting.status, "waiting_for_human")
    assert.equal(stillWaiting.currentRunId, runId)
    assert.match(stillWaiting.reason, /authentication_required/)
    authenticated = true
    const completed = await service.executor.execute(stillWaiting, new AbortController().signal, true)
    assert.equal(completed.status, "completed")
    assert.equal(completed.id, record.id)
    assert.deepEqual(completed.steps[0]!.runIds, [runId])
    assert.equal(completed.result?.nextAction, "rerun")
    assert.equal(completed.cleanup.status, "confirmed")
    assert.equal(completed.consumed.llmCalls, 0)
    assert.deepEqual(commands, ["browser.workflow-step", "browser.read-fields", "browser.read-fields", "browser.read-fields"])
    assert.equal(handoffs.length, 2)
    const windows = starts.map((value) => (value as { managedWindow: { ownerId: string; resume: boolean } }).managedWindow)
    assert.equal(new Set(windows.map((value) => value.ownerId)).size, 1)
    assert.ok(handoffs.every((value) => value === windows[0]!.ownerId))
    assert.deepEqual(windows.map((value) => value.resume), [false, true, true])
    const run = service.repository.run(taskId, runId)
    assert.equal(run.events.filter((event) => event.nodeId === "observe" && event.status === "finished").length, 1)
    assert.equal(run.events.filter((event) => event.nodeId === "capability" && event.outcome === "human_required").length, 2)
    assert.equal(run.modelCalls.length, 0)
  } finally {
    await store.close()
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(tmpdir())}${path.sep}bat-human-wait-closure-`))
    await rm(directory, { recursive: true, force: true })
  }
})

test("无明确完成条件的外部写恢复仍等待并给出原因，不重复派发", async () => {
  const chain = capabilityEffectChain(), action = chain.nodes.find((node) => node.id === "capability")!
  if (action.kind !== "capability") throw new Error("fixture")
  action.effect = "external_write"
  const request = requestFor(chain, null)
  let writes = 0
  const capabilities = { capability: async ({ node }: { node: { id: string } }) => {
    if (node.id === "observe") return { outcome: "success", output: null, browser }
    writes++; return { outcome: "human_required", reason: "等待确认", browser }
  }, verifyResume: async () => ({ ok: true, browser, observation: { url: browser.url } }) }
  const waiting = await new TaskChainRuntime().execute({ chain, request, capabilities })
  const again = await new TaskChainRuntime().execute({ chain, request, capabilities, control: resume(waiting.checkpoint!) })
  assert.equal(again.status, "waiting_for_human")
  assert.equal(again.binding.runId, waiting.binding.runId)
  assert.match(again.outcome!.reason, /缺少人工完成的验证条件/)
  assert.equal(writes, 1)
  const abort = new AbortController(); abort.abort()
  const cancelled = await new TaskChainRuntime().execute({ chain, request, capabilities,
    control: { ...resume(again.checkpoint!), signal: abort.signal } })
  assert.notEqual(cancelled.status, "completed")
  assert.equal(writes, 1)
})

test("人工等待不借新 session 导航冒充原窗口恢复", async () => {
  const requests: string[] = []
  await withHybridCapabilities({ root, directory: tmpdir(), ownerId: randomUUID(), allowedOrigins: ["https://example.test"],
    signal: new AbortController().signal, canRestoreByNavigation: true,
    createRunner: () => ({ startHybrid: async () => {}, envBoolean: () => false, close: async () => report,
      request: async (raw: unknown) => { requests.push((raw as { type: string }).type); return { ...browser, sessionId: "other" } } }) },
  async (capabilities) => {
    const checkpoint = { browser, resumeWhen: { operator: "exists", path: ["url"] }, pendingEffect: null,
      cursor: "read", events: [] } as unknown as TaskCheckpoint
    assert.equal((await capabilities.verifyResume!(checkpoint, new AbortController().signal)).ok, false)
  })
  assert.deepEqual(requests, ["hybrid_observe"])
})

test("人工作用域仅供原暂停节点，owner/tab/document 变化均拒绝", async () => {
  const config = { runtimeScopeFrom: "navigate", scope: { url: browser.url } }
  for (const changed of [{ ...browser, sessionId: "other" }, { ...browser, tabId: "other" }, { ...browser, documentId: "other" }]) {
    const scope = new HybridRuntimeScopeState(); scope.resumeHuman("read", browser)
    await assert.rejects(scope.commandConfig("browser.read-fields", config, async () => changed, "read"), /scope_page_changed/)
  }
  const scope = new HybridRuntimeScopeState(); scope.resumeHuman("read", browser)
  await assert.rejects(scope.commandConfig("browser.read-fields", config, async () => browser, "other"), /predecessor_missing/)
  const invalid = new HybridRuntimeScopeState(); invalid.resumeHuman("read", browser)
  await assert.rejects(invalid.commandConfig("browser.read-fields", { ...config, runtimeScopeFrom: [] },
    async () => browser, "read"), /scope_marker_invalid/)
  const fresh = new HybridRuntimeScopeState(); fresh.resumeHuman("read", browser)
  const resolved = await fresh.commandConfig("browser.read-fields", config,
    async () => ({ ...browser, observationDigest: "b".repeat(64) }), "read")
  assert.equal(Object.hasOwn(resolved, "runtimeScopeFrom"), false)
  assert.ok("scope" in resolved)
  assert.equal((resolved.scope as { url: string }).url, browser.url)
})

function makeFixture(taskId: string) {
  const chain = capabilityEffectChain(), now = new Date().toISOString()
  chain.taskId = taskId; chain.budget.maxBrowserCommands = 50; chain.budget.maxTransitions = 30
  const navigate = chain.nodes.find((node) => node.id === "observe")!, read = chain.nodes.find((node) => node.id === "capability")!
  if (navigate.kind !== "capability" || read.kind !== "capability") throw new Error("fixture")
  navigate.capability.name = "browser.workflow-step"; navigate.effect = "idempotent_write"
  navigate.input = { url: { source: "constant", value: browser.url } }
  navigate.config = { actionName: "navigate", target: null, postconditions: [{ kind: "url", bindingArgument: "url" }] }
  read.capability.name = "browser.read-fields"; read.effect = "read"
  read.config = { runtimeScopeFrom: "observe", scope: { url: browser.url }, specification: {
    container: "body", fields: {}, maxItems: 1, outputSchema: { type: "null" } } }
  const requirement = { contractVersion: CONTRACT_VERSION, kind: "requirement" as const, id: randomUUID(), taskId, version: 1,
    revision: 1, goal: "处理后继续读取", scope: "受控页面", definition: { format: "markdown" as const, body: "人工处理后继续" },
    inputContract: nullContract, outputContract: nullContract, constraints: [], completionCriteria: ["读取完成"],
    authorization: { scope: "测试", risks: [], requiredApprovals: [] }, confirmation: { confirmedAt: now, requestId: randomUUID() } }
  const plan = taskPlanSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "plan", id: chain.plan.id, taskId, version: 1,
    requirement: { id: requirement.id, version: 1, revision: 1, digest: digestJson(requirement) }, summary: "人工处理恢复",
    inputContract: nullContract, outputContract: nullContract, steps: [{ id: chain.stepId, title: "读取", goal: "读取完成",
      dependsOn: [], inputContract: nullContract, outputContract: nullContract, input: { source: "input", path: [] },
      invocation: { mode: "once" }, chain: { id: chain.id, version: chain.version }, budget: chain.budget,
      completion: chain.completion, risks: [] }], output: { source: "node", nodeId: chain.stepId, path: [] },
    budget: chain.budget, completion: chain.completion, evidence: [], authorizationScope: "测试" })
  chain.plan.digest = digestJson(plan)
  const reference = { id: chain.id, version: chain.version, digest: executableChainDigest(chain) }
  const record = { contractVersion: CONTRACT_VERSION, kind: "execution", id: randomUUID(), taskId, authorizationId: randomUUID(),
    release: { id: randomUUID(), version: 1, digest: "b".repeat(64) }, plan: chain.plan, requirement: plan.requirement,
    input: null, inputDigest: digestJson(null), status: "queued", sequence: 0, currentStepId: null, currentRunId: null,
    steps: [{ stepId: chain.stepId, chain: reference, invocationIds: [], runIds: [], status: "pending", output: null, reason: null }],
    output: null, reason: "等待执行", createdAt: now, updatedAt: now }
  return { chain: chain as TaskChain, plan, requirement, record }
}
