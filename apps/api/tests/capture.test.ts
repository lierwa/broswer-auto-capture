import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { chainFixture, chainDecision } from "./chain-fixture.js"

test("正式批量执行保存全部上游输入，复跑独立且普通节点无新增模型，历史可重开", async () => {
  const f = await chainFixture(false, true)
  try {
    const taskId = await f.readyChain(); await f.startPlan(taskId)
    const { execution } = await f.waitChain(taskId)
    assert.equal(execution.status, "partial", execution.reason)
    assert.equal(execution.capture!.steps[1]!.inputIndex, 2)
    assert.equal(execution.capture!.steps[1]!.rows.length, 2)
    assert.ok(execution.capture!.gaps.some((gap) => gap.includes("完整目录")))
    const calls = f.chainFake.calls, command = { type: "replay", requestId: randomUUID(), executionId: execution.id, planDigest: execution.planDigest }
    assert.equal((await f.planPost(taskId, command)).statusCode, 202)
    assert.equal((await f.planPost(taskId, command)).statusCode, 202)
    const replay = (await f.waitChain(taskId)).execution
    assert.notEqual(replay.id, execution.id); assert.equal(replay.mode, "replay"); assert.equal(replay.status, "partial")
    assert.equal(f.chainFake.calls, calls); assert.equal(f.chainFake.llmCalls, 0)
    assert.equal(replay.capture!.steps[1]!.rows.length, 2)
    const snapshot = f.current.plan.snapshot(taskId)
    assert.equal(snapshot.executions.length, 2)
    assert.deepEqual(snapshot.executions[0], execution)
    await f.reopen(); assert.deepEqual(f.current.plan.snapshot(taskId), snapshot)
  } finally { await f.close() }
})

test("实际中断保留检查点，恢复同一运行，核验浏览器状态并继续去重", async () => {
  const f = await chainFixture(false, true)
  try {
    const taskId = await f.readyChain(); await f.startPlan(taskId); const original = (await f.waitChain(taskId)).execution
    await f.planPost(taskId, { type: "replay", requestId: randomUUID(), executionId: original.id, planDigest: original.planDigest })
    let interrupted = false
    f.fake.beforeCommand = async (args) => {
      const current = f.current.plan.snapshot(taskId).executions.at(-1)!
      if (!interrupted && current.capture?.steps[0]?.status === "completed" && args[1] === "navigate") {
        interrupted = true; await f.planPost(taskId, { type: "cancel_execution", executionId: current.id })
      }
    }
    const paused = (await f.waitChain(taskId)).execution
    assert.equal(paused.status, "cancelled"); assert.ok(paused.capture!.steps[0]!.rows.length)
    f.fake.beforeCommand = null
    const command = { type: "resume", requestId: randomUUID(), executionId: paused.id, sequence: paused.sequence }
    assert.equal((await f.planPost(taskId, command)).statusCode, 202)
    assert.equal((await f.planPost(taskId, command)).statusCode, 202)
    const resumed = (await f.waitChain(taskId)).execution
    assert.equal(resumed.id, paused.id); assert.equal(resumed.status, "partial", resumed.reason)
    assert.equal(resumed.capture!.steps[1]!.rows.length, 2)
    assert.equal(resumed.attempt, 2); assert.notEqual(resumed.browserRunId, paused.browserRunId)
    assert.ok(resumed.capture!.steps[1]!.commands > paused.capture!.steps[1]!.commands)
    assert.equal(resumed.capture!.resumeChecks.at(-1)?.matched, true)
    assert.equal(resumed.resumeAuthorizations.length, 1)
    assert.equal(f.chainFake.calls, 2)
  } finally { await f.close() }
})

test("从绑定目录起点执行并实际经过末页分支，字段完整时得到完成结论", async () => {
  const f = await chainFixture(false, true)
  try {
    const taskId = await f.readyChain()
    f.fake.textForUrl = (url) => url.includes("page=2") ? "名称 样例目录 目录结束" : '名称 样例目录 @e1 link "下一页"'
    f.fake.beforeCommand = async (args) => { if (args[1] === "click") f.fake.url = "https://example.com/catalog?page=2" }
    f.chainFake.decide = async (prompt) => {
      const decision = chainDecision(prompt), graph = decision.graph!
      if (graph.nodes.some((node) => node.kind === "extract_links")) {
        graph.nodes = graph.nodes.map((node) => node.id === "save" ? { ...node, next: "last_page" } : node)
        graph.maxTransitions = 50
        graph.nodes.push({ id: "last_page", kind: "branch", label: "核验末页", text: "下一页", present: "loop", absent: "finish" },
          { id: "loop", kind: "loop", label: "分页循环", maxIterations: 5, body: "next_page", exhausted: "limit" },
          { id: "next_page", kind: "click", label: "下一页", target: { role: "link", name: "下一页" }, next: "read" },
          { id: "limit", kind: "stop", label: "分页未完成", reason: "尚有下一页" })
      }
      return decision
    }
    await f.startPlan(taskId); const run = (await f.waitChain(taskId)).execution
    assert.equal(run.status, "completed", run.reason); assert.equal(run.capture!.coverage, "completed")
    assert.deepEqual(run.capture!.gaps, []); assert.equal(run.capture!.steps[1]!.rows.length, 2)
  } finally { await f.close() }
})

test("较大预算只进入显式申请的新计划，默认计划仍受原500条总上限约束", async () => {
  const f = await chainFixture()
  try {
    const taskId = await f.readyChain(), original = f.current.plan.snapshot(taskId).records[0]!, source = f.current.research.snapshot(taskId).records[0]!
    const decide = f.planFake.decide
    f.planFake.decide = async (prompt) => { const plan = await decide(prompt) as ReturnType<typeof import("./plan-fixture.js").proposalFor>; plan.steps[1]!.budget.maxCommands = 600; return plan }
    await f.planPost(taskId, { type: "generate", requestId: randomUUID(), requirementVersion: source.requirementVersion, sourceId: source.id, sourceVersion: source.version,
      budgetCeiling: { maxCommands: 3850, timeoutMs: 1440000, maxModelCalls: 12, maxLlmCalls: 0 } })
    const larger = await f.waitPlan(taskId); assert.equal(larger.status, "ready"); assert.notEqual(larger.id, original.id)
    assert.deepEqual(f.current.plan.snapshot(taskId).records.find((record) => record.id === original.id), original)
    await f.generate(taskId); assert.equal((await f.waitPlan(taskId)).status, "failed")
  } finally { await f.close() }
})

test("修复仅在独立授权后调用模型并形成新版本，原链路与原运行保留", async () => {
  const f = await chainFixture(false, true)
  try {
    const taskId = await f.readyChain(); await f.startPlan(taskId); const original = (await f.waitChain(taskId)).execution
    const oldChains = f.current.chain.snapshot(taskId, f.current.plan.snapshot(taskId)).records
    const command = { type: "repair", requestId: randomUUID(), executionId: original.id, stepId: "collect", planDigest: original.planDigest }
    assert.equal((await f.planPost(taskId, command)).statusCode, 202)
    const repaired = (await f.waitChain(taskId)).execution
    assert.equal(repaired.status, "partial", repaired.reason); assert.equal(repaired.mode, "repair")
    assert.notEqual(repaired.id, original.id); assert.equal(f.chainFake.calls, 3)
    const records = f.current.chain.snapshot(taskId, f.current.plan.snapshot(taskId)).records
    assert.equal(records.length, 3); assert.equal(records[0]!.version, 2); assert.equal(records[0]!.audits[0]!.purpose, "repair")
    for (const previous of oldChains) assert.deepEqual(records.find((item) => item.id === previous.id), previous)
  } finally { await f.close() }
})

test("预算耗尽后恢复被拒绝且不会重置消耗，未验证的步骤不能直接复跑", async () => {
  const f = await chainFixture(false, true)
  try {
    const decide = f.planFake.decide
    f.planFake.decide = async (prompt) => { const plan = await decide(prompt) as ReturnType<typeof import("./plan-fixture.js").proposalFor>; plan.steps[0]!.budget.maxCommands = 3; return plan }
    const taskId = await f.readyChain(); await f.startPlan(taskId); const run = (await f.waitChain(taskId)).execution
    assert.equal(run.status, "failed"); assert.equal(run.capture!.steps[0]!.commands, 3)
    assert.equal((await f.planPost(taskId, { type: "resume", requestId: randomUUID(), executionId: run.id, sequence: run.sequence })).statusCode, 409)
    assert.equal((await f.planPost(taskId, { type: "replay", requestId: randomUUID(), executionId: run.id, planDigest: run.planDigest })).statusCode, 409)
    assert.equal(f.current.plan.snapshot(taskId).executions.length, 1); assert.equal(f.chainFake.calls, 0)
  } finally { await f.close() }
})

test("修复已授权步骤后停在未验证的下游，保留待授权状态且不调用下游模型", async () => {
  const f = await chainFixture(false, true)
  try {
    const taskId = await f.readyChain()
    f.chainFake.decide = async (prompt) => {
      const decision = chainDecision(prompt)
      return decision.graph!.nodes.some((node) => node.kind === "extract_fields")
        ? { ...decision, action: "manual_required", reason: "分页交互待人工确认", graph: null, sample: null, verification: null } : decision
    }
    await f.startPlan(taskId); const initial = (await f.waitChain(taskId)).execution
    assert.equal(initial.status, "manual_required")
    f.chainFake.decide = async (prompt) => chainDecision(prompt)
    const calls = f.chainFake.calls
    assert.equal((await f.planPost(taskId, { type: "repair", requestId: randomUUID(), executionId: initial.id, stepId: "enumerate", planDigest: initial.planDigest })).statusCode, 202)
    const repaired = (await f.waitChain(taskId)).execution
    assert.equal(repaired.status, "awaiting_next_stage"); assert.equal(f.chainFake.calls, calls + 1)
    assert.equal(repaired.capture!.steps[0]!.status, "completed")
    assert.equal(repaired.capture!.steps[1]!.status, "pending"); assert.equal(repaired.capture!.steps[1]!.activeSince, null)
    assert.equal(repaired.capture!.coverage, "partial"); assert.match(repaired.capture!.gaps[0]!, /独立修复授权/)
  } finally { await f.close() }
})

test("字段漂移暂停，保留已完成来源，未经修复授权无模型调用；跨任务操作拒绝", async () => {
  const f = await chainFixture(false, true)
  try {
    const taskId = await f.readyChain()
    f.chainFake.decide = async (prompt) => {
      const decision = chainDecision(prompt)
      decision.graph!.nodes = decision.graph!.nodes.map((node) => node.kind === "extract_fields" ? { ...node, fields: node.fields.map((field) => ({ ...field, source: "text_line", contains: "名称" })) } : node)
      return decision
    }
    await f.startPlan(taskId); const initial = (await f.waitChain(taskId)).execution
    f.fake.textForUrl = (url) => url.endsWith("/two") ? "页面已变化" : "名称 样例目录"
    const request = { type: "replay", requestId: randomUUID(), executionId: initial.id, planDigest: initial.planDigest }
    const other = await f.create(false)
    assert.equal((await f.planPost(other, request)).statusCode, 409)
    await f.planPost(taskId, request); const paused = (await f.waitChain(taskId)).execution
    assert.equal(paused.status, "drift_paused"); assert.equal(paused.capture!.steps[1]!.rows.length, 1)
    assert.equal(f.chainFake.calls, 2); assert.equal((await f.current.browser.snapshot(taskId)).busy, false)
  } finally { await f.close() }
})
