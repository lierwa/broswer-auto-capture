import { Badge, Button, TextArea } from "@radix-ui/themes"
import { useEffect, useRef } from "react"
import { ArrowUp, Check, FileText, MessageSquare, Undo2 } from "lucide-react"
import { canConfirmDraft, nextQuestion, questions, type DemoAction, type DemoState, type DraftVersion } from "./workflowState.js"

type Props = { state: DemoState; dispatch: (action: DemoAction) => void; composer: string; setComposer: (text: string) => void;
  viewedVersion: number | null; setViewedVersion: (version: number | null) => void }

function Draft({ state, version, onVersion, dispatch }: {
  state: DemoState; version: number | null; onVersion: (value: number | null) => void; dispatch: Props["dispatch"]
}) {
  const draft: DraftVersion = state.history.find((item) => item.version === version) ?? state
  const isCurrent = draft.version === state.version
  return <aside className="draft-pane" aria-label="需求草稿">
    <div className="section-kicker"><span><FileText size={14} /> 同步沉淀</span><Badge variant="outline">v{draft.version}</Badge></div>
    <h2>需求草稿</h2><p className="muted">每一次明确的取舍，成为可审阅的范围。</p>
    <label className="field-label" htmlFor="draft-version">版本记录</label>
    <select id="draft-version" value={isCurrent ? "current" : draft.version} onChange={(event) => onVersion(event.target.value === "current" ? null : Number(event.target.value))}>
      <option value="current">当前草稿 · v{state.version}</option>
      {state.history.map((item) => <option key={item.version} value={item.version}>历史草稿 · v{item.version}</option>)}
    </select>
    <div className="draft-title"><span className="eyebrow">目标</span><p>京东旗舰店 · 冰箱商品与评价</p></div>
    <dl className="draft-fields">{questions.map((question) => <div key={question.id}>
      <dt>{question.label}<Badge size="1" color={draft.answers[question.id] ? "green" : "gray"}>{draft.answers[question.id] ? "已决策" : "待讨论"}</Badge></dt>
      <dd>{draft.answers[question.id] ?? "等待在对话中明确"}</dd>
    </div>)}</dl>
    <div className="draft-constraints"><strong>访问与数据边界</strong><p>登录 / 验证码由用户处理；保留文本、表格和链接，附件仅保存来源链接。</p></div>
    {draft.notes.length > 0 && <div className="pending-notes"><strong>待澄清补充 · {draft.notes.length}</strong>{draft.notes.map((note) => <div key={note.id}><p>{note.text}</p>{isCurrent && <Button size="1" variant="ghost" color="gray" onClick={() => dispatch({ type: "withdraw_note", id: note.id })}><Undo2 size={12} />撤回这条补充</Button>}</div>)}</div>}
    <div className="draft-confirm">
      <Button className="wide" disabled={!isCurrent || !canConfirmDraft(state)} onClick={() => dispatch({ type: "confirm_draft" })}><Check size={15} />{state.confirmedVersion === state.version ? `需求 v${state.version} 已确认（演示）` : "确认这份需求草稿（演示）"}</Button>
      <p>{!isCurrent ? "正在查看历史版本；只有当前草稿可以确认。" : state.confirmedVersion !== null ? "下一步是搜索与核验来源，尚未生成正式抓取计划。" : "关键取舍与待澄清事项明确后，再确认需求。"}</p>
    </div>
  </aside>
}

export function Interview({ state, dispatch, composer, setComposer, viewedVersion, setViewedVersion }: Props) {
  const question = nextQuestion(state)
  const transcript = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight
  }, [state.messages.length])
  function send() {
    if (!composer.trim()) return
    dispatch({ type: "add_note", text: composer })
    setComposer("")
    setViewedVersion(null)
  }
  return <div className="interview-layout">
    <section className="conversation" aria-label="持续需求对话">
      <header className="view-heading"><div><p className="eyebrow">DEFINE THE REQUEST</p><h2>先把需求聊清楚</h2></div><Badge variant="soft" color="gray">访谈交互样例</Badge></header>
      <div className="conversation-body" ref={transcript}>
        <div className="conversation-intro"><MessageSquare size={18} /><p>逐个讨论关键取舍。你可以采纳建议，也可以补充、纠正或追问；草稿在右侧同步更新。</p></div>
        <div className="message-list" aria-live="polite">{state.messages.map((message) => <div key={message.id}>{message.question && <article className="message previous-question"><span className="message-author">访谈建议 <small>固定样例</small></span><p>{message.question}</p></article>}<article className="message"><span className="message-author">你 <small>本页样例</small></span><p>{message.text}</p></article></div>)}</div>
        {state.notes.length > 0 ? <div className="question-card"><span className="eyebrow">补充已保留 · 等待真实访谈接入</span><h3>这条补充需要进一步澄清</h3><p>原型不会自行解释自由文本，也不会据此确认旧草稿。你可以继续补充，或撤回该条内容后继续体验固定建议。</p></div>
          : question ? <div className="question-card"><div className="section-kicker"><span>当前讨论 · {question.label}</span><Badge size="1">建议</Badge></div><h3>{question.title}</h3><p>{question.reason}</p><div className="recommendation">{question.answer}</div><Button variant="soft" onClick={() => { dispatch({ type: "accept_recommendation", id: question.id }); setViewedVersion(null) }}><Check size={15} />采纳这项建议</Button></div>
          : <div className="question-card"><span className="eyebrow">需求草稿可审阅</span><h3>{state.confirmedVersion === null ? "这份范围是否符合你的预期？" : "需求已确认，下一步核验真实来源"}</h3><p>可以在右侧审阅并确认，也可以继续补充。具体来源入口、页面能力和抓取预算需要在真实调研后落实到计划中。</p></div>}
      </div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); send() }}>
        <label className="field-label" htmlFor="interview-input">回答、补充或纠正</label>
        <TextArea id="interview-input" placeholder="例如：只要一级能效的冰箱，评论不需要图片……" value={composer} onChange={(event) => setComposer(event.target.value)} rows={3} resize="vertical" />
        <div className="composer-footer"><span>自由输入存为待澄清事项 · 刷新重置本页演示</span><Button type="submit" disabled={!composer.trim()} aria-label="保存补充"><ArrowUp size={17} />保存补充</Button></div>
      </form>
    </section>
    <Draft state={state} version={viewedVersion} onVersion={setViewedVersion} dispatch={dispatch} />
  </div>
}
