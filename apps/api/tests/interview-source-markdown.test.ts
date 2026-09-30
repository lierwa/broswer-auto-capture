import assert from "node:assert/strict"
import test from "node:test"
import { emptyInterview } from "@browser-capture/contracts/interview"
import { parseInterviewOutput } from "../src/interview/protocol.js"
import { preparationEntryFacts, projectProvidedDraftSources, recordUserProvidedSources } from "../src/interview/source-resolution.js"
import { authoredInterview, fixture } from "./helpers.js"

const entry = "https://example.org/"
const markdown = `# 目标\n读取 \`${entry}\` 首页的标题。\n\n## 试做入口\n1. ${entry}\n\n## 运行输入\n- 无\n\n## 代表试做\n打开首页并读取标题。\n\n## 结果与完成\n- 交付：完成状态\n- 页面交付：无需保留\n页面标题可见时完成。`
const draft = { title: "读取首页标题", markdown, brief: null }
const output = { assistantText: "已整理草案。", question: null, draft }

function selectedState() {
  const state = structuredClone(emptyInterview)
  recordUserProvidedSources(state, entry, 1)
  return projectProvidedDraftSources(state, entry)
}

// WHY：保护真实失败边界：正文代码格式不改变 URL 身份，入口仍绑定原已选来源。
test("正文反引号包裹的已选 URL 不阻断正式草案解析或入口来源绑定", () => {
  const state = selectedState(), before = structuredClone(state.sourceResolutions)
  assert.deepEqual(parseInterviewOutput(output, state).draft, draft)
  assert.deepEqual(preparationEntryFacts(state, markdown), [{ url: entry, resolutionId: before[0]!.id }])
  assert.deepEqual(state.sourceResolutions, before)
})

test("Markdown 格式不放宽未经确认的域名、同站深链或真实编码路径", () => {
  const state = selectedState()
  for (const url of ["https://other.example/", `${entry}private`, `${entry}%60`]) {
    assert.throws(() => parseInterviewOutput({ ...output, draft: {
      ...draft, markdown: markdown.replace(`\`${entry}\``, `\`${url}\``),
    } }, state), /interview_draft_url_unverified/)
  }
})

test("用户提供的代码格式 URL 保存同一来源身份，不把反引号持久化为路径", () => {
  const state = structuredClone(emptyInterview)
  recordUserProvidedSources(state, `只读取 \`${entry}\`。`, 1)
  assert.equal(state.sourceResolutions[0]?.candidates[0]?.url, entry)
  assert.deepEqual(parseInterviewOutput(output, state).draft, draft)
})

// WHY：公共 ProductStore.list 必须消费简短标题投影，纯 helper 测试不能保护这个接线。
test("正式访谈提交合法 Markdown 草案，短标题接管回退标题且用户命名不被覆盖", async () => fixture(async ({ create, send, client, coordinator, store }) => {
  const id = create(), request = `读取 ${entry} 的首页标题。${"保留页面可见内容，不修改网站。".repeat(12)}`
  client.runTurn = async function* () { yield authoredInterview(output) }
  send(id, request)
  const provisional = store.list().find((task) => task.id === id)!.title
  assert.ok(Array.from(provisional).length <= 33, `回退标题过长：${provisional.length}`)
  assert.ok(provisional.endsWith("…"))
  await coordinator.waitForIdle()
  assert.equal(store.snapshot(id).turns.at(-1)?.status, "succeeded")
  assert.equal(store.snapshot(id).drafts.length, 1)
  assert.equal(store.list().find((task) => task.id === id)?.title, draft.title)
  coordinator.taskAction({ type: "rename", id, title: "用户保留的名称" })
  assert.equal(store.list().find((task) => task.id === id)?.title, "用户保留的名称")
}))
