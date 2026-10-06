import assert from "node:assert/strict"
import test from "node:test"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parseAIEvent } from "@agent-platform/ai-connect/client"
import { emptyInterview } from "@browser-capture/contracts/interview"
import type { AIModelProvider, PreparedMainAIModel } from "../src/ai/model.js"
import { ProductStore } from "../src/database/store.js"
import { InterviewCoordinator } from "../src/interview/coordinator.js"
import { interviewCanonicalMessages, loadInterviewSkill, parseInterviewOutput } from "../src/interview/protocol.js"
import { InterviewSourceReferences } from "../src/interview/source-references.js"
import { createSourceResolutionTools, ReadOnlySourceResolver, assertRequirementReady,
  projectProvidedDraftSources, preparationEntryFacts } from "../src/interview/source-resolution.js"
import { candidateId } from "../src/interview/source-search-evidence.js"
import { projectRoot } from "./helpers.js"
import { testSelection } from "./fixtures/ai-model.js"

// 保护真实首败：已选来源带查询参数时，草案不得再依赖模型逐字搬运 URL。
const url = "https://catalog.example/items/current?utm_source=search"
const candidate = { id: candidateId(url), title: "资料目录", url, origin: "https://catalog.example",
  domain: "catalog.example", description: "公开来源证据" }
const evidence = { id: "search-1", query: "资料目录", provider: "fixture", status: "ok" as const, candidates: [candidate] }
const markdown = (entry: string) => `# 目标
从指定站点搜索当前资料并保留页面。
## 试做入口
1. ${entry}
## 运行输入
- 无
## 任务步骤
1. 找到当前资料
- 输入：任务输入
- 执行：一次执行
- 产出：完成状态
- 目标：从首页按用户要求搜索，找到当前资料并保留页面。
## 代表试做
完成上述搜索与页面状态。
## 结果与完成
- 交付：完成状态
- 页面交付：保留现场
实际到达用户要求的页面状态；访问受阻如实报告。`
const output = (body: string) => ({ assistantText: "已整理草案。", question: null,
  draft: { title: "查找当前资料", markdown: body, brief: null } })
const resolver = () => new ReadOnlySourceResolver(async () => new Response(
  `<rss><channel><item><title>资料目录</title><link>${url}</link></item></channel></rss>`))

test("来源明确只选一次引用：宿主回填完整参数、首页和来源证据", () => {
  const references = new InterviewSourceReferences(1)
  const [visible] = references.addSearch(evidence)
  const state = structuredClone(emptyInterview)
  const accepted = parseInterviewOutput(output(markdown(`[首页][${visible!.siteRef}]`)), state, false, references)
  assert.match(accepted.draft!.markdown, /1\. <https:\/\/catalog\.example\/>/u)
  assert.ok(accepted.draft!.markdown.includes(url))
  assert.equal(references.draftResolutions[0]?.query, evidence.query)
  assert.equal(references.draftResolutions[0]?.searchId, evidence.id)
  assert.equal(state.sourceResolutions.length, 0, "解析不提前写入已接受状态")
  state.sourceResolutions.push(...references.draftResolutions)
  const selected = projectProvidedDraftSources(state, accepted.draft!.markdown)
  assertRequirementReady(selected, accepted.draft!.markdown, true)
  assert.equal(selected.sourceResolutions[0]?.candidates[0]?.url, url)
  assert.deepEqual(preparationEntryFacts(selected, accepted.draft!.markdown).map((item) => item.url),
    ["https://catalog.example/"])
})

test("引用不容许伪造、串搜索、任意深链或删查询参数", () => {
  const references = new InterviewSourceReferences(1)
  const first = references.addSearch(evidence)[0]!
  const second = references.addSearch({ ...evidence, id: "search-2" })[0]!
  assert.notEqual(first.ref, second.ref)
  assert.throws(() => references.materialize(markdown("[伪造][source-0000000000000000]")), /candidate_reference_invalid/u)
  assert.throws(() => references.propose("来源", [first.ref, second.ref], "question"), /search_reference_invalid/u)
  for (const entry of [url.split("?")[0]!, "https://catalog.example/invented", "https://other.catalog.example/"]) {
    const body = `${markdown(entry)}\n来源依据：[目录][${first.ref}]`
    assert.throws(() => parseInterviewOutput(output(body), structuredClone(emptyInterview), false, references), /draft_url_unverified/u)
  }
})

test("宿主引用展开精确保留括号、标点和中文路径，不把 URL 字节当正文标点", () => {
  for (const raw of ["https://example.org/wiki/Test_(film)", "https://example.org/?q=test,",
    "https://example.org/?q=]", "https://example.org/资料。", "https://example.org/?q=`"]) {
    const url = new URL(raw).href, references = new InterviewSourceReferences(1)
    const [visible] = references.addSearch({ ...evidence, candidates: [{ ...candidate,
      id: candidateId(url), url, origin: "https://example.org", domain: "example.org" }] })
    const accepted = parseInterviewOutput(output(markdown(`[目录][${visible!.ref}]`)), structuredClone(emptyInterview), false, references)
    const state = structuredClone(emptyInterview)
    state.sourceResolutions.push(...references.draftResolutions)
    const selected = projectProvidedDraftSources(state, accepted.draft!.markdown)
    assert.deepEqual(preparationEntryFacts(selected, accepted.draft!.markdown).map((entry) => entry.url), [url])
  }
})

test("对模型暴露的来源接口没有 query/searchId/confirmation 等重复回填", async () => {
  const references = new InterviewSourceReferences(1)
  const tools = createSourceResolutionTools({ resolver: resolver(), revision: 1, questionId: "question", references,
    onSearch() {}, onResolution() {} })
  assert.deepEqual(Object.keys((tools[0]!.parameters as { properties: object }).properties), ["query"])
  assert.deepEqual(Object.keys((tools[1]!.parameters as { properties: object }).properties), ["subject", "candidateRefs"])
  const result = await tools[0]!.execute("search", { query: "资料目录" }) as { content: Array<{ text: string }> }
  const ref = JSON.parse(result.content[0]!.text).results[0].ref as string
  const question = await tools[1]!.execute("choose", { subject: "业务来源", candidateRefs: [ref] }) as { details: { query: string } }
  assert.equal(question.details.query, "资料目录")
})

test("无候选判断保留调查范围，不串成最后一次无关搜索的失败", () => {
  const references = new InterviewSourceReferences(1)
  references.addSearch({ ...evidence, candidates: [] })
  references.addSearch({ ...evidence, id: "search-other", query: "其他业务事实",
    provider: "other", status: "unavailable", candidates: [] })
  const value = references.propose("资料来源", [], "question")
  assert.equal(value.searchId, undefined)
  assert.deepEqual(value.searchIds, [evidence.id, "search-other"])
  assert.equal(value.query, `${evidence.query}\n其他业务事实`)
  assert.equal(value.searchStatus, "ok")
  const unavailable = new InterviewSourceReferences(1)
  unavailable.addSearch({ ...evidence, status: "unavailable", candidates: [] })
  assert.equal(unavailable.propose("资料来源", [], "question").searchStatus, "unavailable")
})

type RunInput = Parameters<PreparedMainAIModel["run"]>[0]
async function withCoordinator(run: (input: RunInput) => Promise<string>, verify: (value: {
  coordinator: InterviewCoordinator; store: ProductStore; taskId: string; directory: string
}) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), "bat-source-binding-"))
  const store = await ProductStore.open(directory)
  const ai: AIModelProvider = { selection: () => testSelection,
    async prepare() { throw new Error("unused") }, async prepareMain() { return {
      selection: testSelection, close: async () => {}, async run(input) {
        const invocationId = randomUUID(), text = await run(input)
        input.onEvent(parseAIEvent({ type: "generation.started", invocationId, sequence: 0, createdAt: 1, output: "text", model: testSelection }))
        input.onEvent(parseAIEvent({ type: "text.delta", invocationId, sequence: 1, createdAt: 2, text }))
        input.onEvent(parseAIEvent({ type: "generation.completed", invocationId, sequence: 2, createdAt: 3,
          providerId: "fixture", modelId: testSelection.modelId, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }))
        return { outputText: text }
      },
    } },
  }
  const coordinator = new InterviewCoordinator(store, ai, loadInterviewSkill(projectRoot), resolver())
  const taskId = coordinator.taskAction({ type: "create", requestId: randomUUID() })
  try { await verify({ coordinator, store, taskId, directory }) }
  finally { await coordinator.close(); await store.close(); await rm(directory, { recursive: true, force: true }) }
}
async function referencedDraft(input: RunInput, invalid = false) {
  const result = await input.tools!.find((tool) => tool.name === "search_sources")!.execute("search", { query: "资料目录" }) as { content: Array<{ text: string }> }
  const ref = JSON.parse(result.content[0]!.text).results[0].siteRef
  const body = markdown(`[首页][${ref}]`) + (invalid ? "\nhttps://unverified.example/" : "")
  return `已整理草案。\n<authoring><interview-markdown title="查找资料">${body}</interview-markdown></authoring>`
}

test("正常 coordinator 只在整轮成功后持久化引用，确认后 SQLite 重开保留原证据", async () => {
  await withCoordinator((input) => referencedDraft(input), async ({ coordinator, store, taskId, directory }) => {
    coordinator.dispatch(taskId, { type: "message", text: "从资料目录首页搜索当前资料并保留页面", expectedRevision: 0, requestId: randomUUID() })
    await coordinator.waitForIdle()
    const state = store.snapshot(taskId)
    assert.equal(state.turns.at(-1)?.status, "succeeded", state.turns.at(-1)?.reason ?? "")
    assert.equal(state.sourceResolutions.length, 1)
    assert.equal(state.sourceResolutions[0]?.status, "open")
    coordinator.dispatch(taskId, { type: "confirm", version: 1, expectedRevision: state.revision, requestId: randomUUID() })
    await coordinator.close(); await store.close()
    const reopened = await ProductStore.open(directory)
    try {
      const saved = reopened.snapshot(taskId)
      assert.equal(saved.confirmedVersion, 1)
      assert.equal(saved.sourceResolutions[0]?.status, "selected")
      assert.equal(saved.sourceResolutions[0]?.candidates[0]?.url, url)
    } finally { await reopened.close() }
  })
})

test("后续合同失败或用户取消不提交来源和草案；保留真实调用审计", async () => {
  for (const cancel of [false, true]) await withCoordinator(async (input) => {
    const result = await referencedDraft(input, !cancel)
    if (cancel && !input.signal.aborted) await new Promise<void>((resolve) => input.signal.addEventListener("abort", () => resolve(), { once: true }))
    return result
  }, async ({ coordinator, store, taskId }) => {
    coordinator.dispatch(taskId, { type: "message", text: "查找当前资料", expectedRevision: 0, requestId: randomUUID() })
    if (cancel) coordinator.dispatch(taskId, { type: "cancel", turnId: store.snapshot(taskId).activeTurnId! })
    await coordinator.waitForIdle()
    const state = store.snapshot(taskId)
    assert.equal(state.turns.at(-1)?.status, cancel ? "cancelled" : "failed")
    assert.equal(state.sourceResolutions.length, 0)
    assert.equal(state.drafts.length, 0)
    assert.equal(state.audits.length, 1)
    if (!cancel) assert.equal(state.messages.at(-1)?.failureCode, "interview_draft_url_unverified")
  })
})

// 保护首败恢复：格式错误只修一次，复用原搜索，保留原始事件，下一轮只接续通过校验的输出。
test("缺闭合标签或必需章节时一次修复，来源不重搜且续聊历史准确", async () => {
  for (const missing of ["envelope", "entry", "numbering", "bullet"]) {
    let calls = 0, valid = ""
    await withCoordinator(async (input) => {
      if (++calls === 1) {
        valid = (await referencedDraft(input)).replace(' title="查找资料"', "")
        if (missing === "numbering") return valid.replace("1. [首页]", "2. [首页]")
        if (missing === "bullet") return valid.replace("1. [首页]", "- [首页]")
        return missing === "envelope" ? valid.replace("</authoring>", "")
          : valid.replace(/## 试做入口\r?\n1\.[^\n]*\r?\n/u, "")
      }
      assert.equal(calls, 2)
      assert.deepEqual(input.tools, [])
      assert.match(input.activeTask, /本次仅修复/u)
      return valid
    }, async ({ coordinator, store, taskId, directory }) => {
      coordinator.dispatch(taskId, { type: "message", text: "查找当前资料", expectedRevision: 0, requestId: randomUUID() })
      await coordinator.waitForIdle()
      const state = store.snapshot(taskId), message = state.messages.at(-1)!
      assert.equal(state.turns.at(-1)?.status, "succeeded", state.turns.at(-1)?.reason ?? "")
      assert.equal(calls, 2)
      assert.equal(state.audits.length, 2)
      assert.equal(state.drafts.length, 1)
      assert.equal(state.sourceResolutions.length, 1)
      assert.ok(message.authoringRepair?.reason)
      assert.ok(message.acceptedInvocationId)
      assert.equal(message.aiEvents.filter((event) => event.type === "generation.completed").length, 2)
      assert.equal(interviewCanonicalMessages(state).at(-1)?.content[0]?.text, valid)
      coordinator.dispatch(taskId, { type: "confirm", version: 1, expectedRevision: state.revision, requestId: randomUUID() })
      await coordinator.close(); await store.close()
      const reopened = await ProductStore.open(directory)
      try {
        assert.equal(reopened.snapshot(taskId).confirmedVersion, 1)
        assert.equal(interviewCanonicalMessages(reopened.snapshot(taskId)).at(-1)?.content[0]?.text, valid)
      } finally { await reopened.close() }
    })
  }
})

test("修复耗尽或取消不会第三次调用、提交草案或泄漏来源", async () => {
  for (const cancel of [false, true]) {
    let calls = 0, invalid = "", cancelRepair: () => void = () => {}
    await withCoordinator(async (input) => {
      if (++calls === 1) invalid = (await referencedDraft(input)).replace("</authoring>", "")
      else if (cancel) cancelRepair()
      return invalid
    }, async ({ coordinator, store, taskId }) => {
      cancelRepair = () => { coordinator.dispatch(taskId, { type: "cancel", turnId: store.snapshot(taskId).activeTurnId! }) }
      coordinator.dispatch(taskId, { type: "message", text: "查找资料", expectedRevision: 0, requestId: randomUUID() })
      await coordinator.waitForIdle()
      const state = store.snapshot(taskId)
      assert.equal(state.turns.at(-1)?.status, cancel ? "cancelled" : "failed")
      assert.equal(calls, 2)
      assert.equal(state.audits.length, 2)
      assert.equal(state.drafts.length, 0)
      assert.equal(state.sourceResolutions.length, 0)
      assert.equal(state.messages.at(-1)?.acceptedInvocationId, undefined)
    })
  }
})

test("公共 Question 输出同样复用注册协议进行一次修复", async () => {
  let calls = 0
  const valid = '需要确认范围。<authoring><question-panel mode="choice" prompt="处理哪个范围？">'
    + '<question-option slot="1" label="当前页面"></question-option>'
    + '<question-option slot="2" label="整个栏目"></question-option></question-panel></authoring>'
  await withCoordinator(async () => ++calls === 1 ? valid.replace("</authoring>", "") : valid,
    async ({ coordinator, store, taskId }) => {
      coordinator.dispatch(taskId, { type: "message", text: "整理资料", expectedRevision: 0, requestId: randomUUID() })
      await coordinator.waitForIdle()
      const state = store.snapshot(taskId)
      assert.equal(state.turns.at(-1)?.status, "succeeded", state.turns.at(-1)?.reason ?? "")
      assert.equal(calls, 2)
      assert.ok(state.messages.at(-1)?.question)
      assert.equal(state.drafts.length, 0)
    })
})
