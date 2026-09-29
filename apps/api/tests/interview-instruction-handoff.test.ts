import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { emptyInterview, type SourceResolution } from "@browser-capture/contracts/interview"
import type { AIModelProvider, PreparedMainAIModel } from "../src/ai/model.js"
import { ProductStore } from "../src/database/store.js"
import { InterviewCoordinator } from "../src/interview/coordinator.js"
import { loadInterviewSkill } from "../src/interview/protocol.js"
import { createSourceResolutionTools, ReadOnlySourceResolver, sourceSupportsEntry, type SourceSearch } from "../src/interview/source-resolution.js"
import { TaskContractRepository } from "../src/task-chain/repository.js"
import { syncConfirmedRequirement } from "../src/task-chain/requirement.js"
import { projectPreparationPlan } from "../src/task-chain/preparation-plan-projection.js"
import { browserUseTask } from "../src/upstream-browser/task-request.js"
import { authoredInterview, projectRoot } from "./helpers.js"
import { testSelection } from "./fixtures/ai-model.js"

// 保护正式交接/引用不变量；夹具的语义决定不冒充真实模型的理解能力验收。
const entry = "https://example.org/", target = "https://example.org/project"
const explicit = "打开示例站，搜索框原样输入 LangGragh，找到项目，进入反馈第二页第一项，记录标题和正文。"
const body = (steps: string) => `# 目标
完成页面任务。
## 明确要求
${steps}
## 可自行决定
未指定的控件与等待方式。
## 来源依据
目标识别依据 ${target}，不是执行起点。
## 试做入口
1. ${entry}
## 运行输入
- 无
## 代表试做
${steps}
## 结果与完成
- 交付：数据结果
- 结果形状：单条记录
- 字段：标题（文本）：详情标题
- 字段：正文（文本）：详情正文
- 页面交付：无需保留
按指定顺序实际到达详情，读取标题正文；不足时如实说明。`

const resolver = () => new ReadOnlySourceResolver(async () => new Response(
  `<rss><channel><item><title>示例站首页</title><link>${entry}</link></item>
  <item><title>目标项目</title><link>${target}</link></item></channel></rss>`, { status: 200 }))
type RunInput = Parameters<PreparedMainAIModel["run"]>[0]

async function sources(input: RunInput, confirmation: "draft" | "question", onlyTarget = false) {
  const tools = input.tools!
  const result = await tools.find((tool) => tool.name === "search_sources")!.execute("search", {
    subject: "示例站", query: "示例站项目",
  }, input.signal) as { details: SourceSearch }
  const submit = tools.find((tool) => tool.name === "present_source_candidates")!
  for (const [index, candidate] of result.details.candidates.entries()) {
    if (onlyTarget && index === 0) continue
    await submit.execute(`source-${index}`, { subject: index ? "目标身份依据" : "试做起点",
      query: result.details.query, searchId: result.details.id, candidateIds: [candidate.id], confirmation })
    if (confirmation === "question") break
  }
}

function output(markdown: string | null, question = false) {
  const event = authoredInterview({ assistantText: "已保留明确要求。", draft: markdown
    ? { title: "页面任务", markdown, brief: null } : null,
  question: question ? { prompt: "记录哪些字段？", options: [
    { label: "标题和正文", description: "记录文本", recommended: false },
    { label: "标题和链接", description: "记录入口", recommended: false },
  ] } : null })
  if (event.type !== "turn_succeeded") throw new Error("fixture_output_missing")
  return event.outputText
}

async function fixture(run: (input: RunInput) => Promise<string>,
  verify: (value: { coordinator: InterviewCoordinator; store: ProductStore; id: string;
    send(text: string): void; confirm(): void }) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-instruction-handoff-"))
  const store = await ProductStore.open(directory)
  const ai: AIModelProvider = { selection: () => testSelection,
    prepare: async () => { throw new Error("unexpected_extra_model") },
    prepareMain: async () => ({ selection: testSelection, close: async () => {}, run: async (input) => {
      const invocationId = randomUUID()
      input.onEvent(parseAIEvent({ type: "generation.started", invocationId, sequence: 0, createdAt: 1,
        output: "text", model: testSelection }))
      const text = await run(input)
      input.onEvent(parseAIEvent({ type: "text.delta", invocationId, sequence: 1, createdAt: 2, text }))
      input.onEvent(parseAIEvent({ type: "generation.completed", invocationId, sequence: 2, createdAt: 3,
        providerId: "fixture", modelId: testSelection.modelId, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
      return { outputText: text }
    } }),
  }
  const coordinator = new InterviewCoordinator(store, ai, loadInterviewSkill(projectRoot), resolver())
  const id = coordinator.taskAction({ type: "create", requestId: randomUUID() })
  try {
    await verify({ coordinator, store, id,
      send: (text) => { coordinator.dispatch(id, { type: "message", text, requestId: randomUUID(),
        expectedRevision: store.snapshot(id).revision }) },
      confirm: () => { coordinator.dispatch(id, { type: "confirm", requestId: randomUUID(),
        version: store.snapshot(id).drafts.at(-1)!.version, expectedRevision: store.snapshot(id).revision }) },
    })
  } finally { await coordinator.close(); await store.close(); await rm(directory, { recursive: true, force: true }) }
}

test("明确指令：同轮多个来源随草案确认，原话与最新修正进入正式 B-U 交接", async () => {
  let count = 0
  await fixture(async (input) => {
    count += 1
    assert.match(input.activeTask, /起点、字面输入、动作、顺序/)
    assert.match(input.activeTask, /confirmation=draft/)
    assert.match(input.activeTask, /识别拼写错误是增强能力/)
    await sources(input, "draft")
    return output(body(count === 1 ? explicit : explicit.replace("LangGragh", "LangGraph")))
  }, async ({ coordinator, store, id, send, confirm }) => {
    send(explicit); await coordinator.waitForIdle()
    const state = store.snapshot(id)
    assert.equal(state.turns.at(-1)?.status, "succeeded", state.turns.at(-1)?.reason ?? "")
    assert.equal(state.messages.at(-1)?.question, null)
    assert.equal(state.drafts.length, 1)
    assert.deepEqual(state.sourceResolutions.map((item) => [item.status, item.questionId]), [["open", null], ["open", null]])
    confirm()
    const repository = new TaskContractRepository(store)
    const first = syncConfirmedRequirement(store, repository, id)!
    const frozen = JSON.stringify(first)
    assert.deepEqual(first.confirmationFacts?.entries?.map((item) => item.url), [entry])
    assert.equal(first.confirmationFacts?.userMessages?.[0]?.text, explicit)
    const correction = "搜索词纠正为 LangGraph，其余不变。"
    send(correction); await coordinator.waitForIdle(); confirm()
    const next = syncConfirmedRequirement(store, repository, id)!
    assert.deepEqual(next.confirmationFacts?.userMessages?.map((item) => item.text), [explicit, correction])
    const plan = projectPreparationPlan(next, 1)
    const task = browserUseTask({ requirement: next, plan, step: plan.steps[0]!, resolvedInput: null })
    assert.ok(task.includes(explicit)); assert.ok(task.includes(correction))
    assert.match(task, /草案遗漏不代表取消原要求/)
    assert.match(task, /不要求额外的拼写检查/)
    assert.match(task, /本次未找到不等于全站搜不到或目标不存在/)
    assert.ok(next.definition.body.includes(explicit.replace("LangGragh", "LangGraph")))
    assert.deepEqual(plan.entryUrls, [entry])
    assert.equal(JSON.stringify(repository.findRequirement(id, first.version)), frozen)
    assert.equal(count, 2)
  })
})

test("深层来源可证明同站首页，但不能证明任意路径、查询或其他主机", async () => {
  assert.equal(sourceSupportsEntry(target, entry), true)
  for (const url of ["https://example.org/other", "https://example.org/?q=test",
    "https://www.example.org/", "http://example.org/"]) assert.equal(sourceSupportsEntry(target, url), false)
  await fixture(async (input) => {
    await sources(input, "draft", true)
    return output(body(explicit))
  }, async ({ coordinator, store, id, send, confirm }) => {
    send(explicit); await coordinator.waitForIdle(); confirm()
    const requirement = syncConfirmedRequirement(store, new TaskContractRepository(store), id)!
    assert.deepEqual(requirement.confirmationFacts!.sources.map((source) => source.url), [target])
    assert.deepEqual(projectPreparationPlan(requirement, 1).entryUrls, [entry])
  })
})

test("模糊和混合指令：模型的业务问题保留，明确部分不被宿主替换或提前确认", async () => {
  for (const text of ["帮我找一个项目，看看反馈。", "打开示例站，输入 LangGragh，看看反馈；要哪些信息还没确定。"] ) {
    await fixture(async (input) => {
      assert.ok(JSON.stringify(input.messages).includes(text))
      return output(null, true)
    }, async ({ coordinator, store, id, send }) => {
      send(text); await coordinator.waitForIdle()
      const state = store.snapshot(id)
      assert.equal(state.messages[0]?.text, text)
      assert.equal(state.drafts.length, 0)
      assert.equal(state.confirmedVersion, null)
      assert.equal(state.unresolved.filter((item) => item.status === "open").length, 1)
    })
  }
})

test("明确委托：允许来源事实随草案确认；未委托的来源选择仍产生原题板", async () => {
  for (const delegated of [true, false]) {
    await fixture(async (input) => {
      await sources(input, delegated ? "draft" : "question")
      return delegated ? output(body("站内找项目并读详情；来源由系统在公开站点中选择。")) : "请选择来源。"
    }, async ({ coordinator, store, id, send }) => {
      send(delegated ? "公开来源由你决定，读详情标题正文。" : "帮我找到来源，选择后再做。")
      await coordinator.waitForIdle()
      const state = store.snapshot(id)
      assert.equal(state.turns.at(-1)?.status, "succeeded", state.turns.at(-1)?.reason ?? "")
      assert.equal(state.drafts.length, delegated ? 1 : 0)
      assert.equal(state.messages.at(-1)?.question === null, delegated)
    })
  }
})

test("随草案候选仍拒绝无候选、多候选、伪造引用；失败轮次不保存半成品", async () => {
  const resolutions: SourceResolution[] = []
  const tools = createSourceResolutionTools({ resolver: resolver(), revision: 1, questionId: randomUUID(),
    onSearch: () => {}, onResolution: (value) => { resolutions.push(value) } })
  const { details } = await tools[0]!.execute("search", { subject: "示例站", query: "示例站" }) as { details: SourceSearch }
  for (const ids of [[], details.candidates.map((candidate) => candidate.id), ["fake"]]) {
    await assert.rejects(tools[1]!.execute("proposal", { subject: "示例站", query: details.query,
      searchId: details.id, candidateIds: ids, confirmation: "draft" }), /candidate_required|candidate_reference_invalid/)
  }
  assert.deepEqual(resolutions, [])
  await fixture(async (input) => {
    await sources(input, "draft")
    return output(body(explicit).replace(`1. ${entry}`, "1. https://fabricated.example/"))
  }, async ({ coordinator, store, id, send }) => {
    send(explicit); await coordinator.waitForIdle()
    const state = store.snapshot(id)
    assert.equal(state.turns.at(-1)?.status, "failed")
    assert.deepEqual(state.sourceResolutions, emptyInterview.sourceResolutions)
    assert.equal(state.drafts.length, 0)
  })
})
