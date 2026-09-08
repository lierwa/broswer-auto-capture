import test from "node:test"
import assert from "node:assert/strict"
import { setTimeout as delay } from "node:timers/promises"
import { chainFixture, chainDecision } from "./chain-fixture.js"

test("正式授权逐步骤探索、不同输入验证、普通节点无模型调用及重开历史", async () => {
  const f = await chainFixture()
  try {
    const id = await f.readyChain(); await f.startPlan(id); const { execution, chains } = await f.waitChain(id)
    assert.equal(execution.status, "awaiting_next_stage"); assert.equal(chains.records.length, 2)
    for (const record of chains.records) {
      assert.equal(record.status, "verified"); assert.notEqual(record.sample!.url, record.verification!.url)
      assert.ok(record.sampleRows.length && record.verificationRows.length)
      assert.equal(record.audits.length, 1); assert.equal(record.audits[0]!.purpose, "exploration")
      assert.equal(record.audits[0]!.reportedModel, "gpt-5.6-sol")
      assert.ok(record.events.some((event) => event.phase === "verification" && event.status === "passed"))
    }
    assert.equal(f.chainFake.calls, 2); assert.equal(f.fake.calls.filter((args) => args[1] === "session" && args[2] === "start").length, 2)
    assert.equal((await f.current.browser.snapshot(id)).busy, false)
    await f.reopen(); assert.deepEqual(f.current.chain.snapshot(id, f.current.plan.snapshot(id)), chains)
  } finally { await f.close() }
})
test("同输入假验证拒绝；重探只消费本步骤的剩余模型预算", async () => {
  const f = await chainFixture()
  try {
    const id = await f.readyChain(); f.chainFake.decide = async (prompt) => { const decision = chainDecision(prompt); decision.verification = decision.sample; return decision }
    await f.startPlan(id); const { chains, execution } = await f.waitChain(id)
    assert.equal(execution.status, "failed"); assert.equal(chains.records.length, 2)
    assert.ok(chains.records.every((record) => record.stepId === "enumerate" && record.status === "failed" && !record.graph))
    assert.equal(f.chainFake.calls, 2)
  } finally { await f.close() }
})
test("零探索预算不调用模型；底层预算耗尽保留失败与完整计划", async () => {
  for (const budget of [{ maxModelCalls: 0, maxCommands: 100 }, { maxModelCalls: 2, maxCommands: 3 }]) {
    const f = await chainFixture()
    try {
      const decide = f.planFake.decide; f.planFake.decide = async (prompt) => { const result = await decide(prompt) as ReturnType<typeof import("./plan-fixture.js").proposalFor>; Object.assign(result.steps[0]!.budget, budget); return result }
      const id = await f.readyChain(); await f.startPlan(id); const { chains } = await f.waitChain(id)
      assert.equal(chains.records[0]!.status, "budget_exceeded"); assert.equal(f.chainFake.calls, 0)
      assert.ok(chains.records[0]!.consumed.commands <= budget.maxCommands)
      assert.equal(f.current.plan.snapshot(id).records[0]!.proposal!.steps.length, 2)
    } finally { await f.close() }
  }
})
test("取消等待模型退出并回收浏览器；迟到编译不能提交成功", async () => {
  const f = await chainFixture()
  try {
    const id = await f.readyChain(); let finish!: () => void
    f.chainFake.decide = async (prompt) => { await new Promise<void>((resolve) => { finish = resolve }); return chainDecision(prompt) }
    await f.startPlan(id)
    while (!finish) await delay(10)
    const run = f.current.plan.snapshot(id).executions[0]!
    await f.planPost(id, { type: "cancel_execution", executionId: run.id }); finish()
    const { chains, execution } = await f.waitChain(id)
    assert.equal(execution.status, "cancelled"); assert.equal(chains.records[0]!.status, "cancelled")
    assert.equal(chains.records[0]!.graph, null); assert.equal((await f.current.browser.snapshot(id)).busy, false)
  } finally { await f.close() }
})
test("受限页面转人工，不把浏览器受限原文保存为链路输出", async () => {
  const f = await chainFixture()
  try {
    const id = await f.readyChain(); f.fake.restricted = true; await f.startPlan(id)
    const { chains, execution } = await f.waitChain(id)
    assert.equal(execution.status, "manual_required"); assert.equal(chains.records[0]!.status, "manual_required")
    assert.equal(f.chainFake.calls, 0); assert.ok(!JSON.stringify(chains).includes("private-sensitive-data"))
  } finally { await f.close() }
})

test("后续步骤换输入失败保留前置已验证版本和原样本，失败回到该步骤", async () => {
  const f = await chainFixture()
  try {
    const id = await f.readyChain()
    f.fake.textForUrl = (url) => url.endsWith("/two") ? "未提供字段" : "名称 样例目录"
    f.chainFake.decide = async (prompt) => {
      const decision = chainDecision(prompt)
      decision.graph!.nodes = decision.graph!.nodes.map((node) => node.kind === "extract_fields" ? { ...node, fields: node.fields.map((field) => ({ ...field, source: "text_line", contains: "名称" })) } : node)
      return decision
    }
    await f.startPlan(id); const { chains } = await f.waitChain(id)
    assert.equal(chains.records.filter((record) => record.stepId === "enumerate").length, 1)
    assert.equal(chains.records.find((record) => record.stepId === "enumerate")!.status, "verified")
    const collect = chains.records.filter((record) => record.stepId === "collect")
    assert.equal(collect.length, 2); assert.ok(collect.every((record) => record.status === "failed" && record.sampleRows.length === 1))
    assert.ok(collect.every((record) => record.events.at(-1)!.phase === "verification" && record.events.at(-1)!.nodeId === "extract"))
    assert.equal(f.chainFake.calls, 3)
  } finally { await f.close() }
})

test("显式LLM必须独立授权预算，且沿用同一选择分别审计", async () => {
  for (const maxLlmCalls of [0, 2]) {
    const f = await chainFixture()
    try {
      const decide = f.planFake.decide
      f.planFake.decide = async (prompt) => { const plan = await decide(prompt) as ReturnType<typeof import("./plan-fixture.js").proposalFor>; plan.steps[1]!.budget.maxLlmCalls = maxLlmCalls; return plan }
      const id = await f.readyChain()
      f.chainFake.decide = async (prompt) => {
        const decision = chainDecision(prompt), graph = decision.graph!
        if (graph.nodes.some((node) => node.kind === "extract_fields")) {
          const final = graph.nodes.pop()!; graph.nodes.push({ id: "finish", kind: "llm", label: "说明", instruction: "说明", outputField: "说明", next: "done" }, { ...final, id: "done" })
        }
        return decision
      }
      await f.startPlan(id); const { chains } = await f.waitChain(id)
      assert.equal(f.chainFake.llmCalls, maxLlmCalls)
      const record = chains.records[0]!
      assert.equal(record.status, maxLlmCalls ? "verified" : "failed")
      if (maxLlmCalls) assert.equal(record.audits.filter((audit) => audit.purpose === "explicit_llm" && audit.reportedModel === "gpt-5.6-sol").length, 2)
    } finally { await f.close() }
  }
})
