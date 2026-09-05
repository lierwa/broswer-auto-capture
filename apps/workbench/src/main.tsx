import { useReducer, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  Badge, Button, Callout, Dialog, IconButton, Tabs, TextArea, TextField, Theme, Tooltip,
} from "@radix-ui/themes"
import { Background, Controls, ReactFlow } from "@xyflow/react"
import {
  Bot, Check, CirclePause, FileSearch, Moon, Play, RotateCcw, Sparkles, Sun,
} from "lucide-react"
import "@radix-ui/themes/styles.css"
import "@xyflow/react/dist/style.css"
import { demoEdges, demoNodes, nodeDetails, stageCopy } from "./demoData.js"
import { demoReducer, initialDemoState, type DemoAction, type DemoStage } from "./demoState.js"
import "./styles.css"

type ThemeMode = "light" | "dark"

function RequirementPanel({ requirement, stage, onSave, onConfirm }: {
  requirement: string
  stage: DemoStage
  onSave: (value: string) => void
  onConfirm: () => void
}) {
  const [draft, setDraft] = useState(requirement)
  const canConfirm = stage === "draft" && requirement.trim().length > 0

  return <section className="panel request-panel" aria-labelledby="requirement-title">
    <div className="panel-heading"><span>01</span><div><p className="eyebrow">需求与范围</p><h2 id="requirement-title">抓取需求</h2></div></div>
    <p className="request-copy">{requirement}</p>
    <div className="scope-list">
      <span><Check size={15} /> 文本、表格与链接</span>
      <span><Check size={15} /> 商品—页面来源关系</span>
      <span><Check size={15} /> 不足 100 条时记录原因</span>
    </div>
    <div className="panel-actions">
      <Dialog.Root>
        <Dialog.Trigger><Button variant="outline"><Sparkles size={16} />编辑需求</Button></Dialog.Trigger>
        <Dialog.Content maxWidth="520px">
          <Dialog.Title>编辑抓取需求</Dialog.Title>
          <Dialog.Description size="2" mb="4">保存后，当前演示计划会回到待确认状态。</Dialog.Description>
          <label className="field-label" htmlFor="requirement-draft">需求描述</label>
          <TextArea id="requirement-draft" value={draft} onChange={(event) => setDraft(event.target.value)} resize="vertical" rows={6} />
          <div className="dialog-actions">
            <Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close>
            <Dialog.Close><Button onClick={() => onSave(draft)} disabled={!draft.trim()}>保存需求</Button></Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Root>
      <Button onClick={onConfirm} disabled={!canConfirm}>确认演示计划</Button>
    </div>
    {stage !== "draft" && <p className="confirmation-note"><Check size={14} /> 当前演示计划已由用户确认。</p>}
  </section>
}

function NodePreview({ enabled }: { enabled: boolean }) {
  const [selectedNodeId, setSelectedNodeId] = useState("scope")
  const selected = nodeDetails[selectedNodeId] ?? nodeDetails.scope!

  return <section className="flow-preview" aria-labelledby="node-preview-title">
    <div className="section-kicker"><span>节点预览</span><Badge color="amber" variant="soft">静态样例</Badge></div>
    <h3 id="node-preview-title">链路步骤</h3>
    <div className={`flow-canvas ${enabled ? "" : "flow-locked"}`} aria-label="演示抓取链路节点图">
      <ReactFlow
        nodes={demoNodes} edges={demoEdges} fitView fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={enabled}
        onNodeClick={(_, node) => setSelectedNodeId(node.id)}
      ><Background gap={22} size={1} /><Controls showInteractive={false} /></ReactFlow>
      {!enabled && <div className="flow-lock-copy">确认演示计划后可检查节点说明</div>}
    </div>
    <div className="node-inspector"><strong>{selected.title}</strong><span>{selected.detail}</span></div>
    <div className="legend"><span><i className="ordinary" />普通程序节点</span><span><i className="checkpoint" />可恢复检查点</span><span><i className="llm" />显式 LLM 节点（样例中无）</span></div>
  </section>
}

function PlanSummary() {
  return <section className="plan-summary" aria-labelledby="plan-summary-title">
    <div className="section-kicker"><span>演示计划</span><Badge color="amber" variant="soft">演示方案</Badge></div>
    <h3 id="plan-summary-title">旗舰店冰箱商品与评价</h3>
    <ol className="plan-steps">
      <li><span>01</span><div><strong>确认来源</strong><p>限定指定品牌旗舰店与可枚举商品范围。</p></div></li>
      <li><span>02</span><div><strong>保留原始信息</strong><p>型号、参数、链接保持与商品页面关联。</p></div></li>
      <li><span>03</span><div><strong>读取默认评价顺序</strong><p>每商品最多 100 条，不足时记录页面终止原因。</p></div></li>
    </ol>
    <Callout.Root color="amber" variant="surface"><Callout.Icon><Sparkles size={16} /></Callout.Icon><Callout.Text>计划展示来源范围、字段关系与完成条件。</Callout.Text></Callout.Root>
  </section>
}

function SampleResults() {
  return <section className="results-preview" aria-labelledby="sample-results-title">
    <div className="section-kicker"><span>结果结构</span><Badge color="orange" variant="solid">样例数据 · 非真实抓取</Badge></div>
    <h3 id="sample-results-title">样例结果</h3>
    <div className="table-wrap"><table>
      <thead><tr><th>商品型号</th><th>原始参数</th><th>评价</th><th>终止原因</th></tr></thead>
      <tbody>
        <tr><td>示例-B509</td><td>一级能效 / 509L</td><td>100 条</td><td>达到演示上限</td></tr>
        <tr><td>示例-C432</td><td>一级能效 / 432L</td><td>37 条</td><td>样例页无下一页</td></tr>
      </tbody>
    </table></div>
    <p className="sample-disclaimer">字段和值仅用于展示结果组件；没有访问京东、没有抓取页面，也没有保存来源文件。</p>
  </section>
}

function DesignSystemSample() {
  return <section className="system-sample" aria-labelledby="system-sample-title">
    <div className="section-kicker"><span>设计系统样例</span><Badge color="gray" variant="outline">Radix Themes candidate</Badge></div>
    <h3 id="system-sample-title">基础组件与主题</h3>
    <div className="sample-grid">
      <div><p className="field-label">Button variants</p><div className="button-row"><Button>Solid</Button><Button variant="soft">Soft</Button><Button variant="outline">Outline</Button><Button variant="ghost">Ghost</Button></div></div>
      <div><label className="field-label" htmlFor="sample-input">Input</label><TextField.Root id="sample-input" placeholder="输入新的来源 URL" /></div>
      <div><p className="field-label">Dialog</p><Dialog.Root><Dialog.Trigger><Button variant="outline">打开说明</Button></Dialog.Trigger><Dialog.Content maxWidth="420px"><Dialog.Title>组件边界说明</Dialog.Title><Dialog.Description size="2">Button、Input、Dialog 与 Tabs 均由候选成品库提供；业务层只组合抓取语义。</Dialog.Description><div className="dialog-actions"><Dialog.Close><Button>知道了</Button></Dialog.Close></div></Dialog.Content></Dialog.Root></div>
    </div>
  </section>
}

function RunPanel({ stage, dispatch, onShowResults }: {
  stage: DemoStage
  dispatch: (action: DemoAction) => void
  onShowResults: () => void
}) {
  const copy = stageCopy[stage]
  const isDraft = stage === "draft"

  function handlePrimaryAction() {
    const actionByStage: Partial<Record<DemoStage, DemoAction>> = {
      confirmed: { type: "queue_demo" }, queued: { type: "start_demo" },
      running: { type: "pause_demo" }, paused: { type: "resume_demo" },
    }
    const action = actionByStage[stage]
    if (action) dispatch(action)
    if (stage === "complete") onShowResults()
  }

  return <aside className="panel run-panel" aria-labelledby="run-title">
    <div className="panel-heading"><span>03</span><div><p className="eyebrow">队列与状态</p><h2 id="run-title">运行概况</h2></div></div>
    <Badge className="run-badge" color={stage === "paused" ? "orange" : "amber"} variant="surface">{copy.label}</Badge>
    <dl>
      <div><dt>队列位置</dt><dd>{copy.queue}</dd></div>
      <div><dt>真实模型统计</dt><dd className="not-run">未运行<small>审计尚未接入</small></dd></div>
      <div><dt>浏览器任务</dt><dd>未启动</dd></div>
      <div><dt>恢复粒度</dt><dd>演示：商品 / 步骤</dd></div>
    </dl>
    <Button className="wide" size="3" disabled={isDraft} onClick={handlePrimaryAction}>
      {stage === "running" ? <CirclePause size={17} /> : stage === "paused" ? <RotateCcw size={17} /> : <Play size={17} />}{copy.next}
    </Button>
    {stage === "running" && <Button className="wide finish-button" variant="outline" onClick={() => { dispatch({ type: "complete_demo" }); onShowResults() }}>完成模拟并查看样例</Button>}
    <p className="fine-print">演示流程按单任务队列表达；实际执行需保留模型调用审计。</p>
  </aside>
}

function App() {
  const [state, dispatch] = useReducer(demoReducer, initialDemoState)
  const [theme, setTheme] = useState<ThemeMode>("dark")
  const [activeTab, setActiveTab] = useState("plan")

  function saveRequirement(requirement: string) {
    dispatch({ type: "edit_requirement", requirement })
    setActiveTab("plan")
  }

  function confirmPlan() {
    dispatch({ type: "confirm_plan" })
    setActiveTab("nodes")
  }

  return <Theme appearance={theme} accentColor="amber" grayColor="sand" radius="small" scaling="95%">
    <main className="app-shell" data-theme={theme}>
      <aside className="rail" aria-label="工作台导航">
        <div className="brand-mark" aria-label="Browser Capture">BC</div>
        <nav><Tooltip content="抓取任务"><IconButton variant="soft" aria-label="抓取任务"><FileSearch size={19} /></IconButton></Tooltip><Tooltip content="模型审计尚未接入"><IconButton variant="ghost" aria-label="模型审计尚未接入"><Bot size={19} /></IconButton></Tooltip></nav>
        <div className="rail-footer"><span className="local-dot" />本机原型</div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">CAPTURE WORKBENCH / REVIEW 01</p><h1>冰箱商品与评价</h1><p className="topbar-copy">需求、计划、节点与结果，在一次可审阅的本机流程中对齐。</p></div>
          <div className="status-group"><Badge size="2" variant="surface">{stageCopy[state.stage].label}</Badge><Tooltip content={`切换为${theme === "dark" ? "浅色" : "深色"}主题`}><IconButton variant="outline" aria-label={`切换为${theme === "dark" ? "浅色" : "深色"}主题`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</IconButton></Tooltip></div>
        </header>
        <Callout.Root className="prototype-notice" color="amber" variant="surface"><Callout.Icon><Sparkles size={16} /></Callout.Icon><Callout.Text><strong>交互原型 · 演示数据</strong>：队列、暂停、恢复、完成与结果均为模拟；真实抓取、链路生成和模型统计尚未接入。</Callout.Text></Callout.Root>
        <div className="content-grid">
          <RequirementPanel requirement={state.requirement} stage={state.stage} onSave={saveRequirement} onConfirm={confirmPlan} />
          <section className="panel review-panel" aria-label="计划、节点、样例结果与设计系统">
            <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
              <Tabs.List aria-label="工作台预览"><Tabs.Trigger value="plan">计划</Tabs.Trigger><Tabs.Trigger value="nodes">节点</Tabs.Trigger><Tabs.Trigger value="results">样例结果</Tabs.Trigger><Tabs.Trigger value="system">设计系统</Tabs.Trigger></Tabs.List>
              <Tabs.Content value="plan"><PlanSummary /></Tabs.Content>
              <Tabs.Content value="nodes"><NodePreview enabled={state.stage !== "draft"} /></Tabs.Content>
              <Tabs.Content value="results"><SampleResults /></Tabs.Content>
              <Tabs.Content value="system"><DesignSystemSample /></Tabs.Content>
            </Tabs.Root>
          </section>
          <RunPanel stage={state.stage} dispatch={dispatch} onShowResults={() => setActiveTab("results")} />
        </div>
      </section>
    </main>
  </Theme>
}

createRoot(document.getElementById("root")!).render(<App />)
