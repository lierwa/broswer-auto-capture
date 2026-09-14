import type { LegacyChainNode, TaskChain, TaskDataContract, TaskPlan, TaskRequirement, ValueSchema } from "../src/task-chain/index.js"
import { CONTRACT_VERSION, requiredNodeOutcomes } from "../src/task-chain/index.js"

export const ids = {
  task: "10000000-0000-4000-8000-000000000001", requirement: "10000000-0000-4000-8000-000000000002",
  plan: "10000000-0000-4000-8000-000000000003", chain: "10000000-0000-4000-8000-000000000004",
  run: "10000000-0000-4000-8000-000000000005", invocation: "10000000-0000-4000-8000-000000000006",
  authorization: "10000000-0000-4000-8000-000000000007", checkpoint: "10000000-0000-4000-8000-000000000008",
  request: "10000000-0000-4000-8000-000000000009",
}
export const digest = "a".repeat(64)
export const reference = (id: string) => ({ id, version: 1, digest })
export const budget = { maxTransitions: 100, maxBrowserCommands: 40, maxActiveMs: 30_000, maxLlmCalls: 0, maxInvocations: 20, maxDepth: 4 }
export const inputBinding = { source: "input" as const, path: [] }
export const nodeBinding = (nodeId: string) => ({ source: "node" as const, nodeId, path: [] })
export const condition = (nodeId: string) => ({ id: "observed", description: "结果有可观察证据", predicate: { operator: "exists" as const, value: nodeBinding(nodeId) } })
export function dataContract(id: string, schema: ValueSchema): TaskDataContract {
  return { id, version: 1, dialect: "bat-value-schema/v1", schema }
}
const inputContract = dataContract("task-input", { type: "object", properties: { destination: { type: "string" } }, required: ["destination"], additionalProperties: false })
export const nullContract = dataContract("unit", { type: "null" })
export function nodeBase(id: string, kind: LegacyChainNode["kind"], outputContract = nullContract) {
  return { id, label: id, outcomes: [...requiredNodeOutcomes[kind]], outputContract, writes: [] }
}

function taskFixture(goal: string, outputContract: TaskDataContract, action: "data" | "browser") {
  const requirement: TaskRequirement = { contractVersion: CONTRACT_VERSION, kind: "requirement", id: ids.requirement,
    taskId: ids.task, version: 1, revision: 1, goal, scope: "用户提供的当前页面", inputContract, outputContract,
    definition: { format: "markdown", body: `# ${goal}\n\n按已确认范围执行并核验结果。` },
    constraints: [], completionCriteria: ["观察并核验结果"], authorization: { scope: "限定当前任务", risks: [], requiredApprovals: [] }, confirmation: null }
  const plan: TaskPlan = { contractVersion: CONTRACT_VERSION, kind: "plan", id: ids.plan, taskId: ids.task, version: 1,
    requirement: { ...reference(ids.requirement), revision: 1 }, summary: goal, inputContract, outputContract,
    steps: [{ id: "perform", title: goal, goal, dependsOn: [], inputContract, outputContract, input: inputBinding,
      invocation: { mode: "once" }, chain: { id: ids.chain, version: 1 }, budget, completion: [condition("perform")], risks: [] }],
    output: nodeBinding("perform"), budget, completion: [condition("perform")], evidence: [], authorizationScope: "一个已确认输入" }
  const middle: LegacyChainNode = action === "data"
    ? { ...nodeBase("act", "data", outputContract), kind: "data", operation: "extract", arguments: { value: nodeBinding("observe") } }
    : { ...nodeBase("act", "browser", outputContract), kind: "browser", operation: "click", arguments: {},
      target: { kind: "semantic", role: "button", name: { source: "constant", value: "播放" } }, timeoutMs: 2000 }
  const nodes: LegacyChainNode[] = [
    { ...nodeBase("open", "browser"), kind: "browser", operation: "navigate", arguments: { url: { source: "input", path: ["destination"] } }, timeoutMs: 2000 },
    { ...nodeBase("observe", "observe", outputContract), kind: "observe", scope: "page", stableWhen: { operator: "exists", path: [] }, timeoutMs: 2000 },
    middle,
    { ...nodeBase("verify", "observe", outputContract), kind: "observe", scope: "page", stableWhen: { operator: "exists", path: [] }, timeoutMs: 2000 },
    { ...nodeBase("emit", "emit", outputContract), kind: "emit", name: "result", output: { kind: "value", value: nodeBinding("verify") }, contract: outputContract },
    { ...nodeBase("end", "terminal"), kind: "terminal", status: "completed", reason: "结果核验通过", evidence: [nodeBinding("emit")] },
    { ...nodeBase("error", "terminal"), kind: "terminal", status: "failed", reason: "操作未完成", evidence: [inputBinding] },
  ]
  const successors = { open: "observe", observe: "act", act: "verify", verify: "emit", emit: "end" } as Record<string, string>
  const chain: TaskChain = { contractVersion: CONTRACT_VERSION, kind: "chain", id: ids.chain, taskId: ids.task, version: 1,
    plan: reference(ids.plan), stepId: "perform", name: goal, inputContract, outputContract, variables: {}, entry: "open", nodes,
    edges: nodes.flatMap((node) => node.outcomes.map((outcome) => ({ from: node.id, outcome, to: outcome === "success" ? successors[node.id]! : "error" }))),
    completion: [condition("emit")], budget, reuseBoundary: { description: "相同页面结构，不同任务输入", assumptions: ["目标语义稳定"], invalidationConditions: ["页面结构变化"] },
    implementationSummary: "结构夹具，仅证明通用契约表达能力", validation: { status: "candidate", evidence: [] } }
  return { requirement, plan, chain }
}

export const extractionFixture = taskFixture("采集页面标题与链接", dataContract("extracted-result", {
  type: "object", properties: { title: { type: "string" }, link: { type: "string" } }, required: ["title", "link"], additionalProperties: false,
}), "data")
export const playbackFixture = taskFixture("播放用户指定内容并验证播放状态", dataContract("playback-result", {
  type: "object", properties: { playing: { type: "boolean" } }, required: ["playing"], additionalProperties: false,
}), "browser")
