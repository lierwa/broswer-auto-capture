import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { eventsForStep } from "./chainWorkbenchProjection.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

export type WorkbenchContextMode = "execution" | "history" | "diagnostics" | "preparation" | null

export function useLiveChain(connection: TaskChainConnection, active: boolean) {
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [stepId, setStepId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [focusStageId, setFocusStageId] = useState<string | null>(null)
  const [runDialogMode, setRunDialogMode] = useState<"trial" | "run" | null>(null)
  const [contextMode, setContextMode] = useState<WorkbenchContextMode>(null)
  useChainPolling(connection, active)

  const workspace = view.workspace
  const activityRunning = Boolean(workspace?.activity && ["queued", "running", "waiting_for_human"]
    .includes(workspace.activity.status))
  // WHY：停止的生成片段保留在准备记录中，不能遮住已有可运行链路。
  const build = activityRunning || !workspace?.draft && !workspace?.release ? workspace?.activity?.build : undefined
  const source = build ? undefined : workspace?.draft?.content ?? workspace?.release?.value.content
  const plan = source?.plan
  const steps = source?.steps ?? []
  const step = steps.find((item) => item.stepId === stepId) ?? steps[0]
  const chain = step?.chain
  const presentation = step?.presentation
  const draft = workspace?.draft ?? null
  const release = workspace?.release ?? null
  const selectedExecution = !build && workspace?.execution && executionMatchesSurface(workspace.execution, draft, release)
    ? workspace.execution : null
  const acceptedExecutionId = !build && acceptedMatchesSurface(view.acceptedExecution, draft, release)
    ? view.acceptedExecution!.executionId : null
  const visibleExecutionId = selectedExecution?.id ?? acceptedExecutionId
  const chainEvents = useMemo(() => step ? eventsForStep(step.stepId, visibleExecutionId, view.eventBatch) : null,
    [step?.stepId, visibleExecutionId, view.eventBatch])
  const selectedNode = (build?.nodes ?? chain?.nodes)?.find((node) => node.id === selectedNodeId) ?? null
  const selectedStage = presentation?.stages.find((stage) => stage.id === selectedStageId)
    ?? presentation?.stages.find((stage) => selectedNode && stage.nodeIds.includes(selectedNode.id)) ?? null
  const focusStage = presentation?.stages.find((stage) => stage.id === focusStageId) ?? null
  const executionRunning = Boolean(selectedExecution && ["queued", "running", "waiting_for_human", "paused", "cleanup_required"]
    .includes(selectedExecution.status))

  useEffect(() => {
    if (!step && stepId) setStepId(null)
    else if (step && step.stepId !== stepId) setStepId(step.stepId)
  }, [step?.stepId, stepId])
  useEffect(() => {
    setFocusStageId(null); setSelectedNodeId(null); setSelectedStageId(null)
  }, [chain?.id, chain?.version, build?.stepId, build ? workspace?.activity?.id : undefined])
  useEffect(() => {
    if (active && workspace?.activity && (["failed", "interrupted"].includes(workspace.activity.status)
      || (workspace.activity.status === "waiting_for_human"
        && (workspace.activity.inputRequest || workspace.activity.waitpoint?.status === "waiting")))) {
      setContextMode("preparation")
    }
  }, [active, workspace?.activity?.id, workspace?.activity?.sequence])
  const openContext = (mode: Exclude<WorkbenchContextMode, null>) => {
    setSelectedNodeId(null); setSelectedStageId(null); setContextMode(mode)
  }
  const closeContext = () => { setSelectedNodeId(null); setSelectedStageId(null); setContextMode(null) }

  return {
    view, workspace, source, plan, steps, step, chain, displayChain: chain, presentation, draft, release, build,
    canvasKey: build ? `build:${workspace!.activity!.id}:${build.stepId}` : `${chain?.id}:${chain?.version}`,
    selectedExecution, acceptedExecutionId, chainEvents, selectedNode, selectedStage, focusStage,
    runDialogMode, selectedNodeId, selectedStageId, focusStageId,
    contextMode, executionRunning, activityRunning, setStepId, setRunDialogMode, setFocusStageId,
    setSelectedStageId, setSelectedNodeId, setContextMode,
    openContext, closeContext,
  }
}

function useChainPolling(connection: TaskChainConnection, active: boolean) {
  useEffect(() => {
    if (!active) return
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      await connection.reload(controller.signal)
      await connection.reloadExecutionEvents(controller.signal)
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 800)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [active, connection])
}

function executionMatchesSurface(execution: NonNullable<ReturnType<TaskChainConnection["snapshot"]>["workspace"]>["execution"],
  draft: NonNullable<ReturnType<TaskChainConnection["snapshot"]>["workspace"]>["draft"],
  release: NonNullable<ReturnType<TaskChainConnection["snapshot"]>["workspace"]>["release"]) {
  if (!execution) return false
  if (draft) return execution.draft?.id === draft.id && execution.draft.revision === draft.revision
    && execution.draft.checksum === draft.checksum
  return Boolean(release && execution.release?.id === release.reference.id
    && execution.release.version === release.reference.version && execution.release.digest === release.reference.digest)
}

function acceptedMatchesSurface(accepted: ReturnType<TaskChainConnection["snapshot"]>["acceptedExecution"],
  draft: NonNullable<ReturnType<TaskChainConnection["snapshot"]>["workspace"]>["draft"],
  release: NonNullable<ReturnType<TaskChainConnection["snapshot"]>["workspace"]>["release"]) {
  if (!accepted) return false
  if (draft) return accepted.source.kind === "draft" && accepted.source.draft.id === draft.id
    && accepted.source.draft.revision === draft.revision && accepted.source.draft.checksum === draft.checksum
  return Boolean(release && accepted.source.kind === "release" && accepted.source.release.id === release.reference.id
    && accepted.source.release.version === release.reference.version && accepted.source.release.digest === release.reference.digest)
}

export type LiveChainModel = ReturnType<typeof useLiveChain>

export function preparationPhaseLabel(phase: string) {
  return ({ forming_plan: "核验准备计划草案", awaiting_representative_input: "等待代表输入",
    preexecuting: "生成节点", compiling: "生成节点", validating_sample: "草稿试跑",
    awaiting_verification_input: "等待另一组输入", validating_verification: "独立复跑检查",
    ready: "草稿可发布" } as Record<string, string>)[phase] ?? "草稿生成"
}

export function preparationActivityLabel(phase: string, status: string) {
  const label = preparationPhaseLabel(phase)
  if (status === "failed") return `${label}未完成`
  if (status === "interrupted") return `${label}已中断`
  if (status === "waiting_for_human" || phase.startsWith("awaiting_") || phase === "ready") return label
  return `正在${label}`
}
