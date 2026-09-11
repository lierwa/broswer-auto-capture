import assert from "node:assert/strict"
import { test } from "node:test"
import type { InterviewAcceptanceCase } from "./interview-acceptance-cases.js"
import { assertAcceptanceDraftQuality } from "./interview-acceptance-quality.js"

const correctionScenario = {
  id: "correction-order",
  title: "纠正顺序",
  initialInput: "初始输入",
  intentProfile: "只校验纠正前后断言时机",
  freeTextRules: [],
  choiceRules: [],
  fallbackAnswer: "",
  draftMustContain: [],
  correctionAfterFirstDraft: "更正来源",
  hardScopeMustNotContain: ["旧来源"],
} satisfies InterviewAcceptanceCase

test("纠正前允许初稿保留当时事实，纠正后拒绝旧值残留", () => {
  const initial = { markdown: "初稿", brief: { scope: "旧来源", constraints: [] } }
  assert.doesNotThrow(() => assertAcceptanceDraftQuality(correctionScenario, initial, "initial"))
  assert.throws(() => assertAcceptanceDraftQuality(correctionScenario, initial, "final"), /纠正前的值留在硬范围/)
  const corrected = { markdown: "终稿", brief: { scope: "新来源", constraints: [] } }
  assert.doesNotThrow(() => assertAcceptanceDraftQuality(correctionScenario, corrected, "final"))
})
