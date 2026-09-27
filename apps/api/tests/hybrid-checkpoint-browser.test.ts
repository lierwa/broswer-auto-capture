import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"
import { requiredStableNodeOutcomes, stableTaskChainSchema, taskCheckpointSchema,
  type TaskCheckpoint } from "@browser-capture/contracts"
import { checkpointBrowserReceipt, digestJson, TaskChainRuntime } from "@browser-capture/runtime"
import { browserEffectChain, capabilityEffectChain, nullContract, requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { HybridRuntimeScopeState, RUNTIME_SCOPE_FROM } from "../src/upstream-browser/hybrid-runtime-scope.js"
import { withHybridCapabilities } from "../src/upstream-browser/hybrid-runtime.js"
import { cleanupReport, RUNNER_CLEANUP_STAGES } from "../src/upstream-browser/cleanup.js"

const browser = { sessionId: "session", tabId: "tab", documentId: "document", url: "https://example.test/items",
  observationDigest: "a".repeat(64), observedAt: "2026-09-27T00:00:00.000Z" }
const current = { ...browser, observedAt: "2026-09-27T00:01:00.000Z" }
const config = { scope: { url: browser.url }, [RUNTIME_SCOPE_FROM]: "observe" }
function resumeRequest(checkpoint: TaskCheckpoint) {
  return { contractVersion: checkpoint.contractVersion, requestId: "20000000-0000-4000-8000-000000000099",
    binding: checkpoint.binding, checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence }
}
function chainFixture() {
  const chain = capabilityEffectChain()
  const read = chain.nodes.find((node) => node.id === "capability")!
  if (read.kind !== "capability") throw new Error("fixture")
  read.capability.name = "browser.read-fields"; read.effect = "read"; read.config = config
  chain.nodes.push({ id: "pure", label: "pure", kind: "branch", outcomes: [...requiredStableNodeOutcomes.branch],
    outputContract: nullContract, writes: [], predicate: { operator: "equals",
      left: { source: "constant", value: null }, right: { source: "constant", value: null } } })
  chain.edges = chain.edges.map((edge) => edge.from === "observe" && edge.outcome === "success" ? { ...edge, to: "pure" } : edge)
  chain.edges.push(...requiredStableNodeOutcomes.branch.map((outcome) => ({ from: "pure", outcome,
    to: outcome === "true" || outcome === "false" ? "capability" : "error" })))
  return stableTaskChainSchema.parse(chain)
}
async function pausedFixture() {
  const chain = chainFixture(), request = requestFor(chain, null), controller = new AbortController()
  let commands = 0
  const run = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    capability: async () => { commands++; return { outcome: "success", output: null, browser } },
    persist: (saved) => {
      if (saved.checkpoint?.browserNodeId) assert.ok(checkpointBrowserReceipt(saved.checkpoint))
    },
  }, control: { signal: controller.signal, pacing: { beforeNode: async ({ node }) => {
    if (node.id === "capability") controller.abort()
  } } } })
  assert.equal(run.status, "paused")
  assert.equal(run.outcome?.status === "paused" && run.outcome.cause, "interrupted")
  assert.equal(commands, 1)
  assert.equal(run.checkpoint?.pendingEffect, null)
  return { chain, request, run, checkpoint: run.checkpoint! }
}

test("真实 runtime 浏览器→纯节点→中断恢复保留同 run、精确前驱与新观察时间", async () => {
  const { chain, request, run, checkpoint } = await pausedFixture()
  assert.equal(checkpoint.browserNodeId, "observe")
  assert.equal(checkpoint.events.at(-1)?.nodeId, "capability")
  assert.equal(checkpoint.events.findLast((event) => event.status === "finished")?.nodeId, "pure")
  assert.equal(checkpointBrowserReceipt(checkpoint)?.browserStateDigest, digestJson(checkpoint.browser))
  assert.ok(checkpoint.events.filter((event) => event.nodeId === "pure").every((event) => !event.browserStateDigest))
  const scope = new HybridRuntimeScopeState()
  let commands = 0
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    verifyResume: async (saved) => ({ ok: scope.restore(saved, current), browser: current }),
    capability: async () => {
      await scope.commandConfig("browser.read-fields", config, async () => current)
      commands++; return { outcome: "success", output: null, browser: current }
    },
  }, control: { checkpoint, resumeRequest: resumeRequest(checkpoint) } })
  assert.equal(resumed.status, "completed")
  assert.equal(resumed.binding.runId, run.binding.runId)
  assert.equal(commands, 1)
  assert.equal(resumed.modelCalls.length, 0)
})

test("恢复后尚未重派浏览器又中断时不改写旧回执摘要", async () => {
  const { chain, request, checkpoint } = await pausedFixture(), scope = new HybridRuntimeScopeState()
  const controller = new AbortController()
  const run = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    verifyResume: async (saved) => ({ ok: scope.restore(saved, current), browser: current }),
    capability: async () => { throw new Error("must not dispatch") },
  }, control: { checkpoint, resumeRequest: resumeRequest(checkpoint), signal: controller.signal,
    pacing: { beforeNode: async () => { controller.abort() } } } })
  assert.equal(run.status, "paused")
  assert.deepEqual(run.checkpoint?.browser, browser)
  assert.equal(checkpointBrowserReceipt(run.checkpoint!)?.browserStateDigest, digestJson(checkpoint.browser))
})

test("pending effect、旧缺字段和篡改节点/引用/现场身份均不恢复scope", async () => {
  const { checkpoint } = await pausedFixture()
  const mutations: Array<(value: TaskCheckpoint) => void> = [
    (value) => { value.pendingEffect = { kind: "browser", nodeId: "capability", stableKey: "root", idempotencyKey: "key", status: "uncertain" } },
    (value) => { delete value.browserNodeId },
    (value) => { value.browserNodeId = "pure" },
    (value) => { value.browserNodeId = "unknown" },
    (value) => { value.events.find((event) => event.browserStateDigest)!.browserStateDigest = "b".repeat(64) },
    (value) => { value.events.find((event) => event.browserStateDigest)!.invocationId = "20000000-0000-4000-8000-000000000098" },
    (value) => { value.events.find((event) => event.browserStateDigest)!.outcome = "failed" },
  ]
  for (const mutate of mutations) {
    const changed = structuredClone(checkpoint); mutate(changed)
    assert.equal(new HybridRuntimeScopeState().restore(changed, current), false)
  }
  for (const changed of [{ ...current, tabId: "other" }, { ...current, documentId: "other" },
    { ...current, sessionId: "other" }, { ...current, url: "https://example.test/other" }]) {
    assert.equal(new HybridRuntimeScopeState().restore(checkpoint, changed), false)
  }
  const legacy = structuredClone(checkpoint); delete legacy.browserNodeId
  for (const event of legacy.events) delete event.browserStateDigest
  assert.ok(taskCheckpointSchema.safeParse(legacy).success)
  assert.equal(new HybridRuntimeScopeState().restore(legacy, current), false)
})

test("runtime 拒绝给纯节点伪造浏览器回执，未决副作用保留暂停", async () => {
  const { chain, request, checkpoint } = await pausedFixture()
  const forged = structuredClone(checkpoint)
  forged.browserNodeId = "pure"
  forged.events.findLast((event) => event.nodeId === "pure")!.browserStateDigest = digestJson(checkpoint.browser)
  await assert.rejects(new TaskChainRuntime().execute({ chain, request, capabilities: {},
    control: { checkpoint: forged, resumeRequest: resumeRequest(forged) } }), /checkpoint_browser_receipt_invalid/)
  const pending = structuredClone(checkpoint)
  pending.pendingEffect = { kind: "browser", nodeId: "capability", stableKey: "root", idempotencyKey: "key", status: "uncertain" }
  const run = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    verifyResume: async () => ({ ok: true, browser: current }),
    capability: async () => { throw new Error("must not dispatch") },
  }, control: { checkpoint: pending, resumeRequest: resumeRequest(pending) } })
  assert.equal(run.status, "paused")
  assert.equal(run.checkpoint?.pendingEffect?.status, "uncertain")
})

test("旧 browser 节点产生同一检查点关联，后续 emit 不覆盖", async () => {
  const chain = browserEffectChain(), request = requestFor(chain, null), controller = new AbortController()
  const run = await new TaskChainRuntime().execute({ chain, request, capabilities: {
    browser: async () => ({ outcome: "success", output: null, browser }),
  }, control: { signal: controller.signal, pacing: { beforeNode: async ({ node }) => {
    if (node.id === "done") controller.abort()
  } } } })
  assert.equal(run.status, "paused")
  assert.equal(run.checkpoint?.browserNodeId, "browser")
  assert.equal(checkpointBrowserReceipt(run.checkpoint!)?.browserStateDigest, digestJson(run.checkpoint!.browser))
})

test("生产 hybrid verifyResume 将新关联校验失败投影为 ok:false", async () => {
  const { checkpoint } = await pausedFixture()
  const report = cleanupReport(RUNNER_CLEANUP_STAGES.map((stage) => ({ stage, status: "not_required", code: null })), false)
  await withHybridCapabilities({ root: path.resolve(import.meta.dirname, "../../.."), directory: ".",
    ownerId: "owner", allowedOrigins: ["https://example.test"], signal: new AbortController().signal,
    createRunner: () => ({ startHybrid: async () => {}, close: async () => report,
      envBoolean: () => true, request: async () => current }) }, async (capabilities) => {
    assert.equal((await capabilities.verifyResume!(checkpoint, new AbortController().signal)).ok, true)
    const changed = structuredClone(checkpoint); changed.browserNodeId = "pure"
    const result = await capabilities.verifyResume!(changed, new AbortController().signal)
    assert.equal(result.ok, false)
    assert.equal(result.reason, "hybrid_browser_checkpoint_association_invalid")
  })
})
