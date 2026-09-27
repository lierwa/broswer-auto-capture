import assert from "node:assert/strict"
import test from "node:test"
import { nodePorts, taskChainSchema, type StableTaskChainV2 } from "@browser-capture/contracts"
import { compactGeneratedFailureRoutes, compileTaskChain, TaskChainRuntime } from "../src/task-chain/index.js"
import { capabilityEffectChain, nullContract, requestFor } from "./task-chain-fixtures.js"

// 保护真实边界：正常路线完整、错误在原节点收束、人工恢复不重放副作用、业务恢复路由优先。
function sparseChain(): StableTaskChainV2 {
  const old = capabilityEffectChain()
  return taskChainSchema.parse({ ...old, nodeModel: "stable/v2",
    nodes: old.nodes.filter((node) => node.id !== "error").map(({ outcomes: _outcomes, ...node }) => node),
    edges: old.edges.filter((edge) => edge.outcome === "success").map(({ outcome, ...edge }) => ({ ...edge, port: outcome })),
  }) as StableTaskChainV2
}

test("稀疏链只有正常边即可完成，仍拒绝缺失成功边", async () => {
  const chain = sparseChain()
  const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null),
    capabilities: { capability: async () => ({ outcome: "success", output: null }) } })
  assert.equal(run.status, "completed")
  assert.equal(run.consumed.llmCalls, 0)
  assert.deepEqual(run.events.filter((item) => item.status === "finished").map((item) => item.nodeId),
    ["observe", "capability", "done"])
  assert.throws(() => compileTaskChain({ ...chain, edges: chain.edges.slice(1) }), /unbound_outcome/)
})

test("未处理异常保留原节点、原原因与类型，不执行伪终态或后续动作", async () => {
  for (const outcome of ["missing", "timeout", "blocked", "failed", "cancelled"] as const) {
    const chain = sparseChain()
    let calls = 0
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null),
      capabilities: { capability: async () => { calls++; return { outcome, reason: `source:${outcome}` } } } })
    assert.equal(run.status, outcome === "blocked" || outcome === "cancelled" ? outcome : "failed")
    assert.equal(run.outcome?.reason, `source:${outcome}`)
    assert.equal(run.events.at(-1)?.nodeId, "observe")
    assert.equal(run.events.at(-1)?.outcome, outcome)
    assert.equal(run.consumed.transitions, 1)
    assert.equal(run.consumed.llmCalls, 0)
    assert.equal(calls, 1)
  }
})

test("无人工边时等待并恢复同一运行，现场核验后不重放已派发动作", async () => {
  const chain = sparseChain()
  const action = chain.nodes.find((node) => node.id === "capability")!
  if (action.kind !== "capability") throw new Error("fixture")
  action.human = { reason: "confirmation", prompt: "请处理当前页面", resumeWhen: { operator: "equals", path: ["ready"],
    expected: { source: "constant", value: true } } }
  const request = requestFor(taskChainSchema.parse(chain), null)
  const browser = { sessionId: "owned", tabId: "tab", url: "https://example.com/", observationDigest: "a".repeat(64),
    observedAt: new Date().toISOString() }
  let calls = 0
  const capabilities = { capability: async ({ node }: { node: { id: string } }) => {
    calls++
    return node.id === "observe" ? { outcome: "success", output: null }
      : { outcome: "human_required", reason: "请处理当前页面", browser }
  }, verifyResume: async () => ({ ok: true, browser, observation: { ready: true } }) }
  const waiting = await new TaskChainRuntime().execute({ chain, request, capabilities })
  assert.equal(waiting.status, "waiting_for_human")
  assert.equal(waiting.checkpoint?.cursor, "capability")
  assert.equal(waiting.checkpoint?.resumeWhen?.operator, "equals")
  assert.deepEqual(waiting.checkpoint?.resumeWhen?.path, ["ready"])
  const checkpoint = waiting.checkpoint!
  const resumed = await new TaskChainRuntime().execute({ chain, request, capabilities, control: {
    checkpoint, resumeRequest: { contractVersion: request.contractVersion, requestId: request.requestId,
      binding: request.binding, checkpointId: checkpoint.id, expectedSequence: checkpoint.sequence },
  } })
  assert.equal(resumed.status, "completed")
  assert.equal(resumed.binding.runId, waiting.binding.runId)
  assert.equal(calls, 2)
  assert.equal(resumed.consumed.llmCalls, 0)
})

test("显式业务恢复路线优先于错误缺省处理，包含人工结果", async () => {
  for (const outcome of ["missing", "human_required"]) {
    const chain = sparseChain()
    chain.edges.push({ from: "observe", port: outcome, to: "capability" })
    const seen: string[] = []
    const run = await new TaskChainRuntime().execute({ chain, request: requestFor(chain, null), capabilities: {
      capability: async ({ node }) => { seen.push(node.id); return { outcome: node.id === "observe" ? outcome : "success", output: null } },
    } })
    assert.equal(run.status, "completed")
    assert.deepEqual(seen, ["observe", "capability"])
  }
})

function generatedChain() {
  const chain = sparseChain(), statuses = { missing: "failed", timeout: "failed", blocked: "blocked",
    human_required: "blocked", failed: "failed", cancelled: "cancelled" } as const
  chain.implementationSummary = `workflow-use hybrid ${"b".repeat(64)}`
  chain.nodes.push(...Object.entries(statuses).map(([id, status]) => ({ id, label: id, kind: "terminal" as const,
    status, reason: id, outputContract: nullContract, writes: [], evidence: [{ source: "input" as const, path: [] }] })))
  chain.edges.push(...chain.nodes.filter((node) => node.kind !== "terminal").flatMap((node) =>
    nodePorts(node).filter((port) => port !== "success").map((port) => ({ from: node.id, port, to: port }))))
  return chain
}

test("仅压缩已知编译器无业务内容异常边，旧对象与业务结果不变", () => {
  const chain = generatedChain(), original = structuredClone(chain)
  const compact = compactGeneratedFailureRoutes(chain)
  assert.equal(compact.edges.length, 2)
  assert.equal(compact.nodes.length, 3)
  assert.deepEqual(chain, original)
  assert.equal(compact.validation.status, "candidate")
  const custom = generatedChain()
  const failed = custom.nodes.find((node) => node.id === "failed")!
  if (failed.kind !== "terminal") throw new Error("fixture")
  failed.reason = "用户定义的停止说明"
  const kept = compactGeneratedFailureRoutes(custom)
  assert.equal(kept.edges.length, 4)
  assert.ok(kept.nodes.some((node) => node.id === "failed"))
  custom.implementationSummary = "用户建立的图"
  assert.deepEqual(compactGeneratedFailureRoutes(custom), custom)
})
