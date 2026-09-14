import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { CONTRACT_VERSION, chainNodeSchema, parseTaskValue, requiredStableNodeOutcomes, stableChainNodeSchema,
  taskChainSchema, taskDataContractSchema, taskPlanExecutionIssues, taskPlanSchema, taskRequirementSchema,
  valueBindingSchema, type ChainNode, type StableChainNode } from "@browser-capture/contracts"
import { budget, condition, dataContract, digest, extractionFixture, ids, inputBinding, nodeBase, nodeBinding,
  nullContract, playbackFixture, reference } from "./task-chain-fixtures.js"

test("两类任务共用 requirement/plan/chain；业务数据只在版本化 schema 内", () => {
  for (const fixture of [extractionFixture, playbackFixture]) {
    assert.deepEqual(taskRequirementSchema.parse(fixture.requirement), fixture.requirement)
    assert.deepEqual(taskPlanSchema.parse(fixture.plan), fixture.plan)
    assert.deepEqual(taskChainSchema.parse(fixture.chain), fixture.chain)
    for (const destination of ["https://example.com/first", "https://example.com/second"]) {
      assert.deepEqual(parseTaskValue(fixture.chain.inputContract, { destination }), { destination })
    }
  }
  assert.deepEqual(parseTaskValue(extractionFixture.chain.outputContract, { title: "示例", link: "https://example.com" }), { title: "示例", link: "https://example.com" })
  assert.deepEqual(parseTaskValue(playbackFixture.chain.outputContract, { playing: true }), { playing: true })
  assert.throws(() => parseTaskValue(playbackFixture.chain.outputContract, { playing: "true" }))
  assert.throws(() => parseTaskValue(extractionFixture.chain.outputContract, { playing: true }))
})

test("动态 schema 严格校验嵌套值、范围、版本和额外属性", () => {
  const contract = dataContract("nested", { type: "array", minItems: 1, maxItems: 2, items: {
    type: "object", properties: { count: { type: "integer", minimum: 1, maximum: 4 }, state: { type: "string", enum: ["ok"] } },
    required: ["count", "state"], additionalProperties: false,
  } })
  assert.deepEqual(parseTaskValue(contract, [{ count: 2, state: "ok" }]), [{ count: 2, state: "ok" }])
  for (const value of [[], [{ count: 1.5, state: "ok" }], [{ count: 2, state: "bad" }], [{ count: 5, state: "ok" }], [{ count: 2, state: "ok", extra: 1 }]]) {
    assert.throws(() => parseTaskValue(contract, value))
  }
  for (const schema of [{ type: "string", minLength: 5, maxLength: 1 }, { type: "object", properties: {}, required: ["unknown"], additionalProperties: false }, { $ref: "https://example.com/schema" }]) {
    assert.equal(taskDataContractSchema.safeParse({ ...contract, schema }).success, false)
  }
  assert.throws(() => parseTaskValue({ ...contract, dialect: "vNext" }, []))
})

test("值绑定只允许四类来源和安全路径，常量内的 source 仍是任务数据", () => {
  for (const binding of [inputBinding, nodeBinding("done"), { source: "variable", name: "item", path: ["name", 0] }, { source: "constant", value: { source: "node", nodeId: "business-data" } }]) {
    assert.equal(valueBindingSchema.safeParse(binding).success, true)
  }
  for (const binding of [{ source: "script", value: "anything" }, { source: "input", path: ["__proto__"] }, { source: "node", path: [] }, { ...inputBinding, expression: "eval()" }]) {
    assert.equal(valueBindingSchema.safeParse(binding).success, false)
  }
})

test("历史十一类节点保持只读兼容；普通节点拒绝隐式模型和临时浏览器引用", () => {
  const nodes: ChainNode[] = [
    ...playbackFixture.chain.nodes,
    extractionFixture.chain.nodes[2]!,
    { ...nodeBase("branch", "condition"), kind: "condition", predicate: condition("open").predicate },
    { ...nodeBase("repeat", "loop"), kind: "loop", iteration: { mode: "each", collection: inputBinding, itemVariable: "item", stableKeyPath: ["id"] }, cursorVariable: "cursor", maxIterations: 10 },
    { ...nodeBase("call", "invoke"), kind: "invoke", chain: reference(ids.chain), input: inputBinding, iteration: { mode: "once" } },
    { ...nodeBase("help", "human"), kind: "human", reason: "confirmation", prompt: "请完成确认", resumeWhen: { operator: "exists", path: [] }, timeoutMs: 60_000 },
    { ...nodeBase("think", "llm"), kind: "llm", instruction: "判断状态", input: inputBinding, model: "fixture-model", timeoutMs: 1000 },
    { ...nodeBase("save", "checkpoint"), kind: "checkpoint", resumeWhen: { operator: "exists", path: [] } },
  ]
  assert.equal(new Set(nodes.map((node) => node.kind)).size, 11)
  for (const node of nodes) {
    assert.equal(chainNodeSchema.safeParse(node).success, true)
    if (node.kind !== "llm") assert.equal(chainNodeSchema.safeParse({ ...node, model: "hidden" }).success, false)
  }
  assert.equal(chainNodeSchema.safeParse({ ...nodes[0], target: { kind: "ref", ref: "@e1" } }).success, false)
  assert.equal(chainNodeSchema.safeParse({ ...nodes[0], operation: "evaluate" }).success, false)
})

test("新链只用六类稳定节点，站点动作通过通用能力配置表达", () => {
  const base = <K extends StableChainNode["kind"]>(id: string, kind: K) => ({ id, label: id,
    outcomes: [...requiredStableNodeOutcomes[kind]], outputContract: nullContract, writes: [] })
  const nodes: StableChainNode[] = [
    { ...base("perform", "capability"), kind: "capability", capability: { name: "browser.perform", version: 1 },
      input: { action: inputBinding }, config: { capture: { scope: "page" } }, effect: "idempotent_write", timeoutMs: 2000 },
    { ...base("think", "llm"), kind: "llm", instruction: "判断页面状态", input: nodeBinding("perform"), model: "fixture-model", timeoutMs: 1000 },
    { ...base("branch", "branch"), kind: "branch", predicate: condition("think").predicate },
    { ...base("repeat", "loop"), kind: "loop", iteration: { mode: "each", collection: inputBinding,
      itemVariable: "item", stableKeyPath: ["id"] }, cursorVariable: "cursor", maxIterations: 10,
      body: { entry: "perform", exits: ["think"] }, accumulators: [] },
    { ...base("call", "invoke"), kind: "invoke", chain: reference(ids.chain), input: inputBinding,
      iteration: { mode: "once" } },
    { ...base("done", "terminal"), kind: "terminal", status: "completed", reason: "完成",
      evidence: [nodeBinding("perform")] },
  ]
  assert.deepEqual(new Set(nodes.map((node) => node.kind)), new Set(["capability", "llm", "branch", "loop", "invoke", "terminal"]))
  for (const node of nodes) assert.equal(stableChainNodeSchema.safeParse(node).success, true)
  assert.equal(stableChainNodeSchema.safeParse({ ...nodes[0], kind: "open_comment_popup" }).success, false)
})

test("图身份、出口、binding 和 verified 证据拒绝伪造或缺失", () => {
  const chain = extractionFixture.chain
  const rejects = [
    { ...chain, nodes: [...chain.nodes, chain.nodes[0]] }, { ...chain, entry: "missing" },
    { ...chain, edges: chain.edges.slice(1) }, { ...chain, edges: [...chain.edges, chain.edges[0]] },
    { ...chain, edges: [{ ...chain.edges[0], to: "missing" }, ...chain.edges.slice(1)] },
    { ...chain, completion: [condition("missing")] },
    { ...chain, nodes: [{ ...chain.nodes[0], writes: [{ variable: "undeclared", path: [] }] }, ...chain.nodes.slice(1)] },
    { ...chain, validation: { status: "verified", evidence: [] } }, { ...chain, contractVersion: "future" },
    { ...chain, fields: ["fixed-business-field"] },
  ]
  for (const invalid of rejects) assert.equal(taskChainSchema.safeParse(invalid).success, false)
  const sample = { phase: "sample", runId: ids.run, chainDigest: digest, inputDigest: digest, outputDigest: digest, passed: true, modelCalls: 0, at: "2026-09-12T00:00:00Z" }
  const verification = { ...sample, phase: "verification", runId: ids.request, inputDigest: "b".repeat(64) }
  assert.equal(taskChainSchema.safeParse({ ...chain, validation: { status: "verified", evidence: [sample, verification] } }).success, true)
  assert.equal(taskChainSchema.safeParse({ ...chain, validation: { status: "verified", evidence: [sample, { ...verification, inputDigest: digest }] } }).success, false)
})

test("组合计划逐项调用同一链路，拒绝未声明依赖和预算扩权", () => {
  const itemSchema = { type: "object" as const, properties: { id: { type: "string" as const }, payload: {
    type: "object" as const, properties: {}, required: [], additionalProperties: true } },
    required: ["id", "payload"], additionalProperties: false }
  const itemsContract = dataContract("items", { type: "array", items: itemSchema })
  const itemContract = dataContract("item", itemSchema)
  const base = extractionFixture.plan.steps[0]!
  const first = { ...base, outputContract: itemsContract }
  const second = { ...base, id: "consume", dependsOn: [first.id], inputContract: itemContract,
    input: { source: "variable", name: "item", path: [] },
    invocation: { mode: "each", collection: nodeBinding(first.id), itemVariable: "item", stableKeyPath: ["id"], maxItems: 10, onItemFailure: "pause" },
    completion: [condition("consume")] }
  const totalBudget = { ...budget, maxTransitions: 200, maxBrowserCommands: 80, maxActiveMs: 60_000, maxInvocations: 40 }
  const resultContract = dataContract("collected-items", { type: "array", items: second.outputContract.schema, maxItems: 10 })
  const plan = { ...extractionFixture.plan, outputContract: resultContract,
    steps: [first, second], output: nodeBinding(second.id), budget: totalBudget }
  assert.equal(taskPlanSchema.safeParse(plan).success, true)
  assert.deepEqual(taskPlanExecutionIssues(plan), [])
  const widerResultContract = dataContract("collected-items", { type: "array", items: second.outputContract.schema })
  assert.deepEqual(taskPlanExecutionIssues({ ...plan, outputContract: widerResultContract }), [])
  const narrowerResultContract = dataContract("collected-items", { type: "array", items: second.outputContract.schema, maxItems: 5 })
  assert.deepEqual(taskPlanExecutionIssues({ ...plan, outputContract: narrowerResultContract }), ["plan_output_contract_mismatch"])
  const eachProducer = { ...second, outputContract: itemContract }
  const third = { ...second, id: "consume-again", dependsOn: [eachProducer.id],
    input: { source: "variable" as const, name: "nextItem", path: [] },
    invocation: { ...second.invocation, collection: nodeBinding(eachProducer.id), itemVariable: "nextItem" },
    completion: [condition("consume-again")] }
  const chainedEachPlan = { ...plan, steps: [first, eachProducer, third], output: nodeBinding(third.id),
    budget: { maxTransitions: 300, maxBrowserCommands: 120, maxActiveMs: 90_000,
      maxLlmCalls: 0, maxInvocations: 60, maxDepth: 4 } }
  assert.equal(taskPlanSchema.safeParse(chainedEachPlan).success, true)
  assert.deepEqual(taskPlanExecutionIssues(chainedEachPlan), [])
  assert.deepEqual(taskPlanExecutionIssues({ ...plan, outputContract: second.outputContract }), ["plan_output_contract_mismatch"])
  assert.deepEqual(taskPlanExecutionIssues({ ...plan, steps: [first, { ...second, inputContract: itemsContract }] }),
    ["plan_input_contract_mismatch"])
  assert.equal(taskPlanSchema.safeParse({ ...plan, steps: [first, { ...second, dependsOn: [] }] }).success, false)
  assert.equal(taskPlanSchema.safeParse({ ...plan, budget }).success, false)
  assert.equal(taskPlanSchema.safeParse({ ...plan, steps: [first, { ...second,
    invocation: { ...second.invocation, maxItems: second.budget.maxInvocations + 1 } }] }).success, false)
  assert.equal(taskPlanSchema.safeParse({ ...plan, steps: [first, { ...second,
    invocation: { ...second.invocation, stableKeyPath: ["payload"] } }] }).success, false)
  assert.equal(taskPlanSchema.safeParse({ ...plan, steps: [first, { ...second,
    invocation: { ...second.invocation, stableKeyPath: ["missing"] } }] }).success, false)
  assert.equal(taskPlanSchema.safeParse({ ...plan, output: { source: "node", nodeId: second.id, path: ["missing"] } }).success, false)
  assert.equal(taskPlanSchema.safeParse({ ...plan, steps: [second, first] }).success, false)

  const batch = { ...second, id: "batch-consume", inputContract: itemsContract, outputContract: resultContract,
    input: nodeBinding(first.id), invocation: { mode: "batch" as const, collection: nodeBinding(first.id),
      itemVariable: "item", stableKeyPath: ["id"], maxItems: 30 }, completion: [condition("batch-consume")] }
  const batchPlan = { ...plan, steps: [first, batch], output: nodeBinding(batch.id) }
  assert.equal(taskPlanSchema.safeParse(batchPlan).success, true)
  assert.deepEqual(taskPlanExecutionIssues(batchPlan), [])
})

test("包出口只暴露通用 IR，不再保留旧运行合同入口", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  for (const key of [".", "./chain", "./plan", "./run", "./requirement", "./binding", "./version"]) {
    assert.ok(manifest.exports[key].includes("/task-chain/"))
  }
  assert.equal(manifest.exports["./workflow"], undefined)
  assert.equal(manifest.exports["./capture"], undefined)
  for (const key of ["./workflow", "./capture", "./legacy/chain", "./legacy/plan", "./legacy/run", "./legacy/workflow"]) {
    assert.equal(manifest.exports[key], undefined)
  }
  const generic = await import("@browser-capture/contracts/chain")
  assert.equal("actionGraphSchema" in generic, false)
  assert.equal(generic.taskChainSchema, taskChainSchema)
  assert.equal(CONTRACT_VERSION, "bat-task-chain/v1")
  assert.deepEqual(parseTaskValue(nullContract, null), null)
})
