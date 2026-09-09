import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { confirmedRequirement, renderRequirementBrief } from "@browser-capture/contracts/interview"
import { fixture, draft, authoredInterview } from "./helpers.js"
import { outputSchema } from "../src/interview/protocol.js"

test("领域候选 Schema 保留本地必填交接约束且不扩散 provider format", () => {
  const schema = outputSchema()
  assert.doesNotMatch(JSON.stringify(schema), /"format":"uri"/)
  const parsed = JSON.parse(JSON.stringify(schema))
  const branch = parsed.properties.draft.anyOf.find((item: { type: string }) => item.type === "object")
  assert.ok(branch.required.includes("brief"))
  assert.ok(branch.properties.brief.required.includes("discoveryTasks"))
})

test("负责人取舍输出保留三项比较与唯一推荐，并保留用户原文", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  client.runTurn = async function* (prompt) {
    assert.match(prompt, /所需数据实体\/字段、覆盖与数量\/终止要求足以判定结果/)
    assert.equal(prompt.match(/所需数据实体\/字段、覆盖与数量\/终止要求足以判定结果/g)?.length, 1)
    assert.match(prompt, /question-panel/)
    assert.match(prompt, /interview-result JSON Schema/)
    assert.match(prompt, /我想抓微波炉的数据/)
    yield authoredInterview({
      assistantText: "先明确这批数据的主要用途，才能确定字段与覆盖要求。",
      question: { prompt: "这批微波炉数据优先支持哪类交付？", options: [
        { label: "选品对比", description: "优先明确可比较字段，能较快形成结构化结果，但不会覆盖内容运营素材", recommended: true },
        { label: "内容整理", description: "优先保留完整介绍与素材线索，但字段横向一致性较弱", recommended: false },
        { label: "数据归档", description: "优先覆盖和留存公开事实，但前期核验范围更大", recommended: false },
      ] },
      draft: null,
    })
  }
  const id = create(); send(id, "我想抓微波炉的数据"); await coordinator.waitForIdle()
  const state = store.snapshot(id)
  assert.equal(state.turns[0]?.status, "succeeded")
  assert.equal(state.drafts.length, 0)
  assert.equal(state.unresolved.length, 1)
  assert.equal(state.unresolved[0]?.question.options.length, 3)
  assert.equal(state.unresolved[0]?.question.options.filter((option) => option.recommended).length, 1)
}))

test("信息完整时首轮草稿仍需用户确认才能交接", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  client.runTurn = async function* () { yield authoredInterview({ assistantText: "需求信息已足够。", question: null, draft }) }
  const id = create()
  send(id, "采集公开在售商品的链接、参数和每商品前20条评价；覆盖目标范围全部商品，不足时记录实际数量和缺口。")
  await coordinator.waitForIdle()
  let state = store.snapshot(id)
  assert.equal(state.messages.at(-1)?.question, null)
  assert.equal(state.drafts.length, 1)
  assert.equal(confirmedRequirement(id, state), null)
  coordinator.dispatch(id, { type: "confirm", requestId: randomUUID(), expectedRevision: state.revision, version: 1 })
  state = store.snapshot(id)
  assert.equal(confirmedRequirement(id, state)?.draftVersion, 1)
}))

test("当前账号不可用所选模型时保留明确行动提示且不提交草稿", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  client.runTurn = async function* () { throw new Error("model_account_model_unavailable") }
  const id = create(); send(id, "采集公开商品数据"); await coordinator.waitForIdle()
  const state = store.snapshot(id)
  assert.equal(state.turns.at(-1)?.status, "failed")
  assert.equal(state.turns.at(-1)?.reason, "当前账号不支持所选模型，请选择其他可用模型。")
  assert.match(state.messages.at(-1)?.text ?? "", /当前账号不支持所选模型/)
  const failureEvent = state.messages.at(-1)?.aiEvents.at(-1)
  assert.ok(failureEvent?.type === "generation.failed")
  assert.equal(failureEvent.code, "model_account_model_unavailable")
  assert.equal(state.drafts.length, 0)
}))

test("开放问题可自然回复，最新已确认需求按 task/version/revision 交给后续阶段", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  let count = 0
  client.runTurn = async function* () {
    yield authoredInterview(++count === 1 ? { assistantText: "我会根据品牌查找官方来源。", question: { prompt: "你希望采集哪个品牌？", options: [] }, draft: null }
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
  client.runTurn = async function* () { yield authoredInterview({ assistantText: "已完成", question: null, draft: { title: "缺失结构", markdown: "# 猜测计划" } }) }
  send(id); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0)
  assert.equal(store.snapshot(id).turns.at(-1)?.status, "failed")
  client.runTurn = async function* () { yield authoredInterview({ assistantText: "已完成", question: null,
    draft: { ...draft, brief: { ...draft.brief, sourceStrategy: { mode: "provided", scope: "用户指定店铺", providedUrls: ["https://example.com/invented"] } } } }) }
  send(id, "没有具体链接，请自动发现"); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0)
  assert.equal(store.snapshot(id).audits.length, 2)
}))
