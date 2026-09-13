import assert from "node:assert/strict"
import test from "node:test"
import { validateAnnotations } from "../src/task-chain/compilation-annotations.js"
import { semanticPlanSchema } from "../src/task-chain/authoring.js"
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
