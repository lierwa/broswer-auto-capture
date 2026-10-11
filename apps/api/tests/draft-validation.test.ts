import assert from "node:assert/strict"
import test from "node:test"
import { parsePreparationDraft } from "../src/interview/preparation-draft.js"
import { DraftValidationError } from "../src/interview/draft-validation.js"

const draft = `# 目标
读取当前资料的实际状态。
## 运行输入
- 无
## 任务步骤
1. 读取资料
- 输入：任务输入
- 执行：一次执行
- 产出：完成状态
- 目标：读取用户指定的当前资料状态。
## 代表试做
从指定入口读取实际状态。
## 结果与完成
- 交付：完成状态
- 页面交付：无需保留
读取实际状态，访问受阻如实说明。`

function rejected(markdown: string) {
  try { parsePreparationDraft(markdown); assert.fail("invalid draft accepted") }
  catch (error) { assert.ok(error instanceof DraftValidationError); return error }
}

// 保护真实首败：两种段落写法都被拒绝，诊断必须解释独立行的区别，不能从词句推断业务值。
test("真实首败两种段落写法得到位置、实际内容、允许格式与具体修正", () => {
  for (const prose of ["完成后返回实际结果。页面交付无需保留。", "完成后返回实际结果。页面交付：无需保留。继续按原要求处理。"] ) {
    const error = rejected(draft.replace("- 页面交付：无需保留", prose))
    assert.equal(error.message, "preparation_draft_browser_delivery_required")
    assert.equal(error.diagnostic.section, "结果与完成")
    assert.equal(error.diagnostic.field, "页面交付")
    assert.equal(error.diagnostic.line, 13)
    assert.match(error.diagnostic.actual, /独立标记 0 条/u)
    assert.ok(error.diagnostic.actual.includes(prose))
    assert.match(error.repairReason(), /位置：.*结果与完成/u)
    assert.match(error.repairReason(), /- 页面交付：保留现场/u)
    assert.match(error.repairReason(), /- 页面交付：无需保留/u)
    assert.match(error.repairReason(), /不能嵌在段落中/u)
  }
})

test("缺失、重复、冲突及未知值仍拒绝，诊断不代选页面交付", () => {
  for (const replacement of ["", "- 页面交付：关闭", "- 页面交付：无需保留。",
    "- 页面交付：无需保留\n- 页面交付：无需保留", "- 页面交付：保留现场\n- 页面交付：无需保留"]) {
    const error = rejected(draft.replace("- 页面交付：无需保留", replacement))
    assert.equal(error.message, "preparation_draft_browser_delivery_required")
    assert.match(error.diagnostic.correction, /不能任意选值/u)
  }
  assert.equal(parsePreparationDraft(draft).browserHandoff, "close")
  assert.equal(parsePreparationDraft(draft.replace("无需保留", "保留现场")).browserHandoff, "keep_open")
})

test("同一机制为章节、输入和其它交付字段提供诊断，接受条件不放宽", () => {
  const cases = [
    [draft.replace("## 代表试做", "## 其它"), "代表试做", "章节"],
    [draft.replace("- 无", ""), "运行输入", "输入声明"],
    [draft.replace("- 无", "查询词：资料"), "运行输入", "字段声明"],
    [draft.replace("- 交付：完成状态", "交付完成状态"), "结果与完成", "交付"],
  ]
  for (const [markdown, section, field] of cases) {
    const error = rejected(markdown!)
    assert.equal(error.diagnostic.section, section)
    assert.equal(error.diagnostic.field, field)
    assert.ok(error.diagnostic.expected.length > 0)
    assert.ok(error.diagnostic.correction.length > 0)
  }
})
