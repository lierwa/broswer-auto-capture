import { useEffect, useRef, useState } from "react"
import { Badge, Button, Dialog, DropdownMenu } from "@radix-ui/themes"
import { Ellipsis, History, MessageSquare, Play, Wrench } from "lucide-react"
import { DraftControls } from "./ChainRevisionEditor.js"
import { ChainRunDialog } from "./ChainRunDialog.js"
import { PrepareTaskDialog } from "./PrepareTaskDialog.js"
import { MethodRevisionDialog } from "./MethodRevisionDialog.js"
import { LiveChainCanvas, LiveChainCanvasToolbar } from "./LiveChainCanvas.js"
import { WorkbenchContext } from "./WorkbenchContext.js"
import { executionStatus, executionOutcome, executionFailureReason } from "./ExecutionPresentation.js"
import { ExecutionActions } from "./ExecutionActions.js"
import { preparationActivityLabel, useLiveChain, type LiveChainModel } from "./useLiveChain.js"
import type { TaskChainConnection } from "./taskChainConnection.js"
import type { TaskExecutionReviewReceipt } from "@browser-capture/contracts"

export function LiveChain({ connection, active, theme, onInterview, onRequirementView, onRequirementRevision, attentionRequest }: {
  connection: TaskChainConnection
  active: boolean
  theme: "light" | "dark"
  onInterview(): void
  onRequirementView(version: number): void
  onRequirementRevision(review: TaskExecutionReviewReceipt): Promise<boolean>
  attentionRequest?: { source: "interview" | "preparation" | "execution"; id: string; token: string } | undefined
}) {
  const model = useLiveChain(connection, active)
  const [publishOpen, setPublishOpen] = useState(false)
  const [prepareOpen, setPrepareOpen] = useState(false)
  const [methodRevisionOpen, setMethodRevisionOpen] = useState(false)
  const [focusExecutionId, setFocusExecutionId] = useState<string | null>(null)
  const { view, workspace } = model
  const handledAttention = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!active || !workspace || !attentionRequest || attentionRequest.source === "interview"
      || handledAttention.current === attentionRequest.token) return
    handledAttention.current = attentionRequest.token
    setFocusExecutionId(attentionRequest.source === "execution" ? attentionRequest.id : null)
    model.openContext(attentionRequest.source === "preparation" ? "preparation" : "history")
  }, [active, Boolean(workspace), attentionRequest?.token])
  if (!workspace) return <section className="chain-workbench chain-loading"><p role="status">
    {view.error || "正在读取任务工作区…"}</p><Button onClick={() => void connection.reload()}>重新连接</Button></section>
  return <section className="chain-workbench" aria-label="链路画布">
    {view.connectionStatus === "unavailable" && <p className="run-action-error" role="status">
      服务连接不可用，正在重新连接。当前显示最后保存的任务事实。
      {(workspace.activity?.updatedAt ?? workspace.execution?.updatedAt ?? view.lastConnectedAt) && <span>
        最后事实更新：{new Date(workspace.activity?.updatedAt ?? workspace.execution?.updatedAt
          ?? view.lastConnectedAt!).toLocaleString()}</span>}
    </p>}
    <WorkbenchToolbar model={model} connection={connection} onInterview={onInterview}
      onPublish={() => setPublishOpen(true)} onPrepare={() => setPrepareOpen(true)} onMethodRevision={() => setMethodRevisionOpen(true)} />
    {!model.build && (!model.chain || !model.presentation) && !model.plan?.steps.length ? <div className="chain-layout"
      data-inspector-open={Boolean(model.contextMode)}>
        <EmptyCanvas model={model} connection={connection} onInterview={onInterview} onPrepare={() => setPrepareOpen(true)} />
        <WorkbenchContext model={model} connection={connection} focusExecutionId={focusExecutionId} onFocusHandled={() => setFocusExecutionId(null)}
          onPrepare={() => setPrepareOpen(true)} onRequirementView={onRequirementView}
          onRequirementRevision={onRequirementRevision} />
      </div>
      : <div className="chain-layout" data-inspector-open={Boolean(model.selectedNode || model.selectedStage || model.contextMode)}>
        <LiveChainCanvas model={model} active={active} theme={theme} />
        <WorkbenchContext model={model} connection={connection} focusExecutionId={focusExecutionId} onFocusHandled={() => setFocusExecutionId(null)}
          onPrepare={() => setPrepareOpen(true)} onRequirementView={onRequirementView}
          onRequirementRevision={onRequirementRevision} />
      </div>}
    {model.runDialogMode && <ChainRunDialog open mode={model.runDialogMode} workspace={workspace} connection={connection}
      onOpenChange={(open) => { if (!open) model.setRunDialogMode(null) }} />}
    <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} model={model} connection={connection} />
    <PrepareTaskDialog open={prepareOpen} onOpenChange={setPrepareOpen} workspace={workspace} connection={connection} />
    <MethodRevisionDialog open={methodRevisionOpen} onOpenChange={setMethodRevisionOpen} model={model} connection={connection} />
  </section>
}

function WorkbenchToolbar({ model, connection, onInterview, onPublish, onPrepare, onMethodRevision }: {
  model: LiveChainModel
  connection: TaskChainConnection
  onInterview(): void
  onPublish(): void
  onPrepare(): void
  onMethodRevision(): void
}) {
  const { workspace, draft, release, activityRunning, executionRunning, view } = model
  if (!workspace) return null
  const activity = workspace.activity
  const execution = model.selectedExecution
  const runPending = view.pending?.type === "run_task" || view.pending?.type === "trial_task_draft"
  const uncertain = runPending && view.pendingUncertain
  return <header className="chain-command-bar" aria-label="运行控制">
    <div className="chain-surface-identity">
      <Badge color={model.build ? "gray" : draft ? "amber" : release ? "green" : "gray"} variant="soft">
        {model.build ? "生成片段" : draft ? "工作草稿" : release ? `已发布 V${release.reference.version}` : "等待生成"}
      </Badge>
      <ExecutionState model={model} />
      {activity && (model.build || model.chain && model.presentation) && <button className="activity-chip" data-status={activity.status}
        onClick={() => model.openContext("preparation")}>
        <i aria-hidden="true" />{!model.build ? "准备记录：" : ""}{preparationActivityLabel(activity.phase, activity.status)}</button>}
      {(activity?.compilationStatus || model.build?.compilation) && <button className="activity-chip"
        data-status={activity?.compilationStatus?.status === "failed" || model.build?.compilation?.issues.length ? "failed" : activity?.status}
        onClick={() => model.openContext("preparation")}>
        <i aria-hidden="true" />已记录 {activity?.compilationStatus?.observedActions ?? model.build?.compilation?.observedActions} 个动作
        {activity?.compilationStatus?.status === "failed" || model.build?.compilation?.issues.length ? " · 编译有缺口" : ""}
      </button>}
      {model.presentation && <LiveChainCanvasToolbar model={model} />}
    </div>
    <div className="chain-run-controls">
      {execution && <ExecutionActions execution={execution} connection={connection} />}
      {view.error && !model.runDialogMode && !runPending && !(view.pending?.type === "review_execution"
        && (model.selectedNode?.kind === "terminal" || model.contextMode === "history")) && <span className="run-action-error" role="alert" title={view.error}>{view.error}
        {(view.pending || view.pendingHandoff) && <Button size="1" variant="ghost" disabled={view.busy} onClick={() => view.pending?.type === "review_execution"
          ? model.openTerminal() : void connection.retry()}>重试</Button>}</span>}
      {(model.chain || model.build) && activity?.status === "waiting_for_human" && <Button size="1" onClick={() => model.openContext("preparation")}>
        {activity.waitpoint?.status === "waiting" ? "处理人工请求" : activity.inputRequest ? "处理所需输入" : "查看等待原因"}</Button>}
      {(model.chain || model.build) && activity && ["failed", "interrupted"].includes(activity.status) && <Button size="1" variant="soft"
        onClick={() => model.openContext("preparation")}>查看原因与继续操作</Button>}
      {draft && <DraftControls readiness={workspace.draftReadiness} busy={view.busy || activityRunning || Boolean(model.build)} running={executionRunning}
        onTrial={() => model.setRunDialogMode("trial")} onPublish={onPublish} />}
      {uncertain ? <Button size="1" onClick={() => model.setRunDialogMode(view.pending?.type === "trial_task_draft" ? "trial" : "run")}>核验启动</Button>
        : !draft && release && <Button size="1" disabled={view.busy || view.pendingUncertain || activityRunning || executionRunning || Boolean(model.build)}
          onClick={() => model.setRunDialogMode("run")}><Play size={13} fill="currentColor" />
          {model.selectedExecution ? "再次运行" : "运行"}</Button>}
      <DropdownMenu.Root><DropdownMenu.Trigger><Button size="1" variant="ghost" color="gray" aria-label="更多操作">
        <Ellipsis size={15} /></Button></DropdownMenu.Trigger><DropdownMenu.Content align="end">
        {draft && release && <DropdownMenu.Item disabled={activityRunning || executionRunning || Boolean(model.build)} onSelect={() => model.setRunDialogMode("run")}>
          <Play size={13} />运行已发布任务</DropdownMenu.Item>}
        <DropdownMenu.Item onSelect={() => model.openContext("history")}><History size={13} />历史记录</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => model.openContext("diagnostics")}><Wrench size={13} />诊断详情</DropdownMenu.Item>
        {model.source && <DropdownMenu.Item disabled={view.busy || activityRunning || executionRunning || Boolean(model.build)}
          onSelect={onMethodRevision}><Wrench size={13} />{model.selectedNode ? "修订所选动作的方法" : "局部修订当前步骤方法"}</DropdownMenu.Item>}
        {workspace.requirement && <DropdownMenu.Item disabled={view.busy || activityRunning || executionRunning}
          onSelect={onPrepare}>重新准备当前需求</DropdownMenu.Item>}
        <DropdownMenu.Separator /><DropdownMenu.Item onSelect={onInterview}><MessageSquare size={13} />返回需求对话</DropdownMenu.Item>
      </DropdownMenu.Content></DropdownMenu.Root>
    </div>
  </header>
}

function ExecutionState({ model }: { model: LiveChainModel }) {
  const execution = model.selectedExecution
  const accepted = model.acceptedExecutionId
  if (!execution && !accepted) return null
  const outcome = execution ? executionOutcome(execution) : null
  const state = execution?.status === "cleanup_required" ? `${outcome ? executionStatus(outcome.status) : ""} · 资源待核验`
    : outcome ? executionStatus(outcome.status) : "已提交"
  const reason = outcome?.status === "failed" && execution
    ? executionFailureReason(model.detail?.execution ?? execution, model.detail?.startupFailure)
    : ["waiting_for_human", "paused"].includes(execution?.status ?? "") ? model.detail?.execution.reason ?? "请在网站处理后继续" : null
  return <span className="run-state" data-tone={outcome?.status ?? "accepted"} aria-live="polite"
    title={`运行 ${execution?.id ?? accepted}`}><i aria-hidden="true" /><strong>{state}</strong>
    <small>{(execution?.id ?? accepted)?.slice(0, 8)}</small>{reason && <span title={reason}>{reason}</span>}</span>
}

function EmptyCanvas({ model, connection, onInterview, onPrepare }: {
  model: LiveChainModel; connection: TaskChainConnection; onInterview(): void; onPrepare(): void
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
        onClick={onPrepare}>生成草稿</Button>
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
