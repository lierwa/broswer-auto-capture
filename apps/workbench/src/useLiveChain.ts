import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { ChainRevisionOperation } from "@browser-capture/contracts"
import { eventsForStep } from "./chainWorkbenchProjection.js"
import type { ChainLayoutDirection } from "./chainLayout.js"
import type { TaskChainConnection } from "./taskChainConnection.js"

export type WorkbenchContextMode = "execution" | "history" | "diagnostics" | "preparation" | "adjustment" | null

export function useLiveChain(connection: TaskChainConnection, active: boolean) {
  const view = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot)
  const [stepId, setStepId] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [focusStageId, setFocusStageId] = useState<string | null>(null)
  const [previewStageId, setPreviewStageId] = useState<string | null>(null)
  const [direction, setDirection] = useState<ChainLayoutDirection>("LR")
  const [arranged, setArranged] = useState(false)
  const [runDialogMode, setRunDialogMode] = useState<"trial" | "run" | null>(null)
  const [contextMode, setContextMode] = useState<WorkbenchContextMode>(null)
  const [adjustmentTarget, setAdjustmentTarget] = useState<{ stepId: string | null; nodeId: string | null } | null>(null)
  const [editorError, setEditorError] = useState("")
  useChainPolling(connection, active)

  const workspace = view.workspace
  const source = workspace?.draft?.content ?? workspace?.release?.value.content
  const plan = source?.plan
  const steps = source?.steps ?? []
  const step = steps.find((item) => item.stepId === stepId) ?? steps[0]
  const chain = step?.chain
  const presentation = step?.presentation
  const draft = workspace?.draft ?? null
  const release = workspace?.release ?? null
  const selectedExecution = workspace?.execution && executionMatchesSurface(workspace.execution, draft, release)
    ? workspace.execution : null
  const acceptedExecutionId = acceptedMatchesSurface(view.acceptedExecution, draft, release)
    ? view.acceptedExecution!.executionId : null
  const visibleExecutionId = selectedExecution?.id ?? acceptedExecutionId
  const chainEvents = useMemo(() => step ? eventsForStep(step.stepId, visibleExecutionId, view.eventBatch) : null,
    [step?.stepId, visibleExecutionId, view.eventBatch])
  const selectedNode = chain?.nodes.find((node) => node.id === selectedNodeId) ?? null
  const selectedDescriptor = selectedNode?.kind === "capability" ? view.diagnostics?.capabilityDescriptors.find((item) =>
    item.capability.name === selectedNode.capability.name && item.capability.version === selectedNode.capability.version) ?? null : null
  const selectedStage = presentation?.stages.find((stage) => stage.id === selectedStageId)
    ?? presentation?.stages.find((stage) => selectedNode && stage.nodeIds.includes(selectedNode.id)) ?? null
  const focusStage = presentation?.stages.find((stage) => stage.id === focusStageId) ?? null
  const executionRunning = Boolean(selectedExecution && ["queued", "running", "waiting_for_human", "paused", "cleanup_required"]
    .includes(selectedExecution.status))
  const activityRunning = Boolean(workspace?.activity && ["queued", "running", "waiting_for_human"]
    .includes(workspace.activity.status))
  const editingBusy = view.busy || executionRunning || activityRunning

  useEffect(() => {
    if (!step && stepId) setStepId(null)
    else if (step && step.stepId !== stepId) setStepId(step.stepId)
  }, [step?.stepId, stepId])
  useEffect(() => {
    setFocusStageId(null); setPreviewStageId(null); setSelectedNodeId(null); setSelectedStageId(null); setArranged(false)
  }, [chain?.id, chain?.version])
  useEffect(() => {
    if (active && draft) void connection.reloadTargetSelection()
  }, [active, connection, draft?.id])
  useEffect(() => {
    if (!active || !draft || selectedNode?.kind !== "capability" || view.diagnostics || view.diagnosticsBusy) return
    void connection.reloadDiagnostics()
  }, [active, connection, draft?.id, selectedNode?.id, view.diagnostics, view.diagnosticsBusy])
  useEffect(() => {
    if (active && workspace?.activity && (["failed", "interrupted"].includes(workspace.activity.status)
      || (workspace.activity.status === "waiting_for_human" && workspace.activity.inputRequest))) {
      setContextMode("preparation")
    }
  }, [active, workspace?.activity?.id, workspace?.activity?.sequence])
  useEffect(() => {
    if (!active || !["opening", "selecting"].includes(view.targetSelection?.status ?? "")) return
    const controller = new AbortController()
    const timer = setInterval(() => void connection.reloadTargetSelection(controller.signal), 500)
    return () => { controller.abort(); clearInterval(timer) }
  }, [active, connection, view.targetSelection?.status])

  const apply = (operations: ChainRevisionOperation[]) => {
    if (!draft || !chain) return
    setEditorError("")
    void connection.dispatch({ type: "save_task_draft", requestId: crypto.randomUUID(), draftId: draft.id,
      chainId: chain.id, expectedRevision: draft.revision, expectedChecksum: draft.checksum, operations })
  }
  const mutate = (operations: () => ChainRevisionOperation[]) => {
    try { apply(operations()) } catch (error) {
      setEditorError(error instanceof Error ? error.message : "无法保存这次修改。")
    }
  }
  const openContext = (mode: Exclude<WorkbenchContextMode, null>) => {
    setSelectedNodeId(null); setSelectedStageId(null); setContextMode(mode)
  }
  const openAdjustment = (stepId: string | null, nodeId: string | null) => {
    setAdjustmentTarget({ stepId, nodeId }); openContext("adjustment")
  }
  const closeContext = () => { setSelectedNodeId(null); setSelectedStageId(null); setContextMode(null) }

  return {
    view, workspace, source, plan, steps, step, chain, displayChain: chain, presentation, draft, release,
    selectedExecution, acceptedExecutionId, chainEvents, selectedNode, selectedDescriptor, selectedStage, focusStage,
    editorError, direction, arranged, runDialogMode, selectedNodeId, selectedStageId, focusStageId, previewStageId,
    contextMode, adjustmentTarget, executionRunning, activityRunning, editingBusy, setStepId, setRunDialogMode, setFocusStageId,
    setSelectedStageId, setSelectedNodeId, setPreviewStageId, setDirection, setArranged, setContextMode,
    openContext, openAdjustment, closeContext, apply, mutate,
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
  return ({ forming_plan: "形成预执行方案", awaiting_representative_input: "等待代表输入",
    preexecuting: "代表试做与链路编译", validating_sample: "草稿试跑",
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
