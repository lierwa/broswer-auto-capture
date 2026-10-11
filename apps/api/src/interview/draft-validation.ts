export type DraftDiagnostic = {
  section: string
  field: string
  actual: string
  expected: string
  correction: string
  line?: number
}

/** WHY：领域校验知道错误位置和修正契约；不能只让 repair 模型猜错误码，也不能替用户补业务值。 */
export class DraftValidationError extends Error {
  constructor(code: string, readonly diagnostic: DraftDiagnostic) { super(code) }

  locate(markdown: string) {
    const index = markdown.split(/\r?\n/u).findIndex(line => line.trim() === `## ${this.diagnostic.section}`)
    if (index >= 0) this.diagnostic.line = index + 1
    return this
  }

  repairReason() {
    const d = this.diagnostic
    return [this.message, `位置：${d.section}${d.line ? `（草稿第 ${d.line} 行开始）` : ""} / ${d.field}`,
      `实际：${d.actual}`, `期望：${d.expected}`, `修正：${d.correction}`].join("\n")
  }

  userMessage() {
    return `准备计划的“${this.diagnostic.section}”中“${this.diagnostic.field}”格式不完整或不正确，自动修复未成功；本轮未提交。`
  }
}

export function draftError(code: string, section: string, field: string, actual: string, expected: string,
  correction = "仅修正此处的格式，保留原草稿和对话已明确的业务值；不要推测、默认或更改交付意图。") {
  return new DraftValidationError(code, { section, field, actual: actual.slice(0, 600), expected, correction })
}

export const deliveryLines = ["- 交付：完成状态", "- 交付：数据结果", "- 交付：页面内容"]
export const resultShapeLines = ["- 结果形状：单条记录", "- 结果形状：记录列表"]
export const browserDeliveryLines = ["- 页面交付：保留现场", "- 页面交付：无需保留"]

export function markerError(code: string, field: string, lines: string[], expected: readonly string[]) {
  const markers = lines.filter(line => line.startsWith(`- ${field}：`))
  // WHY：标签匹配仅定位诊断片段，不把段落中的词句解释成已确认字段，不改变接受条件。
  const excerpts = lines.filter(line => line.includes(field)).slice(0, 3).map(line => line.slice(0, 160))
  return draftError(code, "结果与完成", field,
    `独立标记 ${markers.length} 条；相关原文：${excerpts.length ? excerpts.join(" | ") : "未找到"}`,
    `以下格式选择符合已确认意图的一种，独立一行且仅出现一次：\n${expected.join("\n或\n")}`,
    "将该字段写成上述精确的独立列表行（包括行首“- ”及中文冒号），不能嵌在段落中或附加句号/说明。"
      + "保留原有业务意图；重复或冲突不能任意选值，必须依据原对话纠正。")
}
