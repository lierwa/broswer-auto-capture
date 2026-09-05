import { useReducer, useState } from "react"
import { createRoot } from "react-dom/client"
import { Badge, Button, IconButton, Tabs, Theme, Tooltip } from "@radix-ui/themes"
import { Database, FileSearch, GitBranch, LayoutGrid, MessageSquare, Moon, Search, Sun } from "lucide-react"
import "@radix-ui/themes/styles.css"
import "@xyflow/react/dist/style.css"
import { demoReducer, initialDemoState } from "./workflowState.js"
import { Interview } from "./Interview.js"
import { ChainView } from "./ChainView.js"
import { DesignSystem, Plan, Results, Sources } from "./ArtifactViews.js"
import type { StepId } from "./chainData.js"
import "./styles.css"

const views = [
  { id: "interview", name: "需求对话", icon: MessageSquare },
  { id: "sources", name: "来源调研", icon: Search },
  { id: "plan", name: "抓取计划", icon: FileSearch },
  { id: "nodes", name: "抓取链路", icon: GitBranch },
  { id: "results", name: "运行结果", icon: Database },
]

function App() {
  const [state, dispatch] = useReducer(demoReducer, initialDemoState)
  const [theme, setTheme] = useState<"light" | "dark">("dark")
  const [activeTab, setActiveTab] = useState("interview")
  const [composer, setComposer] = useState("")
  const [viewedVersion, setViewedVersion] = useState<number | null>(null)
  const [step, setStep] = useState<StepId>("catalog")
  const [selectedNodes, setSelectedNodes] = useState<Partial<Record<StepId, number>>>({})
  const confirmed = state.confirmedVersion !== null

  function showChain(value: StepId) { setStep(value); setActiveTab("nodes") }

  return <Theme appearance={theme} accentColor="amber" grayColor="sand" radius="small" scaling="95%">
    <main className="app-shell" data-theme={theme}>
      <aside className="rail" aria-label="工具导航">
        <div className="brand-mark" aria-label="Browser Capture">BC</div>
        <nav><Tooltip content="抓取工作台"><IconButton variant={activeTab === "system" ? "ghost" : "soft"} aria-label="抓取工作台" onClick={() => setActiveTab("interview")}><FileSearch size={19} /></IconButton></Tooltip><Tooltip content="设计系统"><IconButton variant={activeTab === "system" ? "soft" : "ghost"} aria-label="设计系统" onClick={() => setActiveTab("system")}><LayoutGrid size={18} /></IconButton></Tooltip></nav>
        <div className="rail-footer"><span className="local-dot" />本机工作台</div>
      </aside>
      <section className="workspace">
        <header className="topbar"><div><p className="eyebrow">BROWSER CAPTURE / WORKSPACE</p><h1>抓取工作台</h1></div><div className="status-group"><Badge color="gray" variant="outline">本地交互原型</Badge><Tooltip content={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"}><IconButton variant="ghost" aria-label={theme === "dark" ? "切换为浅色主题" : "切换为深色主题"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</IconButton></Tooltip></div></header>
        <div className="prototype-strip"><span className="prototype-dot" /><strong>设计预览</strong><span>访谈为固定交互样例；真实模型、来源搜索与抓取尚未接入。页面内状态在切换时保留，刷新重置。</span></div>
        <div className="workbench-layout">
          <aside className="task-sidebar" aria-label="当前任务">
            <p className="eyebrow">CAPTURE REQUEST</p><div className="task-card"><FileSearch size={19} /><h2>冰箱商品与评价</h2><p>京东旗舰店 · 需求样例</p><Badge variant="soft">{confirmed ? "需求已确认（演示）" : "需求访谈中（演示）"}</Badge></div>
            <div className="sidebar-section"><span className="eyebrow">本次需求</span><dl><div><dt>草稿版本</dt><dd>v{state.version}</dd></div><div><dt>已确认取舍</dt><dd>{Object.keys(state.answers).length} / 3 <small>样例</small></dd></div><div><dt>待澄清补充</dt><dd>{state.notes.length}</dd></div></dl></div>
            <div className="sidebar-section"><span className="eyebrow">当前产物</span><div className="artifact-index"><span>需求草稿<Badge size="1" color={confirmed ? "green" : "gray"}>{confirmed ? "已确认" : "讨论中"}</Badge></span><span>来源证据<small>未调研</small></span><span>正式计划<small>未生成</small></span><span>执行链路<small>未探索</small></span><span>运行结果<small>未运行</small></span></div></div>
            <div className="sidebar-next"><span className="eyebrow">下一项工作</span><p>{confirmed ? "基于确认草稿，搜索并核验真实来源。" : "逐个明确需求，沉淀可审阅的草稿。"}</p><Button size="1" variant="ghost" onClick={() => setActiveTab(confirmed ? "sources" : "interview")}>{confirmed ? "查看来源调研" : "回到需求对话"} →</Button></div>
          </aside>
          <section className="panel review-panel" aria-label="需求、来源、计划、链路与结果">
            <Tabs.Root value={activeTab} onValueChange={setActiveTab} activationMode="manual">
              {/* WHY：焦点移动不切换工作区；鼠标点击或键盘确认才激活目标视图。 */}
              <Tabs.List aria-label="工作台视图">{views.map(({ id, name, icon: Icon }) => <Tabs.Trigger key={id} value={id} onClick={() => setActiveTab(id)}><Icon size={15} />{name}</Tabs.Trigger>)}{activeTab === "system" && <Tabs.Trigger value="system">设计系统</Tabs.Trigger>}</Tabs.List>
              <Tabs.Content value="interview" forceMount hidden={activeTab !== "interview"}><Interview state={state} dispatch={dispatch} composer={composer} setComposer={setComposer} viewedVersion={viewedVersion} setViewedVersion={setViewedVersion} /></Tabs.Content>
              <Tabs.Content value="sources"><Sources confirmedVersion={state.confirmedVersion} /></Tabs.Content>
              <Tabs.Content value="plan"><Plan onChain={showChain} /></Tabs.Content>
              <Tabs.Content value="nodes" forceMount hidden={activeTab !== "nodes"}>{activeTab === "nodes" && <ChainView step={step} onStep={setStep} theme={theme} selected={selectedNodes} onSelect={(id, node) => setSelectedNodes((current) => ({ ...current, [id]: node }))} />}</Tabs.Content>
              <Tabs.Content value="results" forceMount hidden={activeTab !== "results"}><Results /></Tabs.Content>
              <Tabs.Content value="system"><DesignSystem /></Tabs.Content>
            </Tabs.Root>
          </section>
        </div>
      </section>
    </main>
  </Theme>
}

createRoot(document.getElementById("root")!).render(<App />)
