import assert from "node:assert/strict"
import test from "node:test"
import type { InterviewState } from "../src/interviewContract.js"
import { projectDraftMarkdown } from "../src/draftProjection.js"

type Draft = InterviewState["drafts"][number]

const brief = {
  goal: "形成可核验的冰箱商品与评价数据",
  scope: "主流品牌的在售冰箱型号",
  sourceStrategy: { mode: "discover" as const, scope: "由系统发现品牌官网与公开销售入口", providedUrls: [] },
  deliverables: [{ entity: "商品", fields: ["品牌", "型号", "价格"], coverage: "范围内在售型号", limit: "以来源可核验边界为准" }],
  discoveryTasks: [{ objective: "发现来源入口", expectedOutput: "候选入口与覆盖关系", acceptance: "入口可访问且能支撑所需字段" }],
  completionCriteria: ["每条商品记录可追溯到来源"],
  constraints: ["只使用公开可访问页面"],
  proposedDefaults: ["优先采用品牌官方入口"],
}

test("结构化 brief 决定新草稿全文，旧 markdown 不会与下一阶段范围分叉", () => {
  const draft: Draft = { version: 2, revision: 2, title: "冰箱商品需求", markdown: "# 过期文案\n不应显示", brief }
  const markdown = projectDraftMarkdown(draft)
  assert.match(markdown, /# 目标\n\n形成可核验/)
  assert.match(markdown, /# 交给系统调查/)
  assert.match(markdown, /由系统发现品牌官网与公开销售入口/)
  assert.doesNotMatch(markdown, /过期文案/)
})

test("没有 brief 的历史草稿保留原始 Markdown，不伪造结构化产物", () => {
  const draft: Draft = { version: 1, revision: 1, title: "历史需求", markdown: "# 历史范围\n保留原始记录", brief: null }
  assert.equal(projectDraftMarkdown(draft), draft.markdown)
  assert.equal(projectDraftMarkdown(undefined), "")
})
