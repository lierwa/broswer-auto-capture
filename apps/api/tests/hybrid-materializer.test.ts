import assert from "node:assert/strict"
import test from "node:test"
import { type JsonValue } from "@browser-capture/contracts"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { requestFor } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { materializeHybridChain, validateHybridResponse } from "../src/upstream-browser/hybrid-materializer.js"

import { hybridFixture as fixture, hybridPlan as planFor } from "./fixtures/hybrid-compilation.js"

test("真实 Python 编译产物确定性物化并由现有 LangGraph 复跑两个输入", async () => {
  const raw = fixture(), plan = planFor(raw)
  const input = { response: raw.response, request: raw.request, plan, step: plan.steps[0]!, version: 1, model: "fixture" }
  const chain = materializeHybridChain(input)
  assert.deepEqual(chain, materializeHybridChain(input))
  assert.equal(chain.validation.status, "candidate")
  assert.equal(chain.nodes.filter((node) => node.kind === "llm").length, 0)
  const consumed: JsonValue[] = []
  for (const url of ["https://fixture.invalid/alpha", "https://fixture.invalid/beta"]) {
    let commands = 0
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url }, "sample"),
      capabilities: { browserCommandCount: () => commands, capability: async (invocation) => {
        consumed.push(invocation.input.url!); commands++; return { outcome: "success", output: null }
      }, llm: async () => { throw new Error("ordinary_node_called_model") } } })
    assert.equal(run.status, "completed")
    assert.equal(run.modelCalls.length, 0)
  }
  assert.deepEqual(consumed, ["https://fixture.invalid/alpha", "https://fixture.invalid/beta"])
})

for (const kind of ["loop", "semantic-loop"]) test(`已确认两次循环物化一份 body，复用 LangGraph 游标和内建数据能力：${kind}`, async () => {
  const raw = fixture(kind), plan = planFor(raw)
  const chain = materializeHybridChain({ response: raw.response, request: raw.request, plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  assert.equal(chain.nodes.filter((node) => node.kind === "loop").length, 1)
  assert.equal(chain.nodes.filter((node) => node.kind === "capability" && node.capability.name === "browser.workflow-step").length, 1)
  let commands = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: "https://fixture.invalid/next" }, "sample"),
    capabilities: { browserCommandCount: () => commands, capability: async () => { commands++; return { outcome: "success", output: null } } } })
  assert.equal(run.status, "completed")
  assert.equal(commands, 2)
})

test("篡改 canonical bytes 或请求控制合同不允许物化", () => {
  const raw = fixture()
  const plan = planFor(raw), altered = structuredClone(raw)
  altered.request.control.loops.push({ id: "injected" })
  assert.throws(() => materializeHybridChain({ ...altered, plan, step: plan.steps[0]!, version: 1, model: "fixture" }),
    /hybrid_source_mismatch/)
  raw.response.canonicalPayload += " "
  assert.throws(() => validateHybridResponse(raw.response), /hybrid_digest_mismatch/)
})

test("已确认的纯值分支在不同输入下决定是否调用浏览器", async () => {
  const raw = fixture("branch"), plan = planFor(raw)
  const chain = materializeHybridChain({ response: raw.response, request: raw.request, plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  for (const enabled of [true, false]) {
    let calls = 0
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: "https://fixture.invalid/next", enabled }, "sample"),
      capabilities: { browserCommandCount: () => calls, capability: async () => { calls++; return { outcome: "success", output: null } } } })
    assert.equal(run.status, "completed")
    assert.equal(calls, enabled ? 1 : 0)
  }
})

test("混合链普通读取和显式语义节点分开执行，模型审计恰好一次", async () => {
  const raw = fixture("semantic"), plan = planFor(raw)
  const chain = materializeHybridChain({ response: raw.response, request: raw.request, plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  let commands = 0, modelCalls = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: "https://fixture.invalid/next" }, "sample"),
    capabilities: { browserCommandCount: () => commands, capability: async (invocation) => {
      assert.equal(invocation.node.capability.name, "browser.read-fields")
      commands++; return { outcome: "success", output: [{ name: "Read value" }] }
    }, llm: async (invocation) => {
      assert.equal("delegate" in invocation.node, false)
      assert.deepEqual(invocation.input, [{ name: "Read value" }])
      modelCalls++; return { outcome: "success", output: "Bounded summary", reportedInvocations: 1 }
    } } })
  assert.equal(run.status, "completed")
  assert.equal(commands, 1)
  assert.equal(modelCalls, 1)
  assert.equal(run.consumed.llmCalls, 1)
  assert.equal(run.modelCalls[0]?.purpose, "explicit_llm")
})

test("循环集合输出复用既有 accumulator，终点不依赖可能未运行的 body", async () => {
  const raw = fixture("read-loop"), plan = planFor(raw)
  const chain = materializeHybridChain({ response: raw.response, request: raw.request, plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  let commands = 0
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: "https://fixture.invalid/next" }, "sample"),
    capabilities: { browserCommandCount: () => commands, capability: async () => {
      commands++; return { outcome: "success", output: [{ name: `item-${commands}` }] }
    } } })
  assert.equal(run.status, "completed")
  assert.equal(commands, 2)
  assert.deepEqual(run.outputs.result?.kind === "value" && run.outputs.result.value, [{ name: "item-1" }, { name: "item-2" }])
})

test("多个已证明来源复用内建 merge/assemble，换输入时组合真实动态值", async () => {
  const raw = fixture("assembly"), plan = planFor(raw)
  const chain = materializeHybridChain({ response: raw.response, request: raw.request, plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  for (const name of ["First", "Second"]) {
    let commands = 0
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url: "https://fixture.invalid/next" }, "sample"),
      capabilities: { browserCommandCount: () => commands, capability: async () => {
        commands++; return { outcome: "success", output: [{ name }] }
      }, llm: async () => ({ outcome: "success", output: name + " summary", reportedInvocations: 1 }) } })
    assert.equal(run.status, "completed", JSON.stringify(run.outcome))
    assert.deepEqual(run.outputs.result?.kind === "value" && run.outputs.result.value, { records: [{ name }], summary: name + " summary" })
    assert.equal(commands, 1)
    assert.equal(run.consumed.llmCalls, 1)
  }
})

test("普通动作按输出条款引用前置读取，物化后消费实时值", async () => {
  const raw = fixture("prior-navigation"), plan = planFor(raw)
  const chain = materializeHybridChain({ ...raw, plan, step: plan.steps[0]!, version: 1, model: "fixture" })
  const received: JsonValue[] = []
  for (const url of ["https://fixture.invalid/alpha", "https://fixture.invalid/beta"]) {
    let commands = 0
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, { url }, "sample"),
      capabilities: { browserCommandCount: () => commands, capability: async (invocation) => {
        commands++
        if (invocation.node.capability.name === "browser.read-fields") return { outcome: "success", output: { url } }
        received.push(invocation.input.url!); return { outcome: "success", output: null }
      }, llm: async () => { throw new Error("prior_output_called_model") } } })
    assert.equal(run.status, "completed")
    assert.equal(run.consumed.browserCommands, 2)
    assert.deepEqual(run.modelCalls, [])
  }
  assert.deepEqual(received, ["https://fixture.invalid/alpha", "https://fixture.invalid/beta"])
})
