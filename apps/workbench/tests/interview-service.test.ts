import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { InterviewService } from "../server/interviewService.js"
import { currentDraft, interviewOutputSchema } from "../src/interviewContract.js"
import { turnStartParams } from "../../../packages/model-runtime/src/turn-events.js"
import type { CodexAppServerClient, CodexRunEvent } from "../../../packages/model-runtime/src/client.js"

const question = { prompt: "每个商品需要多少评价？", options: [{ label: "前 20 条", description: "范围小", recommended: true }, { label: "前 100 条", description: "样本更广", recommended: false }] }
const draft = { title: "店铺商品与评价", markdown: "# 目标\n店内冰箱与每商品前 20 条评价。\n# 待调查\n真实入口、可访问字段与翻页方式。" }
const result = (value: unknown): CodexRunEvent => ({ type: "turn_succeeded", outputText: JSON.stringify(value), threadId: "thread", turnId: "turn", audit: { invocationCount: 1, requestedModel: "gpt-5.6-terra", requestedEffort: "medium", reportedModel: "gpt-5.6-terra", reportedEffort: "medium" } })

async function fixture(run: (service: InterviewService, client: CodexAppServerClient, prompts: string[], storage: string) => Promise<void>) {
  const storage = await mkdtemp(path.join(tmpdir(), "browser-interview-test-"))
  const prompts: string[] = []
  const client: CodexAppServerClient = { readAccount: async () => ({ loggedIn: true, type: "chatgpt" }), close: async () => {},
    async *runTurn(prompt) { prompts.push(prompt); yield result({ assistantText: "已根据你的回答整理范围。", question: null, draft }) },
  }
  const service = new InterviewService(process.cwd(), { client, storageDirectory: storage })
  try { await service.restore(); await run(service, client, prompts, storage) }
  finally { await service.close(); await rm(storage, { recursive: true, force: true }) }
}
async function collect(service: InterviewService, request: Parameters<InterviewService["handle"]>[0]) {
  const states = []
  for await (const state of service.handle(request)) states.push(state)
  return states
}
const send = (service: InterviewService, text = "店内全部冰箱，每商品前 20 条评价") => collect(service, { type: "message", text, expectedRevision: service.state.revision })

test("私有 skill 使用官方 typed skill input，而不是靠 prompt 假装加载", () => {
  const params = turnStartParams("t", "$interview-browser-task", {}, { name: "interview-browser-task", path: "D:/private/SKILL.md" }) as { input: unknown[] }
  assert.deepEqual(params.input[1], { type: "skill", name: "interview-browser-task", path: "D:/private/SKILL.md" })
})

test("负责人问题与可确认草稿互斥，推荐项必须唯一", () => {
  assert.equal(interviewOutputSchema.safeParse({ assistantText: "说明", question, draft }).success, false)
  assert.equal(interviewOutputSchema.safeParse({ assistantText: "说明", question: { ...question, options: question.options.map((option) => ({ ...option, recommended: true })) }, draft: null }).success, false)
})

test("真实轮次契约支持零问题形成草稿，消息审计与草稿持久恢复", async () => fixture(async (service, client, prompts, storage) => {
  const states = await send(service)
  assert.equal(states[0]?.active, true)
  assert.equal(states.at(-1)?.active, false)
  assert.equal(currentDraft(service.state)?.version, 1)
  assert.equal(service.state.audits[0]?.invocations, 1)
  assert.match(prompts[0]!, /20 条评价/)
  const restored = new InterviewService(process.cwd(), { client, storageDirectory: storage })
  await restored.restore()
  assert.deepEqual(restored.state, service.state)
  await restored.close()
}))

test("确认只绑定需求版本，不生成来源、计划或执行授权；纠正立即失效旧确认", async () => fixture(async (service) => {
  await send(service)
  await collect(service, { type: "confirm", version: 1, expectedRevision: 1 })
  assert.equal(service.state.confirmedVersion, 1)
  assert.equal("plan" in service.state, false)
  const states = await send(service, "改成前 50 条，同时保留差评")
  assert.equal(states[0]?.confirmedVersion, null)
  assert.equal(currentDraft(states[0]!), undefined)
  assert.equal(service.state.drafts.length, 2)
  await assert.rejects(collect(service, { type: "confirm", version: 1, expectedRevision: 2 }), /最新草稿/)
}))

test("自由回答和完整已提出的问题一起传给下一轮，不是固定三道题", async () => fixture(async (service, client, prompts) => {
  client.runTurn = async function* (prompt) { prompts.push(prompt); yield result({ assistantText: "先确定评价范围。", question, draft: null }) }
  await send(service, "我想抓商品和评价")
  await send(service, "我不选这两个，改成 30 条，为什么需要数量上限？")
  assert.match(prompts[1]!, /不选这两个/)
  assert.match(prompts[1]!, /为什么需要数量上限/)
  assert.match(prompts[1]!, /前 100 条/)
  assert.equal(service.state.drafts.length, 0)
}))

test("供应商误发 commentary JSON 不进入用户时间线", async () => fixture(async (service, client) => {
  client.runTurn = async function* () {
    yield { type: "commentary_delta", delta: '{"assistantText":' }
    yield { type: "commentary_delta", delta: '"机器协议"}' }
    yield result({ assistantText: "自然中文问题", question, draft: null })
  }
  const states = await send(service)
  assert.ok(states.every((state) => !state.messages.at(-1)?.text.includes("assistantText")))
  assert.equal(service.state.messages.at(-1)?.text, "自然中文问题")
}))

test("失败不提交草稿，重试不重复追加用户消息，并保留原始纠正", async () => fixture(async (service, client, prompts) => {
  client.runTurn = async function* () { throw new Error("sensitive provider diagnostic") }
  await send(service, "只要一级能效")
  assert.equal(service.state.messages.at(-1)?.status, "failed")
  assert.doesNotMatch(service.state.messages.at(-1)!.text, /sensitive/)
  assert.equal(service.state.drafts.length, 0)
  client.runTurn = async function* (prompt) { prompts.push(prompt); yield result({ assistantText: "继续明确范围。", question, draft: null }) }
  await collect(service, { type: "retry", expectedRevision: 1 })
  assert.equal(service.state.messages.filter((message) => message.role === "user").length, 1)
  assert.match(prompts[0]!, /一级能效/)
}))

test("旧 revision 和运行中提交均被拒绝，不重复启动模型", async () => fixture(async (service, client) => {
  client.runTurn = async function* () { yield { type: "commentary_delta", delta: "正在核对" }; yield result({ assistantText: "说明", question, draft: null }) }
  const stream = service.handle({ type: "message", text: "目标", expectedRevision: 0 })
  await stream.next()
  await assert.rejects(send(service), /仍在运行/)
  await stream.return(undefined)
  assert.equal(service.state.active, false)
  await assert.rejects(collect(service, { type: "message", text: "旧输入", expectedRevision: 0 }), /已经更新/)
}))

test("取消终态保留历史、无草稿，允许独立重试", async () => fixture(async (service, client) => {
  client.runTurn = async function* () { yield { type: "interrupted", audit: { invocationCount: 1, requestedModel: "gpt-5.6-terra", requestedEffort: "medium", reportedModel: "gpt-5.6-terra", reportedEffort: "medium" } } }
  await send(service)
  assert.equal(service.state.messages.at(-1)?.status, "cancelled")
  assert.equal(service.state.drafts.length, 0)
  assert.equal(service.state.active, false)
  assert.equal(service.state.audits[0]?.invocations, 1)
}))
