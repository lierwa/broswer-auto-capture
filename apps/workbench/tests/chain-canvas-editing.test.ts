import assert from "node:assert/strict"
import test from "node:test"
import { taskChainSchema, type StableTaskChainV2, type TaskDraft } from "@browser-capture/contracts"
import { compileTaskChain, digestJson } from "@browser-capture/runtime"
import { createTaskDraft, updateTaskDraft } from "../../api/src/task-chain/chain-revision.js"
import { capabilityEffectChain } from "../../../packages/runtime/tests/task-chain-fixtures.js"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { newFunctionNode, nodeInsertionOperations, nodeRemovalOperations, nodeRouteOperations } from "../src/chainCanvasEditing.js"

function fixture() {
  const original = capabilityEffectChain()
  const requirement = structuredClone(extractionFixture.requirement)
  requirement.taskId = original.taskId
  const plan = structuredClone(extractionFixture.plan)
  plan.id = original.plan.id; plan.taskId = original.taskId
  plan.requirement = { id: requirement.id, version: requirement.version, revision: requirement.revision,
    digest: digestJson(requirement) }
  plan.steps = [{ ...plan.steps[0]!, id: original.stepId, chain: { id: original.id, version: original.version } }]
  const chain = taskChainSchema.parse({ ...original, nodeModel: "stable/v2", plan: {
    id: plan.id, version: plan.version, digest: digestJson(plan) },
    nodes: original.nodes.filter((node) => node.id !== "error").map(({ outcomes: _outcomes, ...node }) => node),
    edges: original.edges.filter((edge) => edge.outcome === "success").map(({ outcome, ...edge }) => ({ ...edge, port: outcome })),
  }) as StableTaskChainV2
  return createTaskDraft({ taskId: chain.taskId, requirement, baseRelease: null, plan, chains: [chain] })
}

function selected(draft: TaskDraft) { return draft.content.steps[0]! }

test("新增 Function 与删除都能通过真实任务草稿应用和编译，阶段成员与出口同步", () => {
  const initial = fixture(), before = structuredClone(initial), base = selected(initial)
  const inserted = updateTaskDraft(initial, initial.revision, initial.checksum, base.chain.id,
    nodeInsertionOperations(base.chain, base.presentation, "capability", newFunctionNode("transform")), 3)
  compileTaskChain(selected(inserted).chain)
  assert.equal(selected(inserted).chain.edges.find((edge) => edge.from === "capability")?.to, "transform")
  assert.equal(selected(inserted).presentation.stages[0]!.exits[0]!.sourceNodeId, "transform")
  const current = selected(inserted)
  const removed = updateTaskDraft(inserted, inserted.revision, inserted.checksum, current.chain.id,
    nodeRemovalOperations(current.chain, current.presentation, "transform"), 4)
  compileTaskChain(selected(removed).chain)
  assert.deepEqual(selected(removed).chain.nodes, base.chain.nodes)
  assert.deepEqual(selected(removed).chain.edges, base.chain.edges)
  assert.deepEqual(initial, before)
})

test("删除入口原子接回后继，完成条件与输入引用保留可读保护", () => {
  const draft = fixture(), item = selected(draft), chain = item.chain as StableTaskChainV2
  chain.completion = [{ id: "ready", description: "任务输入可用", predicate: { operator: "exists", value: { source: "input", path: [] } } }]
  const first = chain.nodes.find((node) => node.id === "observe")!
  first.label = "读取页面"
  const second = chain.nodes.find((node) => node.id === "capability")!
  if (second.kind !== "capability") throw new Error("fixture")
  second.label = "使用页面数据"
  second.input = { value: { source: "node", nodeId: first.id, path: [] } }
  assert.throws(() => nodeRemovalOperations(chain, item.presentation, first.id), /使用页面数据/)
  second.input = {}
  const result = updateTaskDraft(draft, draft.revision, draft.checksum, chain.id,
    nodeRemovalOperations(chain, item.presentation, first.id), 3)
  assert.equal(selected(result).chain.entry, second.id)
  assert.equal(selected(result).presentation.stages[0]!.entryNodeId, second.id)
  compileTaskChain(selected(result).chain)
  chain.completion[0]!.predicate = { operator: "exists", value: { source: "node", nodeId: first.id, path: [] } }
  assert.throws(() => nodeRemovalOperations(chain, item.presentation, first.id), /完成条件“任务输入可用”/)
})

test("恢复分支不自动猜合流；改下一步同样经服务端编译拒绝悬空动作", () => {
  const draft = fixture(), item = selected(draft), chain = item.chain as StableTaskChainV2
  chain.edges.push({ from: "observe", port: "failed", to: "done" })
  assert.throws(() => nodeRemovalOperations(chain, item.presentation, "observe"), /分支或恢复路线/)
  assert.throws(() => updateTaskDraft(draft, draft.revision, draft.checksum, chain.id,
    nodeRouteOperations(chain, item.presentation, "observe", "success", "done"), 3), /unreachable|展示结构/)
})
