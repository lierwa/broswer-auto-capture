import { useState } from "react"
import { Badge, Button, Callout, Dialog, DropdownMenu, Select } from "@radix-ui/themes"
import { Ellipsis, History, MessageSquare, Play, Wrench } from "lucide-react"
import { DraftControls } from "./ChainRevisionEditor.js"
import { ChainRunDialog } from "./ChainRunDialog.js"
import { LiveChainCanvas, LiveChainCanvasToolbar } from "./LiveChainCanvas.js"
import { WorkbenchContext } from "./WorkbenchContext.js"
import { executionStatus } from "./ExecutionPresentation.js"
import { preparationActivityLabel, useLiveChain, type LiveChainModel } from "./useLiveChain.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import type { TaskExecutionReviewReceipt } from "@browser-capture/contracts"

export function LiveChain({ connection, active, theme, onInterview, onRequirementView, onRequirementRevision }: {
  connection: TaskChainConnection
  active: boolean
  theme: "light" | "dark"
  onInterview(): void
  onRequirementView(version: number): void
  onRequirementRevision(review: TaskExecutionReviewReceipt): Promise<boolean>
}) {
  const model = useLiveChain(connection, active)
  const [publishOpen, setPublishOpen] = useState(false)
  const { view, workspace } = model
  if (!workspace) return <section className="chain-workbench chain-loading"><p role="status">
    {view.error || "正在读取任务工作区…"}</p><Button onClick={() => void connection.reload()}>重新连接</Button></section>
  return <section className="chain-workbench" aria-label="链路画布">
    <WorkbenchToolbar model={model} connection={connection} onInterview={onInterview}
      onPublish={() => setPublishOpen(true)} />
    {view.error && <Callout.Root className="workbench-alert" color="red"><Callout.Text>{view.error}</Callout.Text>
      {view.pending && <Button size="1" onClick={() => view.pending?.type === "review_execution"
        ? model.openContext("execution") : void connection.retry()}>重试同一请求</Button>}
      {view.errorCode === "browser_profile_busy" && <Button size="1" variant="soft"
        onClick={() => void connection.closeBrowserProfileAndRetry()}>关闭账号浏览器后重试</Button>}
    </Callout.Root>}
    <ExecutionStrip model={model} />
    {!model.build && (!model.chain || !model.presentation) ? <div className="chain-layout"
      data-inspector-open={Boolean(model.contextMode)}>
        <EmptyCanvas model={model} connection={connection} onInterview={onInterview} />
        <WorkbenchContext model={model} connection={connection}
          onRequirementView={onRequirementView}
          onRequirementRevision={onRequirementRevision} />
      </div>
      : <div className="chain-layout" data-inspector-open={Boolean(model.selectedNode || model.selectedStage || model.contextMode)}>
        <LiveChainCanvas model={model} active={active} theme={theme} />
        <WorkbenchContext model={model} connection={connection}
          onRequirementView={onRequirementView}
          onRequirementRevision={onRequirementRevision} />
      </div>}
    {model.runDialogMode && <ChainRunDialog open mode={model.runDialogMode} workspace={workspace} connection={connection}
      onOpenChange={(open) => { if (!open) model.setRunDialogMode(null) }} />}
    <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} model={model} connection={connection} />
  </section>
}

function WorkbenchToolbar({ model, connection, onInterview, onPublish }: {
  model: LiveChainModel
  connection: TaskChainConnection
  onInterview(): void
  onPublish(): void
}) {
  const { workspace, draft, release, steps, step, activityRunning, executionRunning, view } = model
  if (!workspace) return null
  const activity = workspace.activity
  return <header className="chain-command-bar">
    <div className="chain-surface-identity">
      <Badge color={model.build ? "gray" : draft ? "amber" : release ? "green" : "gray"} variant="soft">
        {model.build ? "生成片段" : draft ? "工作草稿" : release ? `已发布 V${release.reference.version}` : "等待生成"}
      </Badge>
      {activity && (model.build || model.chain && model.presentation) && <button className="activity-chip" data-status={activity.status}
        onClick={() => model.openContext("preparation")}>
        <i aria-hidden="true" />{preparationActivityLabel(activity.phase, activity.status)}</button>}
      {steps.length > 1 && step && <Select.Root value={step.stepId} onValueChange={model.setStepId}>
        <Select.Trigger aria-label="任务步骤" /><Select.Content>{steps.map((item) =>
          <Select.Item value={item.stepId} key={item.stepId}>{model.plan?.steps.find((entry) => entry.id === item.stepId)?.title
            ?? item.stepId}</Select.Item>)}</Select.Content>
      </Select.Root>}
      {model.presentation && <LiveChainCanvasToolbar model={model} />}
    </div>
    <div className="chain-run-controls">
      {(model.chain || model.build) && activity?.status === "waiting_for_human" && <Button size="1" onClick={() => model.openContext("preparation")}>
        {activity.waitpoint?.status === "waiting" ? "处理人工请求" : activity.inputRequest ? "处理所需输入" : "查看等待原因"}</Button>}
      {(model.chain || model.build) && activity && ["failed", "interrupted"].includes(activity.status) && <Button size="1" variant="soft"
        onClick={() => model.openContext("preparation")}>查看原因与继续操作</Button>}
      {draft && <DraftControls readiness={workspace.draftReadiness} busy={view.busy || activityRunning || Boolean(model.build)} running={executionRunning}
        onTrial={() => model.setRunDialogMode("trial")} onPublish={onPublish} />}
      {!draft && release && <Button size="1" disabled={view.busy || activityRunning || executionRunning || Boolean(model.build)}
        onClick={() => model.setRunDialogMode("run")}><Play size={13} fill="currentColor" />运行</Button>}
      <DropdownMenu.Root><DropdownMenu.Trigger><Button size="1" variant="ghost" color="gray" aria-label="更多操作">
        <Ellipsis size={15} /></Button></DropdownMenu.Trigger><DropdownMenu.Content align="end">
        {draft && release && <DropdownMenu.Item disabled={activityRunning || executionRunning || Boolean(model.build)} onSelect={() => model.setRunDialogMode("run")}>
          <Play size={13} />运行已发布任务</DropdownMenu.Item>}
        <DropdownMenu.Item onSelect={() => model.openContext("history")}><History size={13} />历史记录</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => model.openContext("diagnostics")}><Wrench size={13} />诊断详情</DropdownMenu.Item>
        {workspace.requirement && <DropdownMenu.Item disabled={view.busy || activityRunning || executionRunning}
          onSelect={() => void connection.dispatch({ type: "prepare_task", requestId: crypto.randomUUID(),
            requirementVersion: workspace.requirement!.version })}>重新准备当前需求</DropdownMenu.Item>}
        <DropdownMenu.Separator /><DropdownMenu.Item onSelect={onInterview}><MessageSquare size={13} />返回需求对话</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Root>
    </div>
  </header>
}

function ExecutionStrip({ model }: { model: LiveChainModel }) {
  const execution = model.selectedExecution
  const accepted = model.acceptedExecutionId
  if (!execution && !accepted) return null
  return <button className="execution-strip" data-tone={execution?.status ?? "accepted"}
    onClick={() => model.openContext("execution")} aria-live="polite">
    <i aria-hidden="true" /><span><strong>{execution ? executionStatus(execution.status) : "已提交"}</strong>
      <small>{model.detail && !model.detail.execution.steps.some(step => step.runIds.length)
        && ["failed", "blocked", "cancelled"].includes(model.detail.execution.status) ? "在步骤开始前结束，查看原因"
        : execution?.result?.summary ?? (execution ? "查看本次结果" : "排队中")}</small></span>
    <span className="execution-strip-action">查看</span>
  </button>
}

function EmptyCanvas({ model, connection, onInterview }: {
  model: LiveChainModel; connection: TaskChainConnection; onInterview(): void
}) {
  const workspace = model.workspace
  return <div className="empty-chain-canvas">
    <h3>{workspace?.activity ? preparationActivityLabel(workspace.activity.phase, workspace.activity.status) : "还没有链路草稿"}</h3>
    {workspace?.activity ? workspace.activity.reason && <p>{workspace.activity.reason}</p>
      : <p>{workspace?.requirement ? "已确认需求，可以生成草稿。" : "先确认任务需求。"}</p>}
    {workspace?.activity?.status === "waiting_for_human" ? <Button onClick={() => model.openContext("preparation")}>
      {workspace.activity.waitpoint?.status === "waiting" ? "处理人工请求"
        : workspace.activity.inputRequest ? "处理所需输入" : "查看等待原因"}</Button>
      : workspace?.activity && ["failed", "interrupted"].includes(workspace.activity.status)
        ? <Button onClick={() => model.openContext("preparation")}>查看原因与继续操作</Button>
      : workspace?.requirement && !workspace.activity ? <Button disabled={model.view.busy}
        onClick={() => void connection.dispatch({ type: "prepare_task", requestId: crypto.randomUUID(),
          requirementVersion: workspace.requirement!.version })}>生成草稿</Button>
        : !workspace?.activity && <Button variant="soft" onClick={onInterview}>前往需求对话</Button>}
  </div>
}

function PublishDialog({ open, onOpenChange, model, connection }: {
  open: boolean
  onOpenChange(open: boolean): void
  model: LiveChainModel
  connection: TaskChainConnection
}) {
  const draft = model.draft
  async function publish() {
    if (!draft) return
    const accepted = await connection.dispatch({ type: "publish_task_draft", requestId: crypto.randomUUID(),
      draftId: draft.id, expectedRevision: draft.revision, expectedChecksum: draft.checksum })
    if (accepted) onOpenChange(false)
  }
  return <Dialog.Root open={open} onOpenChange={(next) => {
    if (!next && connection.snapshot().busy) return
    onOpenChange(next)
  }}><Dialog.Content maxWidth="460px">
    <Dialog.Title>发布当前草稿</Dialog.Title><Dialog.Description>发布后可重复运行此版本。</Dialog.Description>
    <div className="dialog-actions"><Button variant="soft" color="gray" disabled={connection.snapshot().busy}
      onClick={() => onOpenChange(false)}>取消</Button>
      <Button disabled={!draft || workspaceReadiness(model) !== "ready" || connection.snapshot().busy}
        onClick={() => void publish()}>确认发布</Button></div>
  </Dialog.Content></Dialog.Root>
}

function workspaceReadiness(model: LiveChainModel) { return model.workspace?.draftReadiness?.phase }
