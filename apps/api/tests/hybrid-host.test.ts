import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import type { TaskChain, TaskRun } from "@browser-capture/contracts"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { TaskRuntimeHost } from "../src/task-chain/runtime-host.js"
import { materializeHybridChain } from "../src/upstream-browser/hybrid-materializer.js"

import { hybridFixture, hybridPlan } from "./fixtures/hybrid-compilation.js"
function candidate() {
  const raw = hybridFixture(), plan = hybridPlan(raw)
  return materializeHybridChain({ response: raw.response, request: raw.request, plan, step: plan.steps[0]!, version: 1, model: "fixture" })
}
const zero = () => ({ transitions: 0, browserCommands: 0, activeMs: 0, llmCalls: 0, invocations: 0 })
function group(chain: TaskChain) {
  return { taskId: chain.taskId, authorizationId: randomUUID(), browserRunId: randomUUID(), requirementVersion: 1,
    purpose: "sample" as const, chains: [chain], input: { url: "https://fixture.invalid/next" },
    signal: new AbortController().signal, budget: chain.budget, consumed: zero(), scopeConsumption: {} }
}

test("正式 runtime-host 调用 v2 普通能力并持久化真实 LangGraph 运行，零旧 Browser/模型", async () => {
  const chain = candidate(), stored: TaskRun[] = []
  let sessions = 0, commands = 0, closed = 0
  const forbidden = () => { throw new Error("legacy_or_model_called") }
  const host = new TaskRuntimeHost({ saveRun: (run: TaskRun) => stored.push(run) } as never,
    { setAuthorizationValidator() {}, run: forbidden } as never, { selection: forbidden, prepare: forbidden } as never,
    undefined, { withSession: forbidden, withCapabilities: async (input, work) => {
      assert.deepEqual(input.allowedOrigins, ["https://fixture.invalid"])
      sessions++
      try { return await work({ browserCommandCount: () => commands, capability: async (invocation) => {
        assert.equal(invocation.node.capability.name, "browser.workflow-step")
        commands++; return { outcome: "success", output: null }
      } }) } finally { closed++ }
    } })
  const input = group(chain)
  const run = await host.group(input, (execute) => execute(chain, requestFor(chain, input.input, "sample")))
  assert.equal(run.status, "completed")
  assert.equal(run.consumed.browserCommands, 1)
  assert.equal(run.modelCalls.length, 0)
  assert.equal(stored.at(-1)?.binding.runId, run.binding.runId)
  assert.deepEqual([sessions, closed, commands], [1, 1, 1])
})

test("v2 与旧浏览器能力混用在 factory 和进程前拒绝", async () => {
  const original = candidate()
  const chain = { ...original, nodes: [...original.nodes, { kind: "browser" }] } as TaskChain
  let calls = 0
  const forbidden = () => { calls++; throw new Error("unexpected_external") }
  const host = new TaskRuntimeHost({} as never, { setAuthorizationValidator() {}, run: forbidden } as never,
    {} as never, forbidden, { withSession: forbidden, withCapabilities: forbidden })
  await assert.rejects(host.group(group(chain), forbidden), /mixed_browser_runtime_unsupported/)
  assert.equal(calls, 0)
})
