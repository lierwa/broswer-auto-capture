import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { confirmedRequirement, renderRequirementBrief } from "@browser-capture/contracts/interview"
import { fixture, draft, succeeded } from "./helpers.js"
import { outputSchema } from "../src/interview/protocol.js"

test("结构输出使用供应商支持的格式，同时保留本地必填交接约束", () => {
  const schema = outputSchema()
  assert.doesNotMatch(JSON.stringify(schema), /"format":"uri"/)
  const parsed = JSON.parse(JSON.stringify(schema))
  const branch = parsed.properties.draft.anyOf.find((item: { type: string }) => item.type === "object")
  assert.ok(branch.required.includes("brief"))
  assert.ok(branch.properties.brief.required.includes("discoveryTasks"))
})

test("开放问题可自然回复，最新已确认需求按 task/version/revision 交给后续阶段", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  let count = 0
  client.runTurn = async function* () {
    yield succeeded(++count === 1 ? { assistantText: "我会根据品牌查找官方来源。", question: { prompt: "你希望采集哪个品牌？", options: [] }, draft: null }
      : { assistantText: "范围已明确。", question: null, draft })
  }
  const id = create(); send(id); await coordinator.waitForIdle()
  assert.deepEqual(store.snapshot(id).messages.at(-1)?.question?.options, [])
  send(id, "海尔，入口请系统查找"); await coordinator.waitForIdle()
  let state = store.snapshot(id)
  assert.equal(state.decisions.length, 0)
  assert.equal(confirmedRequirement(id, state), null)
  assert.deepEqual(state.drafts[0]?.brief, draft.brief)
  assert.equal(state.drafts[0]?.markdown, renderRequirementBrief(draft.brief))
  coordinator.dispatch(id, { type: "confirm", requestId: randomUUID(), expectedRevision: state.revision, version: 1 })
  state = store.snapshot(id)
  assert.deepEqual(confirmedRequirement(id, state), { taskId: id, draftVersion: 1, revision: 2, brief: draft.brief })
  send(id, "改为另一品牌")
  assert.equal(confirmedRequirement(id, store.snapshot(id)), null)
  await coordinator.waitForIdle()
}))

test("新模型返回缺失交接字段或猜造的已提供URL时不提交可确认草稿", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  const id = create()
  client.runTurn = async function* () { yield succeeded({ assistantText: "已完成", question: null, draft: { title: "缺失结构", markdown: "# 猜测计划" } }) }
  send(id); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0)
  assert.equal(store.snapshot(id).turns.at(-1)?.status, "failed")
  client.runTurn = async function* () { yield succeeded({ assistantText: "已完成", question: null,
    draft: { ...draft, brief: { ...draft.brief, sourceStrategy: { mode: "provided", scope: "用户指定店铺", providedUrls: ["https://example.com/invented"] } } } }) }
  send(id, "没有具体链接，请自动发现"); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0)
  assert.equal(store.snapshot(id).audits.length, 2)
}))
