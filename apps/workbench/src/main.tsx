import { useEffect, useReducer, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Badge, Button, Dialog, IconButton, TextArea, Theme, Tooltip } from "@radix-ui/themes"
import { ArrowUp, ArrowUpRight, Moon, Plus, Sun } from "lucide-react"
import "@radix-ui/themes/styles.css"
import "@xyflow/react/dist/style.css"
import { demoReducer, initialDemoState, isExecuting, type DemoState, type DemoAction } from "./demoState.js"
import { ReviewPanel, DeveloperPreview } from "./ReviewPanel.js"
import "./styles.css"

function Conversation({ state, draft, setDraft, dispatch }: {
  state: DemoState; draft: string; setDraft: (value: string) => void; dispatch: (action: DemoAction) => void
}) {
  const end = useRef<HTMLDivElement>(null)
  const locked = isExecuting(state.stage)
  useEffect(() => {
    if (state.messages.length) end.current?.scrollIntoView({ block: "nearest", behavior: "instant" })
  }, [state.messages.length])
  function send() {
    if (!draft.trim() || locked) return
    dispatch({ type: "edit_requirement", requirement: draft })
    setDraft("")
  }
  return <section className="conversation" aria-labelledby="conversation-title">
    <header className="section-heading"><h2 id="conversation-title">需求对话</h2><span>先明确范围，再开始执行</span></header>
    <div className="conversation-body">
      {!state.messages.length ? <div className="welcome">
        <span className="eyebrow">从一个需求开始</span>
        <h2>你想从网页里<br />收集什么？</h2>
        <p>告诉我网站、需要的信息和采集范围。<br />计划确认后，才进入执行。</p>
        <button className="example-card" disabled={!!draft.trim()} onClick={() => dispatch({ type: "load_example" })}>
          <span className="eyebrow">体验预设示例</span><strong>旗舰店冰箱与评价 <ArrowUpRight size={18} aria-hidden="true" /></strong>
          <span>{draft.trim() ? "清空输入后可载入示例，保留你正在编辑的需求" : "型号与参数 · 每商品最多 100 条评价"}</span>
        </button>
      </div> : <div className="messages" role="log" aria-label="需求对话记录" aria-live="polite">
        {state.messages.map((message, index) => <article key={index} className={"message " + message.role}>
          <p className="message-author">{message.role === "user" ? "你" : "工作台 · 演示回复"}</p>
          <p>{message.text}</p>
        </article>)}
        <div ref={end} />
      </div>}
    </div>
    <form className="composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      <label htmlFor="requirement-input">{state.messages.length ? "补充或修改需求" : "描述采集需求"}</label>
      <TextArea id="requirement-input" name="requirement" autoComplete="off" maxLength={4000} rows={3}
        placeholder="例如：收集某博物馆正在展出的展览、日期和详情链接…" value={draft}
        disabled={locked} onChange={(event) => setDraft(event.target.value)} aria-describedby="composer-help" />
      <div className="composer-footer"><span id="composer-help">{locked ? "演示运行期间需求已锁定" : "Enter 换行 · 当前仅记录需求，不调用模型"}</span>
        <Button type="submit" disabled={locked || !draft.trim()}><ArrowUp size={16} aria-hidden="true" />发送需求</Button>
      </div>
    </form>
  </section>
}

function NewTask({ disabled, hasContent, onReset }: { disabled: boolean; hasContent: boolean; onReset: () => void }) {
  if (!hasContent) return <Button variant="ghost" color="gray" disabled><Plus size={16} aria-hidden="true" />新建任务</Button>
  return <Dialog.Root><Dialog.Trigger><Button variant="ghost" color="gray" disabled={disabled}><Plus size={16} aria-hidden="true" />新建任务</Button></Dialog.Trigger>
    <Dialog.Content maxWidth="420px"><Dialog.Title>开始新的任务？</Dialog.Title>
      <Dialog.Description>当前演示对话、计划和结果将被清空；本页尚未保存任务历史。</Dialog.Description>
      <div className="dialog-actions"><Dialog.Close><Button variant="soft" color="gray">保留当前任务</Button></Dialog.Close>
        <Dialog.Close><Button onClick={onReset}>清空并新建</Button></Dialog.Close></div>
    </Dialog.Content></Dialog.Root>
}

function App() {
  const [state, dispatch] = useReducer(demoReducer, initialDemoState)
  const [draft, setDraft] = useState("")
  const [theme, setTheme] = useState<"light" | "dark">("dark")
  // WHY：这里只模拟单任务排队转执行，不能将计时器解释为真实Worker进度。
  useEffect(() => {
    if (state.stage !== "queued") return
    const timer = setTimeout(() => dispatch({ type: "start_demo" }), 600)
    return () => clearTimeout(timer)
  }, [state.stage])
  useEffect(() => { document.documentElement.style.colorScheme = theme }, [theme])
  const step = state.stage === "complete" ? 3 : isExecuting(state.stage) ? 2 : state.planRevision ? 1 : 0
  return <Theme appearance={theme} accentColor="amber" grayColor="sand" radius="medium">
    <main className="app-shell" data-theme={theme}>
      <a href="#requirement-input" className="skip-link">跳到需求输入</a>
      <header className="topbar">
        <div className="identity"><span className="brand-mark" aria-hidden="true">BC</span><h1>浏览器抓取</h1><span className="local-label">本机工作台</span></div>
        <div className="header-actions"><NewTask disabled={isExecuting(state.stage)} hasContent={!!state.messages.length || !!draft}
          onReset={() => { dispatch({ type: "reset" }); setDraft("") }} />
          <Tooltip content={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"}><IconButton variant="ghost" color="gray"
            aria-label={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </IconButton></Tooltip></div>
      </header>
      <div className="workspace">
        <div className="workspace-meta"><ol className="phase-list" aria-label="任务阶段">
          {["描述需求", "核对计划", "执行", "结果"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}>
            <span>{String(index + 1).padStart(2, "0")}</span>{label}</li>)}
        </ol><Badge color="gray" variant="outline">交互原型</Badge></div>
        <p className="prototype-notice">本页使用演示回复与样例数据，不会访问网站。内容仅保留在当前页面，刷新后清空。</p>
        <div className="content-grid">
          <Conversation state={state} draft={draft} setDraft={setDraft} dispatch={dispatch} />
          <ReviewPanel state={state} hasUnsentChanges={!!draft.trim()} dispatch={dispatch} />
        </div>
        <footer className="workspace-footer"><span>需求 → 计划 → 执行证据</span><DeveloperPreview /></footer>
      </div>
    </main>
  </Theme>
}

createRoot(document.getElementById("root")!).render(<App />)
