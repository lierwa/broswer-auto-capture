// WHY：保护同版草案→多步骤计划→B-U 交接，不用网站专用代码或结果数组猜循环。
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"
import { taskRequirementSchema } from "@browser-capture/contracts"
import { parseBusinessSteps } from "../src/interview/business-steps.js"
import { projectPreparationPlan } from "../src/task-chain/preparation-plan-projection.js"
import { browserUseTask } from "../src/upstream-browser/task-request.js"

const entry = "https://example.org/"
function requirement(steps: string, result = "- 交付：完成状态", inputs = "- 无") {
  const taskId = randomUUID(), resolutionId = randomUUID()
  const body = `# 目标\n用户的浏览器任务\n\n## 试做入口\n1. ${entry}\n\n## 运行输入\n${inputs}\n\n## 任务步骤\n${steps}\n\n## 代表试做\n研究每步如何完成，逐项只研究一个输入。\n\n## 结果与完成\n${result}\n- 页面交付：无需保留\n按已确认步骤完成，失败保留原因。`
  return taskRequirementSchema.parse({ contractVersion: "bat-task-chain/v1", kind: "requirement", id: randomUUID(),
    taskId, version: 1, revision: 1, goal: "用户的浏览器任务", scope: "同源浏览器任务", definition: { format: "markdown", body },
    inputContract: null, outputContract: null, constraints: [], completionCriteria: ["完成已确认步骤"],
    authorization: { scope: "同源浏览器任务", risks: [], requiredApprovals: [] },
    confirmation: { confirmedAt: new Date().toISOString(), requestId: randomUUID() },
    confirmationFacts: { decisions: [], sources: [{ resolutionId, url: entry, label: "用户来源", origin: entry,
      domain: "example.org", query: entry, provider: "user_provided" }], entries: [{ resolutionId, url: entry }],
      resultExpectation: "完成已确认步骤", unresolvedItemCount: 0 } })
}
function step(index: number, title: string, input = "任务输入", execution = "一次执行", output = "完成状态") {
  return `${index}. ${title}\n- 输入：${input}\n- 执行：${execution}\n- 产出：${output}\n- 目标：${title}，遇到权限要求等待用户。`
}

test("三个业务步骤保留自己的名称、目标和顺序，不强制两步模板", () => {
  const draft = requirement([step(1, "打开设置"), step(2, "启用通知"), step(3, "确认通知状态")].join("\n\n"))
  const plan = projectPreparationPlan(draft, 1)
  assert.deepEqual(plan.steps.map(item => item.title), ["打开设置", "启用通知", "确认通知状态"])
  assert.deepEqual(plan.steps.map(item => item.dependsOn), [[], ["step-1"], ["step-2"]])
  assert.equal(plan.steps.every(item => item.invocation.mode === "once"), true)
  const instruction = browserUseTask({ requirement: draft, plan, step: plan.steps[1]!, resolvedInput: null })
  assert.match(instruction, /步骤名称：启用通知/)
  assert.match(instruction, /已完成的前置步骤：打开设置/)
})

test("入口集合只提供输入，原始内容逐项复用一条链路且无需具体参数字段", () => {
  const draft = requirement([step(1, "选择符合规则的入口", "任务输入", "一次执行", "入口集合"),
    step(2, "保存每个详情区域图文", "步骤 1 的结果", "逐项执行", "最终结果")].join("\n\n"),
    "- 交付：页面内容\n- 结果数量：最多 5 条")
  const plan = projectPreparationPlan(draft, 1), source = plan.steps[0]!, item = plan.steps[1]!
  assert.equal(source.outputContract.schema.type, "array")
  assert.equal(item.invocation.mode, "each")
  if (item.invocation.mode !== "each") throw Error("each_required")
  assert.deepEqual(item.invocation.collection, { source: "node", nodeId: source.id, path: [] })
  assert.deepEqual(item.invocation.stableKeyPath, ["__batRecordKey"])
  assert.equal(item.invocation.maxItems, 5)
  assert.equal(item.outputContract.schema.type, "object")
  assert.equal(plan.outputContract.schema.type, "array")
  assert.equal(plan.steps.length, 2)
})

test("用户文本列表能直接逐项操作，无需先生成浏览器来源步骤", () => {
  const plan = projectPreparationPlan(requirement(step(1, "逐个查找输入内容", "任务输入.查询词", "逐项执行"),
    "- 交付：完成状态", "- 查询词（文本列表）：每次运行提供的查询词"), 1)
  assert.equal(plan.steps.length, 1)
  assert.deepEqual(plan.steps[0]!.inputContract.schema, { type: "string" })
  assert.deepEqual(plan.steps[0]!.invocation.mode === "each" && plan.steps[0]!.invocation.collection,
    { source: "input", path: ["查询词"] })
})

test("不存在输入、非集合逐项及前向引用在浏览器启动前被拒绝", () => {
  assert.throws(() => projectPreparationPlan(requirement(step(1, "处理", "任务输入.不存在")), 1), /input_path_missing/)
  assert.throws(() => projectPreparationPlan(requirement(step(1, "处理", "任务输入", "逐项执行")), 1), /collection_required/)
  assert.throws(() => parseBusinessSteps(`## 任务步骤\n${step(1, "处理", "步骤 2 的结果")}`), /input_reference_invalid/)
})

test("文本输入采集入口集合保留实际输入，入口只含宿主身份", () => {
  const plan = projectPreparationPlan(requirement(step(1, "查找实际入口", "任务输入.查询词", "一次执行", "入口集合"),
    "- 交付：完成状态", "- 查询词（文本）：本次搜索文字"), 1)
  const source = plan.steps[0]!
  assert.deepEqual(source.inputContract.schema, { type: "string" })
  assert.equal(source.outputContract.schema.type, "array")
  if (source.outputContract.schema.type !== "array" || source.outputContract.schema.items.type !== "object") throw Error("entry_array_required")
  assert.deepEqual(Object.keys(source.outputContract.schema.items.properties).sort(), ["__batRecordEntry", "__batRecordKey"])
})

test("最终最多五条不会限制前置逐项检查输入的数量", () => {
  const plan = projectPreparationPlan(requirement([
    step(1, "检查全部输入", "任务输入.查询词", "逐项执行"), step(2, "整理结果", "任务输入", "一次执行", "最终结果")].join("\n\n"),
    "- 交付：数据结果\n- 结果形状：记录列表\n- 结果数量：最多 5 条\n- 字段：摘要（文本）：已确认摘要", "- 查询词（文本列表）：全部输入"), 1)
  assert.equal(plan.steps[0]!.invocation.mode === "each" && plan.steps[0]!.invocation.maxItems, 10_000)
})
