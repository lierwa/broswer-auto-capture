export const questions = [
  { id: "scope", title: "先确定范围：这次以一个旗舰店为边界吗？", label: "来源范围",
    reason: "建议先覆盖一个店铺的全部可枚举冰箱商品，范围清楚，也能核对是否抓全。具体店铺入口留给来源调研核验。",
    answer: "一个京东旗舰店内全部可枚举的冰箱商品" },
  { id: "content", title: "每个商品需要保留哪些内容？", label: "内容范围",
    reason: "建议保留型号、原始参数、商品链接和评价；每条结果都保留与来源页面的对应关系。",
    answer: "型号、原始参数、商品链接、评价及来源关联" },
  { id: "completion", title: "评价抓到什么程度，才算完成？", label: "完成标准",
    reason: "建议采用页面默认排序，每商品最多 100 条；不足时保留实际数量和终止原因，不补造记录。",
    answer: "默认排序，每商品最多 100 条评价；不足记录实际数量和终止原因" },
] as const

export type QuestionId = typeof questions[number]["id"]
export interface DraftVersion {
  version: number
  answers: Partial<Record<QuestionId, string>>
  notes: { id: number; text: string }[]
}
export interface DemoState extends DraftVersion {
  confirmedVersion: number | null
  history: DraftVersion[]
  messages: { id: number; text: string; question?: string }[]
}
export type DemoAction =
  | { type: "accept_recommendation"; id: QuestionId }
  | { type: "add_note"; text: string }
  | { type: "withdraw_note"; id: number }
  | { type: "confirm_draft" }

export const initialDemoState: DemoState = {
  version: 0, answers: {}, notes: [], confirmedVersion: null, history: [],
  messages: [{ id: 0, text: "我想抓取一个京东旗舰店的冰箱商品和评价。" }],
}

export function nextQuestion(state: DraftVersion) {
  return questions.find((question) => !state.answers[question.id])
}

export function canConfirmDraft(state: DemoState) {
  return !nextQuestion(state) && state.notes.length === 0 && state.confirmedVersion !== state.version
}

function revise(state: DemoState, change: Partial<DraftVersion>, text: string, question?: string): DemoState {
  // WHY：确认绑定不可变修订；新输入先使确认失效，旧草稿仍可审阅。
  const { version, answers, notes } = state
  return { ...state, ...change, version: version + 1, confirmedVersion: null,
    history: [...state.history, { version, answers, notes }],
    messages: [...state.messages, { id: state.messages.length, text, ...(question ? { question } : {}) }],
  }
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "accept_recommendation") {
    const question = nextQuestion(state)
    if (!question || question.id !== action.id || state.notes.length) return state
    return revise(state, { answers: { ...state.answers, [question.id]: question.answer } }, question.answer, `${question.title}\n${question.reason}`)
  }
  if (action.type === "add_note") {
    const text = action.text.trim()
    if (!text) return state
    // TRADE-OFF：原型不解释自由文本，只保存为待澄清事项；不能伪造模型决策。
    return revise(state, { notes: [...state.notes, { id: state.messages.length, text }] }, text)
  }
  if (action.type === "withdraw_note") {
    if (!state.notes.some((note) => note.id === action.id)) return state
    return revise(state, { notes: state.notes.filter((note) => note.id !== action.id) }, "撤回一条待澄清补充，保留历史记录。")
  }
  return canConfirmDraft(state) ? { ...state, confirmedVersion: state.version } : state
}
