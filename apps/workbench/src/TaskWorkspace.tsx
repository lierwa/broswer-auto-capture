import { useState } from "react"
import { Tabs } from "@radix-ui/themes"
import { Database, FileSearch, GitBranch, MessageSquare, Search } from "lucide-react"
import { useInterview } from "./useInterview.js"
import { ChatTimeline } from "./ChatTimeline.js"
import { DraftDialog } from "./DraftDialog.js"
import { ChainView } from "./ChainView.js"
import { Results, Sources } from "./ArtifactViews.js"
import { Plan } from "./Plan.js"
import type { StepId } from "./chainData.js"
import type { TaskSummary } from "./taskContract.js"

const views = [
  { id: "interview", name: "需求对话", icon: MessageSquare }, { id: "sources", name: "来源调研", icon: Search },
  { id: "plan", name: "抓取计划", icon: FileSearch }, { id: "nodes", name: "抓取链路", icon: GitBranch }, { id: "results", name: "运行结果", icon: Database },
]
export function TaskWorkspace({ task, visible, theme, otherRunning }: { task: TaskSummary; visible: boolean; theme: "light" | "dark"; otherRunning: TaskSummary | undefined }) {
  const interview = useInterview(task.id)
  const [activeTab, setActiveTab] = useState("interview")
  const [version, setVersion] = useState<number | null>(null)
  const [step, setStep] = useState<StepId>("catalog")
  const [selected, setSelected] = useState<Partial<Record<StepId, number>>>({})
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [chainSample, setChainSample] = useState(false)
  const blocked = task.archived ? "任务已归档，恢复后可以继续对话。" : otherRunning ? `“${otherRunning.title}”正在处理需求，完成后可发送；你仍可查看或编辑当前任务。` : undefined
  function openDraft(value = interview.state.drafts.at(-1)?.version) { if (value) { setVersion(value); setActiveTab("interview") } }
  return <section className="task-workspace" data-task-id={task.id} hidden={!visible} aria-label={task.title}>
    {blocked && <div className="task-notice" role="status">{blocked}</div>}
    <div className="task-body"><section className="panel review-panel" aria-label="需求、来源、计划、链路与结果">
      <Tabs.Root value={activeTab} onValueChange={setActiveTab} activationMode="manual">
        <Tabs.List aria-label="工作台视图">{views.map(({ id, name, icon: Icon }) => <Tabs.Trigger key={id} value={id} onClick={() => setActiveTab(id)}><Icon size={15} />{name}</Tabs.Trigger>)}</Tabs.List>
        <Tabs.Content value="interview" forceMount hidden={activeTab !== "interview"}><ChatTimeline interview={interview} onSources={() => setActiveTab("sources")} onDraft={openDraft} blocked={Boolean(blocked)} readOnly={task.archived} /></Tabs.Content>
        <Tabs.Content value="sources" forceMount hidden={activeTab !== "sources"}><Sources revision={interview.state.revision} readOnly={task.archived} onPlan={() => setActiveTab("plan")} taskId={task.id} active={visible && activeTab === "sources"} confirmedVersion={interview.state.confirmedVersion} onInterview={() => setActiveTab("interview")} onDraft={() => openDraft()} /></Tabs.Content>
        <Tabs.Content value="plan" forceMount hidden={activeTab !== "plan"}><Plan taskId={task.id} active={visible && activeTab === "plan"} readOnly={task.archived} onSources={() => setActiveTab("sources")} /></Tabs.Content>
        <Tabs.Content value="nodes" forceMount hidden={activeTab !== "nodes"}><ChainView step={step} onStep={setStep} theme={theme} selected={selected} inspectorOpen={inspectorOpen} sample={chainSample} onSample={setChainSample} active={visible && activeTab === "nodes"} onPlan={() => setActiveTab("plan")} onClose={() => setInspectorOpen(false)} onSelect={(id, node) => { setSelected((value) => ({ ...value, [id]: node })); setInspectorOpen(true) }} /></Tabs.Content>
        <Tabs.Content value="results" forceMount hidden={activeTab !== "results"}><Results state={interview.state} active={visible && activeTab === "results"} onPlan={() => setActiveTab("plan")} /></Tabs.Content>
      </Tabs.Root>
    </section><DraftDialog state={interview.state} version={version} open={visible && activeTab === "interview" && version !== null} onVersion={setVersion} onConfirm={interview.confirm} readOnly={task.archived} pending={!interview.ready || interview.busy || Boolean(interview.pending)} /></div>
  </section>
}
