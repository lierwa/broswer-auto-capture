import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { digestJson, executableChainDigest, TaskChainRuntime } from "@browser-capture/runtime"
import type { TaskRun } from "@browser-capture/contracts"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { projectVerifiedChild } from "../src/upstream-browser/hybrid-invoke.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"
import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"

test("已验证线性子链经 fork 等价证明物化已有 invoke，沿同一 Browser 执行", async () => {
  const source = hybridFixture(), childPlan = hybridPlan(source)
  const child = materializeHybridChain({ ...source, plan: childPlan, step: childPlan.steps[0]!, version: 1, model: "fixture" })
  for (const [mode, url] of [["sample", "https://fixture.invalid/first"], ["verification", "https://fixture.invalid/second"]] as const) {
    let commands = 0
    const run = await new TaskChainRuntime().execute({ chain: child, request: requestFor(child, { url }, mode, randomUUID(), randomUUID()),
      capabilities: { browserCommandCount: () => commands, capability: async () => { commands++; return { outcome: "success", output: null } } } })
    assert.equal(run.status, "completed")
    child.validation.evidence.push({ phase: mode, runId: run.binding.runId, chainDigest: executableChainDigest(child),
      inputDigest: run.binding.inputDigest, outputDigest: digestJson(run.outputs), passed: true, modelCalls: run.consumed.llmCalls,
      at: "2026-09-16T00:00:00.000Z" })
  }
  child.validation.status = "verified"
  const projected = projectVerifiedChild(child)
  const raw = hybridFixture("invoke", undefined, projected), plan = hybridPlan(raw)
  plan.steps[0]!.chain.id = randomUUID()
  assert.deepEqual(raw.response.compilation.gaps, [])
  const resolver = () => child
  assert.throws(() => materializeHybridChain({ ...raw, plan, step: plan.steps[0]!, version: 1, model: "fixture" }), /resolver_required/)
  const parent = materializeHybridChain({ ...raw, plan, step: plan.steps[0]!, version: 1, model: "fixture", resolveChild: resolver })
  assert.equal(parent.nodes.filter((node) => node.kind === "invoke").length, 1)
  const stored: TaskRun[] = []
  let sessions = 0, commands = 0
  const forbidden = () => { throw new Error("unexpected_old_browser_or_model") }
  const host = new TaskRuntimeHost({ chain: resolver, runs: () => [...new Map(stored.map((run) => [run.binding.runId, run])).values()],
    saveRun: (run: TaskRun) => stored.push(run) } as never,
    { setAuthorizationValidator() {}, run: forbidden } as never, {} as never, undefined,
    { withSession: forbidden, withCapabilities: async (_input, work) => {
      sessions++
      return work({ browserCommandCount: () => commands, capability: async (invocation) => {
        assert.equal(invocation.input.url, "https://fixture.invalid/third")
        commands++; return { outcome: "success", output: null }
      } })
    } })
  const input = { url: "https://fixture.invalid/third" }
  const run = await host.group({ taskId: parent.taskId, authorizationId: randomUUID(), browserRunId: randomUUID(),
    requirementVersion: 1, purpose: "sample", chains: [parent], input, signal: new AbortController().signal,
    budget: parent.budget, consumed: { transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 }, scopeConsumption: {} },
    (execute) => execute(parent, requestFor(parent, input, "sample")))
  assert.equal(run.status, "completed", JSON.stringify(run.outcome))
  assert.equal(run.consumed.llmCalls, 0)
  assert.deepEqual([sessions, commands], [1, 1])
  assert.ok(stored.some((item) => item.binding.chain.id === child.id))
  assert.throws(() => projectVerifiedChild({ ...child, validation: { status: "candidate", evidence: [] } }), /not_verified/)
  const changed = structuredClone(projected)
  changed.operations[0]!.arguments = { url: { source: "constant", value: "https://fixture.invalid/fixed" }, new_tab: { source: "constant", value: false } }
  assert.ok(hybridFixture("invoke", undefined, changed).response.compilation.gaps.some((gap: { reason: string }) => gap.reason === "invoke_body_not_equivalent_to_verified_child"))
})
