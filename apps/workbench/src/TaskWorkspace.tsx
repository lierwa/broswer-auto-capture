import { useEffect, useMemo, useState } from "react"
import { Tabs } from "@radix-ui/themes"
import { GitBranch, MessageSquare } from "lucide-react"
import { useInterview } from "./useInterview.js"
import { ChatTimeline } from "./ChatTimeline.js"
import { DraftDialog } from "./DraftDialog.js"
import { LiveChain } from "./LiveChain.js"
import { TaskChainConnection } from "./taskChainConnection.js"
import { requirementRevisionMessage } from "./resultReview.js"
import type { TaskSummary } from "./taskContract.js"
import type { TaskExecutionReviewReceipt } from "@browser-capture/contracts"
import type { useModelSettings } from "./useModelSettings.js"

type WorkspaceView = "interview" | "canvas"
const views = [
  { id: "interview" as const, name: "需求对话", icon: MessageSquare },
  { id: "canvas" as const, name: "链路", icon: GitBranch },
]
type WorkspaceModelSettings = Pick<ReturnType<typeof useModelSettings>,
  "accounts" | "selection" | "loading" | "saving" | "error" | "ready" | "save" | "load">

export function TaskWorkspace({ task, visible, theme, otherRunning, modelSettings }: {
  task: TaskSummary
  visible: boolean
  theme: "light" | "dark"
  otherRunning: TaskSummary | undefined
  modelSettings: WorkspaceModelSettings
}) {
  const interview = useInterview(task.id)
  const taskChainConnection = useMemo(() => new TaskChainConnection(task.id), [task.id])
  const [activeTab, setActiveTab] = useState<WorkspaceView>("interview")
  const [version, setVersion] = useState<number | null>(null)
  useEffect(() => {
    if (visible && task.attention) setActiveTab(task.attention.source === "interview" ? "interview" : "canvas")
  }, [visible, task.attention?.id, task.attention?.kind])
  const blocked = task.archived
    ? "任务已归档，恢复后可以继续对话。"
    : otherRunning ? "另一任务正在处理，可先输入，结束后发送。" : undefined
  function openDraft(value: number) {
    setVersion(value); setActiveTab("interview")
  }
  async function reopenRequirement(review: TaskExecutionReviewReceipt) {
    if (!review.context || review.context.taskId !== task.id || !review.feedback) return false
    // WHY：已保存 review ID 是唯一提交身份；响应丢失后沿 InterviewConnection 原命令重发。
    if (interview.pending?.type === "message" && interview.pending.requestId === review.id) {
      setActiveTab("interview")
      return interview.sendRevision(interview.pending.text, review.id, interview.pending.expectedRevision)
    }
    if (!interview.ready || interview.busy || interview.state.active || interview.pending || task.archived || otherRunning) return false
    const revision = interview.state.revision
    setActiveTab("interview")
    return interview.sendRevision(requirementRevisionMessage(review.summary, review.feedback, review.context), review.id, revision)
  }
  return <section className="task-workspace" data-task-id={task.id} hidden={!visible} aria-label={task.title}>
    <div className="task-body"><section className="panel review-panel" aria-label="需求与链路">
      <Tabs.Root value={activeTab} onValueChange={(value) => setActiveTab(value as WorkspaceView)} activationMode="manual">
        <Tabs.List aria-label="工作台视图">{views.map(({ id, name, icon: Icon }) => <Tabs.Trigger
          key={id} value={id} aria-label={name}><Icon aria-hidden="true" size={15} />{name}</Tabs.Trigger>)}</Tabs.List>
        <Tabs.Content value="interview" forceMount hidden={activeTab !== "interview"}><ChatTimeline taskId={task.id}
          interview={interview} onPlan={() => setActiveTab("canvas")} onDraft={openDraft} blockedReason={blocked}
          readOnly={task.archived} appearance={theme} modelSettings={modelSettings} /></Tabs.Content>
        <Tabs.Content value="canvas" forceMount hidden={activeTab !== "canvas"}><LiveChain connection={taskChainConnection}
          theme={theme} active={visible && activeTab === "canvas"} onInterview={() => setActiveTab("interview")}
          onRequirementView={openDraft}
          onRequirementRevision={reopenRequirement} /></Tabs.Content>
      </Tabs.Root>
    </section><DraftDialog state={interview.state} version={version}
      open={visible && activeTab === "interview" && version !== null} onVersion={setVersion} onConfirm={interview.confirm}
      readOnly={task.archived} pending={!interview.ready || interview.busy || Boolean(interview.pending)}
      confirming={interview.pending?.type === "confirm"} /></div>
  </section>
}
