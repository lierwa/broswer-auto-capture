import { taskChainSchema, type TaskChain, type TaskExecutionEventBatch, type TaskRun } from "@browser-capture/contracts"
import { TaskChainRuntime } from "@browser-capture/runtime"
import { capabilityEffectChain, nullContract, requestFor } from "../../../../packages/runtime/tests/task-chain-fixtures.js"
import { createStepChainPresentation } from "../../../api/src/task-chain/presentation.js"

export function controlChain() {
  const template = capabilityEffectChain()
  const item = { id: "item", version: 1, dialect: "bat-value-schema/v1" as const, schema: { type: "object" as const,
    properties: { id: { type: "string" as const }, selected: { type: "boolean" as const } },
    required: ["id", "selected"], additionalProperties: false } }
  const action = (id: string, label: string, source = "function main() { return null; }") => ({
    id, label, kind: "function" as const, language: "javascript" as const, source, inputs: {},
    outputContract: nullContract, writes: [], timeoutMs: 1000 })
  const repeat = { id: "repeat", label: "逐项处理", kind: "loop", outputContract: nullContract, writes: [],
    iteration: { mode: "each", collection: { source: "input", path: ["items"] }, itemVariable: "item", stableKeyPath: ["id"] },
    cursorVariable: "cursor", maxIterations: 3, body: { entry: "choice", exits: ["join"] } }
  const choice = { id: "choice", label: "当前项需要处理？", kind: "branch", outputContract: nullContract, writes: [],
    cases: [{ id: "process", label: "需要处理", predicate: { operator: "equals",
      left: { source: "variable", name: "item", path: ["selected"] }, right: { source: "constant", value: true } } }] }
  const done = { id: "done", label: "完成", kind: "terminal", status: "completed", reason: "完成",
    outputContract: nullContract, writes: [], evidence: [{ source: "constant", value: true }],
    result: { name: "result", contract: nullContract, output: { kind: "value", value: { source: "constant", value: null } } } }
  const failed = { ...done, id: "failed", label: "失败", status: "failed", reason: "失败", result: undefined }
  const edges = [
    ["repeat", "body", "choice"], ["repeat", "done", "output"], ["repeat", "limit", "failed"], ["repeat", "failed", "failed"],
    ["choice", "process", "handle"], ["choice", "default", "join"], ["choice", "failed", "failed"],
    ["handle", "success", "join"], ["handle", "failed", "failed"],
    ["join", "success", "repeat"], ["join", "failed", "failed"],
    ["output", "success", "done"], ["output", "failed", "failed"],
  ].map(([from, port, to]) => ({ from, port, to }))
  const chain = taskChainSchema.parse({ ...template, nodeModel: "stable/v2", name: "循环和分支运行事实核验", entry: "repeat",
    inputContract: { ...nullContract, schema: { type: "object", properties: { items: { type: "array", items: item.schema } },
      required: ["items"], additionalProperties: false } }, variables: { item, cursor: { ...nullContract,
      schema: { type: "integer", minimum: 0 } } },
    nodes: [repeat, choice, action("handle", "处理当前项"), action("join", "汇合本轮结果"),
      action("output", "输出汇总结果"), done, failed], edges })
  const presentation = createStepChainPresentation(chain, { id: chain.stepId, title: "处理输入列表",
    goal: "由真实分支选择路径，循环退出后输出结果" })
  return { chain, presentation }
}

export function runBatch(run: TaskRun, length = run.events.length): TaskExecutionEventBatch {
  const events = run.events.slice(0, length)
  return { executionId: run.binding.authorizationId, executionSequence: length, status: length === run.events.length ? run.status : "running",
    after: 0, next: length, events: events.map((event, index) => ({ event, sequence: index + 1, executionId: run.binding.authorizationId,
      stepId: "perform", runId: run.binding.runId, runSequence: 1 })) } as TaskExecutionEventBatch
}

export async function executeControl(chain: TaskChain = controlChain().chain) {
  const snapshots: TaskRun[] = []
  const run = await new TaskChainRuntime().execute({ chain,
    request: requestFor(chain, { items: [{ id: "first", selected: true }, { id: "second", selected: false }] }),
    capabilities: { persist: async run => { snapshots.push(structuredClone(run)) } } })
  return { run, snapshots }
}
