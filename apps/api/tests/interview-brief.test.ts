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
  const capture = parsed.properties.draft
  assert.ok(capture.required.includes("brief"))
  assert.ok(capture.properties.brief.required.includes("discoveryTasks"))
  assert.equal(capture.properties.markdown, undefined)
})

test("负责人取舍输出保留三项比较与唯一推荐，并保留用户原文", async () => fixture(async ({ coordinator, store, client, create, send, mainRuns }) => {
  client.runTurn = async function* (prompt) {
    assert.match(prompt, /对候选疑问作反事实比较/)
    assert.equal(prompt.match(/对候选疑问作反事实比较/g)?.length, 1)
    assert.match(prompt, /question-panel mode="choice"/)
    assert.match(prompt, /interview-result JSON Schema/)
    assert.match(prompt, /每个 question 或 draft 前都先输出一条简短、自然的普通 assistantText/)
    assert.match(prompt, /mode="multi_choice"/)
    assert.doesNotMatch(prompt, /mode="free_form"/)
    assert.match(prompt, /无法枚举用户的具体答案时，仍围绕处理方向或结果影响构造真实选项/)
    assert.match(prompt, /同一必要输入持续未取得时，调整支架、降低表达粒度/)
    assert.match(prompt, /推荐前先核对可行前提/)
    assert.doesNotMatch(prompt, /需要用户填写具体名称或自由描述时，使用不含任何 `?question-option/)
    assert.match(prompt, /其他类别或混合任务使用 `interview-markdown`/)
    assert.match(prompt, /生成问题或草稿时，先用一条简短自然的普通文本承接已知意图或说明本轮产物的意义/)
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
  assert.match(JSON.stringify(mainRuns[0]?.messages), /我想抓微波炉的数据/)
  const state = store.snapshot(id)
  assert.equal(state.turns[0]?.status, "succeeded")
  assert.equal(state.drafts.length, 0)
  assert.equal(state.unresolved.length, 1)
  const projected = state.unresolved[0]?.question
  assert.equal(projected && "type" in projected ? projected.type : null, "choice")
  if (!projected || !("type" in projected) || projected.type !== "choice") throw new Error("choice expected")
  assert.equal(projected.data.options.length, 3)
  assert.equal(projected.data.options.filter((option) => option.recommended).length, 1)
}))

test("正式访谈只接受已注册的推荐单选题", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  client.runTurn = async function* () {
    yield authoredInterview({ assistantText: "请确认范围。", question: { prompt: "选择范围", options: [
      { label: "小范围", description: "较快交付", recommended: false },
      { label: "全范围", description: "覆盖完整", recommended: false },
    ] }, draft: null })
  }
  const id = create(); send(id); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).messages.at(-1)?.status, "failed")
  assert.equal(store.snapshot(id).turns.at(-1)?.reason, "生成的问题格式无效，结果未提交。请重试。")
  assert.equal(store.snapshot(id).audits.length, 1)
  assert.equal(store.snapshot(id).unresolved.length, 0)

  client.runTurn = async function* () {
    yield authoredInterview({ assistantText: "", question: { prompt: "请提供品牌", options: [] }, draft: null })
  }
  const open = create(); send(open); await coordinator.waitForIdle()
  assert.equal(store.snapshot(open).messages.at(-1)?.status, "failed")
  assert.equal(store.snapshot(open).unresolved.length, 0)
}))

test("通用任务草稿可确认保存但不进入数据采集交接", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  const markdown = "# 任务目标\n播放指定内容。\n\n# 可观察完成标准\n目标媒体处于用户指定播放位置。\n\n# 当前支持边界\n确认只保存需求，不授权浏览器操作。"
  client.runTurn = async function* () {
    yield authoredInterview({ assistantText: "需求已经足够形成草稿。", question: null,
      draft: { title: "媒体播放需求", markdown, brief: null },
    })
  }
  const id = create(); send(id, "播放最新一集并定位到180秒"); await coordinator.waitForIdle()
  let state = store.snapshot(id)
  assert.deepEqual(state.drafts[0], { title: "媒体播放需求", markdown, brief: null, version: 1, revision: 1 })
  assert.equal(confirmedRequirement(id, state), null)
  coordinator.dispatch(id, { type: "confirm", requestId: randomUUID(), expectedRevision: state.revision, version: 1 })
  state = store.snapshot(id)
  assert.equal(state.confirmedVersion, 1)
  assert.equal(confirmedRequirement(id, state), null)
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

test("用户可不点击当前选项而自然补充，最新已确认需求按 task/version/revision 交给后续阶段", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  let count = 0
  client.runTurn = async function* () {
    yield authoredInterview(++count === 1 ? { assistantText: "先确认来源范围。", question: { prompt: "采用哪种来源范围？", options: [
      { label: "官方来源", description: "优先查找官方公开入口", recommended: true },
      { label: "指定来源", description: "只使用用户明确提供的入口", recommended: false },
    ] }, draft: null }
      : { assistantText: "范围已明确。", question: null, draft })
  }
  const id = create(); send(id); await coordinator.waitForIdle()
  const projected = store.snapshot(id).messages.at(-1)?.question
  assert.equal(projected && "type" in projected ? projected.type : null, "choice")
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
