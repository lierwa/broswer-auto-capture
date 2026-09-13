import assert from "node:assert/strict"
import test from "node:test"
import { extractionFixture, playbackFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { authoringLevel, projectChainGraph } from "../src/taskChainProjection.js"
import { taskAuthoringJobSchema } from "@browser-capture/contracts"

test("两类任务链使用同一投影并保留通用节点、连线和操作", () => {
  for (const fixture of [extractionFixture, playbackFixture]) {
    const graph = projectChainGraph(fixture.chain, [])
    const ids = new Set(graph.nodes.map((node) => node.id))
    assert.equal(graph.nodes.length, fixture.chain.nodes.length)
    assert.equal(graph.edges.length, fixture.chain.edges.length)
    assert.ok(graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)))
    assert.ok(graph.nodes.every((node) => node.className === "chain-node chain-node-pending"))
  }
  assert.match(String(projectChainGraph(extractionFixture.chain, []).nodes.find((node) => node.id === "act")?.data.label), /数据处理 · extract/)
  assert.match(String(projectChainGraph(playbackFixture.chain, []).nodes.find((node) => node.id === "act")?.data.label), /浏览器动作 · click/)
})

test("探索结果不会伪装成换输入已验证，失败保留 E1 证据等级", () => {
  const now = new Date().toISOString(), job = taskAuthoringJobSchema.parse({ id: crypto.randomUUID(), taskId: "task", type: "chain", key: "step",
    status: "failed", sequence: 1, reason: "编译来源缺失", resultId: null, audit: null, createdAt: now, updatedAt: now,
    authoring: { stage: "compiling", level: "E1", failureLayer: "Trace-to-Graph 编译", exploration: {}, annotations: null,
      consumption: { explorationToolCalls: 4, explorationSessions: 1, compilationCalls: 1, providerInvocations: null } } })
  assert.equal(authoringLevel(job, []), "E1 · 探索已得到结果")
  const chain = extractionFixture.chain
  assert.equal(authoringLevel({ ...job, resultId: chain.id }, [{ ...chain, validation: { status: "candidate", evidence: [] } }]), "E2 · 已编译")
  const original = { ...chain, version: 1, validation: { status: "candidate" as const, evidence: [] } }
  const newer = { ...chain, version: 2, validation: { status: "verified" as const, evidence: [] } }
  assert.equal(authoringLevel({ ...job, resultId: chain.id, authoring: { ...job.authoring!, level: "E2",
    compiledChain: { id: chain.id, version: 1, digest: "a".repeat(64) } } }, [newer, original]), "E2 · 已编译")
})
