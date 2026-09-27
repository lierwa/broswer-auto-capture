import assert from "node:assert/strict"
import test from "node:test"
import { validateAnnotations } from "../src/task-chain/compilation-annotations.js"
import { requirePlannedChainShape, authoringFailureMessage } from "../src/task-chain/authoring.js"
import { browserUseTask } from "../src/upstream-browser/task-request.js"
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

test("浏览器探索明确接收计划入口且禁止换网站碰运气", () => {
  const task = browserUseTask({
    requirement: { definition: { body: "播放目标内容" } },
    plan: { summary: "播放内容", authorizationScope: "目标站点", entryUrls: ["https://video.example/"],
      outputContract: { schema: { type: "null" } } },
    step: { title: "播放", goal: "开始播放", dependsOn: [], invocation: { mode: "once" }, risks: [],
      inputContract: { schema: { type: "null" } }, outputContract: { schema: { type: "null" } },
      resultSpec: { mode: "execution" }, completion: [] }, resolvedInput: null,
  } as never)
  assert.match(task, /入口 1：https:\/\/video\.example\//)
  assert.match(task, /不得改用搜索引擎/)
})

test("准备失败只向产品界面返回可执行说明，不暴露内部错误码", () => {
  const aggregate = new AggregateError([
    new Error("hybrid_completed_source_required"),
    new Error("upstream_cleanup_unconfirmed:1"),
  ], "hybrid_source_and_cleanup_failed")
  const message = authoringFailureMessage(aggregate)
  assert.match(message, /代表任务没有正常结束或输出不符合已确认合同/)
  assert.doesNotMatch(message, /hybrid_|cleanup|upstream/)
  assert.doesNotMatch(authoringFailureMessage(new Error("unknown_internal_code")), /unknown_internal_code/)
  const sourceMismatch = authoringFailureMessage(new Error("workflow_fork_source_mismatch:workflows/private.py"))
  assert.match(sourceMismatch, /受管 workflow-use 源码与已登记摘要不一致/)
  assert.doesNotMatch(sourceMismatch, /private\.py|workflow_fork_source_mismatch/)
  const runnerClosed = authoringFailureMessage(new Error("upstream_runner_closed:1"))
  assert.match(runnerClosed, /受管浏览器运行环境未能启动/)
  assert.doesNotMatch(runnerClosed, /upstream_runner_closed/)
  const protocolFailure = authoringFailureMessage(new Error("hybrid_source_protocol_invalid"))
  assert.match(protocolFailure, /结果交接未通过协议校验/)
  assert.doesNotMatch(protocolFailure, /请重试|hybrid_source_protocol_invalid/)
})

test("batch 计划只能冻结含一个显式循环的链", () => {
  const step = { invocation: { mode: "batch" } } as never
  assert.throws(() => requirePlannedChainShape(step, { nodes: [{ kind: "capability" }] } as never), /batch_chain_loop_required/)
  assert.doesNotThrow(() => requirePlannedChainShape(step, { nodes: [{ kind: "loop" }] } as never))
})
