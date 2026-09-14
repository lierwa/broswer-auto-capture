import assert from "node:assert/strict"
import test from "node:test"
import { validateAnnotations } from "../src/task-chain/compilation-annotations.js"
import { normalizeBoundStepContracts, normalizeEachCompletionBindings, requirePlannedChainShape,
  semanticPlanSchema } from "../src/task-chain/authoring.js"
import { planPrompt } from "../src/task-chain/authoring-prompts.js"
import { traceEvent, type ExplorationTrace } from "../src/task-chain/exploration-trace.js"
const trace: ExplorationTrace = { jobId: "job", browserRunId: "browser", input: { url: "https://example.org/" },
  events: [traceEvent("nav", { type: "navigate", url: "https://example.org/" }, null, null),
    traceEvent("page", { type: "page" }, { title: "Observed" }, null)], result: { result: { title: "Observed" },
    provenance: [{ source: "tool", outputPath: ["title"], eventId: "page", resultPath: ["title"] }] },
  calls: 1, conclusion: "done", closed: true }
const annotations = { inputBindings: [{ eventId: "nav", commandPath: ["url"], inputPath: ["url"] }], repeatRegions: [],
  outputMappings: trace.result!.provenance, completion: [{ eventId: "page", resultPath: ["title"], description: "页面有标题" }],
  reuseBoundary: { description: "详情页面", assumptions: [], invalidationConditions: [] } }

test("注解只绑定真实轨迹和样本值，不允许图、脚本、预算或无来源输出", () => {
  assert.deepEqual(validateAnnotations(annotations, trace), { ...annotations, replayEventIds: ["nav", "page"], continueOnMissingEventIds: [] })
  for (const extra of [{ nodes: [] }, { budget: {} }, { script: "arbitrary" }]) assert.throws(() => validateAnnotations({ ...annotations, ...extra }, trace))
  assert.throws(() => validateAnnotations({ ...annotations, inputBindings: [{ eventId: "invented", commandPath: ["url"], inputPath: ["url"] }] }, trace), /annotation_replay_event_invalid/)
  assert.throws(() => validateAnnotations(annotations, { ...trace, input: { url: "https://different.org/" } }), /binding_mismatch/)
  assert.throws(() => validateAnnotations({ ...annotations, outputMappings: [] }, trace))
})

test("只有无来源依赖的成功目标交互可以声明目标缺失时继续", () => {
  const dismiss = traceEvent("dismiss", { type: "click", target: { role: "button", name: "Close" } }, null, null)
  const withDismiss = { ...trace, events: [trace.events[0]!, dismiss, trace.events[1]!] }
  const value = validateAnnotations({ ...annotations, replayEventIds: ["nav", "dismiss", "page"],
    continueOnMissingEventIds: ["dismiss"] }, withDismiss)
  assert.deepEqual(value.continueOnMissingEventIds, ["dismiss"])
  assert.throws(() => validateAnnotations({ ...annotations, continueOnMissingEventIds: ["page"] }, withDismiss),
    /annotation_optional_event_invalid/)
  assert.throws(() => validateAnnotations({ ...annotations, continueOnMissingEventIds: ["dismiss", "dismiss"] }, withDismiss),
    /annotation_optional_event_invalid/)
})

test("失败探针只有在显式排除后才允许由成功事件形成复跑路径", () => {
  const failed = traceEvent("probe", { type: "click", target: { role: "button", name: "Missing" } }, null, null, "target_missing")
  const withProbe = { ...trace, events: [...trace.events, failed] }
  assert.throws(() => validateAnnotations(annotations, withProbe), /annotation_replay_path_required/)
  const selected = { ...annotations, replayEventIds: ["nav", "page"] }
  assert.deepEqual(validateAnnotations(selected, withProbe).replayEventIds, ["nav", "page"])
  assert.deepEqual(validateAnnotations({ ...selected, replayEventIds: ["nav"] }, withProbe).replayEventIds, ["nav", "page"])
  assert.throws(() => validateAnnotations({ ...selected, completion: [{ eventId: "probe", resultPath: [], description: "bad" }] }, withProbe),
    /annotation_replay_event_invalid/)
})

test("动态目标与固定控件同值时只参数化已锚定的目标 locator", () => {
  const targetTrace: ExplorationTrace = { ...trace, input: { semanticRole: "button", visibleName: "Dynamic product" },
    events: [traceEvent("search", { type: "click", target: { role: "button", name: "Search" } }, null, null),
      traceEvent("target", { type: "click", target: { role: "button", name: "Dynamic product" } }, { url: "https://example.org/item" }, null)],
    result: { result: { url: "https://example.org/item" }, provenance: [{ source: "tool", outputPath: ["url"],
      eventId: "target", resultPath: ["url"] }] } }
  const value = validateAnnotations({ replayEventIds: ["search", "target"], continueOnMissingEventIds: [],
    inputBindings: [{ eventId: "target", commandPath: ["target", "name"], inputPath: ["visibleName"] }],
    repeatRegions: [], outputMappings: targetTrace.result!.provenance,
    completion: [{ eventId: "target", resultPath: ["url"], description: "目标页已打开" }],
    reuseBoundary: { description: "按动态语义目标打开页面", assumptions: [], invalidationConditions: [] } }, targetTrace)
  assert.deepEqual(value.inputBindings, [
    { eventId: "target", commandPath: ["target", "name"], inputPath: ["visibleName"] },
    { eventId: "target", commandPath: ["target", "role"], inputPath: ["semanticRole"] },
  ])
})

test("语义计划 schema 从模型输入中移除技术预算", () => {
  const step = semanticPlanSchema.shape.steps.element
  assert.equal(Object.hasOwn(step.shape, "budget"), false)
  assert.equal(Object.hasOwn(semanticPlanSchema.shape, "budget"), false)
})

test("任务预执行把真实代表输入交给规划且禁止冻结样本值", () => {
  const prompt = planPrompt({ definition: { body: "采集页面结果" } } as never,
    { startUrl: "https://example.org/", searchQuery: "portable value", targetCount: 3 })
  assert.match(prompt, /"searchQuery":"portable value"/)
  assert.match(prompt, /字段名和基础类型保持一致/)
  assert.match(prompt, /不得用 enum 或相同上下界把样本值冻结为常量/)
  assert.match(prompt, /不能把 url\/href 声明为必填/)
  assert.match(prompt, /12000 字符/)
})

test("宿主把 each 的单次输出完成条件规范为聚合输出路径", () => {
  const normalized = normalizeEachCompletionBindings({ steps: [{
    id: "detail", invocation: { mode: "each" }, completion: [
      { predicate: { operator: "exists", value: { source: "node", nodeId: "detail", path: ["record", "url"] } } },
      { predicate: { operator: "equals", left: { source: "node", nodeId: "detail", path: ["status"] },
        right: { source: "constant", value: "ok" } } },
    ],
  }] } as never)
  assert.deepEqual(normalized.steps[0]!.completion[0]!.predicate, { operator: "exists",
    value: { source: "node", nodeId: "detail", path: [0, "record", "url"] } })
  assert.deepEqual(normalized.steps[0]!.completion[1]!.predicate, { operator: "equals",
    left: { source: "node", nodeId: "detail", path: [0, "status"] }, right: { source: "constant", value: "ok" } })
})

test("整值 binding 的步骤输入合同由真实来源派生", () => {
  const source = { id: "source", version: 1, dialect: "bat-value-schema/v1" as const,
    schema: { type: "object" as const, properties: { count: { type: "integer" as const, minimum: 1 } },
      required: ["count"], additionalProperties: true } }
  const candidate = normalizeBoundStepContracts({ inputContract: source, outputContract: source,
    output: { source: "node", nodeId: "batch", path: [] }, steps: [
    { id: "discover", invocation: { mode: "once" }, input: { source: "input", path: [] }, inputContract: { ...source, schema: { type: "object",
      properties: {}, required: [], additionalProperties: true } }, outputContract: source },
    { id: "batch", invocation: { mode: "batch" }, input: { source: "node", nodeId: "discover", path: [] }, inputContract: { ...source,
      schema: { type: "object", properties: {}, required: [], additionalProperties: true } }, outputContract: source },
  ] } as never)
  assert.deepEqual(candidate.steps.map((step) => step.inputContract.schema), [source.schema, source.schema])
})

test("整值计划输出由公开输出合同统一末步 schema", () => {
  const internal = { type: "object" as const, properties: { status: { type: "string" as const } },
    required: ["status"], additionalProperties: true }
  const published = { type: "object" as const, properties: {
    status: { type: "string" as const }, records: { type: "array" as const,
      items: { type: "object" as const, properties: {}, required: [], additionalProperties: true } },
  }, required: ["status", "records"], additionalProperties: true }
  const candidate = normalizeBoundStepContracts({ inputContract: { id: "input", version: 1,
    dialect: "bat-value-schema/v1", schema: internal }, outputContract: { id: "result", version: 1,
    dialect: "bat-value-schema/v1", schema: published }, output: { source: "node", nodeId: "finish", path: [] },
  steps: [{ id: "finish", invocation: { mode: "batch" }, input: { source: "input", path: [] },
    inputContract: { id: "step-input", version: 1, dialect: "bat-value-schema/v1", schema: internal },
    outputContract: { id: "step-output", version: 1, dialect: "bat-value-schema/v1", schema: internal } }] } as never)
  assert.deepEqual(candidate.steps[0]!.outputContract.schema, published)
})

test("batch 计划只能冻结含一个显式循环的链", () => {
  const step = { invocation: { mode: "batch" } } as never
  assert.throws(() => requirePlannedChainShape(step, { nodes: [{ kind: "capability" }] } as never), /batch_chain_loop_required/)
  assert.doesNotThrow(() => requirePlannedChainShape(step, { nodes: [{ kind: "loop" }] } as never))
})
