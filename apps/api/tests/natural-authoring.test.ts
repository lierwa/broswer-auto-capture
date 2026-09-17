import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { digestJson } from "@browser-capture/runtime"
import { extractionFixture } from "../../../packages/contracts/tests/task-chain-fixtures.js"
import { createApplication } from "../src/app.js"
import { hybridAuthorSourceSchema } from "../src/upstream-browser/hybrid-protocol.js"
import { browserUseTask, naturalRequirementText } from "../src/upstream-browser/task-request.js"
import type { UpstreamBrowserRuntime } from "../src/upstream-browser/service.js"
import { confirmedDraft, preexecutionModel, waitFor } from "./task-chain-test-support.js"
import { projectRoot } from "./helpers.js"

test("普通已确认 Markdown 从正式 HTTP 入口到达自然语言 upstream source", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-natural-authoring-"))
  let captured: ReturnType<typeof hybridAuthorSourceSchema.parse> | undefined
  const calls: string[] = []
  const upstream: UpstreamBrowserRuntime = { withSession: async () => { throw new Error("legacy_called") },
    withAuthoring: async (_input, work) => work({ author: async (source) => {
      captured = source; calls.push("upstream.author"); throw new Error("stop_after_natural_source")
    } }) }
  const forbidden = () => { calls.push("legacy_browser"); throw new Error("legacy_browser_called") }
  const application = await createApplication({ root: projectRoot, directory, aiModel: preexecutionModel([]),
    upstreamBrowserRuntime: upstream, browserExecutor: forbidden })
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    confirmedDraft(application.store, taskId)
    const requirement = application.taskChain.snapshot(taskId).requirement!
    let plan = structuredClone(extractionFixture.plan)
    plan.taskId = taskId
    plan.requirement = { id: requirement.id, version: requirement.version, revision: requirement.revision,
      digest: digestJson(requirement) }
    plan = application.taskChain.repository.savePlan(plan)
    const response = await application.app.inject({ method: "POST", url: `/api/task-chain?taskId=${taskId}`,
      headers: { host: "localhost:3001", "sec-fetch-site": "same-origin" }, payload: {
        type: "generate_chain", requestId: randomUUID(), plan: { id: plan.id, version: plan.version, digest: digestJson(plan) },
        stepId: "perform", input: { destination: "https://example.com/" },
      } })
    assert.equal(response.statusCode, 202, response.body)
    await waitFor(() => application.taskChain.repository.jobs(taskId)[0]?.status === "failed")
    assert.deepEqual(calls, ["upstream.author"])
    assert.ok(captured)
    const source: Record<string, unknown> = captured
    assert.equal(source.requirementText, requirement.definition.body)
    assert.equal(source.requirementDigest, digestJson(requirement))
    assert.equal(source.planDigest, digestJson(plan))
    assert.equal(Object.hasOwn(source, "authority"), false)
    assert.equal(Object.hasOwn(source, "branchChoices"), false)
    const task = String(source.task)
    assert.match(task, /需要人工确认后返回结构化结果/)
    assert.match(task, /输入\.destination：文本，必填/)
    assert.match(task, /结果\.title：文本，必填/)
    assert.match(task, /结果\.link：文本，必填/)
    assert.doesNotMatch(task, /bat-compilation|"operator"|"source"|"properties"/)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("未确认需求仍在模型和 upstream 前拒绝", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-natural-unconfirmed-")), calls: string[] = []
  const fail = () => { calls.push("external"); throw new Error("unexpected_external") }
  const base = preexecutionModel([])
  const application = await createApplication({ root: projectRoot, directory,
    aiModel: { ...base, prepare: fail, prepareMain: fail }, upstreamBrowserRuntime: { withSession: fail, withAuthoring: fail },
    browserExecutor: fail } as Parameters<typeof createApplication>[0])
  try {
    const taskId = application.coordinator.taskAction({ type: "create", requestId: randomUUID() })
    const response = await application.app.inject({ method: "POST", url: `/api/task-chain?taskId=${taskId}`,
      headers: { host: "localhost:3001", "sec-fetch-site": "same-origin" }, payload: {
        type: "author_task", requestId: randomUUID(), requirementVersion: 1, input: null,
      } })
    assert.equal(response.statusCode, 409, response.body)
    assert.deepEqual(calls, [])
    assert.equal(application.taskChain.repository.jobs(taskId).length, 0)
    assert.equal(application.taskChain.isActive(taskId), false)
  } finally { await application.app.close(); await rm(directory, { recursive: true, force: true }) }
})

test("历史机器块从自然任务正文中移除且不吞业务正文", () => {
  const requirement = structuredClone(extractionFixture.requirement)
  const plan = structuredClone(extractionFixture.plan)
  plan.steps[0]!.completion = [{ id: "nested", description: "嵌套条件保持完整", predicate: {
    operator: "equals", left: { source: "node", nodeId: "perform", path: ["policy"] },
    right: { source: "constant", value: { policy: { labels: ["第一项", "第二项"] } } } } }]
  requirement.definition.body = "# 业务任务\n\n先打开目标，再返回标题。\n\n```bat-compilation/v1\n{\"control\":{\"secret\":true}}\n```\n\n结果必须有标题。"
  const natural = naturalRequirementText(requirement)
  const task = browserUseTask({ requirement, plan,
    step: plan.steps[0]!, resolvedInput: { destination: "https://example.com/" } })
  assert.equal(natural.legacyMachineBlockRemoved, true)
  assert.match(task, /先打开目标，再返回标题/)
  assert.match(task, /结果必须有标题/)
  assert.match(task, /历史机器规则块已经排除/)
  assert.match(task, /policy 为对象（labels 为列表（第 1 项为“第一项”；第 2 项为“第二项”））/)
  assert.doesNotMatch(task, /\[object Object\]/)
  assert.doesNotMatch(task, /bat-compilation|control|secret/)
})
