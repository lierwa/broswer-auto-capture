import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import {
  CONTRACT_VERSION, requiredStableNodeOutcomes, stableTaskChainSchema,
  type ChainPresentationContent, type StableChainNode, type TaskChain,
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
  assert.deepEqual(presentation.stages, fallback.stages.map((stage) => ({ ...stage,
    title: step.title, summary: step.goal })))
  assert.deepEqual(presentation.overviewLayout, fallback.overviewLayout)
  assert.deepEqual(presentation.focusLayouts, fallback.focusLayouts)
  assert.equal(executableChainDigest(chain), before)
  assert.throws(() => createStepChainPresentation(chain, { ...step, id: "another-step" }),
    /链路展示结构与当前执行图不一致/)
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
