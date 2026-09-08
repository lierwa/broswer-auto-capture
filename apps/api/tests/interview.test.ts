import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { currentDraft } from "@browser-capture/contracts/interview"
import { fixture, question, draft, succeeded, audit } from "./helpers.js"

test("每个请求先持久化再启动模型，重复请求不重复用户消息和调用", async () => fixture(async ({ coordinator, store, client, create }) => {
  const id = create(); let calls = 0
  client.runTurn = async function* () {
    calls++
    assert.equal(store.snapshot(id).messages[0]?.text, "  原文\n")
    yield succeeded({ assistantText: "已理解", question: null, draft })
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
test("多任务输入/草稿/确认隔离，归档只读且可恢复", async () => fixture(async ({ coordinator, store, create, send, prompts }) => {
  const a = create(), b = create()
  send(a, "只要冰箱"); await coordinator.waitForIdle()
  coordinator.dispatch(a, { type: "confirm", requestId: randomUUID(), version: 1, expectedRevision: 1 })
  send(b, "只要电视"); await coordinator.waitForIdle()
  assert.doesNotMatch(prompts[1]!, /只要冰箱/); assert.match(prompts[1]!, /只要电视/)
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
test("自由追问保留原文与问题上下文，不擅自转成建议决策；明确点击才记选项", async () => fixture(async ({ coordinator, store, client, create, send, prompts }) => {
  client.runTurn = async function* (prompt) { prompts.push(prompt); yield succeeded({ assistantText: "请确定范围", question, draft: null }) }
  const id = create(); send(id); await coordinator.waitForIdle()
  send(id, "我不选这两个，为什么要限制？"); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).decisions.length, 0)
  assert.match(prompts[1]!, /为什么要限制/); assert.match(prompts[1]!, /前 100 条/)
  const state = store.snapshot(id), questionId = state.messages.at(-1)!.id
  coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: state.revision, text: "前 20 条", answer: { questionId, label: "前 20 条" } })
  await coordinator.waitForIdle()
  const answered = store.snapshot(id)
  assert.equal(answered.decisions[0]?.text, "前 20 条")
  assert.equal(answered.unresolved.find((item) => item.id === questionId)?.status, "answered")
  assert.throws(() => coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: 3, text: "前 20 条", answer: { questionId, label: "前 20 条" } }), /当前轮次/)
}))
test("Decision/Unresolved 随问题、明确选项和草稿确认投影，不把建议当已确认", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  let turn = 0
  client.runTurn = async function* () {
    turn += 1
    yield succeeded(turn === 1
      ? { assistantText: "需要确认评价范围。", question, draft: null }
      : { assistantText: "已形成草稿。", question: null, draft })
  }
  const id = create(); send(id); await coordinator.waitForIdle()
  const asked = store.snapshot(id), questionId = asked.unresolved[0]!.id
  assert.equal(asked.unresolved[0]?.status, "open")
  assert.equal(asked.decisions.length, 0)

  coordinator.dispatch(id, { type: "message", requestId: randomUUID(), expectedRevision: asked.revision,
    text: "前 20 条", answer: { questionId, label: "前 20 条" } })
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
test("断开观察不会停止执行；重新观察收到提交后的单调序号和最终草稿", async () => fixture(async ({ coordinator, store, client, create, send, gate }) => {
  const ready = gate(), release = gate()
  client.runTurn = async function* () { ready.resolve(); await release.promise; yield succeeded({ assistantText: "已完成", question: null, draft }) }
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
  client.runTurn = async function* () { ready.resolve(); await release.promise; yield succeeded({ assistantText: "迟到", question: null, draft }) }
  const id = create(), first = send(id); await ready.promise
  coordinator.dispatch(id, { type: "cancel", turnId: first.activeTurnId! })
  assert.equal(store.snapshot(id).cancellationRequested, true)
  release.resolve(); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0); assert.equal(store.snapshot(id).audits.length, 1)
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
    yield succeeded({ assistantText: "迟到结果", question: null, draft })
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
test("供应商协议块不进入消息；校验失败/成功后异常均不提交草稿", async () => fixture(async ({ coordinator, store, client, create, send }) => {
  const id = create()
  client.runTurn = async function* () {
    yield { type: "commentary_delta", delta: '{"assistantText": "机器协议"}' }
    yield succeeded({ assistantText: "结果", question, draft })
  }
  send(id); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0); assert.doesNotMatch(store.snapshot(id).messages.at(-1)!.text, /assistantText/)
  client.runTurn = async function* () { yield succeeded({ assistantText: "提前成功", question: null, draft }); throw new Error("private-provider-path") }
  coordinator.dispatch(id, { type: "retry", requestId: randomUUID(), expectedRevision: 1 }); await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).drafts.length, 0)
  assert.equal(store.snapshot(id).messages.filter((message) => message.role === "user").length, 1)
  assert.doesNotMatch(store.snapshot(id).messages.at(-1)!.text, /private-provider-path/)
}))
