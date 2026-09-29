import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import {
  CONTRACT_VERSION, requiredStableNodeOutcomes, stableTaskChainSchema, stableTaskChainV2Schema,
  type ChainPresentationContent, type StableChainNode, type TaskChain, type TaskDataContract,
} from "@browser-capture/contracts"
import { executableChainDigest } from "@browser-capture/runtime"
import { CAPABILITY_DESCRIPTOR_REGISTRY_VERSION, capabilityDescriptors } from "../src/task-chain/capability-descriptors.js"
import { createChainPresentation, createStepChainPresentation } from "../src/task-chain/presentation.js"

test("阶段图服务端校验覆盖节点、入口、出口和布局", () => {
  const chain = fixtureChain(randomUUID()), presentation = createChainPresentation(chain)
  assert.equal(presentation.stages.length, 1)
  assert.equal(presentation.stages[0]?.nodeIds.length, 2)
  assert.equal("source" in presentation, false)
  assert.equal("readOnly" in presentation, false)
  const invalid: ChainPresentationContent = { stages: presentation.stages.map((stage) => ({ ...stage,
    nodeIds: stage.nodeIds.slice(0, 1) })), overviewLayout: presentation.overviewLayout,
    focusLayouts: presentation.focusLayouts }
  assert.throws(() => createChainPresentation(chain, invalid), /链路展示结构与当前执行图不一致/)
})

test("步骤展示只改变冻结的 presentation，不改写执行图", () => {
  const chain = fixtureChain(randomUUID()), before = executableChainDigest(chain)
  const fallback = createChainPresentation(chain)
  const step = { id: chain.stepId, title: "查看指定条目", goal: "打开用户指定条目并读取所需信息。" }
  const presentation = createStepChainPresentation(chain, step)
  assert.equal(fallback.stages.length, 1)
  assert.deepEqual(presentation.stages.map((stage) => stage.nodeIds), [["first"], ["second"]])
  assert.deepEqual(presentation.stages.map((stage) => stage.title), ["等待条件满足", "等待条件满足"])
  assert.deepEqual(presentation.overviewLayout.map((item) => item.stageId), presentation.stages.map((stage) => stage.id))
  assert.equal(executableChainDigest(chain), before)
  assert.throws(() => createStepChainPresentation(chain, { ...step, id: "another-step" }),
    /链路展示结构与当前执行图不一致/)
})

test("展示分组只合并有类型化关系的动作支持节点并保持执行 digest", () => {
  const chain = groupedFixtureChain(randomUUID()), before = executableChainDigest(chain)
  const presentation = createStepChainPresentation(chain, { id: chain.stepId,
    title: "读取指定记录", goal: "输入条件、选择候选并读取字段。" })
  assert.deepEqual(presentation.stages.map((stage) => stage.nodeIds), [
    ["input", "keys", "results-ready"],
    ["candidate-read", "candidate-select", "candidate-click", "detail-ready"],
    ["field-read", "output-transform"],
  ])
  assert.match(presentation.stages[0]!.title, /输入内容.*发送按键/)
  assert.equal(presentation.stages[1]!.title, "点击候选：results-list")
  assert.equal(presentation.stages[2]!.title, "读取字段：标题、正文")
  assert.equal(new Set(presentation.stages.flatMap((stage) => stage.nodeIds)).size, 9)
  assert.equal(executableChainDigest(chain), before)
})

test("展示分组不会把带写副作用的同名能力隐藏进动作阶段", () => {
  const chain = groupedFixtureChain(randomUUID())
  for (const id of ["candidate-read", "output-transform"]) {
    const node = chain.nodes.find((item) => item.id === id)
    if (node?.kind === "capability") node.effect = "external_write"
  }
  const presentation = createStepChainPresentation(chain, { id: chain.stepId,
    title: "读取指定记录", goal: "输入条件、选择候选并读取字段。" })
  for (const id of ["candidate-read", "output-transform"]) {
    assert.deepEqual(presentation.stages.find((stage) => stage.nodeIds.includes(id))?.nodeIds, [id])
  }
})

test("展示版本保留精确的 descriptor registry 标识", () => {
  assert.equal(CAPABILITY_DESCRIPTOR_REGISTRY_VERSION, "bat-capability-descriptors/v1")
  assert.equal(capabilityDescriptors().find((item) => item.capability.name === "browser.workflow-step")?.capability.version, 2)
})

function fixtureChain(taskId: string): TaskChain {
  const contract = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "null" as const } }
  const base = (id: string, kind: keyof typeof requiredStableNodeOutcomes) => ({ id, label: id,
    outcomes: [...requiredStableNodeOutcomes[kind]], outputContract: contract, writes: [] })
  const capability = (id: string): StableChainNode => ({ ...base(id, "capability"), kind: "capability",
    capability: { name: "browser.workflow-step", version: 2 }, input: {},
    config: { actionName: "wait", target: null, postconditions: [{ kind: "url" }] },
    effect: "read", timeoutMs: 1_000 })
  const first = capability("first"), second = capability("second")
  const done: StableChainNode = { ...base("done", "terminal"), kind: "terminal", status: "completed",
    reason: "完成", evidence: [{ source: "node", nodeId: second.id, path: [] }],
    result: { name: "result", output: { kind: "value", value: { source: "constant", value: null } }, contract } }
  const error: StableChainNode = { ...base("error", "terminal"), kind: "terminal", status: "failed",
    reason: "失败", evidence: [{ source: "constant", value: "failed" }] }
  const route = (node: StableChainNode, success: string) => requiredStableNodeOutcomes.capability.map((outcome) => ({
    from: node.id, outcome, to: outcome === "success" ? success : error.id,
  }))
  return stableTaskChainSchema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v1",
    id: randomUUID(), taskId, version: 1, plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) },
    stepId: "perform", name: "通用动作链", inputContract: contract, outputContract: contract,
    variables: {}, entry: first.id, nodes: [first, second, done, error],
    edges: [...route(first, second.id), ...route(second, done.id)],
    completion: [{ id: "complete", description: "链路结束", predicate: { operator: "equals",
      left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    budget: { maxTransitions: 30, maxBrowserCommands: 10, maxActiveMs: 30_000,
      maxLlmCalls: 0, maxInvocations: 5, maxDepth: 3 },
    reuseBoundary: { description: "通用动作复用", assumptions: [], invalidationConditions: [] },
    implementationSummary: "测试通用展示合同", validation: { status: "candidate", evidence: [] } })
}

function groupedFixtureChain(taskId: string): TaskChain {
  const unit: TaskDataContract = { id: "unit", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "null" as const } }
  const data: TaskDataContract = { id: "data", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "object" as const, properties: {}, required: [], additionalProperties: true } }
  const base = (id: string, label = id, outputContract: TaskDataContract = unit) => ({ id, label, outputContract, writes: [] })
  const capability = (id: string, name: string, config: Record<string, unknown>,
    input: Record<string, unknown> = {}, outputContract: TaskDataContract = unit) => ({ ...base(id, id, outputContract), kind: "capability" as const,
    capability: { name, version: name === "data.transform" ? 1 : 2 }, input, config,
    effect: "read" as const, timeoutMs: 1_000 })
  const input = capability("input", "browser.workflow-step", { actionName: "input",
    target: { items: { kind: "css", value: "input[aria-label=\"Search\"]" } }, postconditions: [] })
  const keys = capability("keys", "browser.workflow-step", { actionName: "send_keys", target: null,
    postconditions: [{ kind: "read_fields", ready: true, consumerRef: "results-ready" }] },
  { keys: { source: "constant", value: "Enter" } })
  const ready = capability("results-ready", "browser.read-fields", { specification: {
    container: "[data-testid=\"results-list\"]", fields: { text: {} } } }, {}, data)
  const read = capability("candidate-read", "browser.read-fields", { specification: {
    container: "[data-testid=\"results-list\"] a", fields: { text: {} } } }, {}, data)
  const select = { ...base("candidate-select", "按任务规则选择当前候选", data), kind: "function" as const,
    language: "javascript" as const, source: "return 1", inputs: {
      candidates: { source: "node" as const, nodeId: read.id, path: [] } }, timeoutMs: 100 }
  const click = capability("candidate-click", "browser.workflow-step", { actionName: "click",
    target: { items: { kind: "css", value: "[data-testid=\"results-list\"] a" } },
    postconditions: [{ kind: "read_fields", ready: true, consumerRef: "detail-ready" }], targetOrdinalInput: "targetOrdinal" },
  { targetOrdinal: { source: "node", nodeId: select.id, path: [] } })
  const detail = capability("detail-ready", "browser.read-fields", { specification: {
    container: "main", fields: { text: {} } } }, {}, data)
  const fields = capability("field-read", "browser.read-fields", { specification: {
    container: "article", fields: { 标题: {}, 正文: {} } } }, {}, data)
  const output = capability("output-transform", "data.transform", { operation: "transform" },
  { source: { source: "node", nodeId: fields.id, path: [] } }, data)
  const done = { ...base("done", "完成"), kind: "terminal" as const, status: "completed" as const,
    reason: "完成", evidence: [{ source: "node" as const, nodeId: output.id, path: [] }] }
  const nodes = [input, keys, ready, read, select, click, detail, fields, output, done]
  return stableTaskChainV2Schema.parse({ contractVersion: CONTRACT_VERSION, kind: "chain", nodeModel: "stable/v2",
    id: randomUUID(), taskId, version: 1, plan: { id: randomUUID(), version: 1, digest: "a".repeat(64) },
    stepId: "perform", name: "确定性展示链", inputContract: unit, outputContract: data, variables: {}, entry: input.id,
    nodes, edges: nodes.slice(0, -1).map((node, index) => ({ from: node.id, port: "success", to: nodes[index + 1]!.id })),
    completion: [{ id: "complete", description: "链路结束", predicate: { operator: "equals",
      left: { source: "constant", value: true }, right: { source: "constant", value: true } } }],
    budget: { maxTransitions: 30, maxBrowserCommands: 10, maxActiveMs: 30_000,
      maxLlmCalls: 0, maxInvocations: 5, maxDepth: 3 },
    reuseBoundary: { description: "通用动作复用", assumptions: [], invalidationConditions: [] },
    implementationSummary: "测试确定性展示分组", validation: { status: "candidate", evidence: [] } })
}
