import type { InterviewAcceptanceCase } from "./interview-acceptance-cases.js"

// WHY：弱表达轨迹只冻结用户确实说出的最少事实；选择由真实问题的推荐项驱动，
// 不预写完整 persona、问题 XML 或目标草稿，让自然访谈质量可独立审阅。
export const interviewWeakEvaluationCases: readonly InterviewAcceptanceCase[] = [
  {
    id: "weak-a-recommended",
    title: "弱表达后选择推荐方向并补一个最小事实",
    initialInput: "我想整理几款家用咖啡机的信息",
    intentProfile: "只提供一个宽泛目标；后续选择推荐方向，并在首次明确索要对象时只补一个可识别对象。",
    freeTextRules: [],
    choiceRules: [],
    fallbackAnswer: "",
    draftMustContain: ["咖啡机"],
    answerStrategy: "recommended",
    recommendedFollowUpRules: [{ promptIncludes: ["品牌", "型号", "机型", "商品链接"], value: "德龙 EC685" }],
    maxRounds: 8,
    confirmDraft: false,
  },
  {
    id: "weak-b-correction",
    title: "带具体名称的弱表达与一次纠正",
    initialInput: "我想整理一家店里的几款咖啡机信息",
    intentProfile: "只提供宽泛对象；在首次明确索要来源名称时补一个名称，形成草稿后纠正一次。",
    freeTextRules: [],
    choiceRules: [],
    fallbackAnswer: "",
    draftMustContain: ["咖啡机", "德龙京东自营旗舰店"],
    correctionAfterFirstDraft: "更正：不是德龙京东自营旗舰店，是德龙官方旗舰店；其他已确认选择不变。",
    finalDraftMustContain: ["咖啡机", "德龙官方旗舰店"],
    hardScopeMustNotContain: ["德龙京东自营旗舰店"],
    answerStrategy: "recommended",
    recommendedFollowUpRules: [{ promptIncludes: ["来源", "网站", "店铺", "平台"], value: "德龙京东自营旗舰店" }],
    maxRounds: 8,
    confirmDraft: false,
  },
]
