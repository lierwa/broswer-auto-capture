import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { CommonContentUIProtocol } from "@agent-platform/ai-connect/ui-contracts"
import { createCommonChoiceQuestion, createCommonFreeFormQuestion } from "@agent-platform/ai-connect/integration/authoring/question"
import { currentDraft } from "@browser-capture/contracts/interview"
import { fixture, question, draft, authoredInterview, audit } from "./helpers.js"

test("每个请求先持久化再启动模型，重复请求不重复用户消息和调用", async () => fixture(async ({ coordinator, store, client, create }) => {
  const id = create(); let calls = 0
  client.runTurn = async function* () {
    calls++
    assert.equal(store.snapshot(id).messages[0]?.text, "  原文\n")
    yield authoredInterview({ assistantText: "已理解", question: null, draft })
  }
  const command = { type: "message" as const, requestId: randomUUID(), expectedRevision: 0, text: "  原文\n" }
  assert.equal(coordinator.dispatch(id, command).active, true)
  coordinator.dispatch(id, command)
  await coordinator.waitForIdle()
  coordinator.dispatch(id, command)
  assert.equal(calls, 1); assert.equal(store.snapshot(id).messages.length, 2)
  assert.throws(() => coordinator.dispatch(id, { ...command, text: "替换输入" }), /不同内容/)
  assert.equal(store.snapshot(id).turns[0]?.status, "succeeded")
}))
test("Main 以任务为 canonical session，accepted history 使用同一消息的原始事件且提交后才确认 Pi candidate", async () => fixture(async ({ coordinator, store, client, create, send, mainRuns }) => {
  const confirmed: Array<{ drafts: number; status: string | undefined }> = []
  const id = create()
  client.onConfirm = () => {
    const state = store.snapshot(id)
    confirmed.push({ drafts: state.drafts.length, status: state.turns.at(-1)?.status })
  }

  send(id, "第一轮目标"); await coordinator.waitForIdle()
  send(id, "第二轮补充"); await coordinator.waitForIdle()

  assert.deepEqual(mainRuns.map((run) => run.sessionId), [id, id])
  const history = mainRuns[1]!.messages as Array<{ role: string; content: Array<{ type: string; text: string }> }>
  assert.deepEqual(history.map((item) => item.role), ["user", "assistant", "user"])
  assert.match(history[1]!.content[0]!.text, /<authoring><interview-markdown/)
  assert.doesNotMatch(store.snapshot(id).messages[1]!.text, /authoring|interview-markdown/)
  assert.deepEqual(confirmed, [
    { drafts: 1, status: "succeeded" },
    { drafts: 2, status: "succeeded" },
  ])
}))
test("多任务输入/草稿/确认隔离，归档只读且可恢复", async () => fixture(async ({ coordinator, store, create, send, mainRuns }) => {
  const a = create(), b = create()
  send(a, "只要冰箱"); await coordinator.waitForIdle()
  coordinator.dispatch(a, { type: "confirm", requestId: randomUUID(), version: 1, expectedRevision: 1 })
  send(b, "只要电视"); await coordinator.waitForIdle()
  const secondHistory = JSON.stringify(mainRuns[1]!.messages)
  assert.doesNotMatch(secondHistory, /只要冰箱/); assert.match(secondHistory, /只要电视/)
  assert.equal(store.snapshot(a).confirmedVersion, 1); assert.equal(store.snapshot(b).confirmedVersion, null)
  coordinator.taskAction({ type: "archive", id: a, archived: true })
  assert.throws(() => send(a), /先恢复/)
  coordinator.taskAction({ type: "archive", id: a, archived: false })
  assert.equal(store.snapshot(a).drafts.length, 1)
}))
test("新输入立即使旧确认失效，历史版本只读且历史确认保留", async () => fixture(async ({ coordinator, store, create, send }) => {
  const id = create(); send(id); await coordinator.waitForIdle()
  coordinator.dispatch(id, { type: "confirm", requestId: randomUUID(), version: 1, expectedRevision: 1 })
  const accepted = send(id, "改为 30 条")
  assert.equal(accepted.confirmedVersion, null); assert.equal(currentDraft(accepted), undefined)
  assert.equal(accepted.decisions[0]?.kind, "draft_confirmation")
  await coordinator.waitForIdle()
  assert.throws(() => coordinator.dispatch(id, { type: "confirm", requestId: randomUUID(), version: 1, expectedRevision: 2 }), /最新草稿/)
  assert.equal(store.snapshot(id).drafts.length, 2)
}))
test("自由追问保留原文与问题上下文，不擅自转成建议决策；明确点击才记选项", async () => fixture(async ({ coordinator, store, client, create, send, mainRuns }) => {
  client.runTurn = async function* () { yield authoredInterview({ assistantText: "请确定范围", question, draft: null }) }
  const id = create(); send(id); await coordinator.waitForIdle()
  const firstRound = store.snapshot(id)
  assert.deepEqual(firstRound.messages.map((message) => [message.role, message.status]), [
    ["user", "complete"], ["assistant", "complete"],
  ], firstRound.turns[0]?.reason ?? undefined)
  send(id, "我不选这两个，为什么要限制？"); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).decisions.length, 0)
  const secondHistory = JSON.stringify(mainRuns[1]!.messages)
  assert.match(secondHistory, /为什么要限制/); assert.match(secondHistory, /前 100 条/)
  const state = store.snapshot(id), questionId = state.messages.at(-1)!.id
  coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: state.revision, text: "前 20 条", answer: { type: "choice", questionId, label: "前 20 条" } })
  await coordinator.waitForIdle()
  const answered = store.snapshot(id)
  assert.equal(answered.decisions[0]?.text, "前 20 条")
  assert.equal(answered.unresolved.find((item) => item.id === questionId)?.status, "answered")
  assert.throws(() => coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: 3, text: "前 20 条", answer: { type: "choice", questionId, label: "前 20 条" } }), /当前轮次/)
}))
test("Decision/Unresolved 随问题、明确选项和草稿确认投影，不把建议当已确认", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  let turn = 0
  client.runTurn = async function* () {
    turn += 1
    yield authoredInterview(turn === 1
      ? { assistantText: "需要确认评价范围。", question, draft: null }
      : { assistantText: "已形成草稿。", question: null, draft })
  }
  const id = create(); send(id); await coordinator.waitForIdle()
  const asked = store.snapshot(id), questionId = asked.unresolved[0]!.id
  assert.equal(asked.unresolved[0]?.status, "open")
  assert.equal(asked.decisions.length, 0)

  coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "前 20 条", answer: { type: "choice", questionId, label: "前 20 条" } })
  await coordinator.waitForIdle()
  const drafted = store.snapshot(id)
  assert.equal(drafted.unresolved[0]?.status, "answered")
  assert.deepEqual(drafted.decisions.map((item) => item.kind), ["option"])

  coordinator.dispatch(id, { type: "confirm", requestId: randomUUID(), expectedRevision: drafted.revision, version: 1 })
  const confirmed = store.snapshot(id)
  assert.equal(confirmed.confirmedVersion, 1)
  assert.deepEqual(confirmed.decisions.map((item) => item.kind), ["option", "draft_confirmation"])
  assert.equal(confirmed.unresolved[0]?.status, "resolved")
}))
test("公共 compound choice 在一次原子提交中保留选项、补充、Surface 与 identity", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  let turn = 0
  client.runTurn = async function* () {
    yield authoredInterview(++turn === 1
      ? { assistantText: "需要确认范围。", question, draft: null }
      : { assistantText: "已形成草稿。", question: null, draft })
  }
  const id = create(); send(id); await coordinator.waitForIdle()
  const asked = store.snapshot(id), questionId = asked.unresolved[0]!.id
  const surfaceSubmit = { answers: [{ questionId, data: {
    selectedOptionIds: ["1"], inputValues: { other: "只看公开在售商品" },
  } }], displayText: "前 20 条\n其他补充：只看公开在售商品" }
  assert.throws(() => coordinator.dispatch(id, {
    type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "前 20 条\n其他补充：只看公开在售商品",
    answer: { type: "common_question", questionId, surfaceSubmit: {
      ...surfaceSubmit, answers: [{ questionId, data: { selectedOptionIds: ["stale"], inputValues: { other: "不能绕过" } } }],
    } },
  }), /提交内容/)
  assert.equal(store.snapshot(id).messages.length, asked.messages.length)

  const accepted = coordinator.dispatch(id, {
    type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "前 20 条\n其他补充：只看公开在售商品",
    answer: { type: "common_question", questionId, surfaceSubmit },
  })
  const reply = accepted.messages.at(-2)?.interactionReply
  assert.equal(reply?.surfaceId, questionId)
  assert.deepEqual(reply?.surfaceSubmit, surfaceSubmit)
  assert.deepEqual(reply?.surface.questions[0], asked.unresolved[0]?.question)
  assert.equal(accepted.decisions.at(-1)?.text, "前 20 条\n其他补充：只看公开在售商品")
  assert.equal(accepted.unresolved[0]?.answerMessageId, accepted.messages.at(-2)?.id)
  await coordinator.waitForIdle()
}))
test("公共 multi_choice 使用同一提交、决策和持久化边界", async () => fixture(async ({ coordinator, store, create }) => {
  const id = create()
  const questionId = "question-multi"
  const multi = createCommonChoiceQuestion({ id: questionId, type: "multi_choice", stem: "选择字段", options: [
    { id: "name", label: "名称" }, { id: "price", label: "价格" }, { id: "image", label: "图片" },
  ] })
  store.mutate(id, (state) => {
    state.revision = 1
    state.messages.push({ id: questionId, role: "assistant", text: "请选择。", status: "complete",
      question: multi, draftVersion: null, aiEvents: [] })
    state.unresolved.push({ id: questionId, revision: 1, question: multi, status: "open", answerMessageId: null })
  })
  const surfaceSubmit = { answers: [{ questionId, data: {
    selectedOptionIds: ["name", "price"],
  } }], displayText: "名称\n价格" }
  const accepted = coordinator.dispatch(id, {
    type: "message", requestId: randomUUID(), expectedRevision: 1, text: surfaceSubmit.displayText,
    answer: { type: "common_question", questionId, surfaceSubmit },
  })
  assert.equal(accepted.decisions.at(-1)?.kind, "option")
  assert.equal(accepted.decisions.at(-1)?.text, surfaceSubmit.displayText)
  assert.deepEqual(accepted.messages.at(-2)?.interactionReply?.surfaceSubmit, surfaceSubmit)
  assert.deepEqual(accepted.unresolved[0]?.question, multi)
  await coordinator.waitForIdle()
}))
test("既有开放题 typed reply 绑定 identity/revision 并持久化不可变回答历史", async () => fixture(async ({ coordinator, store, client, create }) => {
  const id = create(), questionId = "question-free"
  const openQuestion = createCommonFreeFormQuestion({ id: questionId, stem: "你希望采集哪个品牌？" })
  store.mutate(id, (state) => {
    state.revision = 1
    state.messages.push({ id: questionId, role: "assistant", text: "请提供品牌。", status: "complete",
      question: openQuestion, draftVersion: null, aiEvents: [] })
    state.unresolved.push({ id: questionId, revision: 1, question: openQuestion, status: "open", answerMessageId: null })
  })
  client.runTurn = async function* () { yield authoredInterview({ assistantText: "已形成草稿。", question: null, draft }) }
  const asked = store.snapshot(id)
  assert.equal(asked.unresolved[0]?.status, "open")
  assert.throws(() => coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "海尔", answer: { type: "free_text", questionId: "stale-question", text: "海尔" } }), /当前轮次/)
  assert.throws(() => coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "海尔", answer: { type: "free_text", questionId, text: "美的" } }), /提交内容/)

  const accepted = coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "海尔", answer: { type: "free_text", questionId, text: "海尔" } })
  assert.equal(accepted.unresolved[0]?.status, "answered")
  assert.equal(accepted.unresolved[0]?.answerMessageId, accepted.messages.at(-2)?.id)
  assert.deepEqual(accepted.decisions.map(({ kind, text, questionId: owner }) => ({ kind, text, owner })), [
    { kind: "free_text", text: "海尔", owner: questionId },
  ])
  await coordinator.waitForIdle()
  const completed = store.snapshot(id)
  assert.equal(completed.unresolved[0]?.status, "answered")
  assert.equal(completed.decisions[0]?.messageId, completed.messages.at(-2)?.id)
  assert.equal(completed.drafts.length, 1)
}))
test("未注册的开放题 authoring 输出不能提交为正式 waitpoint", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  const openQuestion = { prompt: "请提供要采集的品牌名称。", options: [] }
  client.runTurn = async function* () {
    yield authoredInterview({ assistantText: "", question: openQuestion, draft: null })
  }
  const id = create(); send(id); await coordinator.waitForIdle()
  const state = store.snapshot(id)
  assert.equal(state.turns[0]?.status, "failed")
  assert.equal(state.unresolved.length, 0)
}))
test("既有开放题答复后的模型失败保留 canonical history，retry 不重复用户消息", async () => fixture(async ({ coordinator, store, client, create }) => {
  let turn = 0
  const questionId = "question-free"
  const openQuestion = createCommonFreeFormQuestion({ id: questionId, stem: "你希望采集哪个品牌？" })
  client.runTurn = async function* () {
    turn += 1
    if (turn === 1) throw new Error("fixture_downstream_failure")
    yield authoredInterview({ assistantText: "已形成草稿。", question: null, draft })
  }
  const id = create()
  store.mutate(id, (state) => {
    state.revision = 1
    state.messages.push({ id: questionId, role: "assistant", text: "请提供品牌。", status: "complete",
      question: openQuestion, draftVersion: null, aiEvents: [] })
    state.unresolved.push({ id: questionId, revision: 1, question: openQuestion, status: "open", answerMessageId: null })
  })
  const asked = store.snapshot(id)
  coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "海尔", answer: { type: "free_text", questionId, text: "海尔" } })
  await coordinator.waitForIdle()
  const failed = store.snapshot(id)
  assert.equal(failed.messages.at(-1)?.status, "failed")
  assert.equal(failed.unresolved[0]?.status, "answered")
  assert.deepEqual(failed.decisions.map((item) => item.kind), ["free_text"])
  assert.equal(failed.messages.filter((message) => message.role === "user").length, 1)

  coordinator.dispatch(id, { type: "retry", requestId: randomUUID(), expectedRevision: failed.revision })
  await coordinator.waitForIdle()
  const retried = store.snapshot(id)
  assert.equal(retried.messages.filter((message) => message.role === "user").length, 1)
  assert.deepEqual(retried.decisions.map((item) => item.kind), ["free_text"])
  assert.equal(retried.drafts.length, 1)
}))
test("authoring 流只增长安全正文，闭合题块保持非权威候选，终态成功才开放回答", async () => fixture(async ({ coordinator, store, client, create, send, gate }) => {
  const previewed = gate(), finish = gate()
  client.runTurn = async function* () {
    const output = authoredInterview({ assistantText: "先明确范围。", question, draft: null })
    assert.equal(output.type, "turn_succeeded")
    if (output.type !== "turn_succeeded") return
    const boundary = output.outputText.indexOf("<authoring>")
    yield { type: "text_delta", delta: output.outputText.slice(0, boundary) }
    yield { type: "text_delta", delta: output.outputText.slice(boundary) }
    previewed.resolve(); await finish.promise
    yield output
  }
  const id = create(); send(id); await previewed.promise
  const live = store.snapshot(id)
  assert.equal(live.active, true)
  assert.equal(live.messages.at(-1)?.text.trim(), "先明确范围。")
  const projected = live.messages.at(-1)?.question
  assert.equal(projected && "type" in projected ? projected.type : null, "choice")
  assert.equal(live.unresolved.length, 0)
  assert.doesNotMatch(live.messages.at(-1)?.text ?? "", /authoring|question-panel/)
  finish.resolve(); await coordinator.waitForIdle()
  const completed = store.snapshot(id)
  assert.equal(completed.unresolved[0]?.id, completed.messages.at(-1)?.id)
  assert.equal(completed.unresolved[0]?.status, "open")
}))
test("断开观察不会停止执行；重新观察收到提交后的单调序号和最终草稿", async () => fixture(async ({ coordinator, store, client, create, send, gate }) => {
  const ready = gate(), release = gate()
  client.runTurn = async function* () { ready.resolve(); await release.promise; yield authoredInterview({ assistantText: "已完成", question: null, draft }) }
  const id = create(), state = send(id)
  const observer = coordinator.observe(id, -1, new AbortController().signal)
  assert.equal((await observer.next()).value?.state.activeTurnId, state.activeTurnId)
  await observer.return(undefined); await ready.promise
  assert.equal(store.snapshot(id).active, true)
  release.resolve(); await coordinator.waitForIdle()
  const reconnect = coordinator.observe(id, state.sequence, new AbortController().signal)
  const final = await reconnect.next()
  assert.equal(final.value?.state.active, false)
  assert.ok(final.value!.state.sequence > state.sequence)
  assert.equal(final.value?.state.drafts.length, 1)
  await reconnect.return(undefined)
}))
test("取消绑定具体轮次，迟到成功仅保留审计不提交草稿，旧取消不影响下一轮", async () => fixture(async ({ coordinator, store, client, create, send, gate }) => {
  const ready = gate(), release = gate()
  client.runTurn = async function* () { ready.resolve(); await release.promise; yield authoredInterview({ assistantText: "迟到", question: null, draft }) }
  const id = create(), first = send(id); await ready.promise
  coordinator.dispatch(id, { type: "cancel", turnId: first.activeTurnId! })
  assert.equal(store.snapshot(id).cancellationRequested, true)
  release.resolve(); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0); assert.equal(store.snapshot(id).audits.length, 0)
  assert.equal(store.snapshot(id).turns[0]?.status, "cancelled")
  const next = send(id)
  assert.throws(() => coordinator.dispatch(id, { type: "cancel", turnId: first.activeTurnId! }), /过期/)
  assert.equal(store.snapshot(id).activeTurnId, next.activeTurnId)
}))
test("共享调用收到取消信号后不提交草稿，持久化 cancelling 优先", async () => fixture(async ({ coordinator, store, client, create, send, gate }) => {
  const started = gate()
  client.runTurn = async function* (_prompt, _schema, signal) {
    started.resolve()
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
    yield authoredInterview({ assistantText: "迟到结果", question: null, draft })
  }
  const id = create(), active = send(id)
  await started.promise
  coordinator.dispatch(id, { type: "cancel", turnId: active.activeTurnId! })
  await coordinator.waitForIdle()
  const cancelled = store.snapshot(id)
  assert.equal(cancelled.turns[0]?.status, "cancelled")
  assert.equal(cancelled.drafts.length, 0)
  assert.equal(cancelled.messages.filter((message) => message.role === "assistant")[0]?.status, "cancelled")
}))
test("取消期间保持执行互斥，不能误取消其他任务或归档活动任务", async () => fixture(async ({ coordinator, client, create, send, gate }) => {
  const release = gate()
  client.runTurn = async function* () { await release.promise; yield { type: "interrupted", audit } }
  const a = create(), b = create(), first = send(a)
  assert.throws(() => send(b), /另一轮/)
  assert.throws(() => coordinator.dispatch(b, { type: "cancel", turnId: first.activeTurnId! }), /过期/)
  assert.throws(() => coordinator.taskAction({ type: "archive", id: a, archived: true }), /先停止/)
  coordinator.dispatch(a, { type: "cancel", turnId: first.activeTurnId! })
  assert.throws(() => send(b), /另一轮/)
  release.resolve(); await coordinator.waitForIdle()
  send(b); await coordinator.waitForIdle()
}))
test("供应商协议块不进入消息；校验失败/成功后异常均不提交草稿和确认 candidate", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  const id = create()
  let confirmations = 0
  client.onConfirm = () => { confirmations++ }
  client.runTurn = async function* () {
    const output = authoredInterview({ assistantText: "结果", question, draft })
    assert.equal(output.type, "turn_succeeded")
    if (output.type !== "turn_succeeded") return
    const middle = output.outputText.indexOf("<authoring>") + 6
    yield { type: "text_delta", delta: output.outputText.slice(0, middle) }
    yield { type: "text_delta", delta: output.outputText.slice(middle) }
    yield output
  }
  send(id); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0)
  assert.equal(store.snapshot(id).audits.length, 1)
  assert.doesNotMatch(store.snapshot(id).messages.at(-1)!.text, /authoring|interview-result|question-panel/)
  assert.equal(confirmations, 0)
  client.runTurn = async function* () { yield authoredInterview({ assistantText: "提前成功", question: null, draft }); throw new Error("private-provider-path") }
  coordinator.dispatch(id, { type: "retry", requestId: randomUUID(), expectedRevision: 1 }); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0)
  assert.equal(store.snapshot(id).audits.length, 1)
  assert.equal(store.snapshot(id).messages.filter((message) => message.role === "user").length, 1)
  assert.doesNotMatch(store.snapshot(id).messages.at(-1)!.text, /private-provider-path/)
  assert.equal(confirmations, 0)
}))

test("未知 UI capability 在任何访谈副作用前拒绝", async () => fixture(async ({ coordinator, store, create }) => {
  const id = create(), before = store.snapshot(id)
  const invalid = [
    { schemaVersion: 1 as const, packages: [{ id: "unknown.content", version: 1 }] },
    { schemaVersion: 1 as const, packages: [{ ...CommonContentUIProtocol, version: CommonContentUIProtocol.version + 1 }] },
    { schemaVersion: 1 as const, packages: [CommonContentUIProtocol, CommonContentUIProtocol] },
  ]
  for (const ui of invalid) {
    assert.throws(() => coordinator.dispatch(id, {
      type: "message", requestId: randomUUID(), expectedRevision: 0, text: "整理范围", ui,
    }))
    assert.deepEqual(store.snapshot(id), before)
  }
}))

test("Content Card 终态成功后才按作者化顺序持久化，历史快照保持 stable identity", async () => fixture(async ({ coordinator, store, client, create, gate }) => {
  const previewed = gate(), finish = gate()
  const ui = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const text = [
    "前文",
    '<authoring><content-callout variant="highlight" label="范围">关键范围</content-callout></authoring>',
    "后文",
    `<authoring><interview-markdown title="${draft.title}">${draft.markdown}</interview-markdown></authoring>`,
  ].join("")
  client.runTurn = async function* (prompt) {
    assert.match(prompt, /content-callout/)
    yield { type: "text_delta", delta: text }
    previewed.resolve(); await finish.promise
    yield { type: "turn_succeeded", outputText: text }
  }
  const id = create()
  const active = coordinator.dispatch(id, {
    type: "message", requestId: randomUUID(), expectedRevision: 0, text: "整理范围", ui,
  })
  await previewed.promise
  const live = store.snapshot(id)
  assert.equal(live.active, true)
  assert.equal(live.messages.at(-1)?.text, "前文后文")
  assert.equal(live.messages.at(-1)?.parts, undefined)
  finish.resolve(); await coordinator.waitForIdle()

  const completed = store.snapshot(id), message = completed.messages.at(-1)!
  assert.equal(message.status, "complete")
  assert.deepEqual(message.parts?.map((part) => part.type), ["text", "card", "text"])
  assert.deepEqual(message.parts?.flatMap((part) => part.type === "text" ? [part.text] : []), ["前文", "后文"])
  const card = message.parts?.find((part) => part.type === "card")
  assert.equal(card?.type === "card" ? card.card.type : undefined, "content.callout")
  assert.match(card?.id ?? "", new RegExp(`^content:${active.activeTurnId}:`))
  assert.deepEqual(store.snapshot(id).messages.at(-1)?.parts, message.parts)
}))

test("格式化 authoring 的 Card 两侧空白不阻止草稿和审计提交", async () => fixture(async ({ coordinator, store, client, create }) => {
  const ui = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const text = [
    "已按默认口径整理草稿。",
    "",
    "<authoring>",
    '<content-callout variant="highlight" label="范围">保留来源关联和覆盖缺口。</content-callout>',
    "</authoring>",
    "",
    "<authoring>",
    `<interview-markdown title="${draft.title}">${draft.markdown}</interview-markdown>`,
    "</authoring>",
  ].join("\n")
  client.runTurn = async function* () {
    yield { type: "text_delta", delta: text }
    yield { type: "turn_succeeded", outputText: text }
  }

  const id = create()
  coordinator.dispatch(id, {
    type: "message", requestId: randomUUID(), expectedRevision: 0, text: "整理范围", ui,
  })
  await coordinator.waitForIdle()

  const completed = store.snapshot(id), message = completed.messages.at(-1)!
  assert.equal(completed.turns[0]?.status, "succeeded")
  assert.equal(completed.drafts.length, 1)
  assert.equal(completed.audits.length, 1)
  assert.equal(message.text, "已按默认口径整理草稿。")
  assert.deepEqual(message.parts?.map((part) => part.type), ["text", "card"])
  assert.equal(message.parts?.[0]?.type === "text" ? message.parts[0].text : null, message.text)
}))

test("未闭合 Markdown 草稿拒绝提交，合法通用格式保持可提交", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  const malformed = `<authoring><interview-markdown title="${draft.title}">${draft.markdown}`
  client.runTurn = async function* () { yield { type: "turn_succeeded", outputText: malformed } }
  const rejectedId = create(); send(rejectedId, "整理浏览器任务"); await coordinator.waitForIdle()
  const rejected = store.snapshot(rejectedId)
  assert.equal(rejected.turns[0]?.status, "failed")
  assert.equal(rejected.drafts.length, 0)
  assert.equal(rejected.audits.length, 1)

  const valid = `已整理任务草稿。\n\n<authoring><interview-markdown title="${draft.title}">${draft.markdown}</interview-markdown></authoring>`
  client.runTurn = async function* () { yield { type: "turn_succeeded", outputText: valid } }
  const acceptedId = create(); send(acceptedId, "整理浏览器任务"); await coordinator.waitForIdle()
  const accepted = store.snapshot(acceptedId)
  assert.equal(accepted.turns[0]?.status, "succeeded")
  assert.equal(accepted.drafts[0]?.markdown, draft.markdown)
  assert.equal(accepted.audits.length, 1)
}))

test("坏 Content 只降为安全正文且不越过 BAC 终态门；未注册 UI 不接受 Card", async () => fixture(async ({ coordinator, store, client, create }) => {
  const ui = { schemaVersion: 1 as const, packages: [CommonContentUIProtocol] }
  const invalid = [
    '<authoring><content-callout variant="highlight" title="invalid">安全提示</content-callout></authoring>',
    `<authoring><interview-markdown title="${draft.title}">${draft.markdown}</interview-markdown></authoring>`,
  ].join("")
  client.runTurn = async function* () { yield { type: "turn_succeeded", outputText: invalid } }
  const first = create()
  coordinator.dispatch(first, {
    type: "message", requestId: randomUUID(), expectedRevision: 0, text: "整理范围", ui,
  })
  await coordinator.waitForIdle()
  const rejected = store.snapshot(first), rejectedMessage = rejected.messages.at(-1)!
  assert.equal(rejectedMessage.status, "failed")
  assert.equal(rejected.drafts.length, 0)
  assert.equal(rejectedMessage.parts, undefined)
  assert.match(rejectedMessage.text, /安全提示/)
  assert.doesNotMatch(rejectedMessage.text, /authoring|content-callout|interview-markdown/)

  const unregistered = [
    '<authoring><content-callout variant="highlight">未注册展示</content-callout></authoring>',
    `<authoring><interview-markdown title="${draft.title}">${draft.markdown}</interview-markdown></authoring>`,
  ].join("")
  client.runTurn = async function* (prompt) {
    assert.doesNotMatch(prompt, /content-callout/)
    yield { type: "turn_succeeded", outputText: unregistered }
  }
  const second = create()
  coordinator.dispatch(second, {
    type: "message", requestId: randomUUID(), expectedRevision: 0, text: "整理范围",
  })
  await coordinator.waitForIdle()
  const unsupported = store.snapshot(second), unsupportedMessage = unsupported.messages.at(-1)!
  assert.equal(unsupportedMessage.status, "failed")
  assert.equal(unsupported.drafts.length, 0)
  assert.equal(unsupportedMessage.parts, undefined)
  assert.doesNotMatch(unsupportedMessage.text, /authoring|content-callout|interview-markdown/)
}))
